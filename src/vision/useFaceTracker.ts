import { useCallback, useEffect, useRef } from 'react'
import { DETECT, FEATURES } from '@/config/kiosk'
import type { Oval } from '@/overlay/OvalGeometry'
import type { FaceSample } from '@/vision/gates'
import type { FaceMesh } from '@/vision/faceGeometry'
import { getDelegate, getModel, warmUpModel } from '@/vision/modelLoader'

/**
 * MediaPipe FaceLandmarker → the same FaceSample and FaceMesh the mock emits,
 * so nothing downstream knows or cares which source is live.
 *
 * Two coordinate problems have to be solved here, and both are the sort that
 * silently produce a UI that feels wrong rather than one that breaks:
 *
 *  1. object-cover crops the video. Landmarks come back normalised to the
 *     *video frame*, not to what is visible on screen, so they must be mapped
 *     through the same crop CSS applies or the mesh sits off the face.
 *  2. The video is mirrored for display. X must be flipped to match, or every
 *     direction arrow points the wrong way.
 */

/** MediaPipe canonical landmark indices. */
const LM = {
  leftEyeOuter: 33,
  rightEyeOuter: 263,
  noseTip: 1,
  chin: 152,
  forehead: 10,
  leftCheek: 234,
  rightCheek: 454,
} as const

/**
 * How object-cover maps a video frame onto the viewport: the scale applied and
 * the fraction of the source cropped away on each axis.
 */
function coverFit(vw: number, vh: number, sw: number, sh: number) {
  const scale = Math.max(vw / sw, vh / sh)
  const drawnW = sw * scale
  const drawnH = sh * scale
  return {
    // Visible fraction of the source, and where it starts.
    visibleW: vw / drawnW,
    visibleH: vh / drawnH,
    offsetX: (drawnW - vw) / 2 / drawnW,
    offsetY: (drawnH - vh) / 2 / drawnH,
  }
}

export function useFaceTracker(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  meshRef: React.RefObject<FaceMesh | null>,
  enabled: boolean,
) {
  const lastRun = useRef(0)
  const lastSample = useRef<FaceSample | null>(null)
  const lumaCanvas = useRef<HTMLCanvasElement | null>(null)
  const meshBuffer = useRef<Float32Array | null>(null)
  const depthBuffer = useRef<Float32Array | null>(null)

  useEffect(() => {
    if (!enabled) return
    void warmUpModel().catch(() => {})
  }, [enabled])

  useEffect(() => {
    const c = document.createElement('canvas')
    c.width = c.height = DETECT.lumaSampleSize
    lumaCanvas.current = c
  }, [])

  /** Mean luma from a tiny downsample — one small draw, not a full-frame read. */
  const sampleLuma = useCallback((video: HTMLVideoElement) => {
    const c = lumaCanvas.current
    const ctx = c?.getContext('2d', { willReadFrequently: true })
    if (!c || !ctx) return 0.5
    const n = DETECT.lumaSampleSize
    ctx.drawImage(video, 0, 0, n, n)
    const { data } = ctx.getImageData(0, 0, n, n)
    let sum = 0
    for (let i = 0; i < data.length; i += 4) {
      // Rec. 601 luma, close enough and cheap.
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    }
    return sum / (data.length / 4) / 255
  }, [])

  /**
   * Called once per animation frame but only *runs* inference at DETECT.fps.
   * Between runs the previous sample is returned, so the gates stay stable
   * while the overlay keeps rendering at full rate.
   */
  const sample = useCallback(
    (oval: Oval): FaceSample | null => {
      const video = videoRef.current
      const model = getModel()
      if (!enabled || !video || !model || !video.videoWidth) return lastSample.current

      const now = performance.now()
      const interval = 1000 / DETECT.fps
      if (now - lastRun.current < interval) return lastSample.current
      lastRun.current = now

      let result
      try {
        result = model.detectForVideo(video, now)
      } catch {
        // A dropped frame mid-teardown is not worth surfacing.
        return lastSample.current
      }

      const faces = result.faceLandmarks
      if (!faces?.length) {
        lastSample.current = null
        meshRef.current = null
        return null
      }

      const fit = coverFit(oval.vw, oval.vh, video.videoWidth, video.videoHeight)
      // Source-normalised → visible, then mirrored to match the flipped video.
      const mapX = (x: number) => 1 - (x - fit.offsetX) / fit.visibleW
      const mapY = (y: number) => (y - fit.offsetY) / fit.visibleH

      // Largest face wins — the person at the kiosk, not someone behind them.
      let primary = faces[0]
      if (faces.length > 1) {
        let best = -1
        for (const f of faces) {
          const h = Math.abs(f[LM.chin].y - f[LM.forehead].y)
          if (h > best) {
            best = h
            primary = f
          }
        }
      }

      const eyeL = primary[LM.leftEyeOuter]
      const eyeR = primary[LM.rightEyeOuter]
      const nose = primary[LM.noseTip]
      const chin = primary[LM.chin]
      const brow = primary[LM.forehead]
      const cheekL = primary[LM.leftCheek]
      const cheekR = primary[LM.rightCheek]

      const cx = mapX((brow.x + chin.x) / 2)
      const cy = mapY((brow.y + chin.y) / 2)
      const height = Math.abs(mapY(chin.y) - mapY(brow.y))

      /* Roll: the angle of the eye line.
       *
       * Measured on RAW landmark coordinates, deliberately not the mapped
       * ones. mapX mirrors, so it is monotonically decreasing and reverses the
       * eye order — a perfectly level head then gives atan2(≈0, negative),
       * which is 180°, not 0°. Against a 12° gate that fails on every frame
       * and the scan can never complete.
       *
       * Scaled into source pixels too: x and y are each normalised 0–1 over
       * different pixel extents, so feeding them to atan2 directly skews the
       * angle by the video's aspect ratio.
       *
       * Negated so the sign matches the tilt the attendee sees in the
       * mirrored image. Only |roll| is gated, but the sign drives copy.
       */
      const rollDeg =
        -(
          Math.atan2(
            (eyeR.y - eyeL.y) * video.videoHeight,
            (eyeR.x - eyeL.x) * video.videoWidth,
          ) *
          180
        ) / Math.PI

      /* Yaw from how far the nose sits off the midpoint of the cheeks,
       * normalised by cheek width so it is distance-independent. Both terms
       * are on the same axis, so normalised units are fine here.
       *
       * The multiplier converts that ratio to something degree-shaped; it is
       * empirical, and intentionally gentler than a literal reading, because
       * ordinary asymmetry in a relaxed face otherwise reads as a turned head
       * and blocks alignment. */
      const faceWidth = Math.abs(cheekR.x - cheekL.x) || 1e-6
      const noseOffset = nose.x - (cheekL.x + cheekR.x) / 2
      const yawDeg = Math.max(-60, Math.min(60, (noseOffset / faceWidth) * 100))

      const next: FaceSample = {
        t: now,
        faces: faces.length,
        cx,
        cy,
        height,
        rollDeg,
        yawDeg,
        luma: sampleLuma(video),
      }
      lastSample.current = next

      // Mesh: every landmark, mapped into the same normalised viewport space
      // the mock uses. Reuses the buffers — fresh Float32Arrays 18 times a
      // second is needless GC pressure on a machine that runs for days.
      // Skipped entirely when nothing draws it.
      if (!FEATURES.mesh) return next
      const count = primary.length
      if (!meshBuffer.current || meshBuffer.current.length !== count * 2) {
        meshBuffer.current = new Float32Array(count * 2)
        depthBuffer.current = new Float32Array(count)
      }
      const buf = meshBuffer.current
      const dbuf = depthBuffer.current!

      // MediaPipe's z is in roughly the same units as x, negative toward the
      // camera, with no fixed range — so it is normalised across the face each
      // frame rather than against a constant. This is real depth: the nose
      // genuinely reads nearer than the temples.
      let zMin = Infinity
      let zMax = -Infinity
      for (let i = 0; i < count; i++) {
        const z = primary[i].z ?? 0
        if (z < zMin) zMin = z
        if (z > zMax) zMax = z
      }
      const zSpan = zMax - zMin || 1

      for (let i = 0; i < count; i++) {
        buf[i * 2] = mapX(primary[i].x)
        buf[i * 2 + 1] = mapY(primary[i].y)
        // Inverted: nearer the camera (more negative z) → brighter.
        dbuf[i] = 0.25 + (1 - ((primary[i].z ?? 0) - zMin) / zSpan) * 0.75
      }
      meshRef.current = { points: buf, depth: dbuf, count }

      return next
    },
    [enabled, meshRef, sampleLuma, videoRef],
  )

  return { sample, delegate: getDelegate() }
}
