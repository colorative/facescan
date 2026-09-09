import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { TIMING } from '@/config/kiosk'
import { BADGE_H, BADGE_W, BadgeCard } from '@/modals/BadgeCard'
import { PrintAnimation } from '@/modals/PrintAnimation'
import { FitBox } from '@/ui/FitBox'
import { Button } from '@/ui/Button'
import type { Attendee } from '@/data/mockAttendees'
import type { Oval } from '@/overlay/OvalGeometry'
import type { Phase } from '@/machine/scanMachine'

/** One cross-fade for whatever occupies the action slot. */
const swap = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] as const },
}

const STATUS = 'flex w-full flex-col items-center gap-3 text-center'

type Props = {
  attendee: Attendee
  photo: string | null
  oval: Oval
  phase: Phase
  onPrint: () => void
  onNotMe: () => void
  onDone: () => void
}

/**
 * The badge popup.
 *
 * It rises from the oval's centre so the card reads as having come out of the
 * scan rather than arriving from nowhere. A visible countdown is not decoration:
 * an unattended kiosk must never be left holding someone's details on screen,
 * and the attendee needs to know it will clear itself.
 */
export function IdCardModal({
  attendee,
  photo,
  oval,
  phase,
  onPrint,
  onNotMe,
  onDone,
}: Props) {
  const printing = phase === 'printing'
  const printed = phase === 'print-ok'

  /*
   * Landscape puts the badge and its actions in two columns.
   *
   * Stacked, a portrait-proportioned badge plus a button stack does not fit
   * the height of a landscape panel — the card ends up shrunk to almost
   * nothing to make room. Side by side, each gets the axis it needs.
   */
  const landscape = oval.orientation === 'landscape'

  return (
    <motion.div
      /* A bounded flex column: the card takes the space that is left after the
         actions and countdown have theirs, and scales to fit it. Sizing the
         card first is what pushed it off screen on a short viewport. */
      className={[
        'absolute inset-0 z-30 flex items-center justify-center px-6 py-6',
        landscape ? 'flex-row gap-10' : 'flex-col gap-5',
      ].join(' ')}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Badge for ${attendee.name}`}
    >
      {/* Solid green scrim, matching the surround behind it, so the success
          reading does not revert to neutral the moment the card appears. The
          white badge carries plenty of contrast against it. */}
      <div className="absolute inset-0 bg-green backdrop-blur-xl" />

      <motion.div
        className={[
          'relative flex min-h-0 items-center justify-center',
          landscape ? 'h-full max-w-[30rem] flex-1' : 'w-full max-w-[30rem] flex-1',
        ].join(' ')}
        initial={{ opacity: 0, scale: 0.86, y: oval.cy - oval.vh / 2 + 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
        /* The printer assembly owns its own transforms; leaving a layout
           animation on this wrapper would compound with the feed. */
        layout={false}
      >
        {/* While printing, the badge is shown feeding out of the printer slot;
            once the job finishes it rests in the slot until it is taken. */}
        {printing || printed ? (
          <PrintAnimation attendee={attendee} photo={photo} settled={printed} />
        ) : (
          <FitBox width={BADGE_W} height={BADGE_H} maxScale={1.55} className="h-full w-full">
            <BadgeCard attendee={attendee} photo={photo} />
          </FitBox>
        )}

      </motion.div>

      <div
        className={[
          'relative flex shrink-0 flex-col gap-4',
          landscape
            ? 'w-[21rem] items-stretch'
            : 'w-full max-w-[30rem] items-center',
        ].join(' ')}
      >
        {/* Printing status takes the buttons' place rather than covering the
            badge. The attendee wants to see the badge that is printing, and a
            blurred panel floating over it belongs to no shape on screen. */}
        <AnimatePresence mode="wait" initial={false}>
          {printing ? (
            <motion.div key="printing" {...swap} className={STATUS}>
              <Spinner />
              <p className="text-xl font-semibold text-ground">Printing your badge…</p>
              <p className="font-mono text-[11px] tracking-[0.2em] text-ground/55 uppercase">
                Collect it from the slot below
              </p>
            </motion.div>
          ) : printed ? (
            <motion.div key="printed" {...swap} className={STATUS}>
              <PrintedMark />
              <p className="text-xl font-semibold text-ground">Badge printed</p>
              <p className="text-base text-ground/70">
                Enjoy the event, {attendee.name.split(' ')[0]}.
              </p>
            </motion.div>
          ) : (
            <motion.div key="actions" {...swap} className="flex w-full flex-col items-stretch gap-3">
              <Button variant="inverse" onClick={onPrint} className="min-h-18 text-xl">
                Print my badge
              </Button>
              <div className="flex gap-3">
                <Button variant="inverseSecondary" onClick={onDone} className="flex-1">
                  Done
                </Button>
                <Button variant="inverseGhost" onClick={onNotMe} className="flex-1">
                  Not me
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Countdown
          key={phase}
          ms={printed ? TIMING.printOkDismissMs : TIMING.cardTimeoutMs}
          hidden={printing}
        />
      </div>
    </motion.div>
  )
}

/** Dark on the green scrim — a cyan spinner would all but vanish there. */
function Spinner() {
  return (
    <motion.div
      className="h-12 w-12 rounded-full border-4 border-ground/20 border-t-ground"
      animate={{ rotate: 360 }}
      transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
    />
  )
}

function PrintedMark() {
  return (
    <motion.svg
      viewBox="0 0 48 48"
      className="h-12 w-12 text-ground"
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      aria-hidden
    >
      <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3" />
      <motion.path
        d="M14 25 L21 32 L34 17"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.34, delay: 0.12 }}
      />
    </motion.svg>
  )
}

/** Ticks down in whole seconds — a smoothly draining bar reads as a progress
 *  bar for something else. This is a deadline, so it counts. */
function Countdown({ ms, hidden }: { ms: number; hidden: boolean }) {
  const [left, setLeft] = useState(Math.ceil(ms / 1000))

  useEffect(() => {
    setLeft(Math.ceil(ms / 1000))
    const id = window.setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000)
    return () => clearInterval(id)
  }, [ms])

  if (hidden) return null

  return (
    <p className="relative text-center font-mono text-[11px] tracking-[0.3em] text-ground/60 uppercase">
      Returning in {left}s
    </p>
  )
}
