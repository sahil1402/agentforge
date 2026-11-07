'use client'

import dynamic from 'next/dynamic'
import { useCallback, useState, useEffect, useRef, use } from 'react'
import { flushSync } from 'react-dom'
import { ReactFlowProvider } from '@xyflow/react'
import { useRouter } from 'next/navigation'
import {
  Brain, Wrench, Database, GitBranch, UserCheck,
  Save, Play, Square, ChevronLeft, Zap,
  TestTube, Rocket, History, Layers, GripVertical,
  Wrench as ToolsIcon, Code2,
} from 'lucide-react'
import { useGraphStore } from '@/store/graph-store'
import { NODE_COLORS, type NodeType, type RunMetadata } from '@/lib/types'
import { ToolLibrary } from '@/components/canvas/tool-library'
import { CodePreview } from '@/components/canvas/code-preview'
import { cancelRun, resolveGate } from '@/lib/runs'

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

function TopToolbar({ graphId, onOpenToolLibrary, onOpenCode }: { graphId: string; onOpenToolLibrary: () => void; onOpenCode: () => void }) {
  const router = useRouter()
  const {
    graphName, isDirty, graphVersion, runStatus, activeRunId,
    setGraphName, clearRunState,
  } = useGraphStore()

  const [saving, setSaving] = useState(false)

  // shortcut: plain dropdown list of the last 20 runs; the UI revamp restyles history.
  const [history, setHistory] = useState<RunMetadata[] | null>(null) // null = closed
  const toggleHistory = async () => {
    if (history) return setHistory(null)
    const res = await fetch(`/api/runs?graphId=${graphId}`)
    if (res.ok) setHistory(await res.json())
    else console.error(`History failed (HTTP ${res.status})`)
  }
  const replay = (run: RunMetadata) => {
    setHistory(null)
    // Render the cleared state on its own: if this run is already the active one, batching both
    // writes would leave the trace panel's key unchanged, so it would neither remount nor reconnect.
    flushSync(clearRunState)
    // The remounted trace panel's WebSocket replays the stored events.
    useGraphStore.getState().setRunState(run.id, run.status, run.errorMessage ?? undefined)
  }

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const { nodes, edges } = useGraphStore.getState()
      const res = await fetch(`/api/graphs/${graphId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graphJson: { nodes, edges }, name: graphName }),
      })
      if (!res.ok) throw new Error(`Save failed (HTTP ${res.status})`)
      const saved = await res.json()
      useGraphStore.getState().setGraphVersion(saved.version)
      useGraphStore.getState().markSaved()
    } catch (e) {
      console.error(e) // graph stays dirty so the user can retry
    } finally { setSaving(false) }
  }, [graphId, graphName])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (useGraphStore.getState().isDirty) handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  const lastQuery = useRef('')
  const handleRun = useCallback(async () => {
    // shortcut: native prompt as the run input box; replace in the UI revamp.
    const query = window.prompt('Input for this run', lastQuery.current)
    if (query === null) return
    lastQuery.current = query
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graphId, input: { query } }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      useGraphStore.getState().clearRunState() // a rerun must not keep the last run's node states and stats
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
        onClick={() => router.push('/')}
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
        <span style={{ color: 'var(--text-ghost)', cursor: 'pointer' }} onClick={() => router.push('/')}>graphs</span>
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

        <div className="relative">
          <button onClick={toggleHistory} className="af-icon-btn" title="History">
            <History size={13} />
          </button>
          {history && (
            <div
              className="absolute left-0 top-full mt-1 w-[380px] max-h-[320px] overflow-y-auto rounded-lg p-1 font-mono text-[10px]"
              style={{ background: 'var(--surface-1)', border: '1px solid var(--border-subtle)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
            >
              {history.length === 0 && <p className="p-2" style={{ color: 'var(--text-ghost)' }}>No runs yet</p>}
              {history.map((run) => (
                <button
                  key={run.id}
                  onClick={() => replay(run)}
                  className="w-full text-left px-2 py-1.5 rounded-md hover:bg-white/[0.04] flex gap-2 items-baseline"
                  title={run.errorMessage ?? undefined}
                >
                  <span className="w-[76px] flex-shrink-0" style={{ color: run.status === 'COMPLETE' ? '#9B8AFF' : run.status === 'FAILED' ? '#FF6B81' : '#00E5C3' }}>
                    {run.status}
                  </span>
                  <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                    {String(run.inputPayload?.query ?? JSON.stringify(run.inputPayload))}
                  </span>
                  <span className="flex-shrink-0" style={{ color: 'var(--text-ghost)' }}>
                    {run.durationMs != null ? `${(run.durationMs / 1000).toFixed(1)}s` : '—'} · {run.tokenCount ?? 0} tok · {new Date(run.createdAt).toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="af-icon-btn" title="Tests">
          <TestTube size={13} />
        </button>
        <button onClick={onOpenToolLibrary} className="af-icon-btn" title="Tool Library">
          <ToolsIcon size={13} />
        </button>
        <button onClick={onOpenCode} className="af-icon-btn" title="Show generated code">
          <Code2 size={13} />
        </button>

        <div className="w-px h-4" style={{ background: 'var(--border-subtle)' }} />

        <button className="af-btn af-btn-deploy">
          <Rocket size={11} />
          Deploy
        </button>

        {isRunning ? (
          <button onClick={() => { if (activeRunId) cancelRun(activeRunId); clearRunState() }} className="af-btn af-btn-stop">
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
  const [codeOpen, setCodeOpen] = useState(false)

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

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--void)' }}>
      <TopToolbar graphId={graphId} onOpenToolLibrary={() => setToolLibraryOpen(true)} onOpenCode={() => setCodeOpen(true)} />
      <div className="flex flex-1 min-h-0">
        <NodePalette />
        <ReactFlowProvider>
          <main className="flex-1 min-w-0 relative">
            <Canvas />
          </main>
        </ReactFlowProvider>
        <NodeConfigPanel />
        <TracePanel
          key={activeRunId ?? 'idle'} // remount per run so its traces, output and gate state start empty
          runId={activeRunId}
          onGateApprove={() => { if (activeRunId) resolveGate(activeRunId, 'approve') }}
          onGateReject={() => { if (activeRunId) resolveGate(activeRunId, 'reject') }}
        />
      </div>
      <ToolLibrary open={toolLibraryOpen} onOpenChange={setToolLibraryOpen} />
      <CodePreview graphId={graphId} open={codeOpen} onOpenChange={setCodeOpen} />
    </div>
  )
}
