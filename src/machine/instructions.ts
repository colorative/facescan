import type { GateFailure } from '@/vision/gates'

export type Arrow = 'up' | 'down' | 'left' | 'right' | null

export type Instruction = {
  /** Short imperative. Kiosk copy is read at a glance, standing up. */
  text: string
  /** Optional supporting clause; may be omitted on small screens. */
  hint?: string
  arrow: Arrow
  /** Stable key so the banner only re-animates on a genuine change. */
  key: string
}

export const CENTRE_YOURSELF: Instruction = {
  text: 'Centre your face in the circle',
  arrow: null,
  key: 'searching',
}

export const STEP_IN_FRONT: Instruction = {
  text: 'Step in front of the screen',
  hint: 'Stand about an arm’s length away',
  arrow: null,
  key: 'no-face',
}

export const HOLD_STILL: Instruction = {
  text: 'Hold still',
  arrow: null,
  key: 'capturing',
}

export const CHECKING: Instruction = {
  text: 'Checking you in…',
  arrow: null,
  key: 'matching',
}

export const VERIFIED: Instruction = {
  text: 'You’re checked in',
  arrow: null,
  key: 'verified',
}

/**
 * Maps the single prioritised gate failure to the one instruction on screen.
 *
 * Arrow direction note: the video is mirrored, so the attendee sees a
 * looking-glass image. A face measured to the left of the oval centre appears
 * on the *viewer's* left, and the correct instruction is to move right as they
 * perceive it. The sample's cx is already in mirrored screen space, so the
 * arrow points along the correction the attendee should make in the image —
 * pointing back toward the oval centre, i.e. against the offset sign.
 */
export function instructionFor(failure: GateFailure): Instruction {
  switch (failure.key) {
    case 'lighting':
      return failure.kind === 'dark'
        ? {
            text: 'Move to better lighting',
            hint: 'It’s too dark to see your face',
            arrow: null,
            key: 'light-dark',
          }
        : {
            text: 'Too much light behind you',
            hint: 'Try turning away from the window',
            arrow: null,
            key: 'light-bright',
          }

    case 'occupancy':
      return {
        text: 'One person at a time',
        hint: 'Ask others to step aside',
        arrow: null,
        key: 'multiple',
      }

    case 'distance':
      return failure.kind === 'far'
        ? { text: 'Move closer', arrow: null, key: 'too-far' }
        : { text: 'Move back a little', arrow: null, key: 'too-close' }

    case 'centering': {
      // Point along the dominant axis only. Two-axis arrows read as noise.
      const horizontal = Math.abs(failure.dx) > Math.abs(failure.dy)
      const arrow: Arrow = horizontal
        ? failure.dx > 0
          ? 'left'
          : 'right'
        : failure.dy > 0
          ? 'up'
          : 'down'
      return { text: 'Centre your face', arrow, key: `off-${arrow}` }
    }

    case 'pose':
      return failure.kind === 'roll'
        ? { text: 'Straighten your head', arrow: null, key: 'roll' }
        : { text: 'Look at the screen', arrow: null, key: 'yaw' }

    case 'stability':
      return { text: 'Hold still', arrow: null, key: 'jitter' }
  }
}
