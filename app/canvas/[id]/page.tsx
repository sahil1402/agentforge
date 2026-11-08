'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { ReactFlowProvider } from '@xyflow/react'
import { Play, Square, Save, Activity, FlaskConical, Code2, Wrench, Rocket, Maximize, Sun, LayoutGrid } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useGraphStore } from '@/store/graph-store'
import { useUiStore } from '@/store/ui-store'
import { NODE_LABELS, type NodeType } from '@/lib/types'
import { cancelRun } from '@/lib/runs'
import { RunStreamProvider, useRunStream, useRunTotals, fmtClock, fmtTokens, fmtUsd } from '@/lib/run-stream'
import { cn } from '@/lib/utils'
import Canvas, { type CanvasHandle } from '@/components/canvas/canvas'
import NodeConfigPanel from '@/components/canvas/node-config-panel'
import { ToolLibrary } from '@/components/canvas/tool-library'
import { Console } from '@/components/console/console'
import { Rail, NODE_ICONS, type RailSection } from '@/components/shell/rail'
import { CommandPalette, type Command } from '@/components/shell/command-palette'
import { DeployDialog } from '@/components/shell/deploy-dialog'
import { toast } from '@/components/shell/toast'

export default function CanvasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: graphId } = use(params)
  const loadGraph = useGraphStore((s) => s.loadGraph)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    // A new graph starts calm: no run state from the previous one, console closed.
    useGraphStore.getState().clearRunState()
    useGraphStore.getState().setSelectedNode(null)
    useUiStore.setState({ consoleOpen: false, consoleTab: 'trace', runBoxOpen: false })
    fetch(`/api/graphs/${graphId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? 'This graph does not exist.' : `HTTP ${r.status}`))))
      .then((data) => loadGraph(data.graphJson, { id: data.id, name: data.name, version: data.version }))
      .catch((e: Error) => setLoadError(e.message === 'Failed to fetch' ? 'Could not reach the server. Is the database running?' : e.message))
  }, [graphId, loadGraph])

  if (loadError) {
    return (
      <div className="af-empty" style={{ paddingTop: '20vh' }}>
        <b>{loadError}</b>
        <Link href="/" className="af-btn" style={{ marginTop: 12 }}>Back to graphs</Link>
      </div>
    )
  }

  return (
    <RunStreamProvider>
      <ReactFlowProvider>
        <Editor graphId={graphId} />
      </ReactFlowProvider>
    </RunStreamProvider>
  )
}

function Editor({ graphId }: { graphId: string }) {
  const router = useRouter()
  const [canvas, setCanvas] = useState<CanvasHandle | null>(null)
  const ui = useUiStore()
  const graphName = useGraphStore((s) => s.graphName)
  const nodes = useGraphStore((s) => s.nodes)
  const { setTheme, resolvedTheme } = useTheme()
  const save = useSave(graphId)
  const { openRunBox, stop, isRunning } = useRunControls()

  const selectNode = useCallback((id: string) => {
    useGraphStore.getState().setSelectedNode(id)
    canvas?.focusNode(id)
  }, [canvas])

  // The console takes canvas height when it opens: refit so no node hides behind it.
  useEffect(() => {
    const timer = setTimeout(() => canvas?.fitView(), 60)
    return () => clearTimeout(timer)
  }, [canvas, ui.consoleOpen])

  const navigate = useCallback((section: RailSection) => {
    if (section === 'library') router.push('/')
    else if (section === 'canvas') ui.setConsoleOpen(false)
    else if (section === 'runs') ui.openConsole('history')
    else if (section === 'tests') ui.openConsole('tests')
    else if (section === 'code') ui.openConsole('code')
    else if (section === 'tools') ui.setToolsOpen(true)
    else if (section === 'deploy') ui.setDeployOpen(true)
  }, [router, ui])

  // Keyboard: ⌘K palette, ⌘S save, ⌘↵ run, G-chords to sections, Esc to step back.
  useEffect(() => {
    let chord = false
    let chordTimer: ReturnType<typeof setTimeout> | undefined
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName) || (e.target as HTMLElement).isContentEditable
      const ui = useUiStore.getState()
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); ui.setPaletteOpen(!ui.paletteOpen); return }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return }
      if (mod && e.key === 'Enter' && !ui.runBoxOpen) { e.preventDefault(); openRunBox(); return }
      if (e.key === 'Escape' && !typing && !ui.paletteOpen) {
        if (ui.runBoxOpen) ui.setRunBoxOpen(false)
        else useGraphStore.getState().setSelectedNode(null)
        return
      }
      if (typing || mod || ui.paletteOpen) return
      if (e.key.toLowerCase() === 'g' && !chord) { chord = true; chordTimer = setTimeout(() => { chord = false }, 900); return }
      if (chord) {
        chord = false
        clearTimeout(chordTimer)
        const map: Record<string, RailSection> = { l: 'library', c: 'canvas', r: 'runs', t: 'tests', o: 'tools', d: 'code', p: 'deploy' }
        const section = map[e.key.toLowerCase()]
        if (section) { e.preventDefault(); navigate(section) }
        return
      }
      if (e.key === 'f') canvas?.fitView()
    }
    window.addEventListener('keydown', handler)
    return () => { window.removeEventListener('keydown', handler); clearTimeout(chordTimer) }
  }, [save, openRunBox, navigate, canvas])

  const commands = useMemo<Command[]>(() => [
    isRunning
      ? { id: 'stop', group: 'Actions', label: 'Stop run', Icon: Square, run: stop }
      : { id: 'run', group: 'Actions', label: 'Run graph', keys: ['⌘', '↵'], Icon: Play, run: openRunBox },
    { id: 'save', group: 'Actions', label: 'Save graph', keys: ['⌘', 'S'], Icon: Save, run: save },
    { id: 'tests', group: 'Actions', label: 'Open tests', keys: ['G', 'T'], Icon: FlaskConical, run: () => navigate('tests') },
    { id: 'runs', group: 'Actions', label: 'Open run history', keys: ['G', 'R'], Icon: Activity, run: () => navigate('runs') },
    { id: 'code', group: 'Actions', label: 'Show generated code', keys: ['G', 'D'], Icon: Code2, run: () => navigate('code') },
    { id: 'tools', group: 'Actions', label: 'Tool library', keys: ['G', 'O'], Icon: Wrench, run: () => navigate('tools') },
    { id: 'deploy', group: 'Actions', label: 'Deploy', keys: ['G', 'P'], Icon: Rocket, run: () => navigate('deploy') },
    { id: 'fit', group: 'Actions', label: 'Fit canvas to view', keys: ['F'], Icon: Maximize, run: () => canvas?.fitView() },
    { id: 'theme', group: 'Actions', label: `Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`, Icon: Sun, run: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark') },
    { id: 'library', group: 'Actions', label: 'Back to library', keys: ['G', 'L'], Icon: LayoutGrid, run: () => navigate('library') },
    ...(Object.keys(NODE_LABELS) as NodeType[]).map((t) => ({
      id: `add-${t}`, group: 'Add', label: `Add ${NODE_LABELS[t].toLowerCase()}`, Icon: NODE_ICONS[t], run: () => canvas?.addAtCenter(t),
    })),
    ...nodes.map((n) => ({
      id: `node-${n.id}`, group: 'Nodes', label: `Jump to ${n.data.label}`, Icon: NODE_ICONS[n.type as NodeType], run: () => selectNode(n.id),
    })),
  ], [isRunning, stop, openRunBox, save, navigate, resolvedTheme, setTheme, nodes, selectNode, canvas])

  const railActive: RailSection = !ui.consoleOpen ? 'canvas'
    : ui.consoleTab === 'history' ? 'runs' : ui.consoleTab === 'tests' ? 'tests' : ui.consoleTab === 'code' ? 'code' : 'canvas'

  return (
    <div className="af-app">
      <Rail active={railActive} onNavigate={navigate} onAddNode={(t) => canvas?.addAtCenter(t)} onCommand={() => ui.setPaletteOpen(true)} />
      <div className="af-main">
        <TopBar onSave={save} onRun={openRunBox} onStop={stop} isRunning={isRunning} />
        <div className="af-row">
          <Canvas ref={setCanvas} />
          <NodeConfigPanel />
        </div>
        <Console graphId={graphId} onSelectNode={selectNode} />
      </div>
      <CommandPalette open={ui.paletteOpen} onOpenChange={ui.setPaletteOpen} commands={commands} />
      <DeployDialog open={ui.deployOpen} onOpenChange={ui.setDeployOpen} graphName={graphName} />
      <ToolLibrary open={ui.toolsOpen} onOpenChange={ui.setToolsOpen} />
    </div>
  )
}

// ─── Save ────────────────────────────────────────────────────────────────────

function useSave(graphId: string) {
  const saving = useRef(false)
  return useCallback(async () => {
    const { isDirty, nodes, edges, graphName } = useGraphStore.getState()
    if (!isDirty || saving.current) return
    saving.current = true
    try {
      const res = await fetch(`/api/graphs/${graphId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graphJson: { nodes, edges }, name: graphName }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const saved = await res.json()
      useGraphStore.getState().setGraphVersion(saved.version)
      useGraphStore.getState().markSaved()
      toast(`Saved v${saved.version}`)
    } catch (e) {
      console.error(e) // the graph stays dirty so the user can retry
      toast('Save failed. Your changes are still here; try again.')
    } finally {
      saving.current = false
    }
  }, [graphId])
}

// ─── Run controls ────────────────────────────────────────────────────────────

function useRunControls() {
  const runStatus = useGraphStore((s) => s.runStatus)
  const isRunning = runStatus === 'RUNNING' || runStatus === 'AWAITING_HUMAN' || runStatus === 'PENDING'
  const openRunBox = useCallback(() => {
    const s = useGraphStore.getState().runStatus
    if (s === 'RUNNING' || s === 'AWAITING_HUMAN') return
    useUiStore.getState().setRunBoxOpen(true)
  }, [])
  const stop = useCallback(() => {
    const { activeRunId } = useGraphStore.getState()
    if (activeRunId) cancelRun(activeRunId) // the engine records FAILED "Cancelled by user" and the stream shows it
  }, [])
  return { openRunBox, stop, isRunning }
}

const lastInputs = new Map<string, string>()

function RunBox({ graphId }: { graphId: string }) {
  const setOpen = useUiStore((s) => s.setRunBoxOpen)
  const [value, setValue] = useState(() => lastInputs.get(graphId) ?? '')
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('[data-run-btn]')) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [setOpen])

  const go = async () => {
    const query = value.trim()
    if (!query) return
    lastInputs.set(graphId, query)
    setStarting(true)
    setError(null)
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graphId, input: { query } }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      const store = useGraphStore.getState()
      store.clearRunState() // a rerun must not keep the last run's node states and stats
      store.setRunState(data.runId, 'RUNNING')
      setOpen(false)
      useUiStore.getState().openConsole('waterfall')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The run could not start.')
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="af-runbox" ref={box} role="dialog" aria-label="Run input">
      <textarea
        autoFocus
        value={value}
        placeholder="What should this graph work on?"
        aria-label="Input for this run"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); go() }
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      {error && <p className="af-hint" style={{ color: 'var(--fail)', padding: '8px 12px 0', margin: 0 }}>{error}</p>}
      <div className="af-dfoot">
        <span className="af-note">sent as input.query</span>
        <span className="af-sp" />
        <button className="af-btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>
        <button className="af-btn sm primary" onClick={go} disabled={!value.trim() || starting}>
          {starting ? 'Starting…' : 'Run'} <kbd className="af-kbd">⌘↵</kbd>
        </button>
      </div>
    </div>
  )
}

// ─── Top bar ─────────────────────────────────────────────────────────────────

function TopBar({ onSave, onRun, onStop, isRunning }: { onSave: () => void; onRun: () => void; onStop: () => void; isRunning: boolean }) {
  const graphId = useGraphStore((s) => s.graphId)
  const graphName = useGraphStore((s) => s.graphName)
  const graphVersion = useGraphStore((s) => s.graphVersion)
  const isDirty = useGraphStore((s) => s.isDirty)
  const setGraphName = useGraphStore((s) => s.setGraphName)
  const runBoxOpen = useUiStore((s) => s.runBoxOpen)
  return (
    <header className="af-topbar" style={{ position: 'relative' }}>
      <div className="af-crumbs">
        <Link href="/" className="opt">Graphs</Link>
        <span className="opt">›</span>
        <input className="af-name" value={graphName} aria-label="Graph name" onChange={(e) => setGraphName(e.target.value)} />
        <span className="af-vchip">v{graphVersion}</span>
        {isDirty && <span className="af-dirty" title="Unsaved changes" />}
      </div>
      <Telemetry />
      <div className="af-actions">
        <button className="af-btn" onClick={onSave} disabled={!isDirty} title="Save · ⌘S"><Save size={14} />Save</button>
        {isRunning ? (
          <button className="af-btn danger" onClick={onStop}><Square size={12} />Stop</button>
        ) : (
          <button className="af-btn primary" data-run-btn onClick={onRun}><Play size={13} />Run <kbd className="af-kbd">⌘↵</kbd></button>
        )}
      </div>
      {runBoxOpen && graphId && <RunBox graphId={graphId} />}
    </header>
  )
}

function Telemetry() {
  const runId = useGraphStore((s) => s.activeRunId)
  const status = useGraphStore((s) => s.runStatus)
  const { nowMs, state } = useRunStream()
  const { tokens, cost } = useRunTotals()
  if (!runId || !status) return null
  const live = status === 'RUNNING' || status === 'AWAITING_HUMAN'
  const elapsed = live ? nowMs : state.lastMs
  const rate = elapsed > 300 ? Math.round(tokens / (elapsed / 1000)) : 0
  return (
    <div className="af-telemetry">
      <i className={cn('af-led', status)} />
      <span className="st">{status}</span>
      <span>{fmtClock(elapsed)}</span>
      <span className="opt">{fmtTokens(tokens)} tok</span>
      <span className="opt">{rate} tok/s</span>
      <span className="opt">{fmtUsd(cost)}</span>
    </div>
  )
}
