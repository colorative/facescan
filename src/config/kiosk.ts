/**
 * Every timing and threshold in the kiosk lives here.
 *
 * This is the tuning surface for the design: DevPanel binds sliders straight
 * to these values so feel can be adjusted live, on the real hardware, without
 * hunting through components. Nothing else should hard-code a duration.
 */

/* ── Timing ──────────────────────────────────────────────────────────────
   Budget from "face is stable" to "badge on screen":
     hold 600 + capture 1200 + match 900 + verified 600 ≈ 3.3s
   ──────────────────────────────────────────────────────────────────────── */
export const TIMING = {
  /** All gates must stay satisfied this long before CAPTURING begins. */
  holdStableMs: 600,
  /** Ring fills 0→100 and the sweep runs across this window. */
  captureMs: 1200,
  /** Sweep passes per capture. Two reads as deliberate; one feels rushed. */
  sweepPasses: 2,
  /** Mocked identity lookup. */
  matchMs: 900,
  /** Green-lock beat before the badge appears — the moment of confirmation. */
  verifiedBeatMs: 600,

  /** Badge popup self-dismisses, so a walk-away never strands the kiosk. */
  cardTimeoutMs: 15_000,
  /** How long the mock printer takes — a real card printer is 4–8s. */
  printJobMs: 2_600,
  /** After a successful print, how long the success state holds. */
  printOkDismissMs: 4_000,
  /** Every error panel returns to Attract on its own. */
  errorAutoReturnMs: 20_000,
  /** Global inactivity reset, from any state. */
  sessionIdleMs: 45_000,
  /** No face found for this long → show the "step in front" hint. */
  noFaceHintMs: 12_000,

  /** Gate changes must persist this long to alter the instruction. */
  gateDebounceMs: 250,
  /** Sliding window over which face-centre variance is measured. */
  stabilityWindowMs: 500,
  /** Instruction cross-fade. */
  instructionFadeMs: 220,
} as const

/* ── Gates ───────────────────────────────────────────────────────────────
   `hysteresis` widens a gate's band once it is *already* satisfied, so a
   face hovering on a boundary does not strobe the instruction. 0.15 = the
   exit threshold sits 15% beyond the enter threshold.
   ──────────────────────────────────────────────────────────────────────── */
export const GATES = {
  /**
   * faceHeight / circleDiameter — proxy for distance. The measure is
   * mid-forehead to chin, which is well short of the whole head, so the band
   * is wider than it looks: too narrow here and an attendee stands at a
   * perfectly sensible distance and is told to keep moving.
   */
  fill: { min: 0.5, max: 0.92, hysteresis: 0.15 },
  /** distance(faceCentre, ovalCentre) / ovalRadius. */
  offset: { max: 0.18, hysteresis: 0.15 },
  /** Head tilt, from the eye-line angle. */
  rollDeg: { max: 12, hysteresis: 0.15 },
  /** Head turn, from nose-x against the eye midpoint. */
  yawDeg: { max: 18, hysteresis: 0.15 },
  /** Mean luma of a downsampled frame, 0–1. */
  luma: { min: 0.18, max: 0.86, hysteresis: 0.15 },
  /**
   * Positional variance over stabilityWindowMs, normalised units². Loose
   * enough to permit ordinary standing sway — a person is never as still as a
   * test fixture, and gating on that means never completing a scan.
   */
  stability: { max: 0.0025, hysteresis: 0.15 },
} as const

/* ── Detection ───────────────────────────────────────────────────────── */
export const DETECT = {
  /** Detection is throttled well below render rate; 60fps inference is waste. */
  fps: 18,
  /** 720p is plenty for landmarks and far cheaper than 4K to move per frame. */
  video: { width: 1280, height: 720 } as const,
  modelPath: '/models/face_landmarker.task',
  wasmPath: '/mediapipe/wasm',
  /** Frames sampled for the lighting gate — one small draw, not the full frame. */
  lumaSampleSize: 32,
} as const

/* ── Reticle geometry ────────────────────────────────────────────────────
   Sized from the smaller viewport axis so it never crops, and placed
   differently per orientation: high-centre on a portrait totem, centre-left
   in landscape where the instruction panel takes the right side.
   ──────────────────────────────────────────────────────────────────────── */
export const RETICLE = {
  /**
   * Diameter as a fraction of min(vw, vh), and a dead-centre placement in both
   * orientations — an attendee looks at the middle of the screen, so that is
   * where the camera view belongs regardless of panel shape.
   *
   * Landscape runs smaller only because it has less vertical room to fit the
   * instruction underneath.
   */
  portrait: { size: 0.82, centreX: 0.5, centreY: 0.5 },
  landscape: { size: 0.78, centreX: 0.5, centreY: 0.5 },
  /**
   * Width ÷ height. 1 is a circle; lower values give a portrait oval.
   * The geometry stays a general ellipse so this is a one-line change.
   */
  aspect: 1,
  /** Radial dashes around the rim — the Face ID signature. */
  tickCount: 120,
  /**
   * The rim wave: each tick's length rises and falls as a wave travels around
   * the circle, like a radial waveform.
   *
   * `crests` is how many peaks are visible at once, `revsPerSec` how fast the
   * wave travels; length swings between `minLength` and `maxLength` as a
   * multiple of the base tick length.
   */
  tickWave: { crests: 3, revsPerSec: 0.42, minLength: 0.5, maxLength: 1.5 },
  /**
   * Vertical space kept free below the circle, in px: the gap to the
   * instruction, the instruction itself, and padding beneath it. Nothing else
   * lives down there now that Cancel is in the top corner, which is what lets
   * the circle be this large.
   *
   * The circle is centred, so this bound is what stops it growing into that
   * space on a short screen. Positioning the instruction relative to the
   * circle without also bounding the circle is what let them overlap in
   * landscape — the geometry has to know the layout exists.
   */
  bottomReserve: 140,
  /** Minimum breathing room either side. */
  sideMargin: 24,
  /** Never shrink below this radius, however cramped the viewport. */
  minRadius: 90,
} as const

/* ── Feature flags ───────────────────────────────────────────────────────
   Each overlay layer can be switched off independently, both to isolate a
   perf problem on weak kiosk GPUs and to compare design options honestly.
   ──────────────────────────────────────────────────────────────────────── */
export const FEATURES = {
  /**
   * The depth cloud drawn *on the face*. Off: the circle stays clear so the
   * attendee sees themselves, with the sweep, ring and ticks carrying the
   * scan. Nothing is drawn over a real person.
   */
  mesh: false,
  /**
   * Motes drifting inward, converging as the match resolves. Unrelated to the
   * mesh: these are ambient, they never sit on the face, and they are what
   * gives the capture a sense of data being gathered. Keep on.
   */
  particles: true,
  sweep: true,
  telemetry: true,
  cornerBrackets: true,
  /** Hides the cursor and requests fullscreen + wake lock. */
  kioskMode: false,
  /** DevPanel is dev-only by default; force it on to tune on the kiosk itself. */
  devPanel: import.meta.env.DEV,
} as const

/** Mutable copy the DevPanel writes to, so tuning does not need a reload. */
export type KioskConfig = {
  timing: typeof TIMING
  gates: typeof GATES
  features: typeof FEATURES
}
