import { motion } from 'motion/react'
import type { Oval } from '@/overlay/OvalGeometry'

/**
 * Darkens and desaturates everything outside the oval, leaving the face area
 * at full colour. Focus without drawing a hard frame around the attendee.
 *
 * Done with one backdrop-filtered layer masked by a radial gradient rather
 * than two stacked <video> elements: a second decode of the same stream is a
 * real cost on kiosk hardware, and this composites on the GPU for free.
 */
export function VignetteMask({ oval, success }: { oval: Oval; success: boolean }) {
  // Soft inner edge (94%→100%) so the boundary reads as a lens falloff
  // instead of a cut-out sticker.
  const punch = `radial-gradient(${oval.rx}px ${oval.ry}px at ${oval.cx}px ${oval.cy}px, transparent 94%, black 100%)`

  return (
    <>
      {/* Faded out on success: the green surround below is opaque, so all this
          layer still contributes there is a muddy dark smudge in the mask's
          soft edge, just inside the ring. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-ground/55 backdrop-saturate-[0.35] backdrop-brightness-[0.5]"
        style={{ maskImage: punch, WebkitMaskImage: punch }}
        initial={false}
        animate={{ opacity: success ? 0 : 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      />
      {/* Slight lift inside the oval — the attendee's face should be the
          brightest, most saturated thing on the screen. */}
      <div
        aria-hidden
        className="absolute inset-0 backdrop-saturate-[1.12] backdrop-contrast-[1.06]"
        style={{
          maskImage: punch.replace('transparent 94%, black 100%', 'black 88%, transparent 100%'),
          WebkitMaskImage: punch.replace(
            'transparent 94%, black 100%',
            'black 88%, transparent 100%',
          ),
        }}
      />

      {/* Success: the whole surround goes green and stays there, so the result
          is readable from across the room rather than being a flash you can
          miss. Masked with the same punch, so the attendee's own face stays
          true colour instead of being tinted. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-green"
        style={{ maskImage: punch, WebkitMaskImage: punch }}
        initial={{ opacity: 0 }}
        animate={{ opacity: success ? 1 : 0 }}
        transition={{ duration: success ? 0.45 : 0.3, ease: [0.22, 1, 0.36, 1] }}
      />
    </>
  )
}
