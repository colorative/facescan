import { CATEGORY_STYLE } from '@/data/mockAttendees'
import type { Attendee } from '@/data/mockAttendees'

/**
 * The badge itself — what actually comes out of the printer.
 *
 * Laid out to CR80-ish proportions so what is on screen matches the stock.
 * The category band is the single strongest signal at a distance: floor staff
 * read the colour long before they read the name.
 */
/** Intrinsic badge size in px, at CR80 proportions (54×86mm → 0.628). */
export const BADGE_W = 384
export const BADGE_H = 611

export function BadgeCard({ attendee, photo }: { attendee: Attendee; photo: string | null }) {
  const style = CATEGORY_STYLE[attendee.category]

  return (
    <div
      className="badge-card relative flex flex-col overflow-hidden rounded-3xl bg-white text-[#0b1018]"
      /* Rendered at a fixed intrinsic size and scaled as a whole by FitBox.
         The ratio is real CR80 badge stock (54×86mm), so what is reviewed on
         screen matches what the printer produces — and scaling rather than
         reflowing means the design never rearranges itself to fit a screen. */
      style={{ width: BADGE_W, height: BADGE_H }}
    >
      {/* Category band */}
      <div
        className="flex items-center justify-between px-7 py-4"
        style={{ background: style.color }}
      >
        <span className="font-mono text-xs font-semibold tracking-[0.28em] text-black/70 uppercase">
          {style.label}
        </span>
        <span className="font-mono text-xs font-semibold tracking-widest text-black/55">
          {attendee.badgeNo}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-evenly px-7 py-6">
        {/* Photo. Held in memory for this session only — never uploaded, never
            written to storage; the session reset drops the reference. */}
        <div
          className="h-40 w-40 overflow-hidden rounded-2xl bg-black/8"
          style={{ outline: `2px solid ${style.color}`, outlineOffset: 3 }}
        >
          {photo ? (
            <img
              src={photo}
              alt=""
              className="h-full w-full -scale-x-100 object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-16 w-16 text-black/15" aria-hidden>
                <path
                  d="M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.5a7.5 7.5 0 0 1 15 0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          )}
        </div>

        <div className="text-center">
          <p className="text-[2rem] leading-tight font-bold tracking-tight">{attendee.name}</p>
          <p className="mt-1.5 text-lg text-black/60">{attendee.role}</p>
          <p className="text-lg font-medium text-black/80">{attendee.company}</p>
        </div>

        <QrBlock seed={attendee.badgeNo} />
      </div>

      <p className="pb-4 text-center font-mono text-[10px] tracking-[0.3em] text-black/30 uppercase">
        Eventify 2026
      </p>
    </div>
  )
}

/**
 * A deterministic placeholder QR — a real encoder is a production concern, but
 * the badge design needs an honest amount of visual weight in this slot, and a
 * seeded pattern keeps it stable across re-renders instead of shimmering.
 */
function QrBlock({ seed }: { seed: string }) {
  const N = 13
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0

  const cells: boolean[] = []
  for (let i = 0; i < N * N; i++) {
    h = (h * 1103515245 + 12345) >>> 0
    cells.push(((h >>> 16) & 1) === 1)
  }
  // Finder squares in three corners, as a real QR has.
  const finder = (r: number, c: number) =>
    (r < 3 && c < 3) || (r < 3 && c >= N - 3) || (r >= N - 3 && c < 3)

  return (
    <div
      className="grid gap-[2px] rounded-lg bg-white p-2"
      style={{ gridTemplateColumns: `repeat(${N}, 1fr)`, width: 136 }}
    >
      {cells.map((on, i) => {
        const r = Math.floor(i / N)
        const c = i % N
        const filled = finder(r, c)
          ? !((r === 1 || r === N - 2) && (c === 1 || c === N - 2))
          : on
        return (
          <span
            key={i}
            className="aspect-square rounded-[1px]"
            style={{ background: filled ? '#0b1018' : 'transparent' }}
          />
        )
      })}
    </div>
  )
}
