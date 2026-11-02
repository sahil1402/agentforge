'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Zap } from 'lucide-react'

// ─── Graph library (home) ────────────────────────────────────────────────────

interface GraphListItem {
  id: string
  name: string
  description: string | null
  version: number
  nodeCount: number
  updatedAt: string
}

const TEMPLATES = [
  { value: 'blank',    label: 'Blank' },
  { value: 'research', label: 'Research Assistant' },
  { value: 'support',  label: 'Customer Support' },
  { value: 'code_review', label: 'Code Reviewer' },
] as const

export default function GraphLibraryPage() {
  const router = useRouter()
  const [graphs, setGraphs] = useState<GraphListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number]['value']>('blank')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch('/api/graphs')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setGraphs)
      .catch(() => setError('Could not load graphs. Is the database running?'))
  }, [])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const name = TEMPLATES.find((t) => t.value === template)!.label
      const res = await fetch('/api/graphs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: template === 'blank' ? 'Untitled Graph' : name, template }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const graph = await res.json()
      router.push(`/canvas/${graph.id}`)
    } catch {
      setError('Could not create graph.')
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--void)' }}>
      <header
        className="h-11 flex items-center px-4 gap-2"
        style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #9B8AFF, #5CA4FF)' }}
        >
          <Zap size={12} className="text-white" strokeWidth={2.5} />
        </div>
        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
          AgentForge
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <select
            aria-label="Template"
            value={template}
            onChange={(e) => setTemplate(e.target.value as typeof template)}
            className="h-7 px-2 rounded-md text-[11px] outline-none"
            style={{ background: 'var(--surface-3)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
          >
            {TEMPLATES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button onClick={handleCreate} disabled={creating} className="af-btn af-btn-run">
            <Plus size={11} />
            {creating ? 'Creating…' : 'New graph'}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="mb-5" style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: '18px', color: 'var(--text-primary)' }}>
          Graphs
        </h1>

        {error && <p className="text-[12px] mb-4" style={{ color: 'var(--accent-rose)' }}>{error}</p>}
        {!graphs && !error && <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Loading…</p>}
        {graphs?.length === 0 && (
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No graphs yet — create one to get started.</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {graphs?.map((g) => (
            <Link
              key={g.id}
              href={`/canvas/${g.id}`}
              className="block rounded-xl p-4 transition-colors hover:border-[var(--border-hover)]"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
            >
              <p className="mb-1 truncate" style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>
                {g.name}
              </p>
              {g.description && (
                <p className="text-[11px] mb-3 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{g.description}</p>
              )}
              <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', color: 'var(--text-muted)' }}>
                v{g.version} · {g.nodeCount} nodes · {new Date(g.updatedAt).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
