import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { TIMING } from '@/config/kiosk'
import { Button } from '@/ui/Button'
import type { ErrorCode } from '@/machine/scanMachine'

type Copy = {
  headline: string
  remedy: string
  icon: 'camera' | 'face' | 'printer' | 'cloud' | 'lock'
  /** Retrying makes no sense for a hardware or policy problem. */
  retry: boolean
  /** Terminal problems need staff, not another attempt. */
  tone: 'recoverable' | 'terminal'
}

/**
 * Every panel has the same shape — icon, headline, one-line remedy, then
 * actions in a fixed order. Copy is written for someone standing in a queue:
 * what went wrong, and the one thing to do next. No codes, no jargon.
 */
const COPY: Record<ErrorCode, Copy> = {
  permission: {
    headline: 'Camera access is blocked',
    remedy: 'A member of staff needs to enable the camera on this kiosk.',
    icon: 'lock',
    retry: false,
    tone: 'terminal',
  },
  'no-camera': {
    headline: 'No camera found',
    remedy: 'This kiosk can’t scan right now. Please check in with your QR code.',
    icon: 'camera',
    retry: true,
    tone: 'terminal',
  },
  'camera-busy': {
    headline: 'The camera is in use',
    remedy: 'Another program is holding the camera. Staff can free it up.',
    icon: 'camera',
    retry: true,
    tone: 'terminal',
  },
  insecure: {
    headline: 'Scanner unavailable',
    remedy: 'This kiosk isn’t set up correctly for camera access.',
    icon: 'lock',
    retry: false,
    tone: 'terminal',
  },
  model: {
    headline: 'Scanner didn’t load',
    remedy: 'Face check-in is unavailable. Your QR code will still work.',
    icon: 'face',
    retry: true,
    tone: 'terminal',
  },
  'no-match': {
    headline: 'We couldn’t find you',
    remedy: 'Try again, or check in with the QR code from your email.',
    icon: 'face',
    retry: true,
    tone: 'recoverable',
  },
  'lookup-failed': {
    headline: 'Couldn’t reach the guest list',
    remedy: 'The connection dropped. Try again in a moment.',
    icon: 'cloud',
    retry: true,
    tone: 'recoverable',
  },
  'wrong-person': {
    headline: 'Sorry about that',
    remedy: 'Let’s try the scan again, or a staff member can look you up.',
    icon: 'face',
    retry: true,
    tone: 'recoverable',
  },
  'printer-offline': {
    headline: 'The printer is offline',
    remedy: 'You’re checked in. Staff can print your badge at the desk.',
    icon: 'printer',
    retry: true,
    tone: 'recoverable',
  },
  'print-failed': {
    headline: 'Printing didn’t finish',
    remedy: 'You’re checked in. Try printing again, or ask at the desk.',
    icon: 'printer',
    retry: true,
    tone: 'recoverable',
  },
}

/** Each icon is a list of subpaths — no delimiter parsing to get wrong. */
const ICONS: Record<Copy['icon'], string[]> = {
  camera: [
    'M3 8.5A2.5 2.5 0 0 1 5.5 6h2L9 4h6l1.5 2h2A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-8Z',
    'M12 15.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  ],
  // A face inside a reticle, not a smiley — an expression reads as a mood and
  // this panel is reporting a failure, not feeling one.
  face: [
    'M12 11.5a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z',
    'M7.2 17.6a5 5 0 0 1 9.6 0',
    'M4 8.5V6a2 2 0 0 1 2-2h2.5',
    'M20 8.5V6a2 2 0 0 0-2-2h-2.5',
    'M4 15.5V18a2 2 0 0 0 2 2h2.5',
    'M20 15.5V18a2 2 0 0 1-2 2h-2.5',
  ],
  printer: [
    'M7 9V4h10v5',
    'M6 18h12a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2Z',
    'M7 15h10v5H7v-5Z',
  ],
  cloud: ['M7 18a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.6 1.5A3.5 3.5 0 0 1 17 18H7Z', 'M3 3l18 18'],
  lock: [
    'M7 11V8a5 5 0 0 1 10 0v3',
    'M5.5 11h13a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5v-7A1.5 1.5 0 0 1 5.5 11Z',
  ],
}

type Props = {
  code: ErrorCode
  onRetry: () => void
  onQr: () => void
  onStaff: () => void
}

export function ErrorPanel({ code, onRetry, onQr, onStaff }: Props) {
  const copy = COPY[code]

  return (
    <motion.div
      className="absolute inset-0 z-30 flex flex-col items-center justify-center overflow-y-auto px-8 py-8 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28 }}
      role="alertdialog"
      aria-label={copy.headline}
    >
      <div className="absolute inset-0 bg-ground/90 backdrop-blur-xl" />

      <motion.div
        className="relative flex max-h-full flex-col items-center gap-[min(1.75rem,3vh)]"
        initial={{ opacity: 0, y: 22, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex h-[min(6rem,10vh)] w-[min(6rem,10vh)] shrink-0 items-center justify-center rounded-3xl border border-red/30 bg-red/10">
          <svg viewBox="0 0 24 24" className="h-1/2 w-1/2 text-red" aria-hidden>
            {ICONS[copy.icon].map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="max-w-[22ch] text-(length:--text-panel) leading-tight font-semibold tracking-tight text-balance">
            {copy.headline}
          </h2>
          <p className="max-w-[38ch] text-base leading-relaxed text-ink-2 text-balance sm:text-lg">
            {copy.remedy}
          </p>
        </div>

        {/* Fixed action order across every panel, so the primary is always in
            the same place no matter which failure an attendee hits. */}
        <div className="flex w-full max-w-[26rem] shrink-0 flex-col gap-3">
          {copy.retry && (
            <Button
              variant={copy.tone === 'recoverable' ? 'primary' : 'secondary'}
              onClick={onRetry}
              className="min-h-16 text-lg"
            >
              Try again
            </Button>
          )}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onQr} className="flex-1">
              Use my QR code
            </Button>
            <Button variant="ghost" onClick={onStaff} className="flex-1">
              Get staff help
            </Button>
          </div>
        </div>

        <AutoReturn />
      </motion.div>
    </motion.div>
  )
}

/** No error panel is a dead end: the kiosk always returns itself to Attract. */
function AutoReturn() {
  const [left, setLeft] = useState(Math.ceil(TIMING.errorAutoReturnMs / 1000))
  useEffect(() => {
    const id = window.setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <p className="font-mono text-[11px] tracking-[0.3em] text-ink-3 uppercase">
      Starting over in {left}s
    </p>
  )
}
