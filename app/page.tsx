'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Trash2 } from 'lucide-react'
import type { GraphSchema, RunMetadata, TestCase } from '@/lib/types'
import { fmtAgo, fmtSeconds, fmtTokens } from '@/lib/run-stream'
import { cn } from '@/lib/utils'
import { Rail, type RailSection } from '@/components/shell/rail'
import { CommandPalette, type Command } from '@/components/shell/command-palette'
import { GraphThumb } from '@/components/shell/graph-thumb'
import { toast } from '@/components/shell/toast'

// ─── Graph library (home) ────────────────────────────────────────────────────

interface GraphListItem {
  id: string
  name: string
  description: string | null
  version: number
  nodeCount: number
  updatedAt: string
  graphJson: GraphSchema | null
}

interface GraphSummary { lastRun?: RunMetadata; runs: RunMetadata[]; tests?: TestCase[] }

const TEMPLATES = [
  { value: 'blank', label: 'Blank', note: 'empty canvas' },
  { value: 'research', label: 'Research Assistant', note: 'tools' },
  { value: 'support', label: 'Customer Support', note: 'router + gate' },
  { value: 'code_review', label: 'Code Reviewer', note: 'fan-out' },
] as const

export default function GraphLibraryPage() {
  const router = useRouter()
  const [graphs, setGraphs] = useState<GraphListItem[] | null>(null)
  const [summaries, setSummaries] = useState<Record<string, GraphSummary>>({})
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const search = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    fetch('/api/graphs')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((list: GraphListItem[]) => {
        setGraphs(list)
        // shortcut: one runs + one tests request per graph; add a summary endpoint once libraries hold dozens of graphs.
        for (const g of list) {
          Promise.all([
            fetch(`/api/runs?graphId=${g.id}`).then((r) => (r.ok ? r.json() : [])),
            fetch(`/api/graphs/${g.id}/tests`).then((r) => (r.ok ? r.json() : undefined)),
          ]).then(([runs, tests]: [RunMetadata[], TestCase[] | undefined]) =>
            setSummaries((s) => ({ ...s, [g.id]: { lastRun: runs[0], runs, tests } })))
        }
      })
      .catch(() => setError('Could not load graphs. Is the database running?'))
  }, [])
  useEffect(load, [load])

  const create = async (template: (typeof TEMPLATES)[number]['value']) => {
    setMenuOpen(false)
    const name = template === 'blank' ? 'Untitled Graph' : TEMPLATES.find((t) => t.value === template)!.label
    const res = await fetch('/api/graphs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, template }) })
    if (!res.ok) { toast('Could not create the graph.'); return }
    router.push(`/canvas/${(await res.json()).id}`)
  }

  const remove = async (id: string) => {
    const res = await fetch(`/api/graphs/${id}`, { method: 'DELETE' })
    setConfirming(null)
    if (!res.ok) { toast(`Delete failed (HTTP ${res.status})`); return }
    toast('Graph deleted')
    load()
  }

  // `/` focuses search, ⌘K opens the palette.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((o) => !o) }
      else if (e.key === '/' && !typing) { e.preventDefault(); search.current?.focus() }
      else if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const q = query.trim().toLowerCase()
  const visible = (graphs ?? []).filter((g) => !q || g.name.toLowerCase().includes(q) || (g.description ?? '').toLowerCase().includes(q))
  const recent = useMemo(() => Object.entries(summaries)
    .flatMap(([gid, s]) => s.runs.map((r) => ({ ...r, graphId: gid })))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 7), [summaries])

  const commands = useMemo<Command[]>(() => [
    ...TEMPLATES.map((t) => ({ id: `new-${t.value}`, group: 'New graph', label: `New ${t.value === 'blank' ? 'blank graph' : t.label}`, Icon: Plus, run: () => create(t.value) })),
    ...(graphs ?? []).map((g) => ({ id: `open-${g.id}`, group: 'Graphs', label: `Open ${g.name}`, run: () => router.push(`/canvas/${g.id}`) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [graphs, router])

  const navigate = (section: RailSection) => { if (section === 'library') search.current?.focus() }

  return (
    <div className="af-app">
      <Rail active="library" sections={['library']} onNavigate={navigate} onCommand={() => setPaletteOpen(true)} />
      <div className="af-main">
        <div className="af-lib">
          <div className="af-lib-head">
            <h1>Graphs</h1>
            <label className="af-search">
              <Search size={14} />
              <input ref={search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search graphs" aria-label="Search graphs" />
              <kbd className="af-kbd">/</kbd>
            </label>
            <div className="af-menu">
              <button className="af-btn primary" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}><Plus size={14} />New graph</button>
              {menuOpen && (
                <div className="af-menu-list" role="menu">
                  {TEMPLATES.map((t) => (
                    <button key={t.value} role="menuitem" onClick={() => create(t.value)}>{t.label}<span>{t.note}</span></button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && <p className="af-hint" style={{ color: 'var(--fail)', marginBottom: 16 }}>{error}</p>}
          {!graphs && !error && <p className="af-hint">Loading…</p>}
          {graphs?.length === 0 && <div className="af-empty"><b>No graphs yet</b>Create one from a template to get started.</div>}

          {graphs && graphs.length > 0 && (
            <table className="af-grid">
              <thead>
                <tr><th /><th>Graph</th><th>Version</th><th>Nodes</th><th>Last run</th><th>Tests</th><th className="opt">Updated</th><th /></tr>
              </thead>
              <tbody>
                {visible.map((g) => {
                  const s = summaries[g.id]
                  const pass = s?.tests?.filter((t) => t.lastResult === 'PASS').length ?? 0
                  return (
                    <tr key={g.id} className="row" tabIndex={0} onClick={() => router.push(`/canvas/${g.id}`)} onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/canvas/${g.id}`) }}>
                      <td><GraphThumb graph={g.graphJson} /></td>
                      <td>
                        <div className="af-gname">{g.name}</div>
                        {g.description && <div className="af-gdesc">{g.description}</div>}
                      </td>
                      <td className="af-mono" style={{ color: 'var(--text-2)' }}>v{g.version}</td>
                      <td className="af-mono" style={{ color: 'var(--text-2)' }}>{g.nodeCount}</td>
                      <td>
                        {s?.lastRun ? (
                          <span className="af-inline">
                            <i className={cn('af-led', s.lastRun.status)} />
                            <span className="af-mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{s.lastRun.status}</span>
                            <span style={{ color: 'var(--text-3)' }}>· {fmtAgo(s.lastRun.createdAt)}</span>
                          </span>
                        ) : <span style={{ color: 'var(--text-3)' }}>{s ? 'never' : '…'}</span>}
                      </td>
                      <td>
                        {s?.tests?.length ? (
                          <span className="af-inline">
                            <span className="af-mono" style={{ fontSize: 11, color: 'var(--text-2)' }}>{pass}/{s.tests.length}</span>
                            <span className="af-micro"><i style={{ width: `${(pass / s.tests.length) * 100}%` }} /></span>
                          </span>
                        ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </td>
                      <td className="opt" style={{ color: 'var(--text-3)' }}>{fmtAgo(g.updatedAt)}</td>
                      <td style={{ width: 1 }} onClick={(e) => e.stopPropagation()}>
                        {confirming === g.id ? (
                          <span className="af-inline">
                            <button className="af-btn sm danger" onClick={() => remove(g.id)}>Delete</button>
                            <button className="af-btn sm ghost" onClick={() => setConfirming(null)}>Keep</button>
                          </span>
                        ) : (
                          <button className="af-ibtn sm" aria-label={`Delete ${g.name}`} onClick={() => setConfirming(g.id)}><Trash2 size={13} /></button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {visible.length === 0 && <tr><td colSpan={8} style={{ color: 'var(--text-3)' }}>No graphs match “{query}”.</td></tr>}
              </tbody>
            </table>
          )}

          {recent.length > 0 && (
            <div className="af-sub">
              <h2>Recent runs across graphs</h2>
              <div className="af-runs">
                {recent.map((r) => (
                  <button key={r.id} className="af-runrow" onClick={() => router.push(`/canvas/${r.graphId}`)}>
                    <i className={cn('af-led', r.status)} />
                    <span className="af-gname" style={{ fontSize: 12.5 }}>{graphs?.find((g) => g.id === r.graphId)?.name}</span>
                    <span className="inp">{String(r.inputPayload?.query ?? '').split('\n')[0]}</span>
                    <span className="m opt">{r.durationMs != null ? fmtSeconds(r.durationMs) : '—'} · {fmtTokens(r.tokenCount ?? 0)} tok</span>
                    <span className="m">{fmtAgo(r.createdAt)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />
    </div>
  )
}
