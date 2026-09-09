import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { AmbientField } from '@/ui/AmbientField'
import { getModelStatus, onModelStatus, warmUpModel } from '@/vision/modelLoader'
import type { ModelStatus } from '@/vision/modelLoader'

/** One size for both entry buttons, so they are visibly a matched pair. */
const CTA =
  'relative flex h-16 w-[19rem] items-center justify-center px-8 text-base font-semibold tracking-tight transition-[transform,filter] duration-200 ease-(--ease-enter) hover:brightness-115'

type Props = {
  onStart: () => void
  onQrFallback: () => void
}

export function AttractScreen({ onStart, onQrFallback }: Props) {
  const [model, setModel] = useState<ModelStatus>(getModelStatus)

  // Warm the face model while the attendee reads the headline, so tapping
  // Start opens a live camera rather than a spinner.
  useEffect(() => {
    const off = onModelStatus(setModel)
    void warmUpModel().catch(() => {})
    return off
  }, [])

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden px-8 text-center">
      <AmbientField />

      {/* Header and footer float, so the main column can sit on the optical
          centre. Laying all three out in one flex column instead leaves a
          dead upper third on a tall portrait totem. */}
      <header className="absolute inset-x-0 top-14 flex flex-col items-center gap-5">
        {/* Served from public/, not hotlinked from the CDN: the kiosk has to
            work with no network, same reason the face model is vendored. */}
        <img
          src="/brand/eventify-logo.svg"
          alt="Eventify"
          className="h-[clamp(3rem,5vmin+1.25rem,6rem)] w-auto"
          draggable={false}
        />
        <span className="font-mono text-xs tracking-[0.35em] text-ink-3 uppercase">
          Attendee Check-In
        </span>
      </header>

      <main className="relative flex flex-col items-center gap-10">
        <h1 className="max-w-[18ch] text-(length:--text-headline) leading-[1.05] font-light tracking-tight text-balance">
          Check in with
          <br />
          <span className="font-semibold text-brand">your face</span>
        </h1>

        <p className="max-w-[36ch] text-xl leading-relaxed text-ink-2">
          Step up, look at the screen, and collect your badge. It takes about
          three seconds.
        </p>

        {/* This pill is the morph source: it becomes the scanner oval.
            The shared layoutId makes screen 1 → 2 read as one motion. */}
        {/* Two equally weighted routes in, matched in size so neither reads as
            the afterthought. Face scanning is optional by design. */}
        <div className="mt-2 flex flex-col items-center gap-4">
          <motion.button
            layoutId="reticle"
            onClick={onStart}
            className={`${CTA} animate-breathe bg-brand text-white`}
            /* Radius as an inline numeric value, not a `rounded-full` class.
               A shared layout animation has to interpolate border-radius to
               correct for the scale distortion of the morph; when it can only
               find a class it drops the radius and the pill flashes square. */
            style={{ borderRadius: 9999 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.span layout="position" className="relative z-1">
              Tap to start
            </motion.span>
          </motion.button>

          <button
            onClick={onQrFallback}
            className={`${CTA} rounded-full border-2 border-brand text-white active:scale-[0.97] hover:bg-brand/15`}
          >
            Check in with QR instead
          </button>
        </div>
      </main>

      {/* Only a genuine fault gets a line here. The model warm-up is silent by
          design — an attendee has no use for "preparing scanner", and a kiosk
          that narrates its own readiness just looks unready. */}
      {model === 'error' && (
        <footer className="absolute inset-x-0 bottom-14 flex flex-col items-center">
          <p className="font-mono text-xs tracking-wider text-amber/80">
            FACE MODEL UNAVAILABLE · USE QR CHECK-IN
          </p>
        </footer>
      )}
    </div>
  )
}
