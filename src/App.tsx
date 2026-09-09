import { AnimatePresence } from 'motion/react'
import { useCallback, useState } from 'react'
import { AttractScreen } from '@/screens/AttractScreen'
import { ScanScreen } from '@/screens/ScanScreen'
import { FallbackPanel } from '@/ui/FallbackPanel'
import type { FallbackKind } from '@/ui/FallbackPanel'
import { useKioskChrome } from '@/ui/useKioskChrome'
import { useIdleReset } from '@/ui/useIdleReset'

type Screen = 'attract' | 'scan'

/**
 * Dev-only deep link (?screen=scan) so the scanner can be opened directly for
 * screenshots and tuning without tapping through Attract each reload.
 */
function initialScreen(): Screen {
  if (!import.meta.env.DEV) return 'attract'
  return new URLSearchParams(window.location.search).get('screen') === 'scan'
    ? 'scan'
    : 'attract'
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen)
  const [fallback, setFallback] = useState<FallbackKind | null>(null)
  const { enter } = useKioskChrome()

  const start = useCallback(() => {
    // Fullscreen and wake lock need the user gesture, so they ride the tap.
    void enter()
    setScreen('scan')
  }, [enter])

  const home = useCallback(() => {
    setScreen('attract')
    setFallback(null)
  }, [])

  // A fallback panel left open must also time out back to Attract.
  useIdleReset(fallback !== null, home, fallback)

  return (
    <div className="h-full w-full">
      {screen === 'attract' ? (
        <AttractScreen onStart={start} onQrFallback={() => setFallback('qr')} />
      ) : (
        /* Staff help is no longer an Attract-screen button, but it is still
           reachable from an error panel — which is where someone actually
           needs it. */
        <ScanScreen
          onCancel={home}
          onQrFallback={() => setFallback('qr')}
          onStaffHelp={() => setFallback('staff')}
        />
      )}

      <AnimatePresence>
        {fallback && <FallbackPanel kind={fallback} onBack={home} />}
      </AnimatePresence>
    </div>
  )
}
