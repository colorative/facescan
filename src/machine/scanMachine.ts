import type { Attendee } from '@/data/mockAttendees'
import type { CameraFault } from '@/vision/useCamera'

/**
 * The scanner's discrete phases. Per-frame values (ring progress, sweep
 * position, landmark positions) deliberately do NOT live here — they are held
 * in refs and read by the canvas layers, because a per-frame reducer dispatch
 * would re-render React 60 times a second and starve the animation.
 */
export type Phase =
  | 'boot'
  | 'starting-camera'
  | 'searching'
  | 'aligning'
  | 'capturing'
  | 'matching'
  | 'verified'
  | 'card'
  | 'printing'
  | 'print-ok'
  | 'error'

/**
 * Errors that get their own full panel. Gate problems (dark, backlit, two
 * faces) are NOT errors — they are instructions inside `aligning`, because
 * they are the attendee's to fix in place and a panel would break the flow.
 */
export type ErrorCode =
  | 'permission'
  | 'no-camera'
  | 'camera-busy'
  | 'insecure'
  | 'model'
  | 'no-match'
  | 'lookup-failed'
  | 'wrong-person'
  | 'printer-offline'
  | 'print-failed'

export type ScanState = {
  phase: Phase
  error: ErrorCode | null
  attendee: Attendee | null
  /** Bumped on every reset; derived state keys off it so nothing leaks between attendees. */
  sessionId: number
  /** When the current phase was entered — drives progress and timeouts. */
  since: number
  /** Shown after TIMING.noFaceHintMs of an empty frame. */
  noFaceHint: boolean
  /**
   * The session is over and the kiosk should return to Attract.
   *
   * Distinguishes finishing (Done, a timeout, a dismissed error) from
   * retrying (the Try again button), which both reset scan state but must not
   * both send the attendee back to the start screen.
   */
  ended: boolean
}

export type ScanEvent =
  | { type: 'CAMERA_LIVE' }
  | { type: 'CAMERA_FAULT'; fault: CameraFault }
  | { type: 'MODEL_ERROR' }
  /** One evaluated frame. Only the two booleans the machine cares about. */
  | { type: 'GATES'; present: boolean; aligned: boolean }
  | { type: 'HOLD_COMPLETE' }
  | { type: 'CAPTURE_COMPLETE' }
  | { type: 'MATCH_OK'; attendee: Attendee }
  | { type: 'MATCH_NONE' }
  | { type: 'LOOKUP_FAILED' }
  | { type: 'VERIFIED_DONE' }
  | { type: 'NO_FACE_TIMEOUT' }
  | { type: 'PRINT' }
  | { type: 'PRINT_OK' }
  | { type: 'PRINT_FAIL'; code: 'printer-offline' | 'print-failed' }
  | { type: 'NOT_ME' }
  | { type: 'DISMISS' }
  | { type: 'RESET' }
  /**
   * DevPanel and deep-link escape hatch. Carries an attendee because the card
   * phases render nothing without one — forcing `card` with an empty attendee
   * silently shows an empty screen.
   */
  | { type: 'FORCE'; phase: Phase; error?: ErrorCode; attendee?: Attendee }

const FAULT_TO_ERROR: Record<CameraFault, ErrorCode> = {
  denied: 'permission',
  'not-found': 'no-camera',
  busy: 'camera-busy',
  insecure: 'insecure',
  unknown: 'no-camera',
}

export function initialState(now = performance.now()): ScanState {
  return {
    phase: 'starting-camera',
    error: null,
    attendee: null,
    sessionId: 0,
    since: now,
    noFaceHint: false,
    ended: false,
  }
}

const enter = (s: ScanState, phase: Phase, patch: Partial<ScanState> = {}): ScanState => ({
  ...s,
  phase,
  since: performance.now(),
  ...patch,
})

const fail = (s: ScanState, error: ErrorCode): ScanState =>
  enter(s, 'error', { error })

export function scanReducer(state: ScanState, event: ScanEvent): ScanState {
  switch (event.type) {
    case 'CAMERA_LIVE':
      return state.phase === 'starting-camera' ? enter(state, 'searching') : state

    // A camera fault can arrive at any time (device yanked, driver crash).
    case 'CAMERA_FAULT':
      return fail(state, FAULT_TO_ERROR[event.fault])

    case 'MODEL_ERROR':
      return fail(state, 'model')

    case 'GATES': {
      if (state.phase === 'searching') {
        if (!event.present) return state
        return enter(state, 'aligning', { noFaceHint: false })
      }
      if (state.phase === 'aligning') {
        // Face left the frame entirely — back to looking for someone.
        if (!event.present) return enter(state, 'searching')
        return state
      }
      if (state.phase === 'capturing') {
        // Losing alignment mid-capture aborts it. The ring drains rather than
        // completing, so the attendee sees the scan genuinely restart.
        if (!event.present) return enter(state, 'searching')
        if (!event.aligned) return enter(state, 'aligning')
        return state
      }
      return state
    }

    // Alignment held for TIMING.holdStableMs.
    case 'HOLD_COMPLETE':
      return state.phase === 'aligning' ? enter(state, 'capturing') : state

    case 'CAPTURE_COMPLETE':
      return state.phase === 'capturing' ? enter(state, 'matching') : state

    case 'MATCH_OK':
      return state.phase === 'matching'
        ? enter(state, 'verified', { attendee: event.attendee })
        : state

    case 'MATCH_NONE':
      return state.phase === 'matching' ? fail(state, 'no-match') : state

    case 'LOOKUP_FAILED':
      return state.phase === 'matching' ? fail(state, 'lookup-failed') : state

    case 'VERIFIED_DONE':
      return state.phase === 'verified' ? enter(state, 'card') : state

    case 'NO_FACE_TIMEOUT':
      return state.phase === 'searching' ? { ...state, noFaceHint: true } : state

    case 'PRINT':
      return state.phase === 'card' ? enter(state, 'printing') : state

    case 'PRINT_OK':
      return state.phase === 'printing' ? enter(state, 'print-ok') : state

    case 'PRINT_FAIL':
      return state.phase === 'printing' ? fail(state, event.code) : state

    // "Not me" is a mis-identification, not a failure of the attendee's —
    // it returns them to scanning rather than dead-ending in a panel.
    case 'NOT_ME':
      return state.phase === 'card'
        ? enter(state, 'error', { error: 'wrong-person', attendee: null })
        : state

    // Finished: reset everything and hand the kiosk back to Attract.
    case 'DISMISS':
      return {
        ...initialState(),
        sessionId: state.sessionId + 1,
        ended: true,
      }

    // Retry: same reset, but stay on the scanner and look again.
    case 'RESET':
      return {
        ...initialState(),
        sessionId: state.sessionId + 1,
      }

    case 'FORCE':
      return enter(state, event.phase, {
        error: event.error ?? null,
        attendee: event.attendee ?? state.attendee,
      })
  }
}

/** Phases where the attendee is being actively tracked. */
export function isTracking(phase: Phase): boolean {
  return phase === 'searching' || phase === 'aligning' || phase === 'capturing'
}

/** Phases that hold the badge popup open. */
export function isCardOpen(phase: Phase): boolean {
  return phase === 'card' || phase === 'printing' || phase === 'print-ok'
}
