'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useGraphStore } from '@/store/graph-store'
import { NODE_HUE, NODE_LABELS, costUsd, type NodeType } from '@/lib/types'
import { useRunStream, fmtClock, fmtSeconds, fmtTokens, fmtUsd } from '@/lib/run-stream'
import { cn } from '@/lib/utils'

/**
 * The run as a Gantt chart: one lane per node on a shared time axis, bars in the node type's hue,
 * a gate's wait hatched, a live cursor while the run is in flight. Clicking a bar selects the node.
 */
export function Waterfall({ onSelect }: { onSelect: (nodeId: string) => void }) {
  const { state, nowMs } = useRunStream()
  const runStatus = useGraphStore((s) => s.runStatus)
  const nodeStats = useGraphStore((s) => s.nodeStats)
  const nodes = useGraphStore((s) => s.nodes)
  const live = runStatus === 'RUNNING' || runStatus === 'AWAITING_HUMAN'
  const lanesRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)

  useEffect(() => {
    const el = lanesRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (!state.runId) return <div className="af-empty">The waterfall shows every node as a bar on a shared time axis once a run starts.</div>

  const lanes = [...state.nodes.values()].sort((a, b) => a.startMs - b.startMs)
  const end = live ? nowMs : state.lastMs
  const total = Math.max(3000, end, ...lanes.map((l) => l.endMs ?? 0)) * 1.05
  const px = (ms: number) => (ms / total) * Math.max(200, width - 16)
  const step = total > 24000 ? 5000 : total > 12000 ? 2000 : 1000
  const ticks: number[] = []
  for (let t = 0; t <= total; t += step) ticks.push(t)
  const types = [...new Set(lanes.map((l) => l.nodeType))]

  const show = (e: React.MouseEvent, text: string) => {
    const box = lanesRef.current?.closest('.af-cbody')?.getBoundingClientRect()
    if (box) setTip({ x: Math.min(e.clientX - box.left + 12, box.width - 240), y: e.clientY - box.top + 12, text })
  }

  return (
    <div className="af-wf" onMouseLeave={() => setTip(null)}>
      <div className="af-wf-left">
        <div className="af-wf-row legend">
          {types.map((t) => <span key={t} className="af-inline"><i className="af-led" style={{ background: NODE_HUE[t] }} />{NODE_LABELS[t].toLowerCase()}</span>)}
        </div>
        {lanes.map((l) => {
          const s = nodeStats[l.nodeId]
          return (
            <div key={l.nodeId} className="af-wf-row" style={{ '--hue': NODE_HUE[l.nodeType] } as CSSProperties}>
              <span className="pled" />
              <span className="nm">{l.label}</span>
              <span className="st">{s && l.nodeType === 'agent' ? `${fmtTokens(s.inputTokens + s.outputTokens)} tok · ` : ''}{fmtSeconds((l.endMs ?? end) - l.startMs)}</span>
            </div>
          )
        })}
      </div>
      <div className="af-wf-right" ref={lanesRef}>
        <div className="af-wf-axis">
          {ticks.map((t) => (
            <span key={`s${t}`} className={cn(t === 0 && 'first')} style={{ left: px(t) + 8 }}>{t / 1000}s</span>
          ))}
          {ticks.map((t) => <i key={`i${t}`} style={{ left: px(t) + 8 }} />)}
        </div>
        {lanes.map((l) => {
          const nodeType: NodeType = l.nodeType
          const barEnd = l.endMs ?? end
          const s = nodeStats[l.nodeId]
          const model = nodes.find((n) => n.id === l.nodeId)?.data.model
          const gate = state.gates.find((g) => g.nodeId === l.nodeId)
          const text = [
            l.label,
            `${fmtClock(l.startMs)} → ${fmtClock(barEnd)} · ${fmtSeconds(barEnd - l.startMs)}`,
            s && nodeType === 'agent' ? `${fmtTokens(s.inputTokens)} in · ${fmtTokens(s.outputTokens)} out · ${fmtUsd(costUsd(model, s) ?? 0)}` : '',
            gate?.decision ? `decision: ${gate.decision}` : '',
          ].filter(Boolean).join('\n')
          return (
            <div key={l.nodeId} className="af-wf-lane" style={{ '--hue': NODE_HUE[nodeType] } as CSSProperties}>
              {ticks.slice(1).map((t) => <div key={t} className="af-wf-grid" style={{ left: px(t) + 8 }} />)}
              <div
                className={cn('af-bar', nodeType === 'human_gate' && 'wait', nodeType === 'human_gate' && l.status === 'running' && 'live', l.status === 'failed' && 'failed')}
                style={{ left: px(l.startMs) + 8, width: Math.max(2, px(barEnd - l.startMs)) }}
                onMouseMove={(e) => show(e, text)}
                onMouseLeave={() => setTip(null)}
                onClick={() => onSelect(l.nodeId)}
              />
            </div>
          )
        })}
        {live && <div className="af-cursor" style={{ left: px(end) + 8 }} />}
      </div>
      {tip && <div className="af-wf-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
    </div>
  )
}
