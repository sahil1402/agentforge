'use client'

import dynamic from 'next/dynamic'
import { useCallback, useState, useEffect, use } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useRouter } from 'next/navigation'
import {
  Brain, Wrench, Database, GitBranch, UserCheck,
  Save, Play, Square, ChevronLeft, Zap,
  TestTube, Rocket, History, Keyboard, Command,
  Layers, ArrowRight, GripVertical,
} from 'lucide-react'
import { useGraphStore } from '@/store/graph-store'
import { NODE_COLORS, NODE_LABELS, NODE_DESCRIPTIONS, type NodeType } from '@/lib/types'
import { cn } from '@/lib/utils'

const Canvas          = dynamic(() => import('@/components/canvas/canvas'),           { ssr: false })
const NodeConfigPanel = dynamic(() => import('@/components/canvas/node-config-panel'), { ssr: false })
const TracePanel      = dynamic(() => import('@/components/canvas/trace-panel'),       { ssr: false })

// ─── Palette node items ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PALETTE_NODES: Array<{ type: NodeType; label: string; Icon: React.FC<any>; desc: string }> = [
  { type: 'agent',      Icon: Brain,      label: 'Agent',      desc: NODE_DESCRIPTIONS.agent },
  { type: 'tool',       Icon: Wrench,     label: 'Tool',       desc: NODE_DESCRIPTIONS.tool },
  { type: 'memory',     Icon: Database,   label: 'Memory',     desc: NODE_DESCRIPTIONS.memory },
  { type: 'router',     Icon: GitBranch,  label: 'Router',     desc: NODE_DESCRIPTIONS.router },
  { type: 'human_gate', Icon: UserCheck,  label: 'Gate',       desc: NODE_DESCRIPTIONS.human_gate },
]

function PaletteNode({ type, label, Icon, desc }: typeof PALETTE_NODES[0]) {
  const colors = NODE_COLORS[type]

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/agentforge-node', type)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cn(
        'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-grab border transition-all duration-200',
        'hover:scale-[1.02] active:cursor-grabbing active:scale-[0.97]'
      )}
      style={{
        background: colors.bg,
        borderColor: colors.border,
      }}
      title={`Drag to add ${label} node`}
    >
      {/* Grip indicator */}
      <GripVertical size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-white/[0.06] group-hover:text-white/[0.12] transition-colors" />

      {/* Icon */}
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200 group-hover:scale-105"
        style={{
          background: `${colors.primary}12`,
          boxShadow: `inset 0 0 0 1px ${colors.primary}18`,
        }}
      >
        <Icon size={14} style={{ color: colors.primary }} strokeWidth={2} />
      </div>

      {/* Label */}
      <div className="min-w-0 pr-3">
        <p className="text-[11.5px] font-semibold text-[var(--text-primary)] leading-none mb-[3px] font-display">
          {label}
        </p>
        <p className="text-[9px] text-[var(--text-ghost)] font-mono leading-tight line-clamp-1">
          {desc}
        </p>
      </div>
    </div>
  )
}

// ─── Top Toolbar ─────────────────────────────────────────────────────────────

function TopToolbar({ graphId }: { graphId: string }) {
  const router = useRouter()
  const {
    graphName, isDirty, graphVersion, runStatus,
    setGraphName, clearRunState,
  } = useGraphStore()

  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const { nodes, edges } = useGraphStore.getState()
      await fetch(`/api/graphs/${graphId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graphJson: { nodes, edges }, name: graphName }),
      })
      useGraphStore.getState().markSaved()
    } finally {
      setSaving(false)
    }
  }, [graphId, graphName])

  const handleRun = useCallback(async () => {
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          graphId,
          input: { query: 'test input' },
        }),
      })
      const data = await res.json()
      useGraphStore.getState().setRunState(data.runId, 'RUNNING')
    } catch (e) {
      console.error('Run failed', e)
    }
  }, [graphId])

  const handleStop = useCallback(() => {
    clearRunState()
  }, [clearRunState])

  const isRunning = runStatus === 'RUNNING' || runStatus === 'AWAITING_HUMAN'

  return (
    <header className="h-12 bg-[var(--surface-1)]/80 backdrop-blur-xl border-b border-[var(--border-subtle)] flex items-center px-4 gap-3 flex-shrink-0 relative z-50">

      {/* Logo + Back */}
      <button
        onClick={() => router.push('/dashboard')}
        className="flex items-center gap-2.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors mr-1 group"
      >
        <ChevronLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
        <div className="w-6 h-6 rounded-lg flex items-center justify-center relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #9B8AFF, #5CA4FF)',
          }}
        >
          <Zap size={12} className="text-white relative z-10" strokeWidth={2.5} />
        </div>
      </button>

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 font-mono text-[11px]">
        <span
          className="text-[var(--text-ghost)] cursor-pointer hover:text-[var(--text-muted)] transition-colors"
          onClick={() => router.push('/dashboard')}
        >
          graphs
        </span>
        <ArrowRight size={9} className="text-[var(--text-ghost)] opacity-40" />
        <input
          value={graphName}
          onChange={(e) => setGraphName(e.target.value)}
          className="bg-transparent text-[var(--text-primary)] font-semibold outline-none border-b border-transparent focus:border-white/15 transition-colors min-w-[120px] font-display text-[12px]"
        />

        {/* Version badge */}
        <span className="text-[var(--text-ghost)] bg-[var(--surface-3)] border border-[var(--border-subtle)] rounded-md px-2 py-[2px] text-[9px] font-semibold">
          v{graphVersion}
        </span>

        {/* Dirty indicator */}
        {isDirty && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#FFB547] shadow-[0_0_6px_rgba(255,181,71,0.4)]" />
        )}
      </div>

      {/* ── Right Actions ──────────────────────────────────────────────── */}
      <div className="ml-auto flex items-center gap-1.5">

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className={cn(
            'h-8 px-3.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-all border',
            isDirty
              ? 'bg-[var(--surface-3)] border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-hover)]'
              : 'opacity-30 border-transparent text-[var(--text-ghost)] cursor-default'
          )}
        >
          <Save size={12} />
          {saving ? 'Saving…' : 'Save'}
          {isDirty && (
            <kbd className="hidden sm:inline font-mono text-[8px] px-1 py-px rounded bg-white/[0.05] text-[var(--text-ghost)] ml-1">⌘S</kbd>
          )}
        </button>

        <div className="w-px h-5 bg-[var(--border-subtle)] mx-1" />

        {/* History */}
        <button
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-ghost)] hover:text-[var(--text-secondary)] hover:bg-white/[0.04] transition-all"
          title="Version history"
        >
          <History size={14} />
        </button>

        {/* Test */}
        <button
          className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-ghost)] hover:text-[var(--text-secondary)] hover:bg-white/[0.04] transition-all"
          title="Test harness"
        >
          <TestTube size={14} />
        </button>

        <div className="w-px h-5 bg-[var(--border-subtle)] mx-1" />

        {/* Deploy */}
        <button className="h-8 px-3.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all border bg-[#9B8AFF]/8 border-[#9B8AFF]/20 text-[#9B8AFF] hover:bg-[#9B8AFF]/14 hover:border-[#9B8AFF]/30">
          <Rocket size={12} />
          Deploy
        </button>

        {/* Run / Stop */}
        {isRunning ? (
          <button
            onClick={handleStop}
            className="h-8 px-4 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all bg-[#FF6B81]/10 border border-[#FF6B81]/25 text-[#FF6B81] hover:bg-[#FF6B81]/18 active:scale-[0.97]"
          >
            <Square size={10} className="fill-current" />
            Stop
          </button>
        ) : (
          <button
            onClick={handleRun}
            className="h-8 px-4 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all bg-[#00E5C3]/10 border border-[#00E5C3]/25 text-[#00E5C3] hover:bg-[#00E5C3]/18 active:scale-[0.97]"
            style={{
              boxShadow: '0 0 20px rgba(0,229,195,0.05)',
            }}
          >
            <Play size={10} className="fill-current" />
            Run
          </button>
        )}
      </div>
    </header>
  )
}

// ─── Node Palette Sidebar ────────────────────────────────────────────────────

function NodePalette() {
  return (
    <aside className="w-[200px] flex-shrink-0 bg-[var(--surface-1)]/60 backdrop-blur-xl border-r border-[var(--border-subtle)] flex flex-col overflow-hidden">

      {/* Header */}
      <div className="px-3.5 pt-3.5 pb-2.5 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <Layers size={12} className="text-[var(--text-ghost)]" />
          <p className="font-mono text-[9px] font-semibold tracking-[0.14em] uppercase text-[var(--text-ghost)]">
            Components
          </p>
        </div>
      </div>

      {/* Node list */}
      <div className="p-2.5 flex flex-col gap-2 overflow-y-auto flex-1">
        {PALETTE_NODES.map((n) => (
          <PaletteNode key={n.type} {...n} />
        ))}
      </div>

      {/* Footer hint */}
      <div className="p-3 border-t border-[var(--border-subtle)]">
        <div className="flex items-center gap-1.5 justify-center">
          <GripVertical size={9} className="text-[var(--text-ghost)]" />
          <p className="font-mono text-[8px] text-[var(--text-ghost)] tracking-wider">
            DRAG TO CANVAS
          </p>
        </div>
      </div>
    </aside>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CanvasPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: graphId } = use(params)
  const { loadGraph, activeRunId } = useGraphStore()

  useEffect(() => {
    if (!graphId) return
    fetch(`/api/graphs/${graphId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.graphJson) {
          loadGraph(data.graphJson, {
            id: data.id,
            name: data.name,
            version: data.version,
          })
        }
      })
      .catch(console.error)
  }, [graphId, loadGraph])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        // Trigger save via store
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex flex-col h-screen bg-[var(--void)] overflow-hidden">
      <TopToolbar graphId={graphId} />
      <div className="flex flex-1 min-h-0">
        <NodePalette />
        <ReactFlowProvider>
          <main className="flex-1 min-w-0 relative">
            <Canvas />
          </main>
        </ReactFlowProvider>
        <NodeConfigPanel />
        <TracePanel
          runId={activeRunId}
          onGateApprove={async () => {
            if (!activeRunId) return
            await fetch(`/api/runs/${activeRunId}/gate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ decision: 'approve' }),
            })
          }}
          onGateReject={async () => {
            if (!activeRunId) return
            await fetch(`/api/runs/${activeRunId}/gate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ decision: 'reject' }),
            })
          }}
        />
      </div>
    </div>
  )
}
