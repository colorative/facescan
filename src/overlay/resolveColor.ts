/**
 * Resolves a CSS custom property to a concrete colour string.
 *
 * Canvas cannot take `var(--color-accent)`, but the palette should still live in
 * one place, so the token is read off the document rather than duplicated as
 * literals in the drawing code.
 */
const cache = new Map<string, string>()

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

/** `#rrggbb` (or any resolvable token) → `r, g, b` for use in rgba(). */
export function toRgbTriplet(value: string): string {
  const colour = resolveColor(value)
  const hex = /^#([0-9a-f]{6})$/i.exec(colour)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(colour)
  if (rgb) {
    const parts = rgb[1].split(/[,\s/]+/).filter(Boolean)
    return parts.slice(0, 3).join(', ')
  }
  // Unknown format — fall back to the accent token's value rather than throwing
  // inside a draw loop.
  return '79, 216, 255'
}
