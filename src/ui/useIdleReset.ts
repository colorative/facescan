import { useEffect, useRef } from 'react'
import { TIMING } from '@/config/kiosk'

/**
 * Returns the kiosk to Attract after a spell of inactivity, from any state.
 *
 * Without this a kiosk eventually strands: someone walks off mid-scan, or an
 * error panel is dismissed by nobody, and the next attendee walks up to a
 * screen showing the last person's session.
 *
 * "Activity" is a touch, a key, or any state change — a phase transition means
 * the flow is genuinely progressing, so a slow but working scan is never cut off.
 */
export function useIdleReset(active: boolean, onIdle: () => void, ...activity: unknown[]) {
  const onIdleRef = useRef(onIdle)
  onIdleRef.current = onIdle

  useEffect(() => {
    if (!active) return

    let timer = 0
    const arm = () => {
      clearTimeout(timer)
      timer = window.setTimeout(() => onIdleRef.current(), TIMING.sessionIdleMs)
    }

    arm()
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'touchstart']
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }))

    return () => {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, arm))
    }
    // Re-arming on the spread activity values is the point: each change of a
    // watched value restarts the clock.
  }, [active, ...activity])
}
