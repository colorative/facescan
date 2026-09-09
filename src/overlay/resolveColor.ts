/**
 * Resolves CSS custom properties to concrete colour strings for canvas use.
 *
 * Canvas cannot take `var(--color-accent)`, but the palette should still live
 * in one place, so tokens are read off the document rather than duplicated as
 * literals in drawing code.
 *
 * Lookups are memoised because they run inside draw loops. That means the
 * cache has to be invalidated whenever the tokens themselves change — the
 * DevPanel's palette switcher rewrites them at runtime, and without this the
 * canvas would keep painting the previous theme.
 */
const cache = new Map<string, string>()
const listeners = new Set<() => void>()

/** Bumped on every palette change; components key their derived state off it. */
let version = 0

export function colorVersion(): number {
  return version
}

/** Call after changing any --color-* token. */
export function invalidateColorCache(): void {
  cache.clear()
  version += 1
  listeners.forEach((l) => l())
}

export function onColorChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function resolveColor(value: string): string {
  const match = /^var\((--[\w-]+)\)$/.exec(value.trim())
  if (!match) return value

  const name = match[1]
  const hit = cache.get(name)
  if (hit) return hit

  const resolved =
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || value
  cache.set(name, resolved)
  return resolved
}

export type Rgb = [number, number, number]

/** `#rrggbb` (or any resolvable token) → [r, g, b]. */
export function toRgb(value: string): Rgb {
  const colour = resolveColor(value)
  const hex = /^#([0-9a-f]{6})$/i.exec(colour)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const short = /^#([0-9a-f]{3})$/i.exec(colour)
  if (short) {
    const [r, g, b] = short[1].split('')
    return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)]
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(colour)
  if (rgb) {
    const parts = rgb[1].split(/[,\s/]+/).filter(Boolean).map(Number)
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0]
  }
  // Unknown format — fall back rather than throwing inside a draw loop.
  return [79, 216, 255]
}

/** `r, g, b` for interpolating into rgba(). */
export function toRgbTriplet(value: string): string {
  return toRgb(value).join(', ')
}

const WHITE: Rgb = [255, 255, 255]

/** Linear mix, `t` = 0 keeps `from`, 1 becomes `to`. */
export function mix(from: Rgb, to: Rgb, t: number): Rgb {
  return [
    Math.round(from[0] + (to[0] - from[0]) * t),
    Math.round(from[1] + (to[1] - from[1]) * t),
    Math.round(from[2] + (to[2] - from[2]) * t),
  ]
}

/** Lightened toward white — used for glow cores and specular edges. */
export function lighten(colour: Rgb, t: number): Rgb {
  return mix(colour, WHITE, t)
}

export function rgba(colour: Rgb, alpha: number): string {
  return `rgba(${colour[0]}, ${colour[1]}, ${colour[2]}, ${alpha})`
}
