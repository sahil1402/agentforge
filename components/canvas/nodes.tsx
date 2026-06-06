'use client'

import { memo, useCallback } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { NODE_COLORS, NODE_LABELS } from '@/lib/types'
import type {
  AgentNodeData,
  ToolNodeData,
  MemoryNodeData,
  RouterNodeData,
  HumanGateNodeData,
  AnyNodeData,
  NodeType,
} from '@/lib/types'
import { useGraphStore } from '@/store/graph-store'
import {
  Brain, Wrench, Database, GitBranch, UserCheck,
  Cpu, Sparkles, Zap, CircleDot,
} from 'lucide-react'

// ─── Icons per node type ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NODE_ICONS: Record<NodeType, React.FC<any>> = {
  agent:      Brain,
  tool:       Wrench,
  memory:     Database,
  router:     GitBranch,
  human_gate: UserCheck,
}

// ─── Shared node wrapper ──────────────────────────────────────────────────────

interface NodeWrapperProps {
  id: string
  nodeType: NodeType
  selected?: boolean
  children: React.ReactNode
}

function NodeWrapper({ id, nodeType, selected, children }: NodeWrapperProps) {
  const { activeNodeIds, completedNodeIds, failedNodeIds, setSelectedNode } = useGraphStore()
  const colors = NODE_COLORS[nodeType]
  const Icon = NODE_ICONS[nodeType]

  const isActive    = activeNodeIds.has(id)
  const isCompleted = completedNodeIds.has(id)
  const isFailed    = failedNodeIds.has(id)

  const handleClick = useCallback(() => {
    setSelectedNode(id)
  }, [id, setSelectedNode])

  return (
    <div
      onClick={handleClick}
      className={cn(
        'relative rounded-[14px] cursor-pointer min-w-[220px] max-w-[260px]',
        'glass-node',
        isActive && 'node-running',
        selected && !isActive && !isFailed && 'ring-1 ring-white/[0.15]',
      )}
      style={{
        background: isActive
          ? `linear-gradient(135deg, rgba(0,229,195,0.06) 0%, ${colors.bg} 100%)`
          : isFailed
          ? 'rgba(255,107,129,0.05)'
          : colors.bg,
        borderColor: isActive
          ? 'rgba(0,229,195,0.3)'
          : isFailed
          ? 'rgba(255,107,129,0.3)'
          : selected
          ? colors.border
          : undefined,
        boxShadow: isActive
          ? `0 0 30px rgba(0,229,195,0.1), 0 4px 32px rgba(0,0,0,0.4)`
          : isFailed
          ? `0 0 20px rgba(255,107,129,0.08), 0 4px 32px rgba(0,0,0,0.4)`
          : 'var(--shadow-node)',
      }}
    >
      {/* Top gradient accent strip */}
      <div
        className="node-accent-strip"
        style={{ background: colors.gradient }}
      />

      {/* Header row */}
      <div className="flex items-center gap-2.5 px-3.5 pt-3.5 pb-2">
        {/* Icon badge */}
        <div
          className="flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 relative"
          style={{
            background: `${colors.primary}14`,
            boxShadow: `inset 0 0 0 1px ${colors.primary}20`,
          }}
        >
          <Icon size={13} color={colors.primary} strokeWidth={2.2} />
          {isActive && (
            <span
              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full status-dot-pulse"
              style={{ background: 'var(--status-active)', boxShadow: '0 0 6px rgba(0,229,195,0.5)' }}
            />
          )}
        </div>

        {/* Type label + status */}
        <div className="flex-1 min-w-0">
          <span
            className="font-mono text-[9px] font-semibold tracking-[0.14em] uppercase block"
            style={{ color: colors.label }}
          >
            {NODE_LABELS[nodeType]}
          </span>
        </div>

        {/* Status badges */}
        {isActive && (
          <span className="font-mono text-[8px] font-bold tracking-wider px-2 py-[3px] rounded-md bg-[#00E5C3]/10 text-[#00E5C3] border border-[#00E5C3]/20">
            RUNNING
          </span>
        )}
        {isCompleted && !isActive && (
          <span className="font-mono text-[8px] font-bold tracking-wider px-2 py-[3px] rounded-md bg-[#9B8AFF]/10 text-[#9B8AFF] border border-[#9B8AFF]/20">
            DONE
          </span>
        )}
        {isFailed && (
          <span className="font-mono text-[8px] font-bold tracking-wider px-2 py-[3px] rounded-md bg-[#FF6B81]/10 text-[#FF6B81] border border-[#FF6B81]/20">
            FAILED
          </span>
        )}
      </div>

      {/* Divider */}
      <div className="mx-3.5 h-px bg-white/[0.05]" />

      {/* Content */}
      <div className="px-3.5 py-3">{children}</div>

      {/* Input handle — left */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !rounded-full !border-[2px] !bg-[var(--surface-0)]"
        style={{
          borderColor: colors.handleBorder,
          boxShadow: `0 0 0 2px ${colors.bg}`,
        } as React.CSSProperties}
      />

      {/* Output handle — right */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !rounded-full !border-[2px] !bg-[var(--surface-0)]"
        style={{
          borderColor: colors.handleBorder,
          boxShadow: `0 0 0 2px ${colors.bg}`,
        } as React.CSSProperties}
      />
    </div>
  )
}

// ─── Agent Node ───────────────────────────────────────────────────────────────

export const AgentNode = memo(function AgentNode({
  id, data, selected,
}: NodeProps & { data: AgentNodeData }) {
  return (
    <NodeWrapper id={id} nodeType="agent" selected={selected}>
      {/* Name */}
      <p className="text-[13px] font-semibold text-[var(--text-primary)] font-display leading-tight mb-1">
        {data.label}
      </p>

      {/* Model + temp pill */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className="flex items-center gap-1 font-mono text-[9px] px-1.5 py-[2px] rounded-md bg-[#9B8AFF]/8 text-[#9B8AFF]/80 border border-[#9B8AFF]/12">
          <Cpu size={8} />
          {data.model}
        </span>
        <span className="font-mono text-[9px] px-1.5 py-[2px] rounded-md bg-white/[0.03] text-[var(--text-muted)] border border-white/[0.05]">
          t={data.temperature}
        </span>
      </div>

      {/* System prompt preview */}
      {data.systemPrompt && (
        <div className="relative mb-2">
          <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-full bg-gradient-to-b from-[#9B8AFF]/40 to-transparent" />
          <p className="text-[10.5px] text-[var(--text-secondary)] leading-[1.6] pl-2.5 line-clamp-2">
            {data.systemPrompt}
          </p>
        </div>
      )}

      {/* Tools list */}
      {data.tools.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {data.tools.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 font-mono text-[8px] px-1.5 py-[2px] rounded bg-[var(--surface-3)] text-[var(--text-muted)] border border-white/[0.04]"
            >
              <Zap size={7} className="text-[#FFB547]/60" />
              {t}
            </span>
          ))}
        </div>
      )}
    </NodeWrapper>
  )
})

// ─── Tool Node ────────────────────────────────────────────────────────────────

export const ToolNode = memo(function ToolNode({
  id, data, selected,
}: NodeProps & { data: ToolNodeData }) {
  return (
    <NodeWrapper id={id} nodeType="tool" selected={selected}>
      <p className="text-[13px] font-semibold text-[var(--text-primary)] font-display mb-1">{data.label}</p>

      <div className="flex items-center gap-1.5 mb-2">
        <span className="font-mono text-[9px] px-1.5 py-[2px] rounded-md bg-[#5CA4FF]/8 text-[#5CA4FF]/80 border border-[#5CA4FF]/12">
          fn: {data.functionName}
        </span>
        <span className="font-mono text-[9px] px-1.5 py-[2px] rounded-md bg-white/[0.03] text-[var(--text-muted)] border border-white/[0.05]">
          → {data.returnType}
        </span>
      </div>

      {data.description && (
        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-full bg-gradient-to-b from-[#5CA4FF]/40 to-transparent" />
          <p className="text-[10.5px] text-[var(--text-secondary)] leading-[1.6] pl-2.5 line-clamp-2">
            {data.description}
          </p>
        </div>
      )}
    </NodeWrapper>
  )
})

// ─── Memory Node ──────────────────────────────────────────────────────────────

export const MemoryNode = memo(function MemoryNode({
  id, data, selected,
}: NodeProps & { data: MemoryNodeData }) {
  const backendLabels = {
    qdrant: 'Qdrant',
    postgres_vector: 'pgvector',
    in_memory: 'In-memory',
  }
  return (
    <NodeWrapper id={id} nodeType="memory" selected={selected}>
      <p className="text-[13px] font-semibold text-[var(--text-primary)] font-display mb-1">{data.label}</p>

      <div className="flex items-center gap-1.5 mb-2">
        <span className="flex items-center gap-1 font-mono text-[9px] px-1.5 py-[2px] rounded-md bg-[#00E5C3]/8 text-[#00E5C3]/80 border border-[#00E5C3]/12">
          <Database size={8} />
          {backendLabels[data.backend]}
        </span>
        <span className="font-mono text-[9px] px-1.5 py-[2px] rounded-md bg-white/[0.03] text-[var(--text-muted)] border border-white/[0.05]">
          k={data.topK}
        </span>
      </div>

      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-full bg-gradient-to-b from-[#00E5C3]/40 to-transparent" />
        <p className="text-[10.5px] text-[var(--text-secondary)] leading-[1.6] pl-2.5">
          {data.collectionName}
        </p>
      </div>
    </NodeWrapper>
  )
})

// ─── Router Node ──────────────────────────────────────────────────────────────

export const RouterNode = memo(function RouterNode({
  id, data, selected,
}: NodeProps & { data: RouterNodeData }) {
  return (
    <NodeWrapper id={id} nodeType="router" selected={selected}>
      <p className="text-[13px] font-semibold text-[var(--text-primary)] font-display mb-1">{data.label}</p>

      {/* Condition expression */}
      <div className="font-mono text-[9.5px] text-[#FFB547]/70 bg-[#FFB547]/[0.05] rounded-lg px-2.5 py-2 border border-[#FFB547]/10 mb-2">
        <span className="text-[#FFB547]/40 mr-1">if</span>
        {data.condition}
      </div>

      {/* Route badges */}
      <div className="flex flex-wrap gap-1">
        {data.routes.map((r, i) => (
          <span
            key={r.label}
            className="flex items-center gap-1 font-mono text-[8px] px-1.5 py-[2px] rounded bg-[#FFB547]/[0.06] text-[#FFB547]/65 border border-[#FFB547]/10"
          >
            <CircleDot size={7} />
            {r.label}
          </span>
        ))}
      </div>

      {/* Multiple source handles for routes */}
      {data.routes.map((r, i) => (
        <Handle
          key={r.label}
          id={r.label}
          type="source"
          position={Position.Right}
          style={{
            top: `${30 + i * 22}%`,
            borderColor: 'rgba(255,181,71,0.4)',
            boxShadow: '0 0 0 2px rgba(255,181,71,0.05)',
          }}
          className="!w-3 !h-3 !rounded-full !border-[2px] !bg-[var(--surface-0)]"
        />
      ))}
    </NodeWrapper>
  )
})

// ─── Human Gate Node ──────────────────────────────────────────────────────────

export const HumanGateNode = memo(function HumanGateNode({
  id, data, selected,
}: NodeProps & { data: HumanGateNodeData }) {
  const { runStatus, activeNodeIds } = useGraphStore()
  const isGatePending = runStatus === 'AWAITING_HUMAN' && activeNodeIds.has(id)

  return (
    <NodeWrapper id={id} nodeType="human_gate" selected={selected}>
      <p className="text-[13px] font-semibold text-[var(--text-primary)] font-display mb-1">{data.label}</p>

      <div className="flex items-center gap-1.5 mb-2">
        <span className="font-mono text-[9px] px-1.5 py-[2px] rounded-md bg-[#FF6B81]/8 text-[#FF6B81]/70 border border-[#FF6B81]/12">
          timeout: {data.timeoutSeconds}s
        </span>
      </div>

      <div className="relative mb-2">
        <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-full bg-gradient-to-b from-[#FF6B81]/40 to-transparent" />
        <p className="text-[10.5px] text-[var(--text-secondary)] leading-[1.6] pl-2.5 line-clamp-2">
          {data.prompt}
        </p>
      </div>

      {/* Gate approval UI */}
      {isGatePending && (
        <div className="mt-1 p-2.5 rounded-xl bg-[#FF6B81]/[0.06] border border-[#FF6B81]/20">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles size={10} className="text-[#FF6B81]" />
            <span className="font-mono text-[9px] font-bold text-[#FF6B81] tracking-wider">
              AWAITING APPROVAL
            </span>
          </div>
          <div className="flex gap-2">
            <button
              className="flex-1 h-7 rounded-lg text-[10px] font-semibold bg-[#00E5C3]/10 text-[#00E5C3] border border-[#00E5C3]/20 hover:bg-[#00E5C3]/18 transition-all active:scale-[0.97]"
              onClick={(e) => { e.stopPropagation() }}
            >
              ✓ Approve
            </button>
            <button
              className="flex-1 h-7 rounded-lg text-[10px] font-semibold bg-[#FF6B81]/10 text-[#FF6B81] border border-[#FF6B81]/20 hover:bg-[#FF6B81]/18 transition-all active:scale-[0.97]"
              onClick={(e) => { e.stopPropagation() }}
            >
              ✕ Reject
            </button>
          </div>
        </div>
      )}
    </NodeWrapper>
  )
})

// ─── nodeTypes map ───────────────────────────────────────────────────────────

export const nodeTypes = {
  agent:      AgentNode,
  tool:       ToolNode,
  memory:     MemoryNode,
  router:     RouterNode,
  human_gate: HumanGateNode,
} as const
