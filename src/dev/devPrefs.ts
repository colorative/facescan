/**
 * Dev-only sticky preferences.
 *
 * Deliberately inert outside a dev build. A production kiosk that remembered
 * "use the mock tracker" would check attendees in against synthetic data with
 * no camera involved — so this cannot be allowed to survive into a build, and
 * the guard lives here rather than at each call site.
 *
 * Every access is wrapped: localStorage throws outright in some contexts
 * (private windows, blocked site data) rather than just returning null.
 */
const PREFIX = 'facescan.dev.'

export function readPref(key: string): string | null {
  if (!import.meta.env.DEV) return null
  try {
    return localStorage.getItem(PREFIX + key)
  } catch {
    return null
  }
}

export function writePref(key: string, value: string): void {
  if (!import.meta.env.DEV) return
  try {
    localStorage.setItem(PREFIX + key, value)
  } catch {
    // Preference simply will not stick; not worth surfacing.
  }
}
