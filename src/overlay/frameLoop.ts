/**
 * One requestAnimationFrame for the whole overlay.
 *
 * Canvas drawing, the SVG progress ring's dash offset and anything else
 * per-frame subscribe here. The alternative — a rAF per layer — multiplies
 * scheduling overhead and, worse, lets layers drift a frame apart from each
 * other, which is visible where the sweep band and the ring are meant to
 * describe the same moment.
 *
 * Subscribers get (now, dt) and must not call setState.
 */
export type FrameFn = (now: number, dt: number) => void

const subscribers = new Set<FrameFn>()
let raf = 0
let last = 0

function tick(now: number) {
  raf = requestAnimationFrame(tick)
  const dt = last ? Math.min(now - last, 50) : 16.7
  last = now
  for (const fn of subscribers) fn(now, dt)
}

export function subscribeFrame(fn: FrameFn): () => void {
  subscribers.add(fn)
  if (!raf) {
    last = 0
    raf = requestAnimationFrame(tick)
  }
  return () => {
    subscribers.delete(fn)
    if (subscribers.size === 0 && raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  }
}
