import { GATES, TIMING } from '@/config/kiosk'
import type { Oval } from '@/overlay/OvalGeometry'

/**
 * One tracking observation, already mapped into viewport-normalised space
 * (0–1 across the visible video, mirroring applied). Keeping the gates in this
 * space means they are identical whether the sample came from MediaPipe or
 * from the mock tracker.
 */
export type FaceSample = {
  t: number
  /** How many faces are in frame — 2+ is its own instruction. */
  faces: number
  /** Face centre. */
  cx: number
  cy: number
  /** Face height as a fraction of viewport height. */
  height: number
  rollDeg: number
  yawDeg: number
  /** Mean luma of the frame, 0–1. */
  luma: number
}

export type GateKey =
  | 'lighting'
  | 'occupancy'
  | 'distance'
  | 'centering'
  | 'pose'
  | 'stability'

export type GateFailure =
  | { key: 'lighting'; kind: 'dark' | 'bright' }
  | { key: 'occupancy'; kind: 'multiple' }
  | { key: 'distance'; kind: 'far' | 'close' }
  | { key: 'centering'; kind: 'off'; dx: number; dy: number }
  | { key: 'pose'; kind: 'roll' | 'yaw' }
  | { key: 'stability'; kind: 'jitter' }

/**
 * Fixed priority. Exactly one instruction is ever shown, and it is the most
 * upstream problem: telling someone to hold still while the room is too dark
 * sends them chasing the wrong fix.
 */
const PRIORITY: GateKey[] = [
  'lighting',
  'occupancy',
  'distance',
  'centering',
  'pose',
  'stability',
]

export type GateReport = {
  /** No face in frame at all. */
  present: boolean
  /** Every gate currently failing. */
  failures: GateFailure[]
  /** The single failure to act on, by PRIORITY. Null when all gates pass. */
  primary: GateFailure | null
  /** True when every gate passes — the trigger for CAPTURING. */
  aligned: boolean
  /** Raw measures, for the telemetry HUD. */
  metrics: { fill: number; offset: number; rollDeg: number; yawDeg: number; luma: number }
}

/**
 * Hysteresis: a gate that is already satisfied is judged against a threshold
 * widened by `hysteresis`, so a face hovering on the boundary does not flip
 * the instruction every frame. Without this the UI strobes and reads as broken
 * — it is the single most important detail in this file.
 */
function widen(limit: number, h: number, wasSatisfied: boolean, direction: 'max' | 'min') {
  if (!wasSatisfied) return limit
  return direction === 'max' ? limit * (1 + h) : limit * (1 - h)
}

export function createGateEvaluator() {
  /** Which gates passed on the previous evaluation, for hysteresis. */
  const satisfied = new Set<GateKey>()
  /** Recent centres, for the stability gate's variance window. */
  const history: { t: number; cx: number; cy: number }[] = []

  function reset() {
    satisfied.clear()
    history.length = 0
  }

  function evaluate(sample: FaceSample | null, oval: Oval): GateReport {
    if (!sample || sample.faces === 0) {
      reset()
      return {
        present: false,
        failures: [],
        primary: null,
        aligned: false,
        metrics: { fill: 0, offset: 0, rollDeg: 0, yawDeg: 0, luma: sample?.luma ?? 0 },
      }
    }

    // Oval radii as viewport fractions, so gates compare like with like.
    const ovalHeightFrac = (oval.ry * 2) / oval.vh
    const fill = sample.height / ovalHeightFrac

    // Offset measured in oval-radius units: 1.0 means the face centre sits on
    // the rim, which keeps the threshold meaningful across screen sizes.
    const dx = (sample.cx * oval.vw - oval.cx) / oval.rx
    const dy = (sample.cy * oval.vh - oval.cy) / oval.ry
    const offset = Math.hypot(dx, dy)

    // Stability: variance of the centre over the trailing window.
    history.push({ t: sample.t, cx: sample.cx, cy: sample.cy })
    while (history.length && sample.t - history[0].t > TIMING.stabilityWindowMs) {
      history.shift()
    }
    let variance = 0
    if (history.length > 2) {
      const mx = history.reduce((s, p) => s + p.cx, 0) / history.length
      const my = history.reduce((s, p) => s + p.cy, 0) / history.length
      variance =
        history.reduce((s, p) => s + (p.cx - mx) ** 2 + (p.cy - my) ** 2, 0) / history.length
    }

    const failures: GateFailure[] = []
    const nowSatisfied = new Set<GateKey>()

    // ── lighting
    const lumaMin = widen(GATES.luma.min, GATES.luma.hysteresis, satisfied.has('lighting'), 'min')
    const lumaMax = widen(GATES.luma.max, GATES.luma.hysteresis, satisfied.has('lighting'), 'max')
    if (sample.luma < lumaMin) failures.push({ key: 'lighting', kind: 'dark' })
    else if (sample.luma > lumaMax) failures.push({ key: 'lighting', kind: 'bright' })
    else nowSatisfied.add('lighting')

    // ── occupancy (no hysteresis: face count is discrete, not a boundary value)
    if (sample.faces > 1) failures.push({ key: 'occupancy', kind: 'multiple' })
    else nowSatisfied.add('occupancy')

    // ── distance
    const fillMin = widen(GATES.fill.min, GATES.fill.hysteresis, satisfied.has('distance'), 'min')
    const fillMax = widen(GATES.fill.max, GATES.fill.hysteresis, satisfied.has('distance'), 'max')
    if (fill < fillMin) failures.push({ key: 'distance', kind: 'far' })
    else if (fill > fillMax) failures.push({ key: 'distance', kind: 'close' })
    else nowSatisfied.add('distance')

    // ── centering
    const offMax = widen(
      GATES.offset.max,
      GATES.offset.hysteresis,
      satisfied.has('centering'),
      'max',
    )
    if (offset > offMax) failures.push({ key: 'centering', kind: 'off', dx, dy })
    else nowSatisfied.add('centering')

    // ── pose
    const rollMax = widen(GATES.rollDeg.max, GATES.rollDeg.hysteresis, satisfied.has('pose'), 'max')
    const yawMax = widen(GATES.yawDeg.max, GATES.yawDeg.hysteresis, satisfied.has('pose'), 'max')
    if (Math.abs(sample.rollDeg) > rollMax) failures.push({ key: 'pose', kind: 'roll' })
    else if (Math.abs(sample.yawDeg) > yawMax) failures.push({ key: 'pose', kind: 'yaw' })
    else nowSatisfied.add('pose')

    // ── stability (needs a full window before it can judge)
    const varMax = widen(
      GATES.stability.max,
      GATES.stability.hysteresis,
      satisfied.has('stability'),
      'max',
    )
    if (history.length > 2 && variance > varMax) {
      failures.push({ key: 'stability', kind: 'jitter' })
    } else {
      nowSatisfied.add('stability')
    }

    satisfied.clear()
    nowSatisfied.forEach((k) => satisfied.add(k))

    const primary =
      PRIORITY.map((k) => failures.find((f) => f.key === k)).find(Boolean) ?? null

    return {
      present: true,
      failures,
      primary: primary ?? null,
      aligned: failures.length === 0,
      metrics: { fill, offset, rollDeg: sample.rollDeg, yawDeg: sample.yawDeg, luma: sample.luma },
    }
  }

  return { evaluate, reset }
}
