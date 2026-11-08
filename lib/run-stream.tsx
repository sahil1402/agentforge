'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useGraphStore } from '@/store/graph-store'
import { costUsd, type NodeRunStats, type NodeType, type RunStatus, type TraceEvent } from '@/lib/types'

// The run stream: one WebSocket per active run. Every event is mirrored into the graph store (so the
// canvas animates) and folded into a timeline here (so the console and the top bar can show the
// trace, the waterfall and the telemetry). Token chunks are batched so a fast stream does not
// re-render the shell per chunk.

export interface NodeTrace {
  nodeId: string
  label: string
  nodeType: NodeType
  status: 'running' | 'done' | 'failed'
  text: string          // streamed tokens so far
  startMs: number       // offset from the run's first event
  endMs: number | null
}

export interface LogRow {
  key: string
  t: number             // offset ms
  type: TraceEvent['type']
  nodeId?: string
  text?: string
}

export interface GateSpan {
  nodeId: string | null
  prompt: string
  lastOutput: string
  timeoutSeconds: number
  from: number
  until: number | null
  decision?: string
}

export interface RunStreamState {
  key: string           // which stream (run id + replay nonce) this state belongs to
  runId: string | null
  t0: number | null     // epoch ms of the first event
  lastMs: number        // offset of the latest event
  lastReceivedAt: number
  nodes: Map<string, NodeTrace>
  log: LogRow[]
  gates: GateSpan[]
  output: string | null
  error: string | null
}

const empty = (key: string, runId: string | null): RunStreamState => ({
  key, runId, t0: null, lastMs: 0, lastReceivedAt: 0, nodes: new Map(), log: [], gates: [], output: null, error: null,
})

type NodeLookup = (id: string) => { label: string; nodeType: NodeType } | undefined

/** Pure fold of a batch of events into the timeline (StrictMode may call setState updaters twice). */
export function applyEvents(prev: RunStreamState, events: TraceEvent[], lookup: NodeLookup, receivedAt: number): RunStreamState {
  const nodes = new Map(prev.nodes)
  const log = [...prev.log]
  const gates = prev.gates.map((g) => ({ ...g }))
  let { t0, lastMs, output, error } = prev

  for (const ev of events) {
    const ts = Date.parse(ev.ts)
    if (t0 === null) t0 = Number.isNaN(ts) ? Date.now() : ts
    const t = Number.isNaN(ts) ? lastMs : Math.max(0, ts - t0)
    lastMs = Math.max(lastMs, t)
    const key = String(ev.sequence)
    const id = ev.nodeId

    if (ev.type === 'NODE_START' && id) {
      const existing = nodes.get(id)
      const meta = lookup(id)
      nodes.set(id, {
        nodeId: id,
        label: meta?.label ?? id,
        nodeType: meta?.nodeType ?? 'agent',
        status: 'running',
        text: existing?.text ?? '',
        startMs: existing?.startMs ?? t, // a gate node starts again after its interrupt: keep the first start
        endMs: null,
      })
      if (!existing) log.push({ key, t, type: ev.type, nodeId: id })
    } else if (ev.type === 'TOKEN_CHUNK' && id) {
      const n = nodes.get(id)
      if (n) nodes.set(id, { ...n, text: n.text + String(ev.payload.chunk ?? '') })
    } else if (ev.type === 'NODE_END' && id) {
      const n = nodes.get(id)
      if (n) nodes.set(id, { ...n, status: 'done', endMs: t })
      const { inputTokens = 0, outputTokens = 0 } = ev.payload as Partial<NodeRunStats>
      log.push({ key, t, type: ev.type, nodeId: id, text: `${inputTokens + outputTokens} tok` })
    } else if (ev.type === 'GATE_PENDING') {
      gates.push({
        nodeId: id ?? null,
        prompt: String(ev.payload.prompt ?? ''),
        lastOutput: String(ev.payload.lastOutput ?? ''),
        timeoutSeconds: Number(ev.payload.timeoutSeconds ?? 0),
        from: t,
        until: null,
      })
      log.push({ key, t, type: ev.type, nodeId: id })
    } else if (ev.type === 'GATE_RESOLVED') {
      const open = [...gates].reverse().find((g) => g.until === null)
      if (open) { open.until = t; open.decision = String(ev.payload.decision ?? '') }
      log.push({ key, t, type: ev.type, nodeId: id, text: String(ev.payload.decision ?? '') })
    } else if (ev.type === 'COMPLETE') {
      output = String(ev.payload.output ?? '')
      log.push({ key, t, type: ev.type })
    } else if (ev.type === 'ERROR') {
      error = String(ev.payload.message ?? 'Run failed')
      for (const n of nodes.values()) { // the blamed node and any branch still running
        if (n.status === 'running' || n.nodeId === id) nodes.set(n.nodeId, { ...n, status: 'failed', endMs: n.endMs ?? t })
      }
      for (const g of gates) if (g.until === null) g.until = t
      log.push({ key, t, type: ev.type, nodeId: id, text: error })
    }
  }
  return { ...prev, t0, lastMs, lastReceivedAt: receivedAt, nodes, log, gates, output, error }
}

interface RunStreamContext {
  state: RunStreamState
  /** Offset of "now" within the run: the latest event plus the time since it arrived while live. */
  nowMs: number
  pendingGate: GateSpan | null
  /** Make a stored run the active one; the engine replays its events over the socket. */
  replay: (run: { id: string; status: RunStatus; errorMessage?: string | null }) => void
}

const Ctx = createContext<RunStreamContext | null>(null)

export function RunStreamProvider({ children }: { children: React.ReactNode }) {
  const runId = useGraphStore((s) => s.activeRunId)
  const runStatus = useGraphStore((s) => s.runStatus)
  const [nonce, setNonce] = useState(0)
  const key = `${runId}:${nonce}`
  const [stored, setState] = useState<RunStreamState>(() => empty(key, runId))
  // A new stream starts empty; stale state from the previous one is never shown.
  const state = stored.key === key ? stored : empty(key, runId)
  const queue = useRef<TraceEvent[]>([])
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!runId) return
    const url = process.env.NEXT_PUBLIC_WS_URL
    if (!url) { console.error('NEXT_PUBLIC_WS_URL is not set'); return }

    const lookup: NodeLookup = (id) => {
      const n = useGraphStore.getState().nodes.find((x) => x.id === id)
      return n ? { label: n.data.label, nodeType: n.data.nodeType } : undefined
    }
    const flush = () => {
      flushTimer.current = null
      const events = queue.current
      queue.current = []
      const at = Date.now()
      if (events.length) setState((prev) => applyEvents(prev.key === key ? prev : empty(key, runId), events, lookup, at))
    }
    const mirror = (event: TraceEvent) => {
      const store = useGraphStore.getState()
      if (event.nodeId) {
        if (event.type === 'NODE_START') store.setNodeActive(event.nodeId)
        if (event.type === 'NODE_END') {
          // Runs recorded before stats existed have empty NODE_END payloads.
          const { inputTokens = 0, outputTokens = 0, durationMs = 0 } = event.payload as Partial<NodeRunStats>
          store.setNodeComplete(event.nodeId, { inputTokens, outputTokens, durationMs })
        }
        if (event.type === 'ERROR') store.setNodeFailed(event.nodeId)
      }
      if (event.type === 'GATE_PENDING') store.setRunState(runId, 'AWAITING_HUMAN')
      if (event.type === 'GATE_RESOLVED') store.setRunState(runId, 'RUNNING')
      if (event.type === 'COMPLETE') store.setRunState(runId, 'COMPLETE')
      if (event.type === 'ERROR') store.setRunState(runId, 'FAILED', String(event.payload.message ?? 'Run failed'))
    }

    const ws = new WebSocket(`${url}/ws/runs/${runId}`)
    ws.onmessage = (msg) => {
      const event = JSON.parse(msg.data) as TraceEvent
      mirror(event)
      queue.current.push(event)
      if (!flushTimer.current) flushTimer.current = setTimeout(flush, 40)
    }
    ws.onerror = console.error
    return () => {
      ws.onerror = null // closing on purpose (unmount / StrictMode remount / replay) is not an error
      ws.close()
      if (flushTimer.current) clearTimeout(flushTimer.current)
      flushTimer.current = null
      queue.current = []
    }
  }, [runId, key])

  // Live clock: tick while the run is in flight so elapsed times and the waterfall cursor move.
  const live = runStatus === 'RUNNING' || runStatus === 'AWAITING_HUMAN'
  const [clock, setClock] = useState(0)
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => setClock(Date.now()), 100)
    return () => clearInterval(timer)
  }, [live])
  const nowMs = live && state.lastReceivedAt ? state.lastMs + Math.max(0, clock - state.lastReceivedAt) : state.lastMs

  const replay = useCallback((run: { id: string; status: RunStatus; errorMessage?: string | null }) => {
    const store = useGraphStore.getState()
    // Render the cleared state on its own: replaying the already-active run must still reconnect.
    flushSync(() => store.clearRunState())
    store.setRunState(run.id, run.status, run.errorMessage ?? undefined)
    setNonce((n) => n + 1)
  }, [])

  const pendingGate = runStatus === 'AWAITING_HUMAN'
    ? [...state.gates].reverse().find((g) => g.until === null) ?? null
    : null

  const value = useMemo<RunStreamContext>(() => ({ state, nowMs, pendingGate, replay }), [state, nowMs, pendingGate, replay])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useRunStream(): RunStreamContext {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useRunStream must be used inside RunStreamProvider')
  return ctx
}

/** Tokens and estimated cost of the active run, from the NODE_END stats mirrored into the store. */
export function useRunTotals() {
  const nodeStats = useGraphStore((s) => s.nodeStats)
  const nodes = useGraphStore((s) => s.nodes)
  return useMemo(() => {
    let tokens = 0
    let cost = 0
    for (const [id, s] of Object.entries(nodeStats)) {
      tokens += s.inputTokens + s.outputTokens
      cost += costUsd(nodes.find((n) => n.id === id)?.data.model, s) ?? 0
    }
    return { tokens, cost }
  }, [nodeStats, nodes])
}

// ─── Formatting helpers shared by the console and the top bar ────────────────

export const fmtSeconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`
export const fmtClock = (ms: number) => {
  const s = Math.max(0, ms) / 1000
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(1).padStart(4, '0')}`
}
export const fmtUsd = (usd: number) => `$${usd.toFixed(4)}`
export const fmtTokens = (n: number) => n.toLocaleString('en-US')
export const fmtAgo = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  if (min < 1440) return `${Math.round(min / 60)} h ago`
  if (min < 2880) return 'yesterday'
  return `${Math.round(min / 1440)} days ago`
}
