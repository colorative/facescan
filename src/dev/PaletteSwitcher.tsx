import { useState } from 'react'
import { FEATURES } from '@/config/kiosk'
import { PALETTES, applyPalette, currentPaletteId } from '@/styles/palettes'

/**
 * Palette picker, rendered app-wide rather than inside the DevPanel.
 *
 * The DevPanel lives on the scanner because it needs scan state, but a palette
 * has to be judged on the Attract screen too — that is where the brand colour
 * actually shows (logo, buttons, ambient background). Keeping it separate also
 * means it does not depend on any scan props.
 */
export function PaletteSwitcher() {
  const [open, setOpen] = useState(false)
  const [, tick] = useState(0)

  if (!FEATURES.devPanel) return null

  const active = currentPaletteId()

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-50 flex items-center gap-2 rounded-lg bg-black/70 px-3 py-2 font-mono text-[10px] tracking-widest text-ink-2 backdrop-blur-md"
      >
        <span className="flex gap-1">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: 'var(--color-brand)' }}
          />
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: 'var(--color-accent)' }}
          />
        </span>
        THEME
      </button>
    )
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 w-[13rem] rounded-2xl border border-hairline bg-black/85 p-3 font-mono text-[11px] backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between">
        <span className="tracking-widest text-ink-2">PALETTE</span>
        <button onClick={() => setOpen(false)} className="px-1 text-ink-3">
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {PALETTES.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              applyPalette(p.id)
              tick((n) => n + 1)
            }}
            className={[
              'flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
              active === p.id ? 'bg-white/18 text-ink' : 'text-ink-2 hover:bg-white/10',
            ].join(' ')}
          >
            {/* Both roles, since a palette is the pair: brand then accent. */}
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.brand }} />
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.accent }} />
            {p.label}
          </button>
        ))}
      </div>

      <p className="mt-2 leading-relaxed text-ink-3">
        Sticky. State colours (amber / violet / green / red) stay fixed.
      </p>
    </div>
  )
}
