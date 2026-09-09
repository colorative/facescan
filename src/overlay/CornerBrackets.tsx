import { motion } from 'motion/react'
import type { Oval } from '@/overlay/OvalGeometry'

/**
 * Four AR-style brackets around the oval's bounding box that snap inward the
 * moment a face is acquired. This is the "lock-on" beat — it does the work of
 * telling the attendee the machine has found them, before any text does.
 */
export function CornerBrackets({
  oval,
  color,
  locked,
}: {
  oval: Oval
  color: string
  locked: boolean
}) {
  const pad = locked ? 18 : 46
  const arm = Math.min(oval.rx, oval.ry) * 0.22

  const left = oval.cx - oval.rx - pad
  const right = oval.cx + oval.rx + pad
  const top = oval.cy - oval.ry - pad
  const bottom = oval.cy + oval.ry + pad

  const corners = [
    { d: `M ${left} ${top + arm} L ${left} ${top} L ${left + arm} ${top}` },
    { d: `M ${right - arm} ${top} L ${right} ${top} L ${right} ${top + arm}` },
    { d: `M ${right} ${bottom - arm} L ${right} ${bottom} L ${right - arm} ${bottom}` },
    { d: `M ${left + arm} ${bottom} L ${left} ${bottom} L ${left} ${bottom - arm}` },
  ]

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0"
      width={oval.vw}
      height={oval.vh}
    >
      {corners.map((c, i) => (
        <motion.path
          key={i}
          d={c.d}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          initial={false}
          animate={{ opacity: locked ? 0.9 : 0.35 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </svg>
  )
}
