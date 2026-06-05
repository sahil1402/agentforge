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
import { Brain, Wrench, Database, GitBranch, UserCheck } from 'lucide-react'

// ─── Shared node wrapper ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NODE_ICONS: Record<NodeType, React.FC<any>> = {
  agent:      Brain,
  tool:       Wrench,
  memory:     Database,
  router:     GitBranch,
  human_gate: UserCheck,
}

interface NodeWrapperProps {
  id: string
  nodeType: NodeType
  selected?: boolean
  children: React.ReactNode
  statusBadge?: React.ReactNode
}

function NodeWrapper({ id, nodeType, selected, children, statusBadge }: NodeWrapperProps) {
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
        'relative rounded-xl border cursor-pointer transition-all duration-200 min-w-[200px]',
        'bg-[#0F1220] shadow-lg',
        isActive    && 'ring-2 ring-[#0FD98A]/40 border-[#0FD98A]/50',
        isFailed    && 'ring-2 ring-[#FF5252]/40 border-[#FF5252]/50',
        isCompleted && !isActive && 'border-opacity-60',
        selected    && !isActive && !isFailed && 'ring-2 ring-white/20 border-white/30',
        !isActive && !isFailed && !selected && 'hover:border-opacity-60'
      )}
      style={{
        background: colors.bg,
        borderColor: isActive ? 'rgba(15,217,138,0.5)'
          : isFailed ? 'rgba(255,82,82,0.5)'
          : colors.border,
        // Running glow animation via inline style
        boxShadow: isActive
          ? `0 0 0 0 rgba(15,217,138,0.15), 0 4px 24px rgba(0,0,0,0.4)`
          : '0 4px 24px rgba(0,0,0,0.3)',
      }}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-4 right-4 h-[1.5px] rounded-full opacity-60"
        style={{ background: colors.dot }}
      />

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-white/[0.05]"
      >
        <div
          className="flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0"
          style={{ background: `${colors.dot}22` }}
        >
          <Icon size={12} color={colors.dot} />
        </div>
        <span
          className="font-mono text-[9.5px] font-semibold tracking-widest uppercase"
          style={{ color: colors.label }}
        >
          {NODE_LABELS[nodeType]}
        </span>

        {/* Status badge */}
        <div className="ml-auto flex items-center gap-1.5">
          {isActive && (
            <span className="font-mono text-[8px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#0FD98A]/15 text-[#0FD98A]">
              RUNNING
            </span>
          )}
          {isCompleted && !isActive && (
            <span className="font-mono text-[8px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#8B7FFE]/15 text-[#8B7FFE]">
              DONE
            </span>
          )}
          {isFailed && (
            <span className="font-mono text-[8px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-[#FF5252]/15 text-[#FF5252]">
              FAILED
            </span>
          )}
          {statusBadge}
        </div>
      </div>

      {/* Content */}
      <div className="px-3 py-2.5">{children}</div>

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !rounded-full !border-2 !border-[var(--handle-color)] !bg-[#0A0C14]"
        style={{ '--handle-color': colors.dot } as React.CSSProperties}
      />

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !rounded-full !border-2 !border-[var(--handle-color)] !bg-[#0A0C14]"
        style={{ '--handle-color': colors.dot } as React.CSSProperties}
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
      <div className="mb-1">
        <p className="text-[13px] font-semibold text-[#F1F2F8] font-display leading-tight">
          {data.label}
        </p>
        <p className="font-mono text-[9.5px] text-[#4A506A] mt-0.5">
          {data.model} · temp {data.temperature}
        </p>
      </div>
      {data.systemPrompt && (
        <p
          className="text-[10.5px] text-[#9BA0BC] leading-[1.55] mt-2 border-l-2 pl-2 line-clamp-2"
          style={{ borderColor: 'rgba(139,127,254,0.3)' }}
        >
          {data.systemPrompt}
        </p>
      )}
      {data.tools.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {data.tools.map((t) => (
            <span
              key={t}
              className="font-mono text-[8px] px-1.5 py-0.5 rounded bg-[#1A1F30] text-[#4A506A] border border-white/[0.06]"
            >
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
      <p className="text-[13px] font-semibold text-[#F1F2F8] mb-0.5">{data.label}</p>
      <p className="font-mono text-[9.5px] text-[#4A506A]">
        fn: {data.functionName}
      </p>
      {data.description && (
        <p
          className="text-[10.5px] text-[#9BA0BC] leading-[1.55] mt-2 border-l-2 pl-2 line-clamp-2"
          style={{ borderColor: 'rgba(66,165,245,0.3)' }}
        >
          {data.description}
        </p>
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
      <p className="text-[13px] font-semibold text-[#F1F2F8] mb-0.5">{data.label}</p>
      <p className="font-mono text-[9.5px] text-[#4A506A]">
        {backendLabels[data.backend]} · top-k {data.topK}
      </p>
      <p
        className="text-[10.5px] text-[#9BA0BC] leading-[1.55] mt-2 border-l-2 pl-2"
        style={{ borderColor: 'rgba(15,217,138,0.3)' }}
      >
        Collection: {data.collectionName}
      </p>
    </NodeWrapper>
  )
})

// ─── Router Node ──────────────────────────────────────────────────────────────

export const RouterNode = memo(function RouterNode({
  id, data, selected,
}: NodeProps & { data: RouterNodeData }) {
  return (
    <NodeWrapper id={id} nodeType="router" selected={selected}>
      <p className="text-[13px] font-semibold text-[#F1F2F8] mb-0.5">{data.label}</p>
      <p className="font-mono text-[9.5px] text-[#4A506A] mb-2">
        condition router
      </p>
      <div
        className="font-mono text-[9.5px] text-[#FFAA2C]/80 bg-[#1A1F30] rounded px-2 py-1.5 border border-[#FFAA2C]/10"
      >
        {data.condition}
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {data.routes.map((r) => (
          <span
            key={r.label}
            className="font-mono text-[8px] px-1.5 py-0.5 rounded bg-[#FFAA2C]/10 text-[#FFAA2C]/70 border border-[#FFAA2C]/15"
          >
            → {r.label}
          </span>
        ))}
      </div>

      {/* Router has multiple source handles */}
      {data.routes.map((r, i) => (
        <Handle
          key={r.label}
          id={r.label}
          type="source"
          position={Position.Right}
          style={{ top: `${30 + i * 24}%` }}
          className="!w-2.5 !h-2.5 !rounded-full !border-2 !border-[#FFAA2C]/50 !bg-[#0A0C14]"
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
      <p className="text-[13px] font-semibold text-[#F1F2F8] mb-0.5">{data.label}</p>
      <p className="font-mono text-[9.5px] text-[#4A506A] mb-2">
        timeout: {data.timeoutSeconds}s
      </p>
      <p
        className="text-[10.5px] text-[#9BA0BC] leading-[1.55] border-l-2 pl-2 line-clamp-2"
        style={{ borderColor: 'rgba(255,82,82,0.3)' }}
      >
        {data.prompt}
      </p>

      {/* Approval UI when gate is pending */}
      {isGatePending && (
        <div className="mt-3 p-2 rounded-lg bg-[#FF5252]/10 border border-[#FF5252]/25">
          <p className="text-[10px] text-[#FF5252] font-mono font-semibold mb-2">
            ⚠ Awaiting approval
          </p>
          <div className="flex gap-2">
            <button
              className="flex-1 h-6 rounded text-[10px] font-medium bg-[#0FD98A]/15 text-[#0FD98A] border border-[#0FD98A]/25 hover:bg-[#0FD98A]/25 transition-colors"
              onClick={(e) => { e.stopPropagation(); /* dispatch approve */ }}
            >
              Approve
            </button>
            <button
              className="flex-1 h-6 rounded text-[10px] font-medium bg-[#FF5252]/15 text-[#FF5252] border border-[#FF5252]/25 hover:bg-[#FF5252]/25 transition-colors"
              onClick={(e) => { e.stopPropagation(); /* dispatch reject */ }}
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </NodeWrapper>
  )
})

// ─── nodeTypes map (passed to ReactFlow) ─────────────────────────────────────

export const nodeTypes = {
  agent:      AgentNode,
  tool:       ToolNode,
  memory:     MemoryNode,
  router:     RouterNode,
  human_gate: HumanGateNode,
} as const
