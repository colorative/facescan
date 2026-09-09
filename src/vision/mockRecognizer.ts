import { MOCK_ATTENDEES } from '@/data/mockAttendees'
import type { Attendee } from '@/data/mockAttendees'

/**
 * Stands in for the real identity lookup. The seam is deliberate: swap this
 * one function for an API call and the rest of the kiosk is unchanged.
 */
export type MatchOutcome =
  | { kind: 'match'; attendee: Attendee }
  | { kind: 'none' }
  | { kind: 'failed' }

/** Forced by the DevPanel so every branch can be reviewed on demand. */
export type ForcedOutcome = 'auto' | 'match' | 'none' | 'failed'

let cursor = 0

export function recognize(forced: ForcedOutcome = 'auto'): MatchOutcome {
  if (forced === 'none') return { kind: 'none' }
  if (forced === 'failed') return { kind: 'failed' }

  // Cycle the roster so repeated scans show different badge categories rather
  // than the same card every time.
  const attendee = MOCK_ATTENDEES[cursor % MOCK_ATTENDEES.length]
  cursor += 1
  return { kind: 'match', attendee }
}
