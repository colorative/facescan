import { motion, useReducedMotion } from 'motion/react'
import { BADGE_H, BADGE_W, BadgeCard } from '@/modals/BadgeCard'
import { FitBox } from '@/ui/FitBox'
import type { Attendee } from '@/data/mockAttendees'

/** Aperture height, and how much wider the machine fascia is than the card. */
const SLOT_H = 26
const FASCIA_PAD = 52
/** Where the aperture sits inside the fascia. */
const SLOT_TOP = 9
/**
 * Slack inside the clip window for the card's own shadow.
 *
 * The window has to clip the card — that is what sells the slot — but a window
 * sized to the card clips its shadow too, slicing it flush at the edges.
 *
 * Sized for the *projected* card, not the flat one: perspective magnifies the
 * near edge, so mid-feed the card measures ~23px wider than at rest and its
 * shadow is magnified with it. Measured slack was 26px against a 22px blur at
 * that moment, which is precisely when the slicing showed.
 */
const SHADOW_ROOM = 72
const TAIL_ROOM = 84

const ASSEMBLY_W = BADGE_W + FASCIA_PAD * 2
const ASSEMBLY_H = SLOT_TOP + SLOT_H + BADGE_H + TAIL_ROOM

/**
 * The badge feeding out of a printer slot.
 *
 * Four things do the work of making it read as paper leaving a machine:
 *
 *  1. The part still inside is genuinely clipped by the window below the
 *     aperture, so the card is *revealed* from its top edge rather than
 *     sliding over the fascia.
 *  2. Perspective plus a rotateX that eases to flat — the sheet tips toward
 *     the viewer as it clears the rollers.
 *  3. A stepped feed. Real rollers advance in increments, and repeating a
 *     keyframe value creates the tiny dwell between steps. A single linear
 *     glide is the giveaway that something is a div and not paper.
 *  4. A specular sweep down the face, plus a shadow fixed at the aperture so
 *     the emerging edge stays in the machine's shade.
 *
 * The whole assembly is laid out in fixed pixels and scaled by FitBox, so the
 * geometry (where the slot is, how far the card travels) can be reasoned about
 * exactly rather than in percentages.
 */
export function PrintAnimation({
  attendee,
  photo,
  /** True once the job is done: the badge rests fully out, in the slot. */
  settled,
}: {
  attendee: Attendee
  photo: string | null
  settled: boolean
}) {
  const reduced = useReducedMotion()

  // Doubled values are the dwell between roller steps.
  const feed = {
    y: [-BADGE_H, -BADGE_H * 0.74, -BADGE_H * 0.72, -BADGE_H * 0.43, -BADGE_H * 0.41, -BADGE_H * 0.12, 0],
    rotateX: [18, 13, 13, 8, 8, 2.5, 0],
    rotateZ: [0, -0.55, -0.55, 0.5, 0.5, -0.22, 0],
  }

  return (
    <FitBox width={ASSEMBLY_W} height={ASSEMBLY_H} maxScale={1.3} className="h-full w-full">
      <div className="relative" style={{ width: ASSEMBLY_W, height: ASSEMBLY_H }}>
        {/* Machine fascia — the dark face the slot is cut into. */}
        <div
          className="absolute inset-x-0 top-0 rounded-2xl"
          style={{
            height: SLOT_H + 18,
            background: 'linear-gradient(#161b23, #0b0f15)',
            boxShadow:
              '0 1px 0 rgba(255,255,255,0.16) inset, 0 -10px 24px -12px rgba(0,0,0,0.8)',
          }}
        />

        {/* The aperture. Deep inner shadow reads as a cavity; the lit lower lip
            is what stops it looking like a painted-on rectangle. */}
        <div
          className="absolute rounded-[5px]"
          style={{
            left: FASCIA_PAD - 14,
            right: FASCIA_PAD - 14,
            top: SLOT_TOP,
            height: SLOT_H,
            background: 'linear-gradient(#05070b, #010204)',
            boxShadow:
              'inset 0 4px 9px rgba(0,0,0,0.95), inset 0 -1.5px 0 rgba(255,255,255,0.14), 0 1px 0 rgba(255,255,255,0.08)',
          }}
        />

        {/* Emergence window. Its top edge is the aperture, so anything above is
            still "inside" the machine and clipped away. */}
        <div
          className="absolute overflow-hidden"
          style={{
            left: FASCIA_PAD - SHADOW_ROOM,
            width: BADGE_W + SHADOW_ROOM * 2,
            top: SLOT_TOP + SLOT_H - 2,
            height: BADGE_H + TAIL_ROOM,
            perspective: 1500,
            perspectiveOrigin: 'top center',
          }}
        >
          <motion.div
            style={{
              width: BADGE_W,
              height: BADGE_H,
              marginLeft: SHADOW_ROOM,
              transformOrigin: 'top center',
            }}
            initial={reduced || settled ? false : { y: -BADGE_H, rotateX: 18 }}
            animate={settled || reduced ? { y: 0, rotateX: 0, rotateZ: 0 } : feed}
            transition={
              settled || reduced
                ? { duration: 0.35, ease: [0.22, 1, 0.36, 1] }
                : {
                    duration: 2.2,
                    times: [0, 0.22, 0.27, 0.52, 0.57, 0.84, 1],
                    ease: 'easeInOut',
                  }
            }
          >
            {/* Shadow only once the card is at rest.
            
                While feeding, a filter shadow rides inside the clipped,
                perspective-transformed element: it translates rigidly with the
                card and its edges get sliced by the clip, which is exactly the
                artefact that kept reappearing. A sheet emerging into air has
                nothing beneath it to catch a shadow anyway — the aperture
                shade below is the contact shadow, and it correctly stays put
                at the slot instead of travelling with the paper. */}
            <div
              className="relative"
              style={{
                filter: settled ? 'drop-shadow(0 6px 18px rgba(0,0,0,0.32))' : 'none',
                transition: 'filter 300ms ease-out',
              }}
            >
              <BadgeCard attendee={attendee} photo={photo} />

              {/* Specular sweep — a sheet of paper catches the light as it
                  turns past the aperture.

                  Clipped to the card's own rounded box. It travels from above
                  the card to below it, so unclipped it slides off the bottom
                  and blends with whatever is behind — which on the green
                  success scrim showed up as a pale rectangle with hard side
                  edges floating under the badge. */}
              {!reduced && !settled && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
                >
                  <motion.div
                    className="absolute inset-0"
                    style={{
                      background:
                        'linear-gradient(175deg, transparent 34%, rgba(255,255,255,0.4) 48%, transparent 62%)',
                      mixBlendMode: 'overlay',
                    }}
                    initial={{ y: '-90%' }}
                    animate={{ y: '95%' }}
                    transition={{ duration: 2.2, ease: 'easeInOut' }}
                  />
                </div>
              )}
            </div>
          </motion.div>

          {/* Shade cast by the aperture. Fixed to the window, not the card, so
              the emerging edge stays dark as it passes through. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0"
            style={{
              height: 56,
              background:
                'linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0.16) 45%, transparent)',
              /* Faded at both ends rather than cut to the card's flat width:
                 perspective makes the card wider mid-feed than at rest, so a
                 hard-edged band stopped short of its edges. */
              maskImage:
                'linear-gradient(to right, transparent, black 14%, black 86%, transparent)',
              WebkitMaskImage:
                'linear-gradient(to right, transparent, black 14%, black 86%, transparent)',
            }}
          />
        </div>
      </div>
    </FitBox>
  )
}
