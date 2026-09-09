import { TIMING } from '@/config/kiosk'

/**
 * The print seam.
 *
 * A real kiosk drives a badge printer through a native service or local agent,
 * not the browser — so this is deliberately a single async function with a
 * mock body. Swap the body for the real call and the UI, including every
 * failure state, is unchanged.
 */
export type PrintResult =
  | { ok: true }
  | { ok: false; code: 'printer-offline' | 'print-failed' }

/** Forced by the DevPanel so both failure panels can be reviewed. */
export type ForcedPrint = 'auto' | 'ok' | 'offline' | 'failed'

export async function printBadge(forced: ForcedPrint = 'auto'): Promise<PrintResult> {
  // Roughly how long a card printer takes to pick, print and eject.
  await new Promise((r) => setTimeout(r, TIMING.printJobMs))

  if (forced === 'offline') return { ok: false, code: 'printer-offline' }
  if (forced === 'failed') return { ok: false, code: 'print-failed' }
  return { ok: true }
}

/**
 * Browser-side fallback used only for reviewing the print stylesheet against
 * real badge stock. Not the kiosk path.
 */
export function printViaBrowser() {
  window.print()
}
