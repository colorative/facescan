/**
 * A face point cloud in viewport-normalised space (0–1), with a depth value
 * per point.
 *
 * Both sources fill this same shape: the mock builds it procedurally, and the
 * MediaPipe tracker maps its 478 landmarks into it. The canvas layers never
 * learn which one they are drawing, so the mesh design can be developed
 * without a camera and works unchanged with one.
 *
 * Deliberately a *cloud*, not a wireframe. Stroking eye, nose and mouth
 * contours makes the overlay read as a cartoon face drawn on the attendee;
 * unjoined points reading brighter where the surface is nearer read as depth
 * data coming off a real face, which is the intent.
 */
export type FaceMesh = {
  /** Interleaved x,y pairs, normalised to the viewport. */
  points: Float32Array
  /** 0–1 per point, 1 = nearest the camera. Modulates size and brightness. */
  depth: Float32Array
  count: number
}

/** Deterministic hash → 0–1. Keeps jitter stable frame to frame. */
function hash01(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Procedural face cloud: a jittered hex lattice over a head-shaped region,
 * with a dome depth profile so the centre of the face sits nearest.
 *
 * The lattice is jittered because a perfect grid reads as a printed graphic;
 * scattered points read as samples.
 */
export function makeSyntheticFace(
  /** Centre, normalised. */
  cx: number,
  cy: number,
  /** Face width and height, normalised. */
  w: number,
  h: number,
  rollDeg: number,
  yawDeg: number,
): FaceMesh {
  const pts: number[] = []
  const dep: number[] = []

  const roll = (rollDeg * Math.PI) / 180
  const cos = Math.cos(roll)
  const sin = Math.sin(roll)
  const yaw = Math.max(-1, Math.min(1, yawDeg / 45))

  const rx = w / 2
  const ry = h / 2

  // Lattice step in head-local units. ~0.085 lands near MediaPipe's 478
  // points, so the mock and the real tracker have comparable density.
  const step = 0.085
  let i = 0

  for (let row = -1; row <= 1.001; row += step) {
    const rowIndex = Math.round((row + 1) / step)
    const offset = (rowIndex % 2) * step * 0.5

    for (let col = -1 + offset; col <= 1.001; col += step) {
      i++
      // Head taper: narrower at the jaw than the brow.
      const taper = row > 0 ? 1 - 0.26 * row * row : 1 + 0.03 * row * row
      const u = col / taper
      const rr = u * u + row * row
      if (rr > 0.86) continue

      // Jitter, scaled so points never cross into a neighbour's cell.
      const jx = (hash01(i * 2.17) - 0.5) * step * 0.62
      const jy = (hash01(i * 3.71) - 0.5) * step * 0.62

      // Dome: nearest at the centre of the face, falling away to the edges.
      // Yaw shifts the near point toward whichever side faces the camera.
      const domeU = u - yaw * 0.35
      const depth = Math.sqrt(Math.max(0, 1 - Math.min(1, domeU * domeU + row * row * 0.7)))

      const lx = (col + jx) * rx * (1 - 0.18 * Math.abs(yaw)) + yaw * 0.06 * w
      const ly = (row + jy) * ry

      pts.push(cx + lx * cos - ly * sin, cy + lx * sin + ly * cos)
      dep.push(0.25 + depth * 0.75)
    }
  }

  return {
    points: new Float32Array(pts),
    depth: new Float32Array(dep),
    count: pts.length / 2,
  }
}
