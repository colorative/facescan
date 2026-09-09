import { motion } from 'motion/react'
import { Button } from '@/ui/Button'

export type FallbackKind = 'qr' | 'staff'

const COPY: Record<FallbackKind, { headline: string; body: string; hint: string }> = {
  qr: {
    headline: 'Scan your QR code',
    body: 'Hold the QR code from your confirmation email up to the reader below the screen.',
    hint: 'Can’t find the email? A staff member can look you up.',
  },
  staff: {
    headline: 'A staff member is on the way',
    body: 'Please wait here — someone from the check-in desk will help you shortly.',
    hint: 'You can also check in at the main desk.',
  },
}

/**
 * The non-biometric path. Every kiosk needs one: attendees who decline a face
 * scan, whose scan fails repeatedly, or who simply prefer not to, must still
 * be able to check in without feeling singled out — so this is a peer of the
 * face flow on the Attract screen, not a consolation buried in an error.
 */
export function FallbackPanel({
  kind,
  onBack,
}: {
  kind: FallbackKind
  onBack: () => void
}) {
  const copy = COPY[kind]

  return (
    <motion.div
      className="absolute inset-0 z-40 flex flex-col items-center justify-center overflow-y-auto px-8 py-8 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28 }}
      role="dialog"
      aria-modal="true"
      aria-label={copy.headline}
    >
      <div className="absolute inset-0 bg-ground/92 backdrop-blur-xl" />

      <motion.div
        className="relative flex max-h-full max-w-[34rem] flex-col items-center gap-[min(1.5rem,2.6vh)]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        {kind === 'qr' ? <QrTarget /> : <StaffIcon />}

        <h2 className="text-(length:--text-panel) leading-tight font-semibold tracking-tight text-balance">
          {copy.headline}
        </h2>
        <p className="text-base leading-relaxed text-ink-2 text-balance sm:text-lg">{copy.body}</p>
        <p className="text-base text-ink-3 text-balance">{copy.hint}</p>

        <Button variant="secondary" onClick={onBack} className="mt-2 min-w-64">
          Back
        </Button>
      </motion.div>
    </motion.div>
  )
}

function QrTarget() {
  return (
    <div className="relative flex h-[min(8rem,14vh)] w-[min(8rem,14vh)] shrink-0 items-center justify-center">
      <svg viewBox="0 0 48 48" className="h-full w-full text-accent" aria-hidden>
        {[
          'M6 16V9a3 3 0 0 1 3-3h7',
          'M42 16V9a3 3 0 0 0-3-3h-7',
          'M6 32v7a3 3 0 0 0 3 3h7',
          'M42 32v7a3 3 0 0 1-3 3h-7',
        ].map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        ))}
        <rect x="17" y="17" width="6" height="6" fill="currentColor" opacity="0.75" />
        <rect x="25" y="17" width="6" height="6" fill="currentColor" opacity="0.35" />
        <rect x="17" y="25" width="6" height="6" fill="currentColor" opacity="0.35" />
        <rect x="25" y="25" width="6" height="6" fill="currentColor" opacity="0.75" />
      </svg>
    </div>
  )
}

function StaffIcon() {
  return (
    <div className="flex h-[min(7rem,12vh)] w-[min(7rem,12vh)] shrink-0 items-center justify-center rounded-3xl border border-accent/25 bg-accent/10">
      <svg viewBox="0 0 24 24" className="h-1/2 w-1/2 text-accent" aria-hidden>
        <path
          d="M12 11.5a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z M5.5 19.5a6.5 6.5 0 0 1 13 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}
