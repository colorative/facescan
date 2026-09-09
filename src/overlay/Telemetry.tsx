import { useEffect, useRef, useState } from 'react'
import type { GateReport } from '@/vision/gates'

/**
 * Small monospace readouts near the rim.
 *
 * Kept deliberately small and dim. Oversized invented telemetry is what makes
 * this genre of UI look like a toy; at this scale it adds instrument
 * credibility and is honestly useful while tuning the gates.
 *
 * Sampled at 6Hz, not per frame — the numbers are unreadable faster than that
 * and it keeps this component off the frame budget.
 */
export function Telemetry({
  metricsRef,
  fpsRef,
  report,
  delegate,
}: {
  metricsRef: React.RefObject<GateReport['metrics']>
  fpsRef: React.RefObject<number>
  /** Live gate state, so a blocking gate can be identified at a glance. */
  report: React.RefObject<GateReport | null>
  delegate: string | null
}) {
  const [, force] = useState(0)
  const frame = useRef(0)

  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 160)
    return () => clearInterval(id)
  }, [])
  frame.current += 1

  const m = metricsRef.current
  const fps = Math.round(fpsRef.current ?? 0)

  const rows: [string, string][] = [
    ['FILL', m ? m.fill.toFixed(2) : '—'],
    ['ALIGN', m ? `${Math.max(0, Math.round((1 - m.offset / 0.5) * 100))}%` : '—'],
    ['ROLL', m ? `${m.rollDeg.toFixed(0)}°` : '—'],
    ['YAW', m ? `${m.yawDeg.toFixed(0)}°` : '—'],
    ['LUX', m ? (m.luma < 0.18 ? 'LOW' : m.luma > 0.86 ? 'HIGH' : 'OK') : '—'],
  ]

  // Which gate is holding the scan up. Without this, "it never completes" is
  // guesswork; with it the answer is on screen.
  const failing = report.current?.failures.map((f) => f.key) ?? []
  const present = report.current?.present ?? false

  return (
    <div
      aria-hidden
      data-zone="telemetry"
      /* Pinned to the top-left screen edge rather than hung off the circle:
         it is instrument chrome, so it belongs to the screen, and anchoring it
         to the reticle meant it moved every time the circle was resized.
         The right padding keeps it clear of the Cancel button. */
      className="pointer-events-none absolute top-6 left-6 max-w-[calc(100%-11rem)] font-mono text-[10px] leading-relaxed tracking-[0.18em] text-accent/35"
    >
      <div className="flex flex-wrap gap-x-4">
        {rows.map(([k, v]) => (
          <span key={k}>
            {k} <span className="text-accent/70">{v}</span>
          </span>
        ))}
        <span>
          {fps}FPS{delegate ? ` · ${delegate}` : ''}
        </span>
      </div>
      <div className="mt-0.5">
        {!present ? (
          <span className="text-ink-3">NO FACE</span>
        ) : failing.length ? (
          <span className="text-amber/80">HOLD · {failing.join(' · ').toUpperCase()}</span>
        ) : (
          <span className="text-green/80">ALL GATES PASS</span>
        )}
      </div>
    </div>
  )
}
