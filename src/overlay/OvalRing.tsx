import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { subscribeFrame } from '@/overlay/frameLoop'
import type { Oval } from '@/overlay/OvalGeometry'

/**
 * The reticle stroke: a faint always-present guide, a progress ring that fills
 * across the capture, and a soft outer bloom that carries the state colour.
 *
 * The progress ring uses pathLength={1} so the dash maths is exact regardless
 * of the ellipse's real perimeter — no approximation to drift out of sync.
 *
 * Progress arrives as a ref and is written straight to the DOM attribute from
 * the shared frame loop. Threading it through React state would re-render this
 * subtree sixty times a second for what is one attribute change.
 */
export function OvalRing({
  oval,
  color,
  progressRef,
  emphasis,
}: {
  oval: Oval
  color: string
  /** 0–1 capture progress, read per frame. */
  progressRef: React.RefObject<number>
  /** Guide stroke brightens once a face is being tracked. */
  emphasis: boolean
}) {
  const arc = useRef<SVGPathElement>(null)

  useEffect(
    () =>
      subscribeFrame(() => {
        const el = arc.current
        if (!el) return
        const p = progressRef.current ?? 0
        el.setAttribute('stroke-dashoffset', String(1 - p))
        el.style.opacity = p > 0.001 ? '1' : '0'
      }),
    [progressRef],
  )

  const common = {
    cx: oval.cx,
    cy: oval.cy,
    rx: oval.rx,
    ry: oval.ry,
    fill: 'none',
  }

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0"
      width={oval.vw}
      height={oval.vh}
    >
      <defs>
        <filter id="ring-bloom" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>

      {/* Outer bloom — glow from a blurred copy of the stroke rather than a
          stack of box-shadows, which is both cheaper and softer. */}
      <motion.ellipse
        {...common}
        stroke={color}
        strokeWidth={3}
        filter="url(#ring-bloom)"
        animate={{ opacity: emphasis ? 0.5 : 0.22 }}
        transition={{ duration: 0.4, ease: [0.65, 0, 0.35, 1] }}
      />

      {/* Guide stroke, segmented so the rim reads as an instrument. */}
      <motion.ellipse
        {...common}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray="3 7"
        animate={{ opacity: emphasis ? 0.55 : 0.3 }}
        transition={{ duration: 0.4, ease: [0.65, 0, 0.35, 1] }}
      />

      {/* Progress ring.

          Drawn as a path that *starts* at twelve o'clock and runs clockwise,
          rather than an <ellipse> rotated -90°. Rotating an ellipse element
          rotates its geometry, not just the dash's start angle — it turns a
          tall oval into a wide one. Harmless on a circle, visibly wrong here. */}
      <path
        ref={arc}
        d={topStartEllipse(oval)}
        fill="none"
        stroke={color}
        strokeWidth={3.5}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1}
        style={{ opacity: 0 }}
      />
    </svg>
  )
}

/**
 * An ellipse as two arcs, beginning at the top and sweeping clockwise, so a
 * dash offset of 0 starts the fill at twelve o'clock with no transform.
 */
function topStartEllipse({ cx, cy, rx, ry }: Oval): string {
  return [
    `M ${cx} ${cy - ry}`,
    `A ${rx} ${ry} 0 1 1 ${cx} ${cy + ry}`,
    `A ${rx} ${ry} 0 1 1 ${cx} ${cy - ry}`,
    'Z',
  ].join(' ')
}
