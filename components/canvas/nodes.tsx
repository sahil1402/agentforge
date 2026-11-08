'use client'

import { memo, type CSSProperties } from 'react'
import { Handle, Position, useEdges, type NodeProps } from '@xyflow/react'
import { Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NODE_HUE, NODE_LABELS, AVAILABLE_MODELS, costUsd } from '@/lib/types'
import type {
  AgentNodeData, ToolNodeData, MemoryNodeData, RouterNodeData, HumanGateNodeData, NodeType,
} from '@/lib/types'
import { useGraphStore } from '@/store/graph-store'
import { resolveGate } from '@/lib/runs'
import { NODE_ICONS } from '@/components/shell/rail'

type Status = 'idle' | 'running' | 'awaiting' | 'done' | 'failed'

/** Run state of one node, derived from the store's run sets. */
function useNodeStatus(id: string): Status {
  return useGraphStore((s) => {
    if (s.activeNodeIds.has(id)) return s.runStatus === 'AWAITING_HUMAN' && s.nodes.find((n) => n.id === id)?.type === 'human_gate' ? 'awaiting' : 'running'
    if (s.failedNodeIds.has(id)) return 'failed'
    if (s.completedNodeIds.has(id)) return 'done'
    return 'idle'
  })
}

/** Ports light up once they carry an edge. */
function useConnected(id: string) {
  const edges = useEdges()
  return {
    inLit: edges.some((e) => e.target === id),
    outLit: (handle?: string) => edges.some((e) => e.source === id && (handle === undefined || e.sourceHandle === handle)),
  }
}

// ─── Shared card ─────────────────────────────────────────────────────────────

function NodeCard({ id, type, label, selected, model, outHandle = true, inHandle = true, children }: {
  id: string
  type: NodeType
  label: string
  selected?: boolean
  model?: string
  outHandle?: boolean
  inHandle?: boolean
  children: React.ReactNode
}) {
  const status = useNodeStatus(id)
  const stats = useGraphStore((s) => s.nodeStats[id])
  const runError = useGraphStore((s) => (status === 'failed' ? s.runError : null))
  const { inLit, outLit } = useConnected(id)
  const Icon = NODE_ICONS[type]
  const cost = stats && costUsd(model, stats)

  return (
    <div className={cn('af-node', status !== 'idle' && status, selected && 'selected')} style={{ '--hue': NODE_HUE[type] } as CSSProperties}>
      {inHandle && <Handle type="target" position={Position.Left} className={cn(inLit && 'lit')} />}
      {outHandle && <Handle type="source" position={Position.Right} className={cn(outLit() && 'lit')} />}
      <div className="af-n-head">
        <span className="af-n-glyph" title={NODE_LABELS[type]}><Icon size={15} /></span>
        <span className="af-n-name">{label}</span>
        <i className={cn('af-led', status === 'awaiting' ? 'waiting' : status)} title={status} />
      </div>
      <div className="af-n-meter"><i /></div>
      <div className="af-n-body">
        {children}
        {status === 'running' && <div className="af-n-readout live"><i className="af-led running" />running</div>}
        {status === 'awaiting' && <div className="af-n-readout" style={{ color: 'var(--warn)' }}><i className="af-led waiting" />awaiting approval</div>}
        {stats && status !== 'running' && (
          <div className="af-n-readout">
            {type === 'agent' && `${(stats.inputTokens + stats.outputTokens).toLocaleString()} tok · `}
            {(stats.durationMs / 1000).toFixed(1)}s
            {cost !== undefined && ` · $${cost.toFixed(4)}`}
          </div>
        )}
        {runError && <div className="af-n-error">{runError}</div>}
      </div>
    </div>
  )
}

// ─── Node types ──────────────────────────────────────────────────────────────

const modelLabel = (v: string) => AVAILABLE_MODELS.find((m) => m.value === v)?.label ?? v

export const AgentNode = memo(function AgentNode({ id, data, selected }: NodeProps & { data: AgentNodeData }) {
  const shown = data.tools.slice(0, 2) // temperature and max tokens live in the inspector, not on the card
  return (
    <NodeCard id={id} type="agent" label={data.label} selected={selected} model={data.model}>
      <div className="af-n-row">
        <span className="af-chip">{modelLabel(data.model)}</span>
        {shown.map((t) => <span key={t} className="af-chip"><Wrench size={11} />{t}</span>)}
        {data.tools.length > 2 && <span className="af-chip" title={data.tools.slice(2).join(', ')}>+{data.tools.length - 2}</span>}
      </div>
      <div className="af-n-prompt">{data.systemPrompt.split('\n')[0] || 'No system prompt'}</div>
    </NodeCard>
  )
})

export const ToolNode = memo(function ToolNode({ id, data, selected }: NodeProps & { data: ToolNodeData }) {
  return (
    <NodeCard id={id} type="tool" label={data.label} selected={selected}>
      <div className="af-n-row"><span className="af-mono" style={{ fontSize: 11.5 }}>fn {data.functionName || '—'}()</span></div>
      {data.description && <div className="af-n-prompt">{data.description}</div>}
    </NodeCard>
  )
})

const BACKENDS = { qdrant: 'Qdrant', postgres_vector: 'pgvector', in_memory: 'In-memory' }

export const MemoryNode = memo(function MemoryNode({ id, data, selected }: NodeProps & { data: MemoryNodeData }) {
  return (
    <NodeCard id={id} type="memory" label={data.label} selected={selected}>
      <div className="af-n-row"><span className="af-mono" style={{ fontSize: 11.5 }}>{BACKENDS[data.backend]} · {data.collectionName || '—'} · k={data.topK}</span></div>
    </NodeCard>
  )
})

export const RouterNode = memo(function RouterNode({ id, data, selected }: NodeProps & { data: RouterNodeData }) {
  const nodes = useGraphStore((s) => s.nodes)
  const completed = useGraphStore((s) => s.completedNodeIds)
  const failed = useGraphStore((s) => s.failedNodeIds)
  const { outLit } = useConnected(id)
  // Routers emit no run events: a route counts as taken once its target has run.
  const takenLabel = data.routes.find((r) => r.target && (completed.has(r.target) || failed.has(r.target)))?.label
  return (
    <NodeCard id={id} type="router" label={data.label} selected={selected} outHandle={false}>
      <div className="af-n-cond" title={data.condition}>{data.condition || 'no condition'}</div>
      {data.routes.map((r) => (
        <div key={r.label} className={cn('af-n-route', takenLabel && (takenLabel === r.label ? 'taken' : 'untaken'))}>
          <span>{r.label}</span>
          <span style={{ color: 'var(--text-3)' }}>→ {nodes.find((n) => n.id === r.target)?.data.label ?? (r.target ? 'missing' : 'unset')}</span>
          <Handle id={r.label} type="source" position={Position.Right} className={cn((outLit(r.label) || takenLabel === r.label) && 'lit')} />
        </div>
      ))}
    </NodeCard>
  )
})

export const HumanGateNode = memo(function HumanGateNode({ id, data, selected }: NodeProps & { data: HumanGateNodeData }) {
  const status = useNodeStatus(id)
  const activeRunId = useGraphStore((s) => s.activeRunId)
  const decide = (decision: 'approve' | 'reject') => (e: React.MouseEvent) => {
    e.stopPropagation() // don't select the node
    if (activeRunId) resolveGate(activeRunId, decision)
  }
  return (
    <NodeCard id={id} type="human_gate" label={data.label} selected={selected}>
      <div className="af-n-prompt">{data.prompt}</div>
      <div className="af-n-row">
        <span className="af-mono" style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
          timeout {data.timeoutSeconds}s · {data.approvalRequired ? 'approval required' : 'auto-approve on timeout'}
        </span>
      </div>
      {status === 'awaiting' && (
        <div className="af-n-gate nodrag">
          <button className="af-btn sm primary" onClick={decide('approve')}>Approve</button>
          <button className="af-btn sm" onClick={decide('reject')}>Reject</button>
        </div>
      )}
    </NodeCard>
  )
})

export const nodeTypes = {
  agent: AgentNode, tool: ToolNode, memory: MemoryNode, router: RouterNode, human_gate: HumanGateNode,
} as const
