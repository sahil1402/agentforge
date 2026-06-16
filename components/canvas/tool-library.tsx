'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  X, Plus, Wrench, Trash2, Save, Copy, Shield, AlertCircle, Loader2, FileCode, Brackets,
} from 'lucide-react'
import { CodeEditor } from './code-editor'
import { useTools, invalidateToolsCache, type Tool } from '@/lib/use-tools'

// ─── Defaults for a brand-new tool ────────────────────────────────────────────

const BLANK_TOOL: Omit<Tool, 'id'> = {
  name: 'new_tool',
  description: 'A custom tool that does something useful.',
  category: 'custom',
  paramSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Input parameter' },
    },
    required: ['query'],
  },
  returnSchema: { type: 'string' },
  code: `async def new_tool(query: str) -> str:
    """A custom tool that does something useful."""
    return f"Processed: {query}"
`,
}

// A draft can either be an existing tool (has id) or a new one (no id)
type Draft = Tool | (Omit<Tool, 'id'> & { id?: undefined })

function jsonStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return '{}'
  }
}

function jsonParse(s: string): { ok: true; value: Record<string, unknown> | null } | { ok: false; error: string } {
  const trimmed = s.trim()
  if (!trimmed || trimmed === 'null') return { ok: true, value: null }
  try {
    const value = JSON.parse(trimmed)
    if (typeof value !== 'object') return { ok: false, error: 'Must be a JSON object or null' }
    return { ok: true, value }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' }
  }
}

// ─── Tool list sidebar ────────────────────────────────────────────────────────

function ToolListItem({
  tool, active, dirty, onClick,
}: {
  tool: Tool
  active: boolean
  dirty: boolean
  onClick: () => void
}) {
  const isBuiltin = tool.category === 'builtin'
  return (
    <button
      onClick={onClick}
      className="w-full px-3 py-2 text-left border-b border-[var(--border-subtle)] transition-colors"
      style={{
        background: active ? 'rgba(155, 138, 255, 0.08)' : 'transparent',
        borderLeft: active ? '2px solid #9B8AFF' : '2px solid transparent',
      }}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <Wrench size={10} className={isBuiltin ? 'text-[#5CA4FF]' : 'text-[#FFB547]'} />
        <span className="font-mono text-[11px] font-semibold text-[var(--text-primary)] flex-1 truncate">
          {tool.name}
        </span>
        {dirty && (
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: '#FFB547', boxShadow: '0 0 4px rgba(255,181,71,0.6)' }}
            title="Unsaved changes"
          />
        )}
      </div>
      <p className="text-[9.5px] text-[var(--text-ghost)] line-clamp-1 leading-tight pl-3.5">
        {tool.description}
      </p>
    </button>
  )
}

function CategoryHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="px-3 py-1.5 flex items-center justify-between bg-[var(--surface-0)] border-b border-[var(--border-subtle)]">
      <span className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.14em] text-[var(--text-ghost)]">
        {label}
      </span>
      <span className="font-mono text-[8.5px] text-[var(--text-ghost)]">{count}</span>
    </div>
  )
}

// ─── Empty editor state ───────────────────────────────────────────────────────

function EmptyEditor() {
  return (
    <div className="flex-1 flex items-center justify-center text-center px-8">
      <div>
        <Wrench size={28} className="text-[var(--text-ghost)] mx-auto mb-3" />
        <p className="text-[13px] font-medium text-[var(--text-secondary)] mb-1" style={{ fontFamily: 'Syne, sans-serif' }}>
          No tool selected
        </p>
        <p className="text-[11px] text-[var(--text-ghost)]">
          Select a tool from the sidebar or create a new one
        </p>
      </div>
    </div>
  )
}

// ─── Tool editor (right pane) ─────────────────────────────────────────────────

function ToolEditor({
  draft,
  onChange,
  onSave,
  onDelete,
  onDuplicate,
  onCancel,
  dirty,
  saving,
  error,
}: {
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
  const isBuiltin = draft.category === 'builtin'
  const isNew = !draft.id

  // Local string state for JSON editors so user can type invalid JSON mid-edit
  const [paramSchemaText, setParamSchemaText] = useState(() => jsonStringify(draft.paramSchema))
  const [returnSchemaText, setReturnSchemaText] = useState(() => jsonStringify(draft.returnSchema))
  const [paramErr, setParamErr] = useState<string | null>(null)
  const [returnErr, setReturnErr] = useState<string | null>(null)

  // Re-sync when draft identity changes (different tool selected)
  useEffect(() => {
    setParamSchemaText(jsonStringify(draft.paramSchema))
    setReturnSchemaText(jsonStringify(draft.returnSchema))
    setParamErr(null)
    setReturnErr(null)
  }, [draft.id])

  const handleParamSchemaChange = (txt: string) => {
    setParamSchemaText(txt)
    const parsed = jsonParse(txt)
    if (parsed.ok) {
      setParamErr(null)
      onChange({ paramSchema: parsed.value ?? {} })
    } else {
      setParamErr(parsed.error)
    }
  }

  const handleReturnSchemaChange = (txt: string) => {
    setReturnSchemaText(txt)
    const parsed = jsonParse(txt)
    if (parsed.ok) {
      setReturnErr(null)
      onChange({ returnSchema: parsed.value })
    } else {
      setReturnErr(parsed.error)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Editor header */}
      <div className="px-5 py-3 border-b border-[var(--border-subtle)] flex items-center gap-3 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <input
              value={draft.name}
              onChange={(e) => onChange({ name: e.target.value })}
              disabled={isBuiltin}
              placeholder="tool_name"
              className="bg-transparent text-[14px] font-semibold text-[var(--text-primary)] outline-none border-b border-transparent focus:border-white/15 transition-colors font-mono min-w-0 flex-1 disabled:opacity-60"
            />
            <span
              className="font-mono text-[8.5px] px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0"
              style={{
                background: isBuiltin ? 'rgba(92, 164, 255, 0.1)' : 'rgba(255, 181, 71, 0.1)',
                color: isBuiltin ? '#5CA4FF' : '#FFB547',
                border: `1px solid ${isBuiltin ? 'rgba(92, 164, 255, 0.2)' : 'rgba(255, 181, 71, 0.2)'}`,
              }}
            >
              {isBuiltin ? (
                <span className="flex items-center gap-1">
                  <Shield size={8} />
                  Builtin
                </span>
              ) : 'Custom'}
            </span>
          </div>
          <p className="text-[10px] text-[var(--text-ghost)] font-mono">
            {isNew ? 'NEW · unsaved' : draft.id}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {dirty && !isNew && (
            <button
              onClick={onCancel}
              disabled={saving}
              className="h-8 px-3 rounded-lg text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.04] transition-all disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          {!isBuiltin && (
            <button
              onClick={onSave}
              disabled={!dirty || saving || !!paramErr || !!returnErr}
              className="h-8 px-3 rounded-lg text-[11px] font-medium border flex items-center gap-1.5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: 'rgba(155, 138, 255, 0.12)',
                borderColor: 'rgba(155, 138, 255, 0.3)',
                color: '#C4B8FF',
              }}
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
            </button>
          )}
          {isBuiltin && (
            <button
              onClick={onDuplicate}
              className="h-8 px-3 rounded-lg text-[11px] font-medium border flex items-center gap-1.5 transition-all hover:bg-white/[0.04]"
              style={{
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <Copy size={11} />
              Duplicate
            </button>
          )}
          {!isBuiltin && !isNew && (
            <button
              onClick={onDelete}
              disabled={saving}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-ghost)] hover:text-[#FF6B81] hover:bg-[#FF6B81]/8 transition-all disabled:opacity-50"
              title="Delete tool"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-5 py-2 bg-[#FF6B81]/8 border-b border-[#FF6B81]/20 flex items-center gap-2">
          <AlertCircle size={12} className="text-[#FF6B81] flex-shrink-0" />
          <span className="text-[11px] text-[#FF6B81]">{error}</span>
        </div>
      )}

      {/* Editor body */}
      <div
        className="overflow-y-auto"
        style={{ maxHeight: 'calc(88vh - 130px)' }}
      >
        {/* Description */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
          <p className="font-mono text-[9px] font-semibold tracking-[0.12em] uppercase text-[var(--text-ghost)] mb-2">
            Description
          </p>
          <textarea
            value={draft.description}
            onChange={(e) => onChange({ description: e.target.value })}
            readOnly={isBuiltin}
            rows={2}
            placeholder="What does this tool do?"
            className="w-full px-3 py-2 rounded-lg text-[11.5px] bg-[var(--surface-0)] border border-[var(--border-subtle)] text-[var(--text-secondary)] placeholder:text-[var(--text-ghost)] outline-none resize-none leading-relaxed focus:border-[#9B8AFF]/40 focus:ring-1 focus:ring-[#9B8AFF]/10 transition-all read-only:opacity-70 read-only:cursor-default"
          />
        </div>

        {/* Parameter Schema */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center justify-between mb-2">
            <p className="font-mono text-[9px] font-semibold tracking-[0.12em] uppercase text-[var(--text-ghost)] flex items-center gap-1.5">
              <Brackets size={10} />
              Parameter Schema (JSON Schema)
            </p>
            {paramErr && (
              <span className="text-[9.5px] text-[#FF6B81] font-mono">
                {paramErr}
              </span>
            )}
          </div>
          <CodeEditor
            value={paramSchemaText}
            onChange={handleParamSchemaChange}
            language="json"
            minHeight="140px"
            maxHeight="240px"
            readOnly={isBuiltin}
          />
        </div>

        {/* Return Schema */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center justify-between mb-2">
            <p className="font-mono text-[9px] font-semibold tracking-[0.12em] uppercase text-[var(--text-ghost)] flex items-center gap-1.5">
              <Brackets size={10} />
              Return Schema (optional)
            </p>
            {returnErr && (
              <span className="text-[9.5px] text-[#FF6B81] font-mono">
                {returnErr}
              </span>
            )}
          </div>
          <CodeEditor
            value={returnSchemaText}
            onChange={handleReturnSchemaChange}
            language="json"
            minHeight="100px"
            maxHeight="200px"
            readOnly={isBuiltin}
          />
        </div>

        {/* Code */}
        <div className="px-5 py-4">
          <p className="font-mono text-[9px] font-semibold tracking-[0.12em] uppercase text-[var(--text-ghost)] mb-2 flex items-center gap-1.5">
            <FileCode size={10} />
            Python Implementation
          </p>
          <CodeEditor
            value={draft.code}
            onChange={(v) => onChange({ code: v })}
            language="python"
            minHeight="220px"
            maxHeight="500px"
            readOnly={isBuiltin}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function ToolLibrary({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { tools, loading, refetch } = useTools()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // When tools load and nothing selected, pick the first one
  useEffect(() => {
    if (!open) return
    if (tools.length > 0 && !selectedId && !draft) {
      setSelectedId(tools[0].id)
      setDraft(tools[0])
    }
  }, [tools, open, selectedId, draft])

  // Group tools by category
  const { builtin, custom } = useMemo(() => {
    const b = tools.filter((t) => t.category === 'builtin')
    const c = tools.filter((t) => t.category !== 'builtin')
    return { builtin: b, custom: c }
  }, [tools])

  // Detect dirty: compare draft to original server version
  const original = useMemo(() => {
    if (!draft?.id) return null
    return tools.find((t) => t.id === draft.id) ?? null
  }, [draft, tools])

  const dirty = useMemo(() => {
    if (!draft) return false
    if (!draft.id) return true // new tool is always dirty
    if (!original) return false
    return (
      draft.name !== original.name ||
      draft.description !== original.description ||
      draft.code !== original.code ||
      JSON.stringify(draft.paramSchema) !== JSON.stringify(original.paramSchema) ||
      JSON.stringify(draft.returnSchema) !== JSON.stringify(original.returnSchema)
    )
  }, [draft, original])

  const selectTool = useCallback(
    (id: string) => {
      if (dirty && !confirm('Discard unsaved changes?')) return
      const tool = tools.find((t) => t.id === id)
      if (!tool) return
      setSelectedId(id)
      setDraft(tool)
      setError(null)
    },
    [tools, dirty]
  )

  const handleNewTool = () => {
    if (dirty && !confirm('Discard unsaved changes?')) return
    setSelectedId(null)
    setDraft({ ...BLANK_TOOL })
    setError(null)
  }

  const handleDuplicate = () => {
    if (!draft) return
    setSelectedId(null)
    setDraft({
      name: `${draft.name}_copy`,
      description: draft.description,
      category: 'custom',
      paramSchema: JSON.parse(JSON.stringify(draft.paramSchema)),
      returnSchema: draft.returnSchema
        ? JSON.parse(JSON.stringify(draft.returnSchema))
        : null,
      code: draft.code,
    })
    setError(null)
  }

  const handleCancel = () => {
    if (!original) return
    setDraft(original)
    setError(null)
  }

  const updateDraft = (patch: Partial<Draft>) => {
    setDraft((d) => (d ? ({ ...d, ...patch } as Draft) : d))
  }

  const handleSave = async () => {
    if (!draft) return
    setSaving(true)
    setError(null)
    try {
      const body = {
        name: draft.name,
        description: draft.description,
        paramSchema: draft.paramSchema,
        returnSchema: draft.returnSchema,
        code: draft.code,
        category: draft.category,
      }
      const url = draft.id ? `/api/tools/${draft.id}` : '/api/tools'
      const method = draft.id ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Save failed (${res.status})`)
      }
      const saved: Tool = await res.json()
      invalidateToolsCache()
      await refetch()
      setSelectedId(saved.id)
      setDraft(saved)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!draft?.id) return
    if (!confirm(`Delete tool "${draft.name}"?\nAgents using this tool will lose access.`)) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/tools/${draft.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Delete failed (${res.status})`)
      }
      invalidateToolsCache()
      await refetch()
      setSelectedId(null)
      setDraft(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setSaving(false)
    }
  }

  // Close handling — warn on unsaved changes
  const handleOpenChange = (next: boolean) => {
    if (!next && dirty && !confirm('Discard unsaved changes and close?')) return
    onOpenChange(next)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-[1200px] h-[88vh] flex flex-col overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '14px',
            boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          <Dialog.Title className="sr-only">Tool Library</Dialog.Title>
          <Dialog.Description className="sr-only">
            Browse, create, edit, and delete tools available to agents.
          </Dialog.Description>

          {/* Header */}
          <div className="px-5 py-3 border-b border-[var(--border-subtle)] flex items-center gap-3 flex-shrink-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(92,164,255,0.18), rgba(155,138,255,0.18))' }}
            >
              <Wrench size={14} className="text-[#5CA4FF]" />
            </div>
            <div className="flex-1 min-w-0">
              <h2
                className="text-[15px] font-semibold text-[var(--text-primary)] leading-none"
                style={{ fontFamily: 'Syne, sans-serif' }}
              >
                Tool Library
              </h2>
              <p className="text-[10px] text-[var(--text-ghost)] mt-1 font-mono">
                {loading ? 'Loading…' : `${tools.length} tool${tools.length === 1 ? '' : 's'} registered`}
              </p>
            </div>
            <Dialog.Close asChild>
              <button
                className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-ghost)] hover:text-[var(--text-primary)] hover:bg-white/[0.04] transition-all"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </Dialog.Close>
          </div>

          {/* Body — two columns */}
          <div className="flex flex-1 min-h-0">
            {/* Sidebar */}
            <aside className="w-[260px] flex-shrink-0 border-r border-[var(--border-subtle)] flex flex-col bg-black/15">
              <div className="p-3 border-b border-[var(--border-subtle)]">
                <button
                  onClick={handleNewTool}
                  className="w-full h-8 px-3 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1.5 transition-all"
                  style={{
                    background: 'rgba(155, 138, 255, 0.12)',
                    border: '1px solid rgba(155, 138, 255, 0.25)',
                    color: '#C4B8FF',
                  }}
                >
                  <Plus size={11} />
                  New Tool
                </button>
              </div>
              <div
                className="overflow-y-auto"
                style={{ maxHeight: 'calc(88vh - 110px)' }}
              >
                {loading && tools.length === 0 && (
                  <div className="p-6 text-center">
                    <Loader2 size={16} className="animate-spin text-[var(--text-ghost)] mx-auto mb-2" />
                    <p className="text-[10px] text-[var(--text-ghost)]">Loading tools…</p>
                  </div>
                )}
                {custom.length > 0 && (
                  <>
                    <CategoryHeading label="Custom" count={custom.length} />
                    {custom.map((t) => (
                      <ToolListItem
                        key={t.id}
                        tool={t}
                        active={selectedId === t.id}
                        dirty={selectedId === t.id && dirty}
                        onClick={() => selectTool(t.id)}
                      />
                    ))}
                  </>
                )}
                {builtin.length > 0 && (
                  <>
                    <CategoryHeading label="Builtin" count={builtin.length} />
                    {builtin.map((t) => (
                      <ToolListItem
                        key={t.id}
                        tool={t}
                        active={selectedId === t.id}
                        dirty={false}
                        onClick={() => selectTool(t.id)}
                      />
                    ))}
                  </>
                )}
              </div>
            </aside>

            {/* Editor pane */}
            <main className="flex-1 min-w-0 min-h-0 flex flex-col">
              {draft ? (
                <ToolEditor
                  draft={draft}
                  onChange={updateDraft}
                  onSave={handleSave}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onCancel={handleCancel}
                  dirty={dirty}
                  saving={saving}
                  error={error}
                />
              ) : (
                <EmptyEditor />
              )}
            </main>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}