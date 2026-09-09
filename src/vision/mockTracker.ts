import type { Oval } from '@/overlay/OvalGeometry'
import type { FaceSample } from '@/vision/gates'
import { GATES } from '@/config/kiosk'

/**
 * Synthetic tracking data.
 *
 * Two jobs. It drives the scripted replay used for deterministic screenshots
 * and stakeholder review, and it lets every instruction state be exercised on
 * a machine with no webcam — including this one. Each scenario is aimed
 * squarely at one gate, so the DevPanel can walk the full instruction set.
 */
export type MockScenario =
  | 'approach' // the scripted happy path: absent -> far -> off-centre -> aligned
  | 'absent'
  | 'aligned'
  | 'too-far'
  | 'too-close'
  | 'off-left'
  | 'off-right'
  | 'off-up'
  | 'off-down'
  | 'dark'
  | 'bright'
  | 'two-faces'
  | 'roll'
  | 'yaw'
  | 'jitter'

export const SCENARIOS: MockScenario[] = [
  'approach',
  'absent',
  'aligned',
  'too-far',
  'too-close',
  'off-left',
  'off-right',
  'off-up',
  'off-down',
  'dark',
  'bright',
  'two-faces',
  'roll',
  'yaw',
  'jitter',
]

/** Mid-band values, so a nominally aligned sample sits comfortably inside every gate. */
const GOOD_FILL = (GATES.fill.min + GATES.fill.max) / 2
const GOOD_LUMA = (GATES.luma.min + GATES.luma.max) / 2

function base(oval: Oval, t: number): FaceSample {
  const ovalHeightFrac = (oval.ry * 2) / oval.vh
  return {
    t,
    faces: 1,
    cx: oval.cx / oval.vw,
    cy: oval.cy / oval.vh,
    height: GOOD_FILL * ovalHeightFrac,
    rollDeg: 0,
    yawDeg: 0,
    luma: GOOD_LUMA,
  }
}

/** Offset in oval-radius units → normalised viewport delta. */
function nudge(s: FaceSample, oval: Oval, dx: number, dy: number): FaceSample {
  return {
    ...s,
    cx: s.cx + (dx * oval.rx) / oval.vw,
    cy: s.cy + (dy * oval.ry) / oval.vh,
  }
}

export function mockSample(
  scenario: MockScenario,
  oval: Oval,
  /** ms since the scenario started. */
  elapsed: number,
): FaceSample | null {
  const t = performance.now()
  const s = base(oval, t)
  const ovalHeightFrac = (oval.ry * 2) / oval.vh
  // A little life, so nothing looks like a frozen test fixture.
  const breathe = Math.sin(elapsed / 700) * 0.012

  switch (scenario) {
    case 'absent':
      return null

    case 'aligned':
      return nudge({ ...s, cy: s.cy + breathe }, oval, 0, 0)

    case 'too-far':
      return { ...s, height: (GATES.fill.min - 0.22) * ovalHeightFrac }

    case 'too-close':
      return { ...s, height: (GATES.fill.max + 0.3) * ovalHeightFrac }

    // Offsets are in mirrored screen space: 'off-left' means the attendee
    // appears left of centre, so the arrow must send them right.
    case 'off-left':
      return nudge(s, oval, -(GATES.offset.max + 0.3), 0)
    case 'off-right':
      return nudge(s, oval, GATES.offset.max + 0.3, 0)
    case 'off-up':
      return nudge(s, oval, 0, -(GATES.offset.max + 0.3))
    case 'off-down':
      return nudge(s, oval, 0, GATES.offset.max + 0.3)

    case 'dark':
      return { ...s, luma: GATES.luma.min - 0.1 }
    case 'bright':
      return { ...s, luma: GATES.luma.max + 0.1 }

    case 'two-faces':
      return { ...s, faces: 2 }

    case 'roll':
      return { ...s, rollDeg: GATES.rollDeg.max + 9 }
    case 'yaw':
      return { ...s, yawDeg: GATES.yawDeg.max + 12 }

    case 'jitter': {
      // Fast pseudo-random shake, well past the variance threshold.
      const j = (n: number) => Math.sin(elapsed / n) * 0.06
      return nudge(s, oval, j(37) + j(53), j(41) + j(61))
    }

    case 'approach': {
      // A believable walk-up, staged so a reviewer sees each instruction in
      // turn. Every beat is held comfortably longer than the gate debounce —
      // a stage shorter than TIMING.gateDebounceMs is correctly suppressed and
      // would simply never appear in the demo.
      if (elapsed < 900) return null

      // 900–1900: too far away, drifting in from the left.
      if (elapsed < 1900) {
        const p = (elapsed - 900) / 1000
        return nudge(
          { ...s, height: (GATES.fill.min - 0.2 + p * 0.17) * ovalHeightFrac },
          oval,
          -0.62 * (1 - 0.4 * p),
          0.12 * (1 - p),
        )
      }

      // 1900–2750: close enough, but still off to one side — this is the beat
      // that shows the direction arrow, so it is held ~850ms.
      if (elapsed < 2750) {
        const p = (elapsed - 1900) / 850
        // Decay only over the final third, so the offset stays well past the
        // threshold long enough for the arrow to appear and be read.
        const decay = p < 0.66 ? 1 : 1 - (p - 0.66) / 0.34
        return nudge(
          { ...s, height: (GATES.fill.min + 0.04 + p * 0.07) * ovalHeightFrac },
          oval,
          -(GATES.offset.max + 0.16) * decay,
          0,
        )
      }

      return { ...s, cy: s.cy + breathe }
    }
  }
}
