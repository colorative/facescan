import { useEffect, useMemo, useRef } from 'react'
import { FEATURES, RETICLE, TIMING } from '@/config/kiosk'
import { toRgbTriplet } from '@/overlay/resolveColor'
import { subscribeFrame } from '@/overlay/frameLoop'
import type { Oval } from '@/overlay/OvalGeometry'
import type { Phase } from '@/machine/scanMachine'
import type { FaceMesh } from '@/vision/faceGeometry'

type Props = {
  oval: Oval
  phaseRef: React.RefObject<Phase>
  progressRef: React.RefObject<number>
  meshRef: React.RefObject<FaceMesh | null>
  /** Current reticle colour as a CSS value; read per frame, never re-subscribes. */
  colorRef: React.RefObject<string>
}

const PARTICLE_COUNT = 46

type Particle = { x: number; y: number; vx: number; vy: number; r: number; a: number }

/**
 * Brightness bands for the rim ticks. Enough that the wave still reads as a
 * smooth gradient, few enough that the whole ring is a handful of draw calls.
 */
const TICK_BANDS = 7

/** Mesh dot colours, matching the phase palette. */
type DotTint = 'accent' | 'violet' | 'green'

/**
 * Sweep band, face mesh and particle motes on one canvas driven by one
 * requestAnimationFrame loop.
 *
 * Everything per-frame is read from refs. Nothing here touches React state:
 * a 60Hz setState would re-render the overlay tree every frame and is the
 * fastest way to make this feel worse on kiosk hardware than it looks in dev.
 */
export function ScanCanvas({ oval, phaseRef, progressRef, meshRef, colorRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const spritesRef = useRef<Record<DotTint, HTMLCanvasElement> | null>(null)
  const particlesRef = useRef<Particle[]>([])
  /** Accumulated ring rotation, radians. */
  const spin = useRef(0)
  const reducedMotion = useRef(false)

  /**
   * Pre-rendered dot sprites, one per state colour, blitted per point.
   *
   * Sprites rather than per-dot shadowBlur, which is the classic way to turn a
   * glow like this into 12fps. One per tint rather than a canvas filter, which
   * is the other way.
   *
   * Each is a white-hot core fading through the state colour, so the cloud
   * carries the phase's hue now that no contours do.
   */
  useEffect(() => {
    const build = (rgb: string) => {
      const c = document.createElement('canvas')
      const R = 16
      c.width = c.height = R * 2
      const ctx = c.getContext('2d')!
      const g = ctx.createRadialGradient(R, R, 0, R, R, R)
      g.addColorStop(0, 'rgba(255,255,255,1)')
      g.addColorStop(0.3, `rgba(${rgb},0.75)`)
      g.addColorStop(1, `rgba(${rgb},0)`)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, R * 2, R * 2)
      return c
    }
    spritesRef.current = {
      accent: build('120,225,255'),
      violet: build('167,139,250'),
      green: build('34,224,126'),
    }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.current = mq.matches
    const onChange = () => (reducedMotion.current = mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  /**
   * Tick geometry, recomputed only when the reticle moves.
   *
   * For a circle the outward normal is the radius, but this keeps the ellipse
   * form (cos/rx, sin/ry) so a non-round reticle still gets ticks that stand
   * perpendicular to the rim instead of leaning at the flatter sides.
   */
  const ticks = useMemo(() => {
    const n = RETICLE.tickCount
    const base = Math.min(oval.rx, oval.ry) * 0.052
    const inner = 1.014
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2
      let nx = Math.cos(a) / oval.rx
      let ny = Math.sin(a) / oval.ry
      const m = Math.hypot(nx, ny) || 1
      nx /= m
      ny /= m
      return {
        x: oval.cx + Math.cos(a) * oval.rx * inner,
        y: oval.cy + Math.sin(a) * oval.ry * inner,
        nx,
        ny,
        base,
        // Position around the rim, 0–1, driving the wave's phase.
        t: i / n,
      }
    })
  }, [oval])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    // Cap DPR: a 4K kiosk panel at devicePixelRatio 2 quadruples fill cost for
    // glow that is blurred anyway.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(oval.vw * dpr)
    canvas.height = Math.round(oval.vh * dpr)
    canvas.style.width = `${oval.vw}px`
    canvas.style.height = `${oval.vh}px`

    // Seed particles on a ring outside the oval so they drift inward.
    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => {
      const a = Math.random() * Math.PI * 2
      const d = 1.05 + Math.random() * 0.5
      return {
        x: oval.cx + Math.cos(a) * oval.rx * d,
        y: oval.cy + Math.sin(a) * oval.ry * d,
        vx: 0,
        vy: 0,
        r: 0.8 + Math.random() * 1.8,
        a: 0.15 + Math.random() * 0.5,
      }
    })

    const draw = (now: number, dt: number) => {
      const phase = phaseRef.current ?? 'searching'
      const progress = progressRef.current ?? 0
      const mesh = meshRef.current

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, oval.vw, oval.vh)

      /* ── rim ticks ───────────────────────────────────────────────────
         Drawn before the clip, because they live outside the circle.

         On canvas rather than as SVG elements: at this density that would be
         120 individually animated nodes, and the wave wants a continuous
         function of position and time rather than 120 staggered keyframe
         delays. Here it is a sine lookup per tick per frame. */
      {
        const rgb = toRgbTriplet(colorRef.current ?? 'var(--color-accent)')
        const wave = RETICLE.tickWave
        const still = reducedMotion.current
        // The whole ring turns while the identity is being resolved.
        if (phase === 'matching') spin.current += (dt / 1000) * 0.42 * Math.PI * 2
        const travel = still ? 0 : (now / 1000) * wave.revsPerSec * Math.PI * 2
        const swing = wave.maxLength - wave.minLength

        /* Ticks are grouped into a few brightness bands and each band is
           stroked as one path.
           
           Stroking each tick separately means 120 beginPath/stroke pairs per
           frame, which measurably costs frames (60 → 44 when this landed).
           Banding the alpha is visually indistinguishable at this size and
           turns it into TICK_BANDS stroke calls. */
        const cos = Math.cos(spin.current)
        const sin = Math.sin(spin.current)
        const spun = spin.current !== 0
        const bands: Path2D[] = Array.from({ length: TICK_BANDS }, () => new Path2D())

        for (const tick of ticks) {
          // Rotating the ring rotates the sampled point too, so the wave
          // travels with the ticks instead of sliding through them.
          const phaseAt = (tick.t + spin.current / (Math.PI * 2)) * Math.PI * 2 * wave.crests
          const unit = still ? 0.65 : Math.sin(phaseAt - travel) * 0.5 + 0.5
          const len = tick.base * (wave.minLength + unit * swing)

          let { x, y, nx, ny } = tick
          if (spun) {
            const dx = x - oval.cx
            const dy2 = y - oval.cy
            x = oval.cx + dx * cos - dy2 * sin
            y = oval.cy + dx * sin + dy2 * cos
            const rotated = nx * cos - ny * sin
            ny = nx * sin + ny * cos
            nx = rotated
          }

          const band = Math.min(TICK_BANDS - 1, (unit * TICK_BANDS) | 0)
          bands[band].moveTo(x, y)
          bands[band].lineTo(x + nx * len, y + ny * len)
        }

        ctx.lineCap = 'round'
        ctx.lineWidth = 2
        for (let b = 0; b < TICK_BANDS; b++) {
          // Longer ticks read brighter, so the wave is legible as a crest and
          // not just a change in outline.
          const alpha = 0.4 + ((b + 0.5) / TICK_BANDS) * 0.55
          ctx.strokeStyle = `rgba(${rgb}, ${alpha.toFixed(3)})`
          ctx.stroke(bands[b])
        }
      }

      // Everything below is confined to the oval — the overlay is a window
      // onto the face, and glow spilling past the rim destroys that read.
      ctx.save()
      ctx.beginPath()
      ctx.ellipse(oval.cx, oval.cy, oval.rx, oval.ry, 0, 0, Math.PI * 2)
      ctx.clip()

      const capturing = phase === 'capturing'
      const matching = phase === 'matching'
      const verified = phase === 'verified' || phase === 'card' || phase === 'printing'

      // Sweep position: `sweepPasses` trips top→bottom across the capture.
      const passes = TIMING.sweepPasses
      const sweepT = capturing ? (progress * passes) % 1 : 0
      const sweepY = oval.cy - oval.ry + sweepT * oval.ry * 2

      /* ── face mesh, revealed in the sweep's wake ───────────────────── */
      if (FEATURES.mesh && mesh && (capturing || matching || verified)) {
        const tint: DotTint = matching ? 'violet' : verified ? 'green' : 'accent'
        const sprite = spritesRef.current?.[tint]
        ctx.globalCompositeOperation = 'lighter'

        for (let i = 0; i < mesh.count; i++) {
          const px = mesh.points[i * 2] * oval.vw
          const py = mesh.points[i * 2 + 1] * oval.vh

          let alpha: number
          if (capturing) {
            /* The mesh accumulates. A point stays lit once the band has
               crossed it, and flares again on each later pass.

               Gating purely on "is the point above the band" instead would
               make the whole mesh wipe away and rebuild on the second pass,
               which reads as a glitch rather than a scan. A point at height
               `t` is first crossed at progress t/passes. */
            const t = (py - (oval.cy - oval.ry)) / (oval.ry * 2)
            alpha = progress >= t / passes ? 0.46 : 0

            // Flare width scales with the reticle so it reads the same at any
            // screen size, rather than being a fixed pixel distance.
            const behind = sweepY - py
            const flare = oval.ry * 0.28
            if (behind >= 0 && behind < flare) {
              alpha = Math.max(alpha, 1 - behind / flare)
            }
          } else {
            // Dimmed once verified so the tick mark owns the centre — two
            // bright things competing there reads as clutter at the exact
            // moment the message should be unambiguous.
            alpha = matching ? 0.6 : 0.16
          }
          if (alpha <= 0.01) continue

          // Depth does the work the contours used to: nearer points are
          // larger and brighter, so the cloud describes the shape of a face
          // without anything being drawn as a face.
          const d = mesh.depth[i]
          const size = (1.5 + d * 3.4 + alpha * 4.2) * (matching ? 1.15 : 1)
          if (sprite) {
            ctx.globalAlpha = alpha * (0.35 + d * 0.65)
            ctx.drawImage(sprite, px - size, py - size, size * 2, size * 2)
          }
        }

        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
      }

      /* ── sweep wave ─────────────────────────────────────────────────
         A curved sheet passing over the face, not a flat bar.

         Modelled as a horizontal plane cutting a sphere the size of the
         reticle: at height `dy` off centre the intersection has half-width
         sqrt(r² - dy²), so the wave is widest at the equator and narrows to
         nothing at the poles. Drawn as an ellipse squashed by a viewing tilt,
         which is what makes it read as a surface in depth rather than a line
         on glass — and it costs nothing over the flat version.

         The far half of the rim is dimmer than the near half, standing in for
         the occlusion you would get if the head were really solid. */
      if (FEATURES.sweep && capturing && !reducedMotion.current) {
        const r = oval.ry
        const dy = sweepY - oval.cy
        const halfWidth = Math.sqrt(Math.max(0, r * r - dy * dy))

        if (halfWidth > 1) {
          // Viewing tilt. Higher values look like a steeper look-down.
          const squash = 0.26
          const ry2 = halfWidth * squash

          // Wake above the sheet, in the direction it came from.
          const trailH = r * 0.5
          const trail = ctx.createLinearGradient(0, sweepY - trailH, 0, sweepY)
          trail.addColorStop(0, 'rgba(79,216,255,0)')
          trail.addColorStop(1, 'rgba(79,216,255,0.14)')
          ctx.fillStyle = trail
          ctx.fillRect(oval.cx - oval.rx, sweepY - trailH, oval.rx * 2, trailH)

          ctx.globalCompositeOperation = 'lighter'

          // The sheet itself — translucent, brightest through the middle.
          const sheet = ctx.createLinearGradient(0, sweepY - ry2, 0, sweepY + ry2)
          sheet.addColorStop(0, 'rgba(120,225,255,0.04)')
          sheet.addColorStop(0.5, 'rgba(170,242,255,0.17)')
          sheet.addColorStop(1, 'rgba(120,225,255,0.04)')
          ctx.beginPath()
          ctx.ellipse(oval.cx, sweepY, halfWidth, ry2, 0, 0, Math.PI * 2)
          ctx.fillStyle = sheet
          ctx.fill()

          // Far rim (upper half), held back.
          ctx.beginPath()
          ctx.ellipse(oval.cx, sweepY, halfWidth, ry2, 0, Math.PI, Math.PI * 2)
          ctx.strokeStyle = 'rgba(130,205,235,0.32)'
          ctx.lineWidth = 1.4
          ctx.stroke()

          // Near rim (lower half), bright, with a lens-split either side.
          const rims: [number, string, number][] = [
            [-1.7, 'rgba(255,90,90,0.28)', 1.4],
            [1.7, 'rgba(120,180,255,0.28)', 1.4],
            [0, 'rgba(228,250,255,0.95)', 2],
          ]
          for (const [offset, colour, width] of rims) {
            ctx.beginPath()
            ctx.ellipse(oval.cx, sweepY + offset, halfWidth, ry2, 0, 0, Math.PI)
            ctx.strokeStyle = colour
            ctx.lineWidth = width
            ctx.stroke()
          }

          ctx.globalCompositeOperation = 'source-over'
        }
      }

      /* ── particle motes ───────────────────────────────────────────── */
      if (FEATURES.particles && !reducedMotion.current) {
        const pull = matching ? 0.0022 : capturing ? 0.0007 : 0.00018
        // Blitted through the same glow sprite as everything else, so they
        // read as soft motes rather than hard-edged circles.
        const moteTint: DotTint = matching ? 'violet' : verified ? 'green' : 'accent'
        const mote = spritesRef.current?.[moteTint]
        ctx.globalCompositeOperation = 'lighter'
        for (const p of particlesRef.current) {
          const dx = oval.cx - p.x
          const dy = oval.cy - p.y
          const d = Math.hypot(dx, dy) || 1
          p.vx += (dx / d) * pull * dt
          p.vy += (dy / d) * pull * dt
          // Light drag keeps them from slingshotting through the centre.
          p.vx *= 0.985
          p.vy *= 0.985
          p.x += p.vx * dt
          p.y += p.vy * dt

          // Recycle once absorbed, so density stays constant.
          if (d < oval.rx * 0.08) {
            const a = Math.random() * Math.PI * 2
            const dd = 1.05 + Math.random() * 0.5
            p.x = oval.cx + Math.cos(a) * oval.rx * dd
            p.y = oval.cy + Math.sin(a) * oval.ry * dd
            p.vx = p.vy = 0
          }

          ctx.globalAlpha = p.a * (matching ? 1 : 0.6)
          // The sprite is mostly falloff, so it is drawn larger than the
          // mote's nominal radius to end up the same visual size.
          const rr = p.r * 3.2
          if (mote) ctx.drawImage(mote, p.x - rr, p.y - rr, rr * 2, rr * 2)
        }
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
      }

      ctx.restore()
    }

    return subscribeFrame(draw)
  }, [oval, phaseRef, progressRef, meshRef, colorRef, ticks])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0"
    />
  )
}
