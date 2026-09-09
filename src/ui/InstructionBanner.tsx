import { AnimatePresence, motion } from 'motion/react'
import type { Arrow, Instruction } from '@/machine/instructions'

const ARROW_ROTATION: Record<Exclude<Arrow, null>, number> = {
  up: 0,
  right: 90,
  down: 180,
  left: 270,
}

/**
 * The one instruction on screen. Never two: a queue of advice is unreadable to
 * someone standing at a kiosk for three seconds.
 *
 * The aria-live region carries the same text so a screen-reader user gets the
 * alignment feedback that sighted users get from the oval.
 */
export function InstructionBanner({ instruction }: { instruction: Instruction | null }) {
  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {instruction?.text ?? ''}
      </div>

      <div className="pointer-events-none flex min-h-[5rem] flex-col items-center gap-3 text-center">
        <AnimatePresence mode="wait" initial={false}>
          {instruction && (
            <motion.div
              key={instruction.key}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22, ease: [0.65, 0, 0.35, 1] }}
              className="flex flex-col items-center gap-3"
            >
              {/* The arrow hangs outside the text rather than sitting in a
                  row with it. In a row it takes part in the centring, so the
                  words shift sideways whenever an arrow appears and the
                  instruction no longer lines up with the circle above it. */}
              <div className="relative flex items-center justify-center">
                {instruction.arrow && (
                  <motion.svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="absolute top-1/2 right-full mr-3 h-6 w-6 -translate-y-1/2 text-amber"
                    style={{ rotate: ARROW_ROTATION[instruction.arrow] }}
                    animate={{ opacity: [0.45, 1, 0.45] }}
                    transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <path
                      d="M12 4 L12 20 M12 4 L6 10 M12 4 L18 10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </motion.svg>
                )}
                <p className="text-(length:--text-instruct) leading-tight font-medium tracking-tight text-balance">
                  {instruction.text}
                </p>
              </div>
              {instruction.hint && (
                <p className="max-w-[34ch] text-sm text-ink-2 text-balance">{instruction.hint}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
