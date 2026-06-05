'use client'

import dynamic from 'next/dynamic'
import { useCallback, useState, useEffect, use } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useRouter } from 'next/navigation'
import {
  Brain, Wrench, Database, GitBranch, UserCheck,
  Save, Play, Square, ChevronLeft, GitFork, Zap,
  TestTube, Rocket, History
} from 'lucide-react'
import { useGraphStore } from '@/store/graph-store'
import { NODE_COLORS, NODE_LABELS, type NodeType } from '@/lib/types'
import { cn } from '@/lib/utils'

// Dynamic import — ReactFlow must be client-only
const Canvas         = dynamic(() => import('@/components/canvas/canvas'),          { ssr: false })
const NodeConfigPanel= dynamic(() => import('@/components/canvas/node-config-panel'),{ ssr: false })
const TracePanel     = dynamic(() => import('@/components/canvas/trace-panel'),      { ssr: false })

// ─── Node palette items ───────────────────────────────────────────────────────

const PALETTE_NODES: Array<{ type: NodeType; label: string; Icon: React.FC<any>; desc: string }> = [
  { type: 'agent',      Icon: Brain,      label: 'Agent',     desc: 'LLM with tools' },
  { type: 'tool',       Icon: Wrench,     label: 'Tool',      desc: 'Python function' },
  { type: 'memory',     Icon: Database,   label: 'Memory',    desc: 'Vector store' },
  { type: 'router',     Icon: GitBranch,  label: 'Router',    desc: 'Conditional edge' },
  { type: 'human_gate', Icon: UserCheck,  label: 'HumanGate', desc: 'Approval gate' },
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
        'flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-grab border transition-all',
        'hover:border-opacity-60 active:cursor-grabbing active:opacity-70 active:scale-95'
      )}
      style={{
        background: colors.bg,
        borderColor: colors.border,
        transition: 'all 0.12s',
      }}
      title={`Drag to add ${label} node`}
    >
      <div
        className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
        style={{ background: `${colors.dot}22` }}
      >
        <Icon size={12} style={{ color: colors.dot }} />
      </div>
      <div className="min-w-0">
        <p className="text-[11.5px] font-semibold text-[#F1F2F8] leading-none mb-0.5">{label}</p>
        <p className="text-[9.5px] text-[#4A506A] font-mono">{desc}</p>
      </div>
    </div>
  )
}

// ─── Top bar ──────────────────────────────────────────────────────────────────

function TopBar({ graphId }: { graphId: string }) {
  const router = useRouter()
  const {
    graphName, isDirty, isSaving, graphVersion, runStatus,
    setGraphName, clearRunState,
  } = useGraphStore()

  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)

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
    setRunning(true)
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          graphId,
          input: { query: 'test input' }, // TODO: run config modal
        }),
      })
      const data = await res.json()
      useGraphStore.getState().setRunState(data.runId, 'RUNNING')
    } catch (e) {
      console.error('Run failed', e)
      setRunning(false)
    }
  }, [graphId])

  const handleStop = useCallback(() => {
    setRunning(false)
    clearRunState()
  }, [clearRunState])

  const isRunning = runStatus === 'RUNNING' || runStatus === 'AWAITING_HUMAN'

  return (
    <header className="h-11 bg-[#0D1017] border-b border-white/[0.07] flex items-center px-4 gap-3 flex-shrink-0 relative z-50">
      {/* Logo + back */}
      <button
        onClick={() => router.push('/dashboard')}
        className="flex items-center gap-2 text-[#4A506A] hover:text-[#9BA0BC] transition-colors mr-2"
      >
        <ChevronLeft size={14} />
        <div className="w-5 h-5 rounded bg-[#8B7FFE] flex items-center justify-center">
          <Zap size={10} className="text-white" />
        </div>
      </button>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 font-mono text-[11px]">
        <span className="text-[#4A506A] cursor-pointer hover:text-[#9BA0BC]" onClick={() => router.push('/dashboard')}>
          graphs
        </span>
        <span className="text-[#4A506A] opacity-40">/</span>
        <input
          value={graphName}
          onChange={(e) => setGraphName(e.target.value)}
          className="bg-transparent text-[#F1F2F8] outline-none border-b border-transparent focus:border-white/20 transition-colors min-w-[120px]"
        />
        <span className="text-[#4A506A] bg-[#1A1F30] border border-white/[0.07] rounded px-1.5 py-0.5 text-[9px]">
          v{graphVersion}
        </span>
        {isDirty && (
          <span className="text-[#FFAA2C] text-[9px]">●</span>
        )}
      </div>

      {/* Right actions */}
      <div className="ml-auto flex items-center gap-2">

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className={cn(
            'h-7 px-3 rounded-md text-[11.5px] font-medium flex items-center gap-1.5 transition-all border',
            isDirty
              ? 'bg-[#161B2C] border-white/[0.1] text-[#9BA0BC] hover:text-[#F1F2F8] hover:border-white/20'
              : 'opacity-40 border-transparent text-[#4A506A] cursor-default'
          )}
        >
          <Save size={11} />
          {saving ? 'Saving…' : 'Save'}
        </button>

        <div className="w-px h-4 bg-white/[0.07]" />

        {/* History */}
        <button
          className="w-7 h-7 flex items-center justify-center rounded-md text-[#4A506A] hover:text-[#9BA0BC] hover:bg-white/[0.05] transition-all border border-transparent hover:border-white/[0.07]"
          title="Version history"
        >
          <History size={13} />
        </button>

        {/* Test */}
        <button
          className="w-7 h-7 flex items-center justify-center rounded-md text-[#4A506A] hover:text-[#9BA0BC] hover:bg-white/[0.05] transition-all border border-transparent hover:border-white/[0.07]"
          title="Test harness"
        >
          <TestTube size={13} />
        </button>

        {/* Deploy */}
        <button
          className="h-7 px-3 rounded-md text-[11.5px] font-medium flex items-center gap-1.5 transition-all border bg-[#8B7FFE]/10 border-[#8B7FFE]/30 text-[#8B7FFE] hover:bg-[#8B7FFE]/18"
        >
          <Rocket size={11} />
          Deploy
        </button>

        {/* Run / Stop */}
        {isRunning ? (
          <button
            onClick={handleStop}
            className="h-7 px-3 rounded-md text-[11.5px] font-semibold flex items-center gap-1.5 transition-all bg-[#FF5252]/12 border border-[#FF5252]/30 text-[#FF5252] hover:bg-[#FF5252]/20"
          >
            <Square size={10} className="fill-current" />
            Stop
          </button>
        ) : (
          <button
            onClick={handleRun}
            className="h-7 px-3 rounded-md text-[11.5px] font-semibold flex items-center gap-1.5 transition-all bg-[#0FD98A]/12 border border-[#0FD98A]/30 text-[#0FD98A] hover:bg-[#0FD98A]/20"
          >
            <Play size={10} className="fill-current" />
            Run
          </button>
        )}
      </div>
    </header>
  )
}

// ─── Left palette sidebar ─────────────────────────────────────────────────────

function NodePalette() {
  return (
    <aside className="w-[170px] flex-shrink-0 bg-[#0D1017] border-r border-white/[0.07] flex flex-col overflow-hidden">
      <div className="px-3 pt-3 pb-2 border-b border-white/[0.07]">
        <p className="font-mono text-[9px] font-semibold tracking-widest uppercase text-[#4A506A]">
          Nodes
        </p>
      </div>
      <div className="p-2 flex flex-col gap-1.5 overflow-y-auto">
        {PALETTE_NODES.map((n) => (
          <PaletteNode key={n.type} {...n} />
        ))}
      </div>
      <div className="mt-auto p-3 border-t border-white/[0.07]">
        <p className="font-mono text-[9px] text-[#4A506A] text-center">
          Drag nodes onto the canvas
        </p>
      </div>
    </aside>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CanvasPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: graphId } = use(params)
  const { loadGraph, activeRunId, runStatus } = useGraphStore()

  // Load graph from API on mount
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

  return (
    <div className="flex flex-col h-screen bg-[#080B12] overflow-hidden">
      <TopBar graphId={graphId} />
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
