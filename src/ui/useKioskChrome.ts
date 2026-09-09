import { useCallback, useEffect, useRef } from 'react'
import { FEATURES } from '@/config/kiosk'

/**
 * Turns a browser tab into kiosk furniture: no cursor, no sleep, no accidental
 * exit gestures. Fullscreen and wake lock both require a user gesture or an
 * already-visible document, so `enter()` is called from the Attract tap rather
 * than on mount.
 */
export function useKioskChrome() {
  const wakeLock = useRef<WakeLockSentinel | null>(null)

  const acquireWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return
    try {
      wakeLock.current = await navigator.wakeLock.request('screen')
    } catch {
      // Denied or unsupported — the display may sleep, which is a deployment
      // concern (set it at the OS level), not something to surface to attendees.
    }
  }, [])

  const enter = useCallback(async () => {
    if (!FEATURES.kioskMode) return
    document.documentElement.dataset.kiosk = 'true'
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      }
    } catch {
      // Fullscreen refused; the UI is already viewport-filling so this is cosmetic.
    }
    void acquireWakeLock()
  }, [acquireWakeLock])

  useEffect(() => {
    // A wake lock is dropped whenever the tab is hidden; re-take it on return.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && FEATURES.kioskMode) {
        void acquireWakeLock()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    // Suppress browser affordances that make a kiosk look like a computer.
    const block = (e: Event) => e.preventDefault()
    document.addEventListener('contextmenu', block)
    document.addEventListener('dragstart', block)
    // Pinch-zoom on touch kiosks slips past user-scalable=no in some engines.
    const blockGesture = (e: Event) => e.preventDefault()
    document.addEventListener('gesturestart', blockGesture)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      document.removeEventListener('contextmenu', block)
      document.removeEventListener('dragstart', block)
      document.removeEventListener('gesturestart', blockGesture)
      void wakeLock.current?.release()
      wakeLock.current = null
    }
  }, [acquireWakeLock])

  return { enter }
}
