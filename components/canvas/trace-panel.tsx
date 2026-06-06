'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGraphStore } from '@/store/graph-store'
import type { TraceEvent } from '@/lib/types'
import { cn } from '@/lib/utils'
import { NODE_COLORS } from '@/lib/types'
import {
  CheckCircle2, XCircle, Loader2, Clock, Terminal,
  FileText, Activity, ChevronDown, ChevronRight,
  Sparkles, Timer,
} from 'lucide-react'

interface NodeTrace {
  nodeId: string
  nodeLabel: string
  nodeType: string
  status: 'running' | 'done' | 'failed' | 'waiting'
  tokens: string[]
  tokenCount: number
  durationMs?: number
  startedAt?: number
}

interface TracePanelProps {
  runId: string | null
  onGateApprove?: () => void
  onGateReject?: () => void
}

export default function TracePanel({ runId, onGateApprove, onGateReject }: TracePanelProps) {
  const { nodes, runStatus } = useGraphStore()
  const [nodeTraces, setNodeTraces] = useState<Map<string, NodeTrace>>(new Map())
  const [totalTokens, setTotalTokens] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [activeTab, setActiveTab] = useState<'trace' | 'output' | 'logs'>('trace')
  const [finalOutput, setFinalOutput] = useState<string | null>(null)
  const [gatePending, setGatePending] = useState(false)
  const [gateNodeId, setGateNodeId] = useState<string | null>(null)

  const startTimeRef = useRef<number | null>(null)
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const bottomRef    = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (runStatus === 'RUNNING') {
      startTimeRef.current = Date.now()
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - (startTimeRef.current ?? Date.now()))
      }, 100)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [runStatus])

  useEffect(() => {
    if (!runId) return
    const ws = new WebSocket(`${process.env.NEXT_PUBLIC_WS_URL}/ws/runs/${runId}`)

    ws.onmessage = (msg) => {
      const event: TraceEvent = JSON.parse(msg.data)
      handleTraceEvent(event)
    }

    ws.onerror = console.error
    return () => ws.close()
  }, [runId])

  const handleTraceEvent = (event: TraceEvent) => {
    setNodeTraces((prev) => {
      const next = new Map(prev)

      if (event.type === 'NODE_START' && event.nodeId) {
        const graphNode = nodes.find((n) => n.id === event.nodeId)
        next.set(event.nodeId, {
          nodeId: event.nodeId,
          nodeLabel: graphNode?.data.label ?? event.nodeId,
          nodeType: graphNode?.data.nodeType ?? 'agent',
          status: 'running',
          tokens: [],
          tokenCount: 0,
          startedAt: Date.now(),
        })
      }

      if (event.type === 'TOKEN_CHUNK' && event.nodeId) {
        const existing = next.get(event.nodeId)
        if (existing) {
          existing.tokens = [...existing.tokens, String(event.payload.chunk ?? '')]
          existing.tokenCount += 1
        }
      }

      if (event.type === 'NODE_END' && event.nodeId) {
        const existing = next.get(event.nodeId)
        if (existing) {
          existing.status = 'done'
          existing.durationMs = existing.startedAt ? Date.now() - existing.startedAt : undefined
        }
      }

      if (event.type === 'ERROR' && event.nodeId) {
        const existing = next.get(event.nodeId)
        if (existing) existing.status = 'failed'
      }

      return next
    })

    if (event.type === 'GATE_PENDING') {
      setGatePending(true)
      setGateNodeId(event.nodeId ?? null)
    }
    if (event.type === 'GATE_RESOLVED') {
      setGatePending(false)
      setGateNodeId(null)
    }
    if (event.type === 'COMPLETE') {
      setFinalOutput(String(event.payload.output ?? ''))
    }

    setTotalTokens((t) => t + (event.type === 'TOKEN_CHUNK' ? 1 : 0))
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [nodeTraces.size])

  const traces = Array.from(nodeTraces.values())
  const isRunning = runStatus === 'RUNNING' || runStatus === 'AWAITING_HUMAN'
  const completedCount = traces.filter((t) => t.status === 'done').length

  const TABS = [
    { id: 'trace' as const, label: 'Trace',  Icon: Activity },
    { id: 'output' as const, label: 'Output', Icon: FileText },
    { id: 'logs' as const, label: 'Logs',   Icon: Terminal },
  ]

  return (
    <aside className="w-[300px] flex-shrink-0 bg-[var(--surface-1)]/80 backdrop-blur-xl border-l border-[var(--border-subtle)] flex flex-col overflow-hidden">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3.5 border-b border-[var(--border-subtle)] flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-[var(--text-muted)]" />
            <span className="text-[13px] font-semibold text-[var(--text-primary)] font-display">
              Execution Trace
            </span>
          </div>

          {/* Status pill */}
          {isRunning ? (
            <span className="flex items-center gap-1.5 font-mono text-[9px] font-semibold text-[#00E5C3] bg-[#00E5C3]/8 border border-[#00E5C3]/15 rounded-full px-2.5 py-[3px]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00E5C3] status-dot-pulse" />
              LIVE
            </span>
          ) : runStatus === 'COMPLETE' ? (
            <span className="font-mono text-[9px] font-semibold text-[#9B8AFF] bg-[#9B8AFF]/8 border border-[#9B8AFF]/15 rounded-full px-2.5 py-[3px]">
              COMPLETE
            </span>
          ) : runStatus === 'FAILED' ? (
            <span className="font-mono text-[9px] font-semibold text-[#FF6B81] bg-[#FF6B81]/8 border border-[#FF6B81]/15 rounded-full px-2.5 py-[3px]">
              FAILED
            </span>
          ) : (
            <span className="font-mono text-[9px] font-medium text-[var(--text-ghost)] bg-white/[0.03] border border-[var(--border-subtle)] rounded-full px-2.5 py-[3px]">
              IDLE
            </span>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-[var(--surface-0)] rounded-lg p-1">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-medium transition-all',
                activeTab === id
                  ? 'bg-[var(--surface-3)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              )}
            >
              <Icon size={10} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Trace Tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'trace' && (
        <>
          <div className="flex-1 overflow-y-auto">
            {traces.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
                <div className="w-12 h-12 rounded-2xl bg-[var(--surface-3)] flex items-center justify-center border border-[var(--border-subtle)]">
                  <Clock size={20} className="text-[var(--text-ghost)]" />
                </div>
                <div>
                  <p className="text-[12px] font-medium text-[var(--text-muted)] mb-1">No execution yet</p>
                  <p className="text-[11px] text-[var(--text-ghost)]">
                    Click <span className="text-[#00E5C3] font-mono font-semibold">▶ Run</span> to start
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-1">
                {traces.map((trace, idx) => (
                  <TraceNodeRow key={trace.nodeId} trace={trace} idx={idx} isLast={idx === traces.length - 1} />
                ))}
              </div>
            )}

            {/* Gate approval */}
            {gatePending && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mx-3 my-3 p-3.5 rounded-xl bg-[#FF6B81]/[0.05] border border-[#FF6B81]/20"
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles size={11} className="text-[#FF6B81]" />
                  <span className="font-mono text-[9px] font-bold text-[#FF6B81] tracking-wider">
                    HUMAN GATE — AWAITING APPROVAL
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] mb-3 leading-relaxed">
                  Review the agent&apos;s output and decide whether to continue.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={onGateApprove}
                    className="flex-1 h-8 rounded-lg text-[11px] font-semibold bg-[#00E5C3]/10 text-[#00E5C3] border border-[#00E5C3]/20 hover:bg-[#00E5C3]/18 transition-all active:scale-[0.97]"
                  >
                    ✓ Approve
                  </button>
                  <button
                    onClick={onGateReject}
                    className="flex-1 h-8 rounded-lg text-[11px] font-semibold bg-[#FF6B81]/10 text-[#FF6B81] border border-[#FF6B81]/20 hover:bg-[#FF6B81]/18 transition-all active:scale-[0.97]"
                  >
                    ✕ Reject
                  </button>
                </div>
              </motion.div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* ── Stats Footer ───────────────────────────────────────────────── */}
          <div className="flex-shrink-0 border-t border-[var(--border-subtle)] p-3">
            {/* Run ID + timer */}
            <div className="flex items-center justify-between mb-2.5">
              <span className="font-mono text-[9px] text-[var(--text-ghost)]">
                {runId ? `run_${runId.slice(0, 8)}` : '—'}
              </span>
              {isRunning && (
                <span className="flex items-center gap-1 font-mono text-[9px] text-[#00E5C3]">
                  <Timer size={9} />
                  {(elapsedMs / 1000).toFixed(1)}s
                </span>
              )}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'tokens', value: totalTokens.toLocaleString(), color: '#9B8AFF' },
                { label: 'nodes', value: `${completedCount}/${traces.length}`, color: '#00E5C3' },
                { label: 'est. cost', value: `$${(totalTokens * 0.000015).toFixed(4)}`, color: '#FFB547' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-[var(--surface-0)] rounded-lg p-2 text-center border border-[var(--border-subtle)]">
                  <div className="font-mono text-[13px] font-bold text-[var(--text-primary)] leading-none" style={{ color }}>
                    {value}
                  </div>
                  <div className="text-[8px] font-mono text-[var(--text-ghost)] mt-1 uppercase tracking-wider">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Output Tab ────────────────────────────────────────────────────── */}
      {activeTab === 'output' && (
        <div className="flex-1 overflow-y-auto p-4">
          {finalOutput ? (
            <div className="bg-[var(--surface-0)] rounded-xl p-4 border border-[var(--border-subtle)]">
              <pre className="font-mono text-[10.5px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                {finalOutput}
              </pre>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <FileText size={20} className="text-[var(--text-ghost)]" />
              <p className="text-[11px] text-[var(--text-ghost)]">
                Output appears when the run completes.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Logs Tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'logs' && (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-px">
            {traces.flatMap((t) =>
              t.tokens.map((tok, i) => (
                <div key={`${t.nodeId}-${i}`} className="font-mono text-[9px] text-[var(--text-muted)] leading-relaxed flex gap-2 py-0.5 px-2 rounded hover:bg-white/[0.02]">
                  <span className="text-[#9B8AFF]/35 flex-shrink-0 w-20 truncate">[{t.nodeLabel}]</span>
                  <span className="text-[var(--text-secondary)]">{tok}</span>
                </div>
              ))
            )}
            {traces.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center pt-12">
                <Terminal size={18} className="text-[var(--text-ghost)]" />
                <p className="text-[11px] text-[var(--text-ghost)]">No logs yet</p>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}

// ─── Individual Trace Row ─────────────────────────────────────────────────────

function TraceNodeRow({ trace, idx, isLast }: { trace: NodeTrace; idx: number; isLast: boolean }) {
  const [expanded, setExpanded] = useState(trace.status === 'running')
  const colors = NODE_COLORS[trace.nodeType as keyof typeof NODE_COLORS]
  const tokenText = trace.tokens.join('')

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.04, duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
    >
      <div
        className={cn(
          'relative px-4 py-3 cursor-pointer transition-colors',
          trace.status === 'running' && 'bg-[#00E5C3]/[0.02]',
          trace.status === 'failed'  && 'bg-[#FF6B81]/[0.02]',
          'hover:bg-white/[0.015]',
        )}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Timeline connector */}
        <div className="absolute left-[22px] top-0 bottom-0 flex flex-col items-center">
          {/* Dot */}
          <div className="mt-[15px] relative z-10">
            {trace.status === 'running' && (
              <div className="w-3 h-3 rounded-full bg-[#00E5C3]/20 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-[#00E5C3] status-dot-pulse" />
              </div>
            )}
            {trace.status === 'done' && (
              <div className="w-3 h-3 rounded-full flex items-center justify-center" style={{ background: `${colors?.primary}25` }}>
                <div className="w-2 h-2 rounded-full" style={{ background: colors?.primary }} />
              </div>
            )}
            {trace.status === 'failed' && (
              <div className="w-3 h-3 rounded-full bg-[#FF6B81]/20 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-[#FF6B81]" />
              </div>
            )}
          </div>
          {/* Vertical line */}
          {!isLast && (
            <div className="flex-1 w-px bg-white/[0.05] mt-1" />
          )}
        </div>

        {/* Content — offset for timeline */}
        <div className="ml-8">
          {/* Row header */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px] font-semibold text-[var(--text-primary)] font-display flex-1 truncate">
              {trace.nodeLabel}
            </span>

            {/* Expand chevron */}
            {tokenText && (
              <span className="text-[var(--text-ghost)]">
                {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              </span>
            )}

            {/* Status + Duration */}
            {trace.status === 'running' && (
              <Loader2 size={11} className="text-[#00E5C3] animate-spin flex-shrink-0" />
            )}
            {trace.durationMs && (
              <span className="font-mono text-[9px] text-[var(--text-ghost)]">
                {(trace.durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>

          {/* Meta line */}
          <div className="flex items-center gap-2 font-mono text-[9px] text-[var(--text-ghost)]">
            <span style={{ color: colors?.label }}>{trace.nodeType}</span>
            <span>·</span>
            <span>{trace.tokenCount} tokens</span>
          </div>

          {/* Token preview — expanded or while running */}
          <AnimatePresence>
            {(expanded || trace.status === 'running') && tokenText && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div
                  className="font-mono text-[9.5px] text-[var(--text-secondary)] leading-relaxed bg-[var(--surface-0)] rounded-lg px-3 py-2.5 border mt-2 max-h-28 overflow-y-auto"
                  style={{
                    borderColor: trace.status === 'running'
                      ? 'rgba(0,229,195,0.1)'
                      : 'var(--border-subtle)',
                  }}
                >
                  {tokenText}
                  {trace.status === 'running' && <span className="token-cursor" />}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}
