import { useEffect, useState } from 'react'
import { RETICLE } from '@/config/kiosk'

export type Orientation = 'portrait' | 'landscape'

/** The oval, in CSS pixels. Every overlay layer positions against this. */
export type Oval = {
  cx: number
  cy: number
  /** Horizontal radius. */
  rx: number
  /** Vertical radius. */
  ry: number
  /** Perimeter, for stroke-dasharray on the progress ring. */
  circumference: number
  orientation: Orientation
  vw: number
  vh: number
}

/**
 * Ramanujan's second approximation for ellipse perimeter — accurate to ~1e-5
 * at our eccentricity, which matters because the progress ring's dasharray
 * must match the rendered path or the fill will over/undershoot 100%.
 */
function ellipsePerimeter(rx: number, ry: number): number {
  const h = ((rx - ry) / (rx + ry)) ** 2
  return Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))
}

export function computeOval(vw: number, vh: number): Oval {
  const orientation: Orientation = vh >= vw ? 'portrait' : 'landscape'
  const placement = RETICLE[orientation]

  /*
   * Three bounds, smallest wins:
   *   1. the design size, off the smaller axis so it never crops
   *   2. vertical room, so the circle cannot grow into the instruction and
   *      footer below it — it is centred, so the reserve binds on this half
   *   3. horizontal room, leaving a side margin
   * Then a floor, so a very short viewport yields something small rather than
   * something negative.
   */
  const wanted = (placement.size * Math.min(vw, vh)) / 2
  const verticalRoom = vh / 2 - RETICLE.bottomReserve
  const horizontalRoom = vw / 2 - RETICLE.sideMargin
  const ry = Math.max(RETICLE.minRadius, Math.min(wanted, verticalRoom, horizontalRoom))
  const rx = ry * RETICLE.aspect

  return {
    cx: placement.centreX * vw,
    cy: placement.centreY * vh,
    rx,
    ry,
    circumference: ellipsePerimeter(rx, ry),
    orientation,
    vw,
    vh,
  }
}

/** Normalised (0–1) point → oval-space offset, as a fraction of its radii. */
export function offsetFromCentre(
  oval: Oval,
  nx: number,
  ny: number,
): { dx: number; dy: number; magnitude: number } {
  const dx = (nx * oval.vw - oval.cx) / oval.rx
  const dy = (ny * oval.vh - oval.cy) / oval.ry
  return { dx, dy, magnitude: Math.hypot(dx, dy) }
}

/** Live viewport-sized oval. Recomputes on resize and orientation change. */
export function useOval(): Oval {
  const [oval, setOval] = useState(() =>
    computeOval(window.innerWidth, window.innerHeight),
  )

  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() =>
        setOval(computeOval(window.innerWidth, window.innerHeight)),
      )
    }
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return oval
}
