'use client'

import dynamic from 'next/dynamic'
import { useCallback, useState, useEffect, use } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useRouter } from 'next/navigation'
import {
  Brain, Wrench, Database, GitBranch, UserCheck,
  Save, Play, Square, ChevronLeft, Zap,
  TestTube, Rocket, History, Layers, GripVertical,
  Wrench as ToolsIcon,
} from 'lucide-react'
import { useGraphStore } from '@/store/graph-store'
import { NODE_COLORS, type NodeType } from '@/lib/types'
import { ToolLibrary } from '@/components/canvas/tool-library'

const Canvas          = dynamic(() => import('@/components/canvas/canvas'),           { ssr: false })
const NodeConfigPanel = dynamic(() => import('@/components/canvas/node-config-panel'), { ssr: false })
const TracePanel      = dynamic(() => import('@/components/canvas/trace-panel'),       { ssr: false })

// ─── Palette ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PALETTE_NODES: Array<{ type: NodeType; label: string; Icon: React.FC<any>; desc: string }> = [
  { type: 'agent',      Icon: Brain,      label: 'Agent',  desc: 'LLM with tools' },
  { type: 'tool',       Icon: Wrench,     label: 'Tool',   desc: 'Python function' },
  { type: 'memory',     Icon: Database,   label: 'Memory', desc: 'Vector store' },
  { type: 'router',     Icon: GitBranch,  label: 'Router', desc: 'Conditional edge' },
  { type: 'human_gate', Icon: UserCheck,  label: 'Gate',   desc: 'Approval point' },
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
      className="af-palette-node group relative flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] cursor-grab"
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
      }}
      title={`Drag to add ${label}`}
    >
      <div
        className="w-[30px] h-[30px] rounded-lg flex items-center justify-center flex-shrink-0"
        style={{
          background: `${colors.primary}14`,
          boxShadow: `inset 0 0 0 1px ${colors.primary}20`,
        }}
      >
        <Icon size={14} style={{ color: colors.primary }} strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold leading-none mb-[2px]" style={{ color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif' }}>{label}</p>
        <p className="text-[8.5px] leading-none" style={{ color: 'var(--text-ghost)', fontFamily: 'JetBrains Mono, monospace' }}>{desc}</p>
      </div>
    </div>
  )
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

function TopToolbar({ graphId, onOpenToolLibrary }: { graphId: string; onOpenToolLibrary: () => void }) {
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
    } finally { setSaving(false) }
  }, [graphId, graphName])

  const handleRun = useCallback(async () => {
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graphId, input: { query: 'test input' } }),
      })
      const data = await res.json()
      useGraphStore.getState().setRunState(data.runId, 'RUNNING')
    } catch (e) { console.error('Run failed', e) }
  }, [graphId])

  const isRunning = runStatus === 'RUNNING' || runStatus === 'AWAITING_HUMAN'

  return (
    <header
      className="h-11 flex items-center px-3 gap-2 flex-shrink-0 relative z-50"
      style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--border-subtle)' }}
    >
      {/* Logo */}
      <button
        onClick={() => router.push('/dashboard')}
        className="flex items-center gap-2 mr-1 group"
        style={{ color: 'var(--text-muted)' }}
      >
        <ChevronLeft size={13} className="group-hover:-translate-x-0.5 transition-transform" />
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #9B8AFF, #5CA4FF)' }}
        >
          <Zap size={12} className="text-white" strokeWidth={2.5} />
        </div>
      </button>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px' }}>
        <span style={{ color: 'var(--text-ghost)', cursor: 'pointer' }} onClick={() => router.push('/dashboard')}>graphs</span>
        <span style={{ color: 'var(--text-ghost)', opacity: 0.4, fontSize: '8px' }}>→</span>
        <input
          value={graphName}
          onChange={(e) => setGraphName(e.target.value)}
          className="bg-transparent outline-none border-b border-transparent focus:border-white/15 transition-colors min-w-[100px]"
          style={{ color: 'var(--text-primary)', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: '12px' }}
        />
        <span
          className="rounded-md px-1.5 py-[1px]"
          style={{ background: 'var(--surface-3)', border: '1px solid var(--border-subtle)', fontSize: '8px', fontWeight: 600, color: 'var(--text-muted)' }}
        >
          v{graphVersion}
        </span>
        {isDirty && (
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-amber)', boxShadow: '0 0 6px rgba(255,181,71,0.4)' }} />
        )}
      </div>

      {/* Right actions */}
      <div className="ml-auto flex items-center gap-1.5">
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="af-btn af-btn-save"
        >
          <Save size={11} />
          {saving ? 'Saving…' : 'Save'}
          {isDirty && (
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: '7px', background: 'rgba(255,255,255,0.05)', padding: '1px 3px', borderRadius: '3px', color: 'var(--text-ghost)' }}>⌘S</span>
          )}
        </button>

        <div className="w-px h-4" style={{ background: 'var(--border-subtle)' }} />

        <button className="af-icon-btn" title="History">
          <History size={13} />
        </button>
        <button className="af-icon-btn" title="Tests">
          <TestTube size={13} />
        </button>
        <button onClick={onOpenToolLibrary} className="af-icon-btn" title="Tool Library">
          <ToolsIcon size={13} />
        </button>

        <div className="w-px h-4" style={{ background: 'var(--border-subtle)' }} />

        <button className="af-btn af-btn-deploy">
          <Rocket size={11} />
          Deploy
        </button>

        {isRunning ? (
          <button onClick={() => clearRunState()} className="af-btn af-btn-stop">
            <Square size={9} className="fill-current" />
            Stop
          </button>
        ) : (
          <button onClick={handleRun} className="af-btn af-btn-run">
            <Play size={9} className="fill-current" />
            Run
          </button>
        )}
      </div>
    </header>
  )
}

// ─── Palette Sidebar ─────────────────────────────────────────────────────────

function NodePalette() {
  return (
    <aside
      className="w-[170px] flex-shrink-0 flex flex-col overflow-hidden"
      style={{ background: 'rgba(12,16,25,0.6)', borderRight: '1px solid var(--border-subtle)' }}
    >
      <div className="px-3 pt-3 pb-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-1.5">
          <Layers size={10} style={{ color: 'var(--text-ghost)' }} />
          <p style={{ fontFamily: 'JetBrains Mono', fontSize: '8px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: 'var(--text-ghost)' }}>
            Components
          </p>
        </div>
      </div>
      <div className="p-2 flex flex-col gap-1.5 overflow-y-auto flex-1">
        {PALETTE_NODES.map((n) => <PaletteNode key={n.type} {...n} />)}
      </div>
      <div className="p-2.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-1.5 justify-center">
          <GripVertical size={8} style={{ color: 'var(--text-ghost)' }} />
          <p style={{ fontFamily: 'JetBrains Mono', fontSize: '7px', color: 'var(--text-ghost)', letterSpacing: '0.1em' }}>DRAG TO CANVAS</p>
        </div>
      </div>
    </aside>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CanvasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: graphId } = use(params)
  const { loadGraph, activeRunId } = useGraphStore()
  const [toolLibraryOpen, setToolLibraryOpen] = useState(false)

  useEffect(() => {
    if (!graphId) return
    fetch(`/api/graphs/${graphId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.graphJson) {
          loadGraph(data.graphJson, { id: data.id, name: data.name, version: data.version })
        }
      })
      .catch(console.error)
  }, [graphId, loadGraph])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') e.preventDefault()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--void)' }}>
      <TopToolbar graphId={graphId} onOpenToolLibrary={() => setToolLibraryOpen(true)} />
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
      <ToolLibrary open={toolLibraryOpen} onOpenChange={setToolLibraryOpen} />
    </div>
  )
}
