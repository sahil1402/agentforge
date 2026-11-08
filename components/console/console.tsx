'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { ChevronRight, FlaskConical, Play, Trash2, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { useGraphStore } from '@/store/graph-store'
import { useUiStore, type ConsoleTab } from '@/store/ui-store'
import { NODE_HUE, costUsd, type RunMetadata, type TestCase } from '@/lib/types'
import { resolveGate } from '@/lib/runs'
import { useRunStream, useRunTotals, fmtClock, fmtSeconds, fmtTokens, fmtUsd, fmtAgo, type LogRow } from '@/lib/run-stream'
import { cn } from '@/lib/utils'
import { CodeEditor } from '@/components/canvas/code-editor'
import { AfDialog } from '@/components/shell/dialog'
import { toast } from '@/components/shell/toast'
import { Waterfall } from './waterfall'

const TABS: Array<{ id: ConsoleTab; label: string }> = [
  { id: 'trace', label: 'Trace' },
  { id: 'waterfall', label: 'Waterfall' },
  { id: 'output', label: 'Output' },
  { id: 'tests', label: 'Tests' },
  { id: 'history', label: 'History' },
  { id: 'code', label: 'Code' },
]

const isLive = (s: string | null) => s === 'RUNNING' || s === 'AWAITING_HUMAN'

/** Run history for the open graph, refreshed whenever a run reaches a terminal state. */
function useHistory(graphId: string) {
  const runStatus = useGraphStore((s) => s.runStatus)
  const [runs, setRuns] = useState<RunMetadata[] | null>(null)
  const live = isLive(runStatus)
  useEffect(() => {
    if (live) return
    let cancelled = false
    fetch(`/api/runs?graphId=${graphId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`History failed (HTTP ${r.status})`))))
      .then((data: RunMetadata[]) => { if (!cancelled) setRuns(data) })
      .catch(console.error)
    return () => { cancelled = true }
  }, [graphId, live, runStatus])
  return { runs }
}

/** The graph's test cases; polls while any result is pending (the API grades lazily). */
function useTests(graphId: string) {
  const [tests, setTests] = useState<TestCase[] | null>(null)
  const [version, setVersion] = useState(0) // bump to refetch
  const reload = useCallback(() => setVersion((v) => v + 1), [])
  useEffect(() => {
    let cancelled = false
    fetch(`/api/graphs/${graphId}/tests`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Tests failed (HTTP ${r.status})`))))
      .then((data: TestCase[]) => { if (!cancelled) setTests(data) })
      .catch(console.error)
    return () => { cancelled = true }
  }, [graphId, version])
  useEffect(() => {
    if (!tests?.some((t) => t.lastResult === 'PENDING')) return
    const timer = setTimeout(reload, 2000)
    return () => clearTimeout(timer)
  }, [tests, reload])
  return { tests, reload }
}

export function Console({ graphId, onSelectNode }: { graphId: string; onSelectNode: (id: string) => void }) {
  const { consoleTab: tab, consoleOpen: open, consoleHeight, setConsoleTab, setConsoleOpen, setConsoleHeight } = useUiStore()
  const runStatus = useGraphStore((s) => s.runStatus)
  const activeRunId = useGraphStore((s) => s.activeRunId)
  const { state, nowMs, replay } = useRunStream()
  const totals = useRunTotals()
  const history = useHistory(graphId)
  const tests = useTests(graphId)
  const [saveOpen, setSaveOpen] = useState(false)
  const drag = useRef<{ y: number; h: number } | null>(null)

  const last = history.runs?.[0]
  const duration = isLive(runStatus) ? nowMs : state.lastMs

  return (
    <section className={cn('af-console', !open && 'collapsed')} style={{ height: open ? consoleHeight : undefined }}>
      <div
        className="af-resizer"
        onPointerDown={(e) => { drag.current = { y: e.clientY, h: consoleHeight }; e.currentTarget.setPointerCapture(e.pointerId) }}
        onPointerMove={(e) => { if (drag.current) setConsoleHeight(Math.min(window.innerHeight * 0.7, Math.max(140, drag.current.h + drag.current.y - e.clientY))) }}
        onPointerUp={() => { drag.current = null }}
      />
      <div className="af-chead" onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest('button')) setConsoleOpen(!open) }}>
        {TABS.map((t) => (
          <button key={t.id} className={cn('af-tab', open && tab === t.id && 'on')} onClick={() => (open && tab === t.id ? setConsoleOpen(false) : setConsoleTab(t.id))}>
            {t.label}
            {t.id === 'tests' && tests.tests && <span className="cnt">{tests.tests.length}</span>}
          </button>
        ))}
        <div className="af-csum">
          {activeRunId && runStatus ? (
            <>
              <span className={cn('af-pill', runStatus)}>{runStatus}</span>
              <span className="opt">{fmtTokens(totals.tokens)} tok</span>
              <span className="opt">{fmtUsd(totals.cost)}</span>
              <span>{fmtSeconds(duration)}</span>
              {runStatus === 'COMPLETE' && state.output !== null && (
                <button className="af-btn sm" onClick={() => setSaveOpen(true)}><FlaskConical size={12} />Save as test</button>
              )}
            </>
          ) : last ? (
            <>
              <span className="opt">last run</span>
              <span className={cn('af-pill', last.status)}>{last.status}</span>
              <span className="opt">{fmtAgo(last.createdAt)}</span>
              <button className="af-btn sm ghost" onClick={() => { replay(last); setConsoleTab('waterfall') }}>Replay</button>
            </>
          ) : null}
        </div>
        <button className="af-ibtn sm" aria-label={open ? 'Collapse console' : 'Expand console'} onClick={() => setConsoleOpen(!open)}>
          {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>
      {open && (
        <div className="af-cbody">
          {tab === 'trace' && <Trace onSelectNode={onSelectNode} />}
          {tab === 'waterfall' && <Waterfall onSelect={(id) => { onSelectNode(id); setConsoleTab('trace') }} />}
          {tab === 'output' && <Output />}
          {tab === 'tests' && <Tests graphId={graphId} tests={tests.tests} reload={tests.reload} />}
          {tab === 'history' && <History runs={history.runs} onReplay={(r) => { replay(r); setConsoleTab('waterfall') }} />}
          {tab === 'code' && <Code graphId={graphId} />}
        </div>
      )}
      <SaveTestDialog open={saveOpen} onOpenChange={setSaveOpen} graphId={graphId} onSaved={() => { tests.reload(); setConsoleTab('tests') }} />
    </section>
  )
}

// ─── Trace ───────────────────────────────────────────────────────────────────

function Trace({ onSelectNode }: { onSelectNode: (id: string) => void }) {
  const { state, pendingGate } = useRunStream()
  const runId = useGraphStore((s) => s.activeRunId)
  const nodeStats = useGraphStore((s) => s.nodeStats)
  const nodes = useGraphStore((s) => s.nodes)
  const selected = useGraphStore((s) => s.selectedNodeId)
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }) }, [state.log.length, pendingGate])

  if (!state.runId) {
    return <div className="af-empty"><b>No run yet</b>Press Run (⌘↵) to execute this graph. Events stream here with timings; the Waterfall tab shows where the time went.</div>
  }

  const hueOf = (id?: string) => {
    const n = id ? nodes.find((x) => x.id === id) : undefined
    return n ? NODE_HUE[n.data.nodeType as keyof typeof NODE_HUE] : 'var(--line-2)'
  }
  const nameOf = (id?: string) => (id ? state.nodes.get(id)?.label ?? nodes.find((x) => x.id === id)?.data.label ?? id : 'run')

  const row = (r: LogRow, msg: React.ReactNode, act?: React.ReactNode, hue = hueOf(r.nodeId)) => (
    <div key={r.key} className="af-tr" style={{ '--hue': hue } as CSSProperties}>
      <span className="t">{fmtClock(r.t)}</span>
      <span className="n">{nameOf(r.nodeId)}</span>
      <span className="msg">{msg}</span>
      <span className="act">{act}</span>
    </div>
  )

  return (
    <div>
      {state.log.map((r) => {
        if (r.type === 'NODE_START' && r.nodeId) {
          const n = state.nodes.get(r.nodeId)
          if (!n) return null
          const hasText = n.text.length > 0
          const open = hasText && (n.status === 'running' || !closed.has(n.nodeId))
          const s = nodeStats[n.nodeId]
          const model = nodes.find((x) => x.id === n.nodeId)?.data.model
          const msg = n.status === 'running'
            ? <>running{hasText && <span className="af-mono">{fmtTokens(Math.round(n.text.length / 4))} tok streamed</span>}</>
            : n.status === 'failed'
            ? <span style={{ color: 'var(--fail)' }}>failed</span>
            : <>ended {s && <span className="af-mono">{fmtTokens(s.inputTokens + s.outputTokens)} tok · {fmtSeconds(s.durationMs)}{costUsd(model, s) !== undefined && ` · ${fmtUsd(costUsd(model, s)!)}`}</span>}</>
          return (
            <div key={r.key}>
              <div
                className={cn('af-tr', hasText && 'exp', open && 'open', selected === n.nodeId && 'sel')}
                style={{ '--hue': NODE_HUE[n.nodeType] } as CSSProperties}
                onClick={() => {
                  onSelectNode(n.nodeId)
                  if (hasText) setClosed((c) => { const next = new Set(c); if (next.has(n.nodeId)) next.delete(n.nodeId); else next.add(n.nodeId); return next })
                }}
              >
                <span className="t">{fmtClock(r.t)}</span>
                <span className="n">{n.label}</span>
                <span className="msg">{msg}</span>
                <span className="act">{hasText && <span className="chev"><ChevronRight size={13} /></span>}</span>
              </div>
              {open && (
                <div className="af-tr-text" style={{ '--hue': NODE_HUE[n.nodeType] } as CSSProperties}>
                  {n.text}{n.status === 'running' && <span className="af-caret" />}
                </div>
              )}
            </div>
          )
        }
        if (r.type === 'GATE_PENDING') return row(r, 'awaiting approval')
        if (r.type === 'GATE_RESOLVED') return row(r, r.text === 'approve' ? <span style={{ color: 'var(--ok)' }}>approved</span> : <span style={{ color: 'var(--fail)' }}>{r.text || 'rejected'}</span>)
        if (r.type === 'NODE_END') {
          const t = state.nodes.get(r.nodeId ?? '')?.nodeType
          return t === 'agent' ? null : row(r, 'ended') // agents show their result on their own row
        }
        if (r.type === 'COMPLETE') return row(r, <span style={{ color: 'var(--ok)' }}>complete</span>, null, 'var(--ok)')
        if (r.type === 'ERROR') return row(r, <span style={{ color: 'var(--fail)' }}>{r.text}</span>, null, 'var(--fail)')
        return null
      })}
      {pendingGate && runId && (
        <div className="af-gatecard">
          <div className="q">{nameOf(pendingGate.nodeId ?? undefined)} is waiting for a review</div>
          {pendingGate.prompt && <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{pendingGate.prompt}</div>}
          {pendingGate.lastOutput && <div className="last">{pendingGate.lastOutput}</div>}
          <div className="acts">
            <button className="af-btn sm primary" onClick={() => resolveGate(runId, 'approve')}>Approve</button>
            <button className="af-btn sm" onClick={() => resolveGate(runId, 'reject')}>Reject</button>
            {pendingGate.timeoutSeconds > 0 && <span className="af-note" style={{ alignSelf: 'center' }}>rejects after {pendingGate.timeoutSeconds}s</span>}
          </div>
        </div>
      )}
      <div ref={bottom} />
    </div>
  )
}

// ─── Output ──────────────────────────────────────────────────────────────────

function Output() {
  const { state } = useRunStream()
  const [copied, setCopied] = useState(false)
  if (state.output === null) {
    return <div className="af-empty">{state.error ? <><b>The run failed</b>{state.error}</> : 'The final answer appears here when a run completes.'}</div>
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(state.output ?? ''); setCopied(true); setTimeout(() => setCopied(false), 1400) }
    catch { toast('Copy failed: select the text instead') }
  }
  return (
    <div>
      <div className="af-out-head">
        <span>output · last agent&apos;s reply</span>
        <button className="af-btn sm" onClick={copy}>{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <div className="af-out">{state.output}</div>
    </div>
  )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

function Tests({ graphId, tests, reload }: { graphId: string; tests: TestCase[] | null; reload: () => void }) {
  const nodes = useGraphStore((s) => s.nodes)
  const [confirming, setConfirming] = useState<string | null>(null)
  if (!tests) return <div className="af-empty">Loading tests…</div>
  if (tests.length === 0) return <div className="af-empty"><b>No tests yet</b>Save one from a finished run: the console shows “Save as test” after a run completes.</div>

  const pass = tests.filter((t) => t.lastResult === 'PASS').length
  const fail = tests.filter((t) => t.lastResult === 'FAIL').length
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.data.label ?? id

  const runAll = async () => {
    const res = await fetch(`/api/graphs/${graphId}/tests/run`, { method: 'POST' })
    if (!res.ok) { toast(`Could not start tests (HTTP ${res.status})`); return }
    const failed = ((await res.json()).started as Array<{ error?: string }>).filter((s) => s.error)
    if (failed.length) toast(`${failed.length} test${failed.length === 1 ? '' : 's'} could not start: ${failed[0].error}`)
    reload()
  }
  const remove = async (id: string) => {
    const res = await fetch(`/api/tests/${id}`, { method: 'DELETE' })
    if (!res.ok) toast(`Delete failed (HTTP ${res.status})`)
    setConfirming(null)
    reload()
  }

  return (
    <div>
      <div className="af-ttop">
        <span>{tests.length} test{tests.length === 1 ? '' : 's'} · <span className="af-mono" style={{ color: 'var(--ok)' }}>{pass} pass</span> · <span className="af-mono" style={{ color: 'var(--fail)' }}>{fail} fail</span></span>
        <span className="af-micro" style={{ width: 80 }}><i style={{ width: `${(pass / tests.length) * 100}%` }} /></span>
        <button className="af-btn sm primary" onClick={runAll} disabled={tests.some((t) => t.lastResult === 'PENDING')}><Play size={11} />Run all</button>
      </div>
      {tests.map((t) => (
        <div key={t.id} className="af-trow">
          <span>{t.lastResult ? <span className={cn('af-pill', t.lastResult)}>{t.lastResult}</span> : <span className="af-pill">never run</span>}</span>
          <div style={{ minWidth: 0 }}>
            <div className="nm">{t.name}</div>
            <div className="meta">
              path {t.expectedPath.length ? t.expectedPath.map(nameOf).join(' › ') : 'any'}
              {t.expectedOutputContains && ` · output contains “${t.expectedOutputContains}”`}
              {` · input “${String(t.inputPayload.query ?? JSON.stringify(t.inputPayload)).split('\n')[0].slice(0, 48)}”`}
            </div>
          </div>
          <span className="act">
            {confirming === t.id ? (
              <>
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Delete?</span>
                <button className="af-btn sm danger" onClick={() => remove(t.id)}>Delete</button>
                <button className="af-btn sm ghost" onClick={() => setConfirming(null)}>Keep</button>
              </>
            ) : (
              <button className="af-ibtn sm" aria-label={`Delete test ${t.name}`} onClick={() => setConfirming(t.id)}><Trash2 size={13} /></button>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── History ─────────────────────────────────────────────────────────────────

function History({ runs, onReplay }: { runs: RunMetadata[] | null; onReplay: (r: RunMetadata) => void }) {
  const activeRunId = useGraphStore((s) => s.activeRunId)
  if (!runs) return <div className="af-empty">Loading runs…</div>
  if (runs.length === 0) return <div className="af-empty">No runs yet.</div>
  return (
    <div>
      {runs.map((r) => (
        <button key={r.id} className={cn('af-hrow', activeRunId === r.id && 'on')} onClick={() => onReplay(r)} title={r.errorMessage ?? 'Replay this run'}>
          <i className={cn('af-led', r.status)} />
          <span className="inp">
            <span className="af-mono" style={{ fontSize: 11, color: r.status === 'COMPLETE' ? 'var(--ok)' : r.status === 'FAILED' ? 'var(--fail)' : 'var(--accent)' }}>{r.status}</span>
            &nbsp; {String(r.inputPayload?.query ?? JSON.stringify(r.inputPayload)).split('\n')[0]}
            {r.errorMessage && <span style={{ color: 'var(--text-3)' }}> · {r.errorMessage}</span>}
          </span>
          <span className="m">
            {r.durationMs != null ? fmtSeconds(r.durationMs) : '—'} · {fmtTokens(r.tokenCount ?? 0)} tok · {fmtAgo(r.createdAt)}
          </span>
        </button>
      ))}
    </div>
  )
}

// ─── Code ────────────────────────────────────────────────────────────────────

type CodeResult = { status: 'loading' } | { status: 'ok'; code: string } | { status: 'error'; message: string }

/** LangGraph Python for the current canvas, unsaved changes included. */
function Code({ graphId }: { graphId: string }) {
  const [result, setResult] = useState<CodeResult>({ status: 'loading' })
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    let cancelled = false
    const { nodes, edges } = useGraphStore.getState()
    fetch(`/api/graphs/${graphId}/transpile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graphJson: { nodes, edges } }),
    })
      .then(async (res) => {
        const data = await res.json()
        if (!cancelled) setResult(res.ok ? { status: 'ok', code: data.code } : { status: 'error', message: data.error ?? `HTTP ${res.status}` })
      })
      .catch(() => { if (!cancelled) setResult({ status: 'error', message: 'Could not reach the server.' }) })
    return () => { cancelled = true }
  }, [graphId])

  if (result.status === 'loading') return <div className="af-empty">Generating…</div>
  if (result.status === 'error') return <div className="af-empty"><b style={{ color: 'var(--fail)' }}>This graph cannot be transpiled</b>{result.message}</div>
  const copy = async () => {
    try { await navigator.clipboard.writeText(result.code); setCopied(true); setTimeout(() => setCopied(false), 1400) }
    catch { toast('Copy failed: select the text instead') }
  }
  return (
    <div>
      <div className="af-code-head">
        <span>graph.py</span>
        <span>{result.code.split('\n').length} lines · LangGraph · includes unsaved changes</span>
        <button className="af-btn sm" onClick={copy}>{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <div style={{ padding: 12 }}>
        <CodeEditor value={result.code} onChange={() => {}} language="python" readOnly lineNumbers minHeight="100px" maxHeight="none" />
      </div>
    </div>
  )
}

// ─── Save as test ────────────────────────────────────────────────────────────

function SaveTestDialog({ open, onOpenChange, graphId, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; graphId: string; onSaved: () => void }) {
  return (
    <AfDialog open={open} onOpenChange={onOpenChange} title="Save run as test">
      {/* The form mounts with the dialog, so its fields start fresh every time. */}
      {open && <SaveTestForm graphId={graphId} onDone={(saved) => { onOpenChange(false); if (saved) { toast('Test saved'); onSaved() } }} />}
    </AfDialog>
  )
}

function SaveTestForm({ graphId, onDone }: { graphId: string; onDone: (saved: boolean) => void }) {
  const runId = useGraphStore((s) => s.activeRunId)
  const completed = useGraphStore((s) => s.completedNodeIds)
  const nodes = useGraphStore((s) => s.nodes)
  const { state } = useRunStream()
  const [name, setName] = useState('')
  const [input, setInput] = useState<Record<string, unknown> | null>(null)
  const [contains, setContains] = useState(() => state.output?.trim().split('\n')[0].slice(0, 60) ?? '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!runId) return
    fetch(`/api/runs/${runId}`).then((r) => r.json()).then((run) => {
      const payload = { ...run.inputPayload }
      delete payload.autoApprove // the test runner adds it again
      setInput(payload)
      setName((n) => n || String(payload.query ?? `Run ${runId.slice(0, 8)}`).split('\n')[0].slice(0, 48))
    }).catch(() => setError('Could not load the run input.'))
  }, [runId])

  const path = nodes.filter((n) => completed.has(n.id))
  const save = async () => {
    if (!input) return
    const res = await fetch(`/api/graphs/${graphId}/tests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, inputPayload: input, expectedPath: path.map((n) => n.id), expectedOutputContains: contains || null }),
    })
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? `Save failed (HTTP ${res.status})`); return }
    onDone(true)
  }

  return (
    <>
      <div className="af-field">
        <label htmlFor="st-name">Name</label>
        <input id="st-name" className="af-in" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="af-field">
        <label>Input</label>
        <pre className="af-cmds" style={{ whiteSpace: 'pre-wrap' }}>{input ? String(input.query ?? JSON.stringify(input, null, 2)) : 'Loading…'}</pre>
      </div>
      <div className="af-field">
        <label>Expected path (the set of nodes that ran)</label>
        <div className="af-tags">{path.map((n) => <span key={n.id} className="af-tag on">{n.data.label}</span>)}</div>
      </div>
      <div className="af-field">
        <label htmlFor="st-contains">Output contains (case-insensitive, optional)</label>
        <input id="st-contains" className="af-in" value={contains} onChange={(e) => setContains(e.target.value)} />
        <span className="af-hint">Output assertions are brittle with real models. Clear this if the test flaps.</span>
      </div>
      {error && <p className="af-hint" style={{ color: 'var(--fail)' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
        <span className="af-note">gates auto-approve in tests</span>
        <span className="af-sp" />
        <button className="af-btn ghost" onClick={() => onDone(false)}>Cancel</button>
        <button className="af-btn primary" onClick={save} disabled={!input || !name.trim()}>Save test</button>
      </div>
    </>
  )
}
