import { motion } from 'motion/react'
import type { Oval } from '@/overlay/OvalGeometry'

/**
 * The confirmation beat: two halo rings fly outward, a tick draws itself, and
 * the screen takes a brief lift. This is the only moment in the flow that is
 * allowed to be emphatic — everything else stays calm.
 */
export function SuccessBurst({
  oval,
  show,
  onGreen = false,
}: {
  oval: Oval
  show: boolean
  /** The surround is solid green, so halos must be dark to be seen at all. */
  onGreen?: boolean
}) {
  if (!show) return null

  // The halos travel outward across the green surround; the tick sits inside
  // the clear circle over the camera view, so it stays green.
  const halo = onGreen ? 'var(--color-ground)' : 'var(--color-green)'

  const size = Math.min(oval.rx, oval.ry) * 0.5

  return (
    <>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0"
        width={oval.vw}
        height={oval.vh}
      >
        {[0, 0.14].map((delay, i) => (
          <ellipse
            key={i}
            cx={oval.cx}
            cy={oval.cy}
            rx={oval.rx}
            ry={oval.ry}
            fill="none"
            stroke={halo}
            strokeWidth={2.5}
            style={{
              transformOrigin: `${oval.cx}px ${oval.cy}px`,
              animation: `halo-out 0.85s ${delay}s var(--ease-enter) forwards`,
            }}
          />
        ))}

        {/* Tick, drawn on rather than popped in. */}
        <motion.path
          d={`M ${oval.cx - size * 0.42} ${oval.cy} L ${oval.cx - size * 0.08} ${oval.cy + size * 0.34} L ${oval.cx + size * 0.46} ${oval.cy - size * 0.3}`}
          fill="none"
          stroke="var(--color-green)"
          strokeWidth={size * 0.14}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.42, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
    </>
  )
}
