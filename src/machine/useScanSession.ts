import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { TIMING } from '@/config/kiosk'
import type { Oval } from '@/overlay/OvalGeometry'
import { createGateEvaluator } from '@/vision/gates'
import type { FaceSample, GateReport } from '@/vision/gates'
import { recognize } from '@/vision/mockRecognizer'
import type { ForcedOutcome } from '@/vision/mockRecognizer'
import {
  initialState,
  isTracking,
  scanReducer,
} from '@/machine/scanMachine'
import type { ScanEvent } from '@/machine/scanMachine'
import {
  CHECKING,
  CENTRE_YOURSELF,
  HOLD_STILL,
  STEP_IN_FRONT,
  VERIFIED,
  instructionFor,
} from '@/machine/instructions'
import type { Instruction } from '@/machine/instructions'

/** Supplies one tracking observation per frame — mock or MediaPipe. */
export type SampleSource = (oval: Oval) => FaceSample | null

const EMPTY_METRICS: GateReport['metrics'] = {
  fill: 0,
  offset: 0,
  rollDeg: 0,
  yawDeg: 0,
  luma: 0,
}

export function useScanSession(oval: Oval, source: SampleSource, forced: ForcedOutcome = 'auto') {
  const [state, dispatch] = useReducer(scanReducer, undefined, () => initialState())
  const [instruction, setInstruction] = useState<Instruction | null>(null)

  /**
   * Per-frame values live in refs, never in state. A 60Hz setState would
   * re-render the whole overlay tree every frame and starve the animation —
   * the canvas layers read these directly in their own draw loop instead.
   */
  const metricsRef = useRef<GateReport['metrics']>(EMPTY_METRICS)
  const progressRef = useRef(0)
  const reportRef = useRef<GateReport | null>(null)
  const fpsRef = useRef(0)

  const evaluator = useMemo(() => createGateEvaluator(), [])
  const ovalRef = useRef(oval)
  ovalRef.current = oval
  const sourceRef = useRef(source)
  sourceRef.current = source
  const phaseRef = useRef(state.phase)
  phaseRef.current = state.phase
  /** Mirror of state.since the frame loop can read without re-subscribing. */
  const stateSince = useRef(state.since)
  stateSince.current = state.since

  // Latched booleans, so GATES only dispatches on a genuine change.
  const lastGates = useRef({ present: false, aligned: false })
  // When alignment began, for the hold-stable trigger.
  const alignedSince = useRef<number | null>(null)
  // Debounce for instruction text, separate from the machine's transitions.
  const pendingInstruction = useRef<{ key: string; at: number } | null>(null)
  const shownKey = useRef<string | null>(null)

  /* ── The single frame loop ──────────────────────────────────────────── */
  useEffect(() => {
    let raf = 0
    let last = performance.now()

    const frame = () => {
      raf = requestAnimationFrame(frame)
      const now = performance.now()
      const dt = now - last
      last = now
      fpsRef.current = fpsRef.current * 0.9 + (1000 / Math.max(dt, 1)) * 0.1

      const phase = phaseRef.current
      const currentOval = ovalRef.current

      // Capture progress is time-based so the ring cannot desync from the
      // state machine's own capture timeout.
      if (phase === 'capturing') {
        progressRef.current = Math.min(1, (now - stateSince.current) / TIMING.captureMs)
      } else if (phase === 'matching' || phase === 'verified') {
        progressRef.current = 1
      } else {
        // Drain rather than snap, so an aborted capture reads as a rewind.
        progressRef.current = Math.max(0, progressRef.current - dt / 400)
      }

      if (!isTracking(phase)) return

      const sample = sourceRef.current(currentOval)
      const report = evaluator.evaluate(sample, currentOval)
      reportRef.current = report
      metricsRef.current = report.metrics

      // Only tell the machine when a boolean actually flips.
      if (
        report.present !== lastGates.current.present ||
        report.aligned !== lastGates.current.aligned
      ) {
        lastGates.current = { present: report.present, aligned: report.aligned }
        dispatch({ type: 'GATES', present: report.present, aligned: report.aligned })
      }

      // Hold-stable: alignment must persist, not merely occur.
      if (report.aligned) {
        alignedSince.current ??= now
        if (phase === 'aligning' && now - alignedSince.current >= TIMING.holdStableMs) {
          dispatch({ type: 'HOLD_COMPLETE' })
        }
      } else {
        alignedSince.current = null
      }

      /* Instruction selection, debounced.
         The machine may already be capturing while the text still says
         "hold still" — that is intended; text lags the state slightly so it
         never flickers ahead of a transition. */
      const next: Instruction | null =
        phase === 'capturing'
          ? HOLD_STILL
          : !report.present
            ? state.noFaceHint
              ? STEP_IN_FRONT
              : CENTRE_YOURSELF
            : report.primary
              ? instructionFor(report.primary)
              : HOLD_STILL

      if (next && next.key !== shownKey.current) {
        if (pendingInstruction.current?.key !== next.key) {
          pendingInstruction.current = { key: next.key, at: now }
        } else if (now - pendingInstruction.current.at >= TIMING.gateDebounceMs) {
          shownKey.current = next.key
          pendingInstruction.current = null
          setInstruction(next)
        }
      } else if (next && next.key === shownKey.current) {
        pendingInstruction.current = null
      }
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // state.noFaceHint is read inside; re-subscribing on it is cheap and keeps
    // the closure honest without threading another ref.
  }, [evaluator, state.noFaceHint])

  /* ── Phase timers ───────────────────────────────────────────────────── */
  useEffect(() => {
    const timers: number[] = []
    const after = (ms: number, event: ScanEvent) =>
      timers.push(window.setTimeout(() => dispatch(event), ms))

    switch (state.phase) {
      case 'searching':
        after(TIMING.noFaceHintMs, { type: 'NO_FACE_TIMEOUT' })
        break
      case 'capturing':
        after(TIMING.captureMs, { type: 'CAPTURE_COMPLETE' })
        break
      case 'matching': {
        timers.push(
          window.setTimeout(() => {
            const outcome = recognize(forced)
            dispatch(
              outcome.kind === 'match'
                ? { type: 'MATCH_OK', attendee: outcome.attendee }
                : outcome.kind === 'none'
                  ? { type: 'MATCH_NONE' }
                  : { type: 'LOOKUP_FAILED' },
            )
          }, TIMING.matchMs),
        )
        break
      }
      case 'verified':
        after(TIMING.verifiedBeatMs, { type: 'VERIFIED_DONE' })
        break
      case 'card':
        after(TIMING.cardTimeoutMs, { type: 'DISMISS' })
        break
      case 'print-ok':
        after(TIMING.printOkDismissMs, { type: 'DISMISS' })
        break
      case 'error':
        after(TIMING.errorAutoReturnMs, { type: 'DISMISS' })
        break
      default:
        break
    }

    return () => timers.forEach(clearTimeout)
  }, [state.phase, state.since, forced])

  /* ── Instruction for non-tracking phases ────────────────────────────── */
  useEffect(() => {
    if (state.phase === 'matching') {
      shownKey.current = CHECKING.key
      setInstruction(CHECKING)
    } else if (state.phase === 'verified') {
      shownKey.current = VERIFIED.key
      setInstruction(VERIFIED)
    } else if (state.phase === 'starting-camera' || state.phase === 'error') {
      shownKey.current = null
      setInstruction(null)
    }
  }, [state.phase])

  /* ── Session reset on a fresh session ───────────────────────────────── */
  useEffect(() => {
    evaluator.reset()
    lastGates.current = { present: false, aligned: false }
    alignedSince.current = null
    shownKey.current = null
    pendingInstruction.current = null
    progressRef.current = 0
    setInstruction(null)
  }, [state.sessionId, evaluator])

  const send = useCallback((event: ScanEvent) => dispatch(event), [])

  return { state, send, instruction, metricsRef, progressRef, reportRef, fpsRef }
}
