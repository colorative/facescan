import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import { DETECT } from '@/config/kiosk'

/**
 * Loads the FaceLandmarker once and shares it.
 *
 * The wasm bundle plus the model is ~4MB, so this is kicked off from the
 * Attract screen while the attendee is still reading the headline. By the time
 * they tap, the scanner opens with no loading state at all — a spinner between
 * "tap" and "camera" is the single most damaging pause in a kiosk flow.
 */
export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'
export type Delegate = 'GPU' | 'CPU'

let instance: FaceLandmarker | null = null
let pending: Promise<FaceLandmarker> | null = null
let status: ModelStatus = 'idle'
let activeDelegate: Delegate | null = null
const listeners = new Set<(s: ModelStatus) => void>()

function setStatus(next: ModelStatus) {
  status = next
  listeners.forEach((l) => l(next))
}

export function getModelStatus(): ModelStatus {
  return status
}

/** Which delegate actually took. Surfaced in the telemetry HUD. */
export function getDelegate(): Delegate | null {
  return activeDelegate
}

export function onModelStatus(listener: (s: ModelStatus) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Idempotent — safe to call from Attract on mount and again from the scanner. */
export function warmUpModel(): Promise<FaceLandmarker> {
  if (instance) return Promise.resolve(instance)
  if (pending) return pending

  setStatus('loading')
  pending = (async () => {
    // Dynamic import so the ~1MB tasks-vision bundle stays out of the initial
    // paint; the Attract screen must appear instantly on kiosk boot.
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(DETECT.wasmPath)

    const build = (delegate: Delegate) =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: DETECT.modelPath, delegate },
        runningMode: 'VIDEO',
        numFaces: 2, // 2, not 1: we must *detect* a second face to warn about it.
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      })

    // MediaPipe's GPU delegate hard-fails where WebGL is unavailable
    // ("kGpuService ... was not provided") and does NOT fall back on its own.
    // That happens on low-end kiosk GPUs, locked-down browser profiles and bad
    // drivers, so a CPU retry is the difference between a working kiosk and a
    // dead one. CPU inference is slower but comfortably clears DETECT.fps.
    let landmarker: FaceLandmarker
    try {
      landmarker = await build('GPU')
      activeDelegate = 'GPU'
    } catch (gpuErr) {
      console.warn('[facescan] GPU delegate unavailable, retrying on CPU', gpuErr)
      landmarker = await build('CPU')
      activeDelegate = 'CPU'
    }

    instance = landmarker
    setStatus('ready')
    return landmarker
  })()

  pending.catch(() => {
    pending = null
    setStatus('error')
  })

  return pending
}

export function getModel(): FaceLandmarker | null {
  return instance
}
