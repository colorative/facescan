import { useEffect, useRef, useState } from 'react'
import { FEATURES } from '@/config/kiosk'
import { onColorChange, resolveColor } from '@/overlay/resolveColor'
import { CornerBrackets } from '@/overlay/CornerBrackets'
import { OvalRing } from '@/overlay/OvalRing'
import { ScanCanvas } from '@/overlay/ScanCanvas'
import { SuccessBurst } from '@/overlay/SuccessBurst'
import { Telemetry } from '@/overlay/Telemetry'
import { VignetteMask } from '@/overlay/VignetteMask'
import type { Oval } from '@/overlay/OvalGeometry'
import type { Phase } from '@/machine/scanMachine'
import type { FaceMesh } from '@/vision/faceGeometry'
import type { GateReport } from '@/vision/gates'

/** Phase → reticle hue. One state, one colour; never a blend of two. */
export const PHASE_COLOR: Record<Phase, string> = {
  boot: 'var(--color-accent)',
  'starting-camera': 'var(--color-accent)',
  searching: 'var(--color-accent)',
  aligning: 'var(--color-amber)',
  capturing: 'var(--color-accent)',
  matching: 'var(--color-violet)',
  verified: 'var(--color-green)',
  card: 'var(--color-green)',
  printing: 'var(--color-green)',
  'print-ok': 'var(--color-green)',
  error: 'var(--color-red)',
}

type Props = {
  oval: Oval
  phase: Phase
  phaseRef: React.RefObject<Phase>
  progressRef: React.RefObject<number>
  meshRef: React.RefObject<FaceMesh | null>
  metricsRef: React.RefObject<GateReport['metrics']>
  fpsRef: React.RefObject<number>
  reportRef: React.RefObject<GateReport | null>
  /** Face acquired — drives the bracket lock-on. */
  locked: boolean
  delegate: string | null
}

/**
 * Composes the reticle. Order matters: mask, then canvas (sweep/mesh/motes
 * inside the oval), then the vector rim on top so strokes stay crisp over the
 * glow, then the success beat above everything.
 */
export function ScanOverlay({
  oval,
  phase,
  phaseRef,
  progressRef,
  meshRef,
  metricsRef,
  fpsRef,
  reportRef,
  locked,
  delegate,
}: Props) {
  /*
   * On success the surround is solid green, so the reticle inverts to dark ink.
   * Left green it would be green-on-green and simply vanish — the ring, ticks,
   * brackets and halos all carry the success colour themselves.
   */
  const success =
    phase === 'verified' || phase === 'card' || phase === 'printing' || phase === 'print-ok'
  const color = success ? 'var(--color-ground)' : PHASE_COLOR[phase]
  const tracking = phase === 'searching' || phase === 'aligning' || phase === 'capturing'

  /* The canvas reads the colour per frame from a ref. Passing it as a prop
     would re-run the canvas effect on every phase change, which re-seeds the
     particles — they would jump back to the rim mid-scan. */
  const colorRef = useRef(resolveColor(color))
  // Re-resolve on palette change too: the prop string stays
  // 'var(--color-accent)' while what it points at has changed underneath.
  const [themeTick, setThemeTick] = useState(0)
  useEffect(() => onColorChange(() => setThemeTick((t) => t + 1)), [])
  useEffect(() => {
    colorRef.current = resolveColor(color)
  }, [color, themeTick])

  return (
    <>
      <VignetteMask oval={oval} success={success} />

      <ScanCanvas
        oval={oval}
        phaseRef={phaseRef}
        progressRef={progressRef}
        meshRef={meshRef}
        colorRef={colorRef}
      />

      <OvalRing oval={oval} color={color} progressRef={progressRef} emphasis={locked} />

      {FEATURES.cornerBrackets && (
        <CornerBrackets oval={oval} color={color} locked={locked} />
      )}

      <SuccessBurst oval={oval} show={phase === 'verified'} onGreen />

      {FEATURES.telemetry && tracking && (
        <Telemetry
          metricsRef={metricsRef}
          fpsRef={fpsRef}
          report={reportRef}
          delegate={delegate}
        />
      )}
    </>
  )
}
