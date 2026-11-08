'use client'

import { useState, useMemo } from 'react'
import { Plus, Wrench, Trash2, Save, Copy, Search } from 'lucide-react'
import { CodeEditor } from './code-editor'
import { useTools, invalidateToolsCache, type Tool } from '@/lib/use-tools'
import { AfDialog } from '@/components/shell/dialog'
import { toast } from '@/components/shell/toast'
import { cn } from '@/lib/utils'

const BLANK_TOOL: Omit<Tool, 'id'> = {
  name: 'new_tool',
  description: 'A custom tool that does something useful.',
  category: 'custom',
  paramSchema: { type: 'object', properties: { query: { type: 'string', description: 'Input parameter' } }, required: ['query'] },
  returnSchema: { type: 'string' },
  code: `async def new_tool(query: str) -> str:
    """A custom tool that does something useful."""
    return f"Processed: {query}"
`,
}

// A draft is an existing tool (has id) or a new one (no id).
type Draft = Tool | (Omit<Tool, 'id'> & { id?: undefined })

const toJson = (v: unknown) => { try { return JSON.stringify(v, null, 2) } catch { return '{}' } }

function parseJson(s: string): { ok: true; value: Record<string, unknown> | null } | { ok: false; error: string } {
  const t = s.trim()
  if (!t || t === 'null') return { ok: true, value: null }
  try {
    const value = JSON.parse(t)
    return typeof value === 'object' ? { ok: true, value } : { ok: false, error: 'Must be a JSON object or null' }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' }
  }
}

function ToolEditor({ draft, onChange, onSave, onDelete, onDuplicate, onCancel, dirty, saving, error }: {
  draft: Draft
  onChange: (patch: Partial<Draft>) => void
  onSave: () => void
  onDelete: () => void
  onDuplicate: () => void
  onCancel: () => void
  dirty: boolean
  saving: boolean
  error: string | null
}) {
  const builtin = draft.category === 'builtin'
  const isNew = !draft.id
  // Local text so the user can type invalid JSON mid-edit.
  const [params, setParams] = useState(() => toJson(draft.paramSchema))
  const [ret, setRet] = useState(() => toJson(draft.returnSchema))
  const [paramErr, setParamErr] = useState<string | null>(null)
  const [retErr, setRetErr] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const onParams = (txt: string) => {
    setParams(txt)
    const p = parseJson(txt)
    if (p.ok) { setParamErr(null); onChange({ paramSchema: p.value ?? {} }) } else setParamErr(p.error)
  }
  const onRet = (txt: string) => {
    setRet(txt)
    const p = parseJson(txt)
    if (p.ok) { setRetErr(null); onChange({ returnSchema: p.value }) } else setRetErr(p.error)
  }

  return (
    <div className="af-tedit">
      <div className="af-tgrid">
        <div className="af-field" style={{ margin: 0 }}>
          <label htmlFor="tl-name">Name</label>
          <input id="tl-name" className="af-in af-mono" value={draft.name} disabled={builtin} placeholder="tool_name" onChange={(e) => onChange({ name: e.target.value })} />
        </div>
        <div className="af-field" style={{ margin: 0 }}>
          <label>Kind</label>
          <div className="af-hint" style={{ height: 32, display: 'flex', alignItems: 'center' }}>
            {builtin ? 'Builtin: read-only. Duplicate it to customize.' : isNew ? 'Custom · not saved yet' : `Custom · ${draft.id}`}
          </div>
        </div>
      </div>
      <div className="af-field" style={{ margin: 0 }}>
        <label htmlFor="tl-desc">Description <span className="af-note">shown to the model</span></label>
        <textarea id="tl-desc" className="af-in" rows={2} style={{ minHeight: 56 }} value={draft.description} readOnly={builtin} placeholder="What does this tool do?" onChange={(e) => onChange({ description: e.target.value })} />
      </div>
      <div className="af-tgrid">
        <div className="af-field" style={{ margin: 0 }}>
          <label>Parameters · JSON Schema {paramErr && <span style={{ color: 'var(--fail)' }}>· {paramErr}</span>}</label>
          <CodeEditor value={params} onChange={onParams} language="json" minHeight="140px" maxHeight="240px" readOnly={builtin} />
        </div>
        <div className="af-field" style={{ margin: 0 }}>
          <label>Return schema · optional {retErr && <span style={{ color: 'var(--fail)' }}>· {retErr}</span>}</label>
          <CodeEditor value={ret} onChange={onRet} language="json" minHeight="140px" maxHeight="240px" readOnly={builtin} />
        </div>
      </div>
      <div className="af-field" style={{ margin: 0 }}>
        <label>Python <span className="af-note">must define {draft.name}()</span></label>
        <CodeEditor value={draft.code} onChange={(v) => onChange({ code: v })} language="python" lineNumbers minHeight="220px" maxHeight="460px" readOnly={builtin} />
      </div>
      {error && <p className="af-hint" style={{ color: 'var(--fail)', margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {builtin ? (
          <button className="af-btn" onClick={onDuplicate}><Copy size={13} />Duplicate</button>
        ) : (
          <button className="af-btn primary" onClick={onSave} disabled={!dirty || saving || !!paramErr || !!retErr}>
            <Save size={13} />{saving ? 'Saving…' : isNew ? 'Create tool' : 'Save tool'}
          </button>
        )}
        {dirty && !isNew && <button className="af-btn ghost" onClick={onCancel} disabled={saving}>Discard changes</button>}
        <span className="af-sp" />
        {!builtin && !isNew && (confirmDelete ? (
          <>
            <span className="af-hint">Agents using {draft.name} lose access.</span>
            <button className="af-btn sm danger" onClick={onDelete} disabled={saving}>Delete</button>
            <button className="af-btn sm ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
          </>
        ) : (
          <button className="af-btn ghost" onClick={() => setConfirmDelete(true)}><Trash2 size={13} />Delete</button>
        ))}
      </div>
    </div>
  )
}

export function ToolLibrary({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { tools, loading, refetch } = useTools()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [resetCount, setResetCount] = useState(0) // bumped to remount the editor (drops local JSON text)
  const [pending, setPending] = useState<null | (() => void)>(null) // an action waiting on "discard changes?"

  if (open && tools.length > 0 && !selectedId && !draft) {
    setSelectedId(tools[0].id)
    setDraft(tools[0])
  }

  const original = useMemo(() => (draft?.id ? tools.find((t) => t.id === draft.id) ?? null : null), [draft, tools])
  const dirty = useMemo(() => {
    if (!draft) return false
    if (!draft.id) return true
    if (!original) return false
    return draft.name !== original.name || draft.description !== original.description || draft.code !== original.code
      || JSON.stringify(draft.paramSchema) !== JSON.stringify(original.paramSchema)
      || JSON.stringify(draft.returnSchema) !== JSON.stringify(original.returnSchema)
  }, [draft, original])

  const guard = (action: () => void) => (dirty ? setPending(() => action) : action())

  const q = query.trim().toLowerCase()
  const match = (t: Tool) => !q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
  const groups = [
    { label: 'Custom', items: tools.filter((t) => t.category !== 'builtin' && match(t)) },
    { label: 'Builtin', items: tools.filter((t) => t.category === 'builtin' && match(t)) },
  ]

  const select = (tool: Tool) => guard(() => { setSelectedId(tool.id); setDraft(tool); setError(null) })
  const newTool = () => guard(() => { setSelectedId(null); setDraft({ ...BLANK_TOOL }); setError(null) })
  const duplicate = () => {
    if (!draft) return
    setSelectedId(null)
    setDraft({
      name: `${draft.name}_copy`, description: draft.description, category: 'custom',
      paramSchema: structuredClone(draft.paramSchema), returnSchema: draft.returnSchema ? structuredClone(draft.returnSchema) : null, code: draft.code,
    })
    setError(null)
  }
  const cancel = () => { if (original) { setDraft(original); setResetCount((n) => n + 1); setError(null) } }

  const save = async () => {
    if (!draft) return
    setSaving(true)
    setError(null)
    try {
      const body = { name: draft.name, description: draft.description, paramSchema: draft.paramSchema, returnSchema: draft.returnSchema, code: draft.code, category: draft.category }
      const res = await fetch(draft.id ? `/api/tools/${draft.id}` : '/api/tools', {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Save failed (HTTP ${res.status})`)
      const saved: Tool = await res.json()
      invalidateToolsCache()
      await refetch()
      setSelectedId(saved.id)
      setDraft(saved)
      toast('Tool saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!draft?.id) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/tools/${draft.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Delete failed (HTTP ${res.status})`)
      invalidateToolsCache()
      await refetch()
      setSelectedId(null)
      setDraft(null)
      toast('Tool deleted')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AfDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : guard(() => onOpenChange(false)))}
      title={loading ? 'Tool library' : `Tool library · ${tools.length} tool${tools.length === 1 ? '' : 's'}`}
      description="Browse, create, edit and delete the tools agents can call."
      className="wide"
      width={1100}
      footer={pending ? (
        <>
          <span className="af-hint">You have unsaved changes to {draft?.name}.</span>
          <span className="af-sp" />
          <button className="af-btn ghost" onClick={() => setPending(null)}>Keep editing</button>
          <button className="af-btn danger" onClick={() => { const action = pending; setPending(null); setResetCount((n) => n + 1); action() }}>Discard changes</button>
        </>
      ) : undefined}
    >
      <div className="af-tools">
        <div className="af-tlist">
          <label className="af-search">
            <Search size={14} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tools" aria-label="Search tools" />
          </label>
          {loading && tools.length === 0 && <div className="af-empty">Loading tools…</div>}
          {groups.map((g) => g.items.length > 0 && (
            <div key={g.label}>
              <div className="af-tcat">{g.label} · {g.items.length}</div>
              {g.items.map((t) => (
                <button key={t.id} className={cn('af-titem', selectedId === t.id && 'on')} onClick={() => select(t)} title={t.description}>
                  <Wrench size={12} />
                  <span className="af-mono">{t.name}</span>
                  {selectedId === t.id && dirty && <i className="af-dirty" title="Unsaved changes" />}
                </button>
              ))}
            </div>
          ))}
          <div style={{ padding: 8, marginTop: 'auto' }}>
            <button className="af-btn sm" style={{ width: '100%', justifyContent: 'center' }} onClick={newTool}><Plus size={12} />New tool</button>
          </div>
        </div>
        {draft ? (
          <ToolEditor
            key={`${draft.id ?? 'new'}:${resetCount}`}
            draft={draft}
            onChange={(patch) => setDraft((d) => (d ? ({ ...d, ...patch } as Draft) : d))}
            onSave={save}
            onDelete={remove}
            onDuplicate={duplicate}
            onCancel={cancel}
            dirty={dirty}
            saving={saving}
            error={error}
          />
        ) : (
          <div className="af-empty" style={{ alignSelf: 'center' }}><b>No tool selected</b>Pick a tool on the left, or create a new one.</div>
        )}
      </div>
    </AfDialog>
  )
}
