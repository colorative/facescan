import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FEATURES } from '@/config/kiosk'
import { DevPanel } from '@/dev/DevPanel'
import { MOCK_ATTENDEES } from '@/data/mockAttendees'
import { isCardOpen } from '@/machine/scanMachine'
import type { ErrorCode, Phase } from '@/machine/scanMachine'
import { useScanSession } from '@/machine/useScanSession'
import { IdCardModal } from '@/modals/IdCardModal'
import { printBadge } from '@/modals/printBadge'
import type { ForcedPrint } from '@/modals/printBadge'
import { useOval } from '@/overlay/OvalGeometry'
import { PHASE_COLOR, ScanOverlay } from '@/overlay/ScanOverlay'
import { ErrorPanel } from '@/ui/ErrorPanel'
import { InstructionBanner } from '@/ui/InstructionBanner'
import { useIdleReset } from '@/ui/useIdleReset'
import type { Oval } from '@/overlay/OvalGeometry'
import type { FaceMesh } from '@/vision/faceGeometry'
import { makeSyntheticFace } from '@/vision/faceGeometry'
import type { ForcedOutcome } from '@/vision/mockRecognizer'
import type { MockScenario } from '@/vision/mockTracker'
import { mockSample } from '@/vision/mockTracker'
import { useCamera } from '@/vision/useCamera'
import { useFaceTracker } from '@/vision/useFaceTracker'
import { getModelStatus, onModelStatus } from '@/vision/modelLoader'

type Props = {
  onCancel: () => void
  onQrFallback: () => void
  onStaffHelp: () => void
}

/** Faces are roughly this much wider than tall — used to size the mock mesh. */
const FACE_ASPECT = 0.68

/**
 * Dev-only deep links, so any state can be opened directly for review or a
 * screenshot without performing the whole flow:
 *   ?screen=scan&scenario=off-left   pick the mock scenario
 *   ?screen=scan&force=no-match      jump straight to an error panel
 *   ?screen=scan&phase=card          jump straight to a phase
 */
function devParams() {
  if (!import.meta.env.DEV) return {}
  const q = new URLSearchParams(window.location.search)
  return {
    scenario: (q.get('scenario') as MockScenario | null) ?? null,
    force: (q.get('force') as ErrorCode | null) ?? null,
    phase: (q.get('phase') as Phase | null) ?? null,
    /*
     * Any of these is a design-review link, so all of them imply mock
     * tracking. Without that, a forced phase races the real camera: on a
     * machine with no webcam the fault arrives a moment later and replaces
     * whatever phase was being reviewed with the no-camera panel.
     */
    mock:
      q.get('mock') === '1' || q.has('scenario') || q.has('phase') || q.has('force'),
  }
}

export function ScanScreen({ onCancel, onQrFallback, onStaffHelp }: Props) {
  const oval = useOval()
  const videoRef = useRef<HTMLVideoElement>(null)
  const { state: camera, start } = useCamera(videoRef)

  /**
   * Real camera tracking is the default. The mock is an explicit dev choice
   * (?mock=1, ?scenario=…, or the DEV panel) and never a silent fallback: a
   * kiosk that quietly fakes a scan when the camera dies would check people in
   * against synthetic data. No camera is an error panel, which is correct.
   */
  const [useMock, setUseMock] = useState(() => devParams().mock ?? false)
  const [scenario, setScenario] = useState<MockScenario>(
    () => devParams().scenario ?? 'approach',
  )
  const [forced, setForced] = useState<ForcedOutcome>('auto')
  const [forcedPrint, setForcedPrint] = useState<ForcedPrint>('auto')

  /**
   * The badge photo, held in a state variable for the length of one session
   * and nothing longer. It is never uploaded and never written to storage; the
   * session reset below drops it.
   */
  const [photo, setPhoto] = useState<string | null>(null)

  /** Latest face mesh, read by the canvas each frame. */
  const meshRef = useRef<FaceMesh | null>(null)

  const scenarioStart = useRef(performance.now())
  useEffect(() => {
    scenarioStart.current = performance.now()
  }, [scenario])

  /**
   * Produces one sample per frame and, as a side effect, refreshes the mesh
   * the canvas draws. Kept together deliberately: both derive from the same
   * observation, and splitting them would mean tracking twice per frame.
   */
  const { sample: trackedSample, delegate } = useFaceTracker(videoRef, meshRef, !useMock)

  const source = useCallback(
    (o: Oval) => {
      if (!useMock) return trackedSample(o)
      const sample = mockSample(scenario, o, performance.now() - scenarioStart.current)
      if (!sample) {
        meshRef.current = null
        return null
      }
      if (!FEATURES.mesh) return sample
      const wNorm = (sample.height * o.vh * FACE_ASPECT) / o.vw
      meshRef.current = makeSyntheticFace(
        sample.cx,
        sample.cy,
        wNorm,
        sample.height,
        sample.rollDeg,
        sample.yawDeg,
      )
      return sample
    },
    [useMock, scenario, trackedSample],
  )

  const { state, send, instruction, progressRef, metricsRef, fpsRef, reportRef } =
    useScanSession(oval, source, forced)

  const phaseRef = useRef(state.phase)
  phaseRef.current = state.phase

  // Grab the badge frame at the moment of verification, while the attendee is
  // still square to the camera.
  useEffect(() => {
    if (state.phase !== 'verified') return
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const c = document.createElement('canvas')
    c.width = 320
    c.height = 320
    const ctx = c.getContext('2d')
    if (!ctx) return
    // Centre-crop the square from the middle of the frame.
    const side = Math.min(video.videoWidth, video.videoHeight)
    ctx.drawImage(
      video,
      (video.videoWidth - side) / 2,
      (video.videoHeight - side) / 2,
      side,
      side,
      0,
      0,
      320,
      320,
    )
    setPhoto(c.toDataURL('image/jpeg', 0.86))
  }, [state.phase])

  // Nothing survives into the next attendee's session.
  useEffect(() => {
    setPhoto(null)
  }, [state.sessionId])

  const handlePrint = useCallback(async () => {
    send({ type: 'PRINT' })
    const result = await printBadge(forcedPrint)
    send(result.ok ? { type: 'PRINT_OK' } : { type: 'PRINT_FAIL', code: result.code })
  }, [send, forcedPrint])

  useEffect(() => {
    if (!useMock) void start()
  }, [useMock, start])

  // Apply a deep-linked phase or error once, after the first paint.
  useEffect(() => {
    const { force, phase } = devParams()
    if (force) send({ type: 'FORCE', phase: 'error', error: force })
    else if (phase)
      send({
        type: 'FORCE',
        phase,
        // The card phases need someone on the badge to render at all.
        attendee: isCardOpen(phase) ? MOCK_ATTENDEES[0] : undefined,
      })
  }, [send])

  useEffect(() => {
    if (camera.status === 'error') send({ type: 'CAMERA_FAULT', fault: camera.fault })
  }, [camera, send])

  // A model that never loads is its own error panel, not a silent dead scanner.
  useEffect(() => {
    if (useMock) return
    if (getModelStatus() === 'error') send({ type: 'MODEL_ERROR' })
    return onModelStatus((st) => {
      if (st === 'error') send({ type: 'MODEL_ERROR' })
    })
  }, [useMock, send])

  /**
   * Arm the scanner whenever it is waiting and the source is ready.
   *
   * Keyed on the phase, not on the camera object. A session reset returns the
   * machine to `starting-camera` while the camera is still live and unchanged
   * — so an effect watching only the camera never fires again, the machine
   * sits in a non-tracking phase, and detection silently stops for good.
   *
   * The mock has no device to wait on, so it arms immediately.
   */
  useEffect(() => {
    if (state.phase !== 'starting-camera') return
    if (useMock || camera.status === 'live') send({ type: 'CAMERA_LIVE' })
  }, [state.phase, state.sessionId, useMock, camera.status, send])

  /**
   * A finished session hands the kiosk back to Attract. Re-arming the scanner
   * in place would immediately re-scan whoever is still standing there and
   * check them in again.
   */
  useEffect(() => {
    if (state.ended) onCancel()
  }, [state.ended, onCancel])

  /**
   * The Attract pill morphs into the oval, then hands off to the full reticle.
   * Both cannot be visible at once or the stroke doubles, so the morph vehicle
   * fades out exactly as the reticle fades in.
   */
  const [handedOff, setHandedOff] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setHandedOff(true), 480)
    return () => clearTimeout(id)
  }, [])

  // Any phase change counts as progress and restarts the idle clock.
  useIdleReset(true, onCancel, state.phase, state.sessionId)

  const locked = state.phase !== 'searching' && state.phase !== 'starting-camera'
  // Chrome sitting on the solid-green surround has to invert with it.
  const onGreen =
    state.phase === 'verified' ||
    state.phase === 'card' ||
    state.phase === 'printing' ||
    state.phase === 'print-ok'

  return (
    <div className="relative h-full w-full overflow-hidden bg-ground">
      {/* Mirrored, or corrective movements go the wrong way: an unmirrored
          self-view makes "move left" actively misleading. */}
      <video
        ref={videoRef}
        muted
        playsInline
        className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
      />

      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: handedOff ? 1 : 0 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        <ScanOverlay
          oval={oval}
          phase={state.phase}
          phaseRef={phaseRef}
          progressRef={progressRef}
          meshRef={meshRef}
          metricsRef={metricsRef}
          fpsRef={fpsRef}
          reportRef={reportRef}
          locked={locked}
          delegate={delegate}
        />
      </motion.div>

      {/* Morph vehicle from the Attract pill. */}
      <motion.div
        layoutId="reticle"
        className="absolute border-2"
        style={{
          left: oval.cx - oval.rx,
          top: oval.cy - oval.ry,
          width: oval.rx * 2,
          height: oval.ry * 2,
          // Half the diameter in px, so it is a true circle and interpolates
          // cleanly against the pill's numeric radius during the morph.
          // A '50%' string cannot be tweened against a px value.
          borderRadius: oval.ry,
          borderColor: PHASE_COLOR[state.phase],
        }}
        initial={{ backgroundColor: 'rgba(16, 94, 251, 1)' }}
        animate={{
          backgroundColor: 'rgba(16, 94, 251, 0)',
          opacity: handedOff ? 0 : 1,
        }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      />

      {/* One layout everywhere: the instruction sits directly under the circle,
          centred. A side panel in landscape put the text where nobody looking
          into the camera is looking. */}
      <div
        data-zone="instruction"
        className={[
          'absolute inset-x-0 flex justify-center px-8 transition-colors duration-300',
          onGreen ? 'text-ground' : 'text-ink',
        ].join(' ')}
        style={{ top: oval.cy + oval.ry + 32 }}
      >
        <InstructionBanner instruction={instruction} />
      </div>

      <AnimatePresence>
        {state.phase === 'error' && state.error && (
          <ErrorPanel
            code={state.error}
            onRetry={() => send({ type: 'RESET' })}
            onQr={onQrFallback}
            onStaff={onStaffHelp}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCardOpen(state.phase) && state.attendee && (
          <IdCardModal
            attendee={state.attendee}
            photo={photo}
            oval={oval}
            phase={state.phase}
            onPrint={handlePrint}
            onNotMe={() => send({ type: 'NOT_ME' })}
            onDone={() => send({ type: 'DISMISS' })}
          />
        )}
      </AnimatePresence>

      {/* Top right, clear of the reticle and of the instruction beneath it.
          Out of the way of an attendee looking into the camera, but reachable
          without hunting. */}
      <button
        data-zone="cancel"
        onClick={onCancel}
        className={[
          'absolute top-6 right-6 z-20 flex h-14 items-center rounded-2xl border px-6 text-base backdrop-blur-md transition-colors duration-300 active:scale-[0.97]',
          onGreen
            ? 'border-ground/25 bg-ground/10 text-ground hover:bg-ground/20'
            : 'border-hairline-strong bg-white/6 text-ink-2 hover:bg-white/12',
        ].join(' ')}
      >
        Cancel
      </button>

      {FEATURES.devPanel && (
        <DevPanel
          state={state}
          send={send}
          scenario={scenario}
          onScenario={setScenario}
          forced={forced}
          onForced={setForced}
          useMock={useMock}
          onUseMock={setUseMock}
          report={reportRef}
          forcedPrint={forcedPrint}
          onForcedPrint={setForcedPrint}
        />
      )}
    </div>
  )
}
