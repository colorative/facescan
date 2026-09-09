import { useEffect, useState } from 'react'
import type { Phase, ScanEvent, ScanState } from '@/machine/scanMachine'
import type { MockScenario } from '@/vision/mockTracker'
import { SCENARIOS } from '@/vision/mockTracker'
import type { ForcedOutcome } from '@/vision/mockRecognizer'
import type { ForcedPrint } from '@/modals/printBadge'
import type { ErrorCode } from '@/machine/scanMachine'
import type { GateReport } from '@/vision/gates'
import { MOCK_ATTENDEES } from '@/data/mockAttendees'
import { isCardOpen } from '@/machine/scanMachine'

const PHASES: Phase[] = [
  'starting-camera',
  'searching',
  'aligning',
  'capturing',
  'matching',
  'verified',
  'card',
  'printing',
  'print-ok',
]

const ERRORS: ErrorCode[] = [
  'permission',
  'no-camera',
  'camera-busy',
  'insecure',
  'model',
  'no-match',
  'lookup-failed',
  'wrong-person',
  'printer-offline',
  'print-failed',
]

const OUTCOMES: ForcedOutcome[] = ['auto', 'match', 'none', 'failed']
const PRINTS: ForcedPrint[] = ['auto', 'ok', 'offline', 'failed']

type Props = {
  state: ScanState
  send: (e: ScanEvent) => void
  scenario: MockScenario
  onScenario: (s: MockScenario) => void
  forced: ForcedOutcome
  onForced: (o: ForcedOutcome) => void
  useMock: boolean
  onUseMock: (v: boolean) => void
  /** Live gate state, so a failing gate can be read without a debugger. */
  report: React.RefObject<GateReport | null>
  forcedPrint: ForcedPrint
  onForcedPrint: (p: ForcedPrint) => void
}

/**
 * The design workbench. Every phase, every error panel and every instruction
 * state reachable in one click, so the flow can be reviewed without standing
 * in front of the camera performing each failure — and so states can be
 * screenshotted deterministically.
 */
export function DevPanel(props: Props) {
  const [open, setOpen] = useState(false)

  // The readouts below read refs, which React has no reason to re-render for.
  const [, tick] = useState(0)
  useEffect(() => {
    if (!open) return
    const id = window.setInterval(() => tick((n) => n + 1), 200)
    return () => clearInterval(id)
  }, [open])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute bottom-4 left-4 z-50 rounded-lg bg-black/70 px-3 py-2 font-mono text-[10px] tracking-widest text-accent/70 backdrop-blur-md"
      >
        DEV
      </button>
    )
  }

  return (
    <div className="absolute bottom-4 left-4 z-50 max-h-[92vh] w-[19rem] overflow-y-auto rounded-2xl border border-hairline bg-black/85 p-4 font-mono text-[11px] text-ink-2 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <span className="tracking-widest text-accent">DEV PANEL</span>
        <button onClick={() => setOpen(false)} className="px-2 text-ink-3">
          ✕
        </button>
      </div>

      <Readout label="phase" value={props.state.phase} />
      <Readout label="error" value={props.state.error ?? '—'} />
      <Readout label="session" value={String(props.state.sessionId)} />
      <Readout
        label="failing"
        value={props.report.current?.failures.map((f) => f.key).join(',') || '—'}
      />

      <Group label="tracking source">
        <Chip active={props.useMock} onClick={() => props.onUseMock(true)}>
          mock
        </Chip>
        <Chip active={!props.useMock} onClick={() => props.onUseMock(false)}>
          camera
        </Chip>
      </Group>

      <Group label="mock scenario">
        {SCENARIOS.map((s) => (
          <Chip key={s} active={props.scenario === s} onClick={() => props.onScenario(s)}>
            {s}
          </Chip>
        ))}
      </Group>

      <Group label="match outcome">
        {OUTCOMES.map((o) => (
          <Chip key={o} active={props.forced === o} onClick={() => props.onForced(o)}>
            {o}
          </Chip>
        ))}
      </Group>

      <Group label="print outcome">
        {PRINTS.map((p) => (
          <Chip
            key={p}
            active={props.forcedPrint === p}
            onClick={() => props.onForcedPrint(p)}
          >
            {p}
          </Chip>
        ))}
      </Group>

      <Group label="force phase">
        {PHASES.map((p) => (
          <Chip
            key={p}
            onClick={() =>
              props.send({
                type: 'FORCE',
                phase: p,
                attendee: isCardOpen(p) ? MOCK_ATTENDEES[0] : undefined,
              })
            }
          >
            {p}
          </Chip>
        ))}
      </Group>

      <Group label="force error panel">
        {ERRORS.map((e) => (
          <Chip key={e} onClick={() => props.send({ type: 'FORCE', phase: 'error', error: e })}>
            {e}
          </Chip>
        ))}
      </Group>

      <Group label="session">
        <Chip onClick={() => props.send({ type: 'RESET' })}>reset</Chip>
      </Group>
    </div>
  )
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-hairline py-1">
      <span className="text-ink-3">{label}</span>
      <span className="text-ink">{value}</span>
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 tracking-widest text-ink-3 uppercase">{label}</p>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'rounded-md px-2 py-1 transition-colors',
        active ? 'bg-accent text-ground' : 'bg-white/6 text-ink-2 hover:bg-white/12',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
