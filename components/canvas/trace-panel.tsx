'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGraphStore } from '@/store/graph-store'
import type { TraceEvent } from '@/lib/types'
import { cn } from '@/lib/utils'
import { NODE_COLORS } from '@/lib/types'
import { CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react'

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
  const { nodes, runStatus, activeNodeIds } = useGraphStore()
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

  // Elapsed timer
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

  // WebSocket connection for live trace
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
    const { graphStore } = window as any
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
          existing.durationMs = existing.startedAt
            ? Date.now() - existing.startedAt
            : undefined
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

  // Auto-scroll trace list to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [nodeTraces.size])

  const traces = Array.from(nodeTraces.values())
  const isRunning = runStatus === 'RUNNING' || runStatus === 'AWAITING_HUMAN'

  return (
    <aside className="w-[280px] flex-shrink-0 bg-[#0D1017] border-l border-white/[0.07] flex flex-col overflow-hidden">

      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.07] flex-shrink-0">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[13px] font-semibold text-[#F1F2F8]">Execution trace</span>
          {isRunning ? (
            <span className="flex items-center gap-1.5 font-mono text-[9.5px] font-medium text-[#0FD98A] bg-[#0FD98A]/10 border border-[#0FD98A]/20 rounded-full px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0FD98A] animate-pulse" />
              live
            </span>
          ) : runStatus === 'COMPLETE' ? (
            <span className="font-mono text-[9.5px] font-medium text-[#8B7FFE] bg-[#8B7FFE]/10 border border-[#8B7FFE]/20 rounded-full px-2 py-0.5">
              complete
            </span>
          ) : runStatus === 'FAILED' ? (
            <span className="font-mono text-[9.5px] font-medium text-[#FF5252] bg-[#FF5252]/10 border border-[#FF5252]/20 rounded-full px-2 py-0.5">
              failed
            </span>
          ) : (
            <span className="font-mono text-[9.5px] text-[#4A506A] bg-white/[0.04] border border-white/[0.06] rounded-full px-2 py-0.5">
              idle
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[#080B12] rounded-md p-1">
          {(['trace', 'output', 'logs'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex-1 py-1 rounded text-[10px] font-mono font-medium transition-all',
                activeTab === tab
                  ? 'bg-[#161B2C] text-[#F1F2F8]'
                  : 'text-[#4A506A] hover:text-[#9BA0BC]'
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Trace tab */}
      {activeTab === 'trace' && (
        <>
          {/* Node execution list */}
          <div className="flex-1 overflow-y-auto">
            {traces.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                <div className="w-10 h-10 rounded-xl bg-[#161B2C] flex items-center justify-center">
                  <Clock size={18} className="text-[#4A506A]" />
                </div>
                <p className="text-[12px] text-[#4A506A]">
                  Hit <span className="text-[#F1F2F8] font-mono">▶ Run</span> to start execution
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {traces.map((trace, idx) => (
                  <TraceNodeRow key={trace.nodeId} trace={trace} idx={idx} />
                ))}
              </div>
            )}

            {/* Gate approval UI */}
            {gatePending && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mx-3 my-3 p-3 rounded-xl bg-[#FF5252]/08 border border-[#FF5252]/25"
              >
                <p className="font-mono text-[9.5px] font-semibold text-[#FF5252] mb-1.5 flex items-center gap-1.5">
                  <span>⚠</span> Human gate — awaiting approval
                </p>
                <p className="text-[11px] text-[#9BA0BC] mb-3 leading-relaxed">
                  Review the agent&apos;s output and approve or reject to continue.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={onGateApprove}
                    className="flex-1 h-7 rounded-md text-[11px] font-semibold bg-[#0FD98A]/12 text-[#0FD98A] border border-[#0FD98A]/25 hover:bg-[#0FD98A]/20 transition-colors"
                  >
                    Approve ✓
                  </button>
                  <button
                    onClick={onGateReject}
                    className="flex-1 h-7 rounded-md text-[11px] font-semibold bg-[#FF5252]/12 text-[#FF5252] border border-[#FF5252]/25 hover:bg-[#FF5252]/20 transition-colors"
                  >
                    Reject ✕
                  </button>
                </div>
              </motion.div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Stats footer */}
          <div className="flex-shrink-0 border-t border-white/[0.07] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[9px] text-[#4A506A]">
                {runId ? `run_${runId.slice(0, 8)}` : 'no active run'}
              </span>
              {isRunning && (
                <span className="font-mono text-[9px] text-[#0FD98A]">
                  {(elapsedMs / 1000).toFixed(1)}s
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'tokens', value: totalTokens.toLocaleString() },
                { label: 'nodes', value: traces.filter((t) => t.status === 'done').length.toString() + '/' + traces.length },
                { label: 'cost', value: `$${(totalTokens * 0.000015).toFixed(4)}` },
              ].map(({ label, value }) => (
                <div key={label} className="bg-[#080B12] rounded-lg p-2 text-center">
                  <div className="font-mono text-[13px] font-semibold text-[#F1F2F8] leading-none">
                    {value}
                  </div>
                  <div className="text-[9px] text-[#4A506A] mt-1">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Output tab */}
      {activeTab === 'output' && (
        <div className="flex-1 overflow-y-auto p-4">
          {finalOutput ? (
            <pre className="font-mono text-[10.5px] text-[#9BA0BC] leading-relaxed whitespace-pre-wrap">
              {finalOutput}
            </pre>
          ) : (
            <p className="text-[12px] text-[#4A506A] text-center mt-8">
              Output will appear here when the run completes.
            </p>
          )}
        </div>
      )}

      {/* Logs tab */}
      {activeTab === 'logs' && (
        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-0.5">
            {traces.flatMap((t) =>
              t.tokens.map((tok, i) => (
                <div key={`${t.nodeId}-${i}`} className="font-mono text-[9.5px] text-[#4A506A] leading-relaxed flex gap-2">
                  <span className="text-[#8B7FFE]/40 flex-shrink-0">[{t.nodeLabel}]</span>
                  <span className="text-[#9BA0BC]">{tok}</span>
                </div>
              ))
            )}
            {traces.length === 0 && (
              <p className="text-[11px] text-[#4A506A] text-center mt-8">No logs yet</p>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}

// ─── Individual node trace row ────────────────────────────────────────────────

function TraceNodeRow({ trace, idx }: { trace: NodeTrace; idx: number }) {
  const [expanded, setExpanded] = useState(trace.status === 'running')
  const colors = NODE_COLORS[trace.nodeType as keyof typeof NODE_COLORS]
  const tokenText = trace.tokens.join('')

  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.05 }}
      className={cn(
        'px-4 py-3 cursor-pointer transition-colors',
        trace.status === 'running' && 'bg-[#0FD98A]/[0.03]',
        trace.status === 'failed'  && 'bg-[#FF5252]/[0.03]',
      )}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Row header */}
      <div className="flex items-center gap-2 mb-1">
        {/* Status icon */}
        {trace.status === 'running' && (
          <Loader2 size={12} className="text-[#0FD98A] animate-spin flex-shrink-0" />
        )}
        {trace.status === 'done' && (
          <CheckCircle2 size={12} className="text-[#8B7FFE] flex-shrink-0" />
        )}
        {trace.status === 'failed' && (
          <XCircle size={12} className="text-[#FF5252] flex-shrink-0" />
        )}

        <span className="text-[12.5px] font-semibold text-[#F1F2F8] flex-1 truncate">
          {trace.nodeLabel}
        </span>

        {trace.status === 'done' && (
          <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#8B7FFE]/12 text-[#8B7FFE]">
            DONE
          </span>
        )}
        {trace.status === 'running' && (
          <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#0FD98A]/12 text-[#0FD98A]">
            RUNNING
          </span>
        )}

        {/* Duration */}
        {trace.durationMs && (
          <span className="font-mono text-[9px] text-[#4A506A]">
            {(trace.durationMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      {/* Token count */}
      <div className="font-mono text-[9px] text-[#4A506A] mb-1.5">
        {trace.tokenCount} tokens ·{' '}
        <span style={{ color: colors?.label ?? '#9BA0BC' }}>{trace.nodeType}</span>
      </div>

      {/* Token stream preview */}
      {(expanded || trace.status === 'running') && tokenText && (
        <div
          className="font-mono text-[9.5px] text-[#9BA0BC] leading-relaxed bg-[#080B12] rounded-md px-2.5 py-2 border border-white/[0.05] max-h-24 overflow-hidden"
          style={{ borderColor: trace.status === 'running' ? 'rgba(15,217,138,0.12)' : undefined }}
        >
          {tokenText}
          {trace.status === 'running' && (
            <span className="inline-block w-1.5 h-3 bg-[#0FD98A] rounded-sm ml-0.5 animate-pulse align-middle" />
          )}
        </div>
      )}
    </motion.div>
  )
}
