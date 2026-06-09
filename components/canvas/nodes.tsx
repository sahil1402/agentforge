'use client'

import { memo, useCallback } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { NODE_COLORS, NODE_LABELS } from '@/lib/types'
import type {
  AgentNodeData, ToolNodeData, MemoryNodeData,
  RouterNodeData, HumanGateNodeData, NodeType,
} from '@/lib/types'
import { useGraphStore } from '@/store/graph-store'
import { Brain, Wrench, Database, GitBranch, UserCheck, Cpu, Zap, CircleDot, Sparkles } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NODE_ICONS: Record<NodeType, React.FC<any>> = {
  agent: Brain, tool: Wrench, memory: Database, router: GitBranch, human_gate: UserCheck,
}

// ─── Shared wrapper ──────────────────────────────────────────────────────────

interface NodeWrapperProps {
  id: string; nodeType: NodeType; selected?: boolean; children: React.ReactNode
}

function NodeWrapper({ id, nodeType, selected, children }: NodeWrapperProps) {
  const { activeNodeIds, completedNodeIds, failedNodeIds, setSelectedNode } = useGraphStore()
  const colors = NODE_COLORS[nodeType]
  const Icon = NODE_ICONS[nodeType]

  const isActive    = activeNodeIds.has(id)
  const isCompleted = completedNodeIds.has(id)
  const isFailed    = failedNodeIds.has(id)

  return (
    <div
      onClick={useCallback(() => setSelectedNode(id), [id, setSelectedNode])}
      className={cn(
        'relative rounded-[14px] cursor-pointer min-w-[210px] max-w-[250px] glass-node',
        isActive && 'node-running',
        selected && !isActive && !isFailed && 'ring-1 ring-white/[0.15]',
      )}
      style={{
        background: isActive
          ? `linear-gradient(135deg, rgba(0,229,195,0.12), transparent), var(--surface-2)`
          : isFailed
          ? `linear-gradient(135deg, rgba(255,107,129,0.10), transparent), var(--surface-2)`
          : `linear-gradient(135deg, ${colors.bg}, transparent), var(--surface-2)`,
        borderColor: isActive ? 'rgba(0,229,195,0.35)' : isFailed ? 'rgba(255,107,129,0.35)' : selected ? colors.border : undefined,
        boxShadow: isActive
          ? '0 0 30px rgba(0,229,195,0.12), 0 4px 32px rgba(0,0,0,0.4)'
          : 'var(--shadow-node)',
      }}
    >
      {/* Accent strip */}
      <div className="node-accent-strip" style={{ background: colors.gradient }} />

      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 pt-3.5 pb-2">
        <div
          className="flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0 relative"
          style={{ background: `${colors.primary}14`, boxShadow: `inset 0 0 0 1px ${colors.primary}20` }}
        >
          <Icon size={12} color={colors.primary} strokeWidth={2.2} />
          {isActive && (
            <span className="absolute -top-0.5 -right-0.5 w-[6px] h-[6px] rounded-full status-dot-pulse"
              style={{ background: '#00E5C3', boxShadow: '0 0 6px rgba(0,229,195,0.5)' }} />
          )}
        </div>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: '8px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: colors.label }}>
          {NODE_LABELS[nodeType]}
        </span>
        {isActive && (
          <span className="ml-auto" style={{ fontFamily: 'JetBrains Mono', fontSize: '7px', fontWeight: 700, padding: '2px 6px', borderRadius: '5px', background: 'rgba(0,229,195,0.1)', color: '#00E5C3', border: '1px solid rgba(0,229,195,0.2)', letterSpacing: '0.05em' }}>
            RUNNING
          </span>
        )}
        {isCompleted && !isActive && (
          <span className="ml-auto" style={{ fontFamily: 'JetBrains Mono', fontSize: '7px', fontWeight: 700, padding: '2px 6px', borderRadius: '5px', background: 'rgba(155,138,255,0.1)', color: '#9B8AFF', border: '1px solid rgba(155,138,255,0.2)', letterSpacing: '0.05em' }}>
            DONE
          </span>
        )}
        {isFailed && (
          <span className="ml-auto" style={{ fontFamily: 'JetBrains Mono', fontSize: '7px', fontWeight: 700, padding: '2px 6px', borderRadius: '5px', background: 'rgba(255,107,129,0.1)', color: '#FF6B81', border: '1px solid rgba(255,107,129,0.2)', letterSpacing: '0.05em' }}>
            FAILED
          </span>
        )}
      </div>

      <div className="mx-3.5 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />

      <div className="px-3.5 py-3">{children}</div>

      {/* Handles */}
      <Handle type="target" position={Position.Left}
        className="!w-[10px] !h-[10px] !rounded-full !border-2"
        style={{ borderColor: colors.handleBorder, background: 'var(--surface-0)', boxShadow: `0 0 0 2px ${colors.bg}` } as React.CSSProperties}
      />
      <Handle type="source" position={Position.Right}
        className="!w-[10px] !h-[10px] !rounded-full !border-2"
        style={{ borderColor: colors.handleBorder, background: 'var(--surface-0)', boxShadow: `0 0 0 2px ${colors.bg}` } as React.CSSProperties}
      />
    </div>
  )
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export const AgentNode = memo(function AgentNode({ id, data, selected }: NodeProps & { data: AgentNodeData }) {
  return (
    <NodeWrapper id={id} nodeType="agent" selected={selected}>
      <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', marginBottom: '4px' }}>{data.label}</p>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="flex items-center gap-1" style={{ fontFamily: 'JetBrains Mono', fontSize: '8px', padding: '2px 5px', borderRadius: '5px', background: 'rgba(155,138,255,0.08)', color: 'rgba(155,138,255,0.8)', border: '1px solid rgba(155,138,255,0.12)' }}>
          <Cpu size={7} /> {data.model}
        </span>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: '8px', padding: '2px 5px', borderRadius: '5px', background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.05)' }}>
          t={data.temperature}
        </span>
      </div>
      {data.systemPrompt && (
        <div className="relative mb-1.5">
          <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-full" style={{ background: 'linear-gradient(to bottom, rgba(155,138,255,0.5), transparent)' }} />
          <p className="line-clamp-2" style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.5, paddingLeft: '9px' }}>{data.systemPrompt}</p>
        </div>
      )}
      {data.tools.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {data.tools.map((t) => (
            <span key={t} className="flex items-center gap-1" style={{ fontFamily: 'JetBrains Mono', fontSize: '7px', padding: '1px 5px', borderRadius: '4px', background: 'var(--surface-3)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.04)' }}>
              <Zap size={6} style={{ color: 'rgba(255,181,71,0.6)' }} /> {t}
            </span>
          ))}
        </div>
      )}
    </NodeWrapper>
  )
})

// ─── Tool ─────────────────────────────────────────────────────────────────────

export const ToolNode = memo(function ToolNode({ id, data, selected }: NodeProps & { data: ToolNodeData }) {
  return (
    <NodeWrapper id={id} nodeType="tool" selected={selected}>
      <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', marginBottom: '4px' }}>{data.label}</p>
      <div className="flex items-center gap-1.5 mb-2">
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: '8px', padding: '2px 5px', borderRadius: '5px', background: 'rgba(92,164,255,0.08)', color: 'rgba(92,164,255,0.8)', border: '1px solid rgba(92,164,255,0.12)' }}>
          fn: {data.functionName}
        </span>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: '8px', padding: '2px 5px', borderRadius: '5px', background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.05)' }}>
          → {data.returnType}
        </span>
      </div>
      {data.description && (
        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-full" style={{ background: 'linear-gradient(to bottom, rgba(92,164,255,0.5), transparent)' }} />
          <p className="line-clamp-2" style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.5, paddingLeft: '9px' }}>{data.description}</p>
        </div>
      )}
    </NodeWrapper>
  )
})

// ─── Memory ───────────────────────────────────────────────────────────────────

export const MemoryNode = memo(function MemoryNode({ id, data, selected }: NodeProps & { data: MemoryNodeData }) {
  const bl = { qdrant: 'Qdrant', postgres_vector: 'pgvector', in_memory: 'In-memory' }
  return (
    <NodeWrapper id={id} nodeType="memory" selected={selected}>
      <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', marginBottom: '4px' }}>{data.label}</p>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="flex items-center gap-1" style={{ fontFamily: 'JetBrains Mono', fontSize: '8px', padding: '2px 5px', borderRadius: '5px', background: 'rgba(0,229,195,0.08)', color: 'rgba(0,229,195,0.8)', border: '1px solid rgba(0,229,195,0.12)' }}>
          <Database size={7} /> {bl[data.backend]}
        </span>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: '8px', padding: '2px 5px', borderRadius: '5px', background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.05)' }}>
          k={data.topK}
        </span>
      </div>
      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-full" style={{ background: 'linear-gradient(to bottom, rgba(0,229,195,0.5), transparent)' }} />
        <p style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.5, paddingLeft: '9px' }}>{data.collectionName}</p>
      </div>
    </NodeWrapper>
  )
})

// ─── Router ───────────────────────────────────────────────────────────────────

export const RouterNode = memo(function RouterNode({ id, data, selected }: NodeProps & { data: RouterNodeData }) {
  return (
    <NodeWrapper id={id} nodeType="router" selected={selected}>
      <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', marginBottom: '4px' }}>{data.label}</p>
      <div style={{ fontFamily: 'JetBrains Mono', fontSize: '9px', color: 'rgba(255,181,71,0.7)', background: 'rgba(255,181,71,0.05)', borderRadius: '8px', padding: '6px 8px', border: '1px solid rgba(255,181,71,0.1)', marginBottom: '6px' }}>
        <span style={{ color: 'rgba(255,181,71,0.4)', marginRight: '4px' }}>if</span>{data.condition}
      </div>
      <div className="flex flex-wrap gap-1">
        {data.routes.map((r) => (
          <span key={r.label} className="flex items-center gap-1" style={{ fontFamily: 'JetBrains Mono', fontSize: '7px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(255,181,71,0.06)', color: 'rgba(255,181,71,0.65)', border: '1px solid rgba(255,181,71,0.1)' }}>
            <CircleDot size={6} /> {r.label}
          </span>
        ))}
      </div>
      {data.routes.map((r, i) => (
        <Handle key={r.label} id={r.label} type="source" position={Position.Right}
          style={{ top: `${30 + i * 22}%`, borderColor: 'rgba(255,181,71,0.4)' }}
          className="!w-[10px] !h-[10px] !rounded-full !border-2 !bg-[var(--surface-0)]"
        />
      ))}
    </NodeWrapper>
  )
})

// ─── Human Gate ───────────────────────────────────────────────────────────────

export const HumanGateNode = memo(function HumanGateNode({ id, data, selected }: NodeProps & { data: HumanGateNodeData }) {
  const { runStatus, activeNodeIds } = useGraphStore()
  const isGatePending = runStatus === 'AWAITING_HUMAN' && activeNodeIds.has(id)

  return (
    <NodeWrapper id={id} nodeType="human_gate" selected={selected}>
      <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', marginBottom: '4px' }}>{data.label}</p>
      <span style={{ fontFamily: 'JetBrains Mono', fontSize: '8px', padding: '2px 5px', borderRadius: '5px', background: 'rgba(255,107,129,0.08)', color: 'rgba(255,107,129,0.7)', border: '1px solid rgba(255,107,129,0.12)', display: 'inline-block', marginBottom: '6px' }}>
        timeout: {data.timeoutSeconds}s
      </span>
      <div className="relative mb-1.5">
        <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-full" style={{ background: 'linear-gradient(to bottom, rgba(255,107,129,0.5), transparent)' }} />
        <p className="line-clamp-2" style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.5, paddingLeft: '9px' }}>{data.prompt}</p>
      </div>
      {isGatePending && (
        <div style={{ marginTop: '4px', padding: '8px', borderRadius: '10px', background: 'rgba(255,107,129,0.06)', border: '1px solid rgba(255,107,129,0.2)' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles size={9} style={{ color: '#FF6B81' }} />
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: '8px', fontWeight: 700, color: '#FF6B81', letterSpacing: '0.05em' }}>AWAITING APPROVAL</span>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 h-6 rounded-md text-[9px] font-semibold transition-all active:scale-[0.97]"
              style={{ background: 'rgba(0,229,195,0.1)', color: '#00E5C3', border: '1px solid rgba(0,229,195,0.2)' }}
              onClick={(e) => e.stopPropagation()}>✓ Approve</button>
            <button className="flex-1 h-6 rounded-md text-[9px] font-semibold transition-all active:scale-[0.97]"
              style={{ background: 'rgba(255,107,129,0.1)', color: '#FF6B81', border: '1px solid rgba(255,107,129,0.2)' }}
              onClick={(e) => e.stopPropagation()}>✕ Reject</button>
          </div>
        </div>
      )}
    </NodeWrapper>
  )
})

export const nodeTypes = {
  agent: AgentNode, tool: ToolNode, memory: MemoryNode, router: RouterNode, human_gate: HumanGateNode,
} as const
