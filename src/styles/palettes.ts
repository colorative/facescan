import { readPref, writePref } from '@/dev/devPrefs'
import { invalidateColorCache } from '@/overlay/resolveColor'

/**
 * Palettes for trying colour directions without editing tokens.
 *
 * Each varies only the two roles that are a design choice:
 *   brand  — logo lockup, entry buttons, Attract headline and background
 *   accent — the scanner: reticle, tick wave, sweep, motes, telemetry
 *
 * The state colours (amber aligning, violet matching, green verified, red
 * error) are NOT varied. They carry meaning, and the scan reads as a sequence
 * through them, so they have to stay put to stay legible.
 *
 * A caveat that matters when judging these: an accent close to amber, violet
 * or green collides with that state's colour, so the scan sequence loses
 * contrast even though the still frame looks fine. `ember` and `sage` are the
 * ones to watch for this — they are here because they are worth seeing, not
 * because they are safe.
 */
export type Palette = {
  id: string
  label: string
  brand: string
  accent: string
}

export const PALETTES: Palette[] = [
  { id: 'eventify', label: 'eventify', brand: '#105efb', accent: '#4fd8ff' },
  { id: 'deep', label: 'deep sea', brand: '#0b4fd8', accent: '#38bdf8' },
  { id: 'teal', label: 'teal', brand: '#0d9488', accent: '#5eead4' },
  { id: 'violet', label: 'violet', brand: '#6d28d9', accent: '#c4b5fd' },
  { id: 'magenta', label: 'magenta', brand: '#c026d3', accent: '#f0abfc' },
  { id: 'ember', label: 'ember', brand: '#ea580c', accent: '#fdba74' },
  { id: 'sage', label: 'sage', brand: '#15803d', accent: '#86efac' },
  { id: 'mono', label: 'mono', brand: '#4b5563', accent: '#e5e7eb' },
]

const STORE_KEY = 'palette'

export function paletteById(id: string): Palette | undefined {
  return PALETTES.find((p) => p.id === id)
}

/**
 * Writes the palette onto :root and tells the canvas layers their cached
 * colours are stale. Everything CSS-driven updates on its own; the canvas
 * needs the nudge because it memoises token lookups per frame.
 */
export function applyPalette(id: string, { persist = true } = {}): void {
  const palette = paletteById(id)
  if (!palette) return

  const root = document.documentElement
  root.style.setProperty('--color-brand', palette.brand)
  root.style.setProperty('--color-accent', palette.accent)
  root.dataset.palette = palette.id

  invalidateColorCache()
  if (persist) writePref(STORE_KEY, palette.id)
}

/** Current palette id, falling back to the token defaults in tokens.css. */
export function currentPaletteId(): string {
  return document.documentElement.dataset.palette ?? PALETTES[0].id
}

/** Re-applies a previously chosen palette. Call once on boot. */
export function restorePalette(): void {
  const saved = readPref(STORE_KEY)
  if (saved && paletteById(saved)) applyPalette(saved, { persist: false })
}
