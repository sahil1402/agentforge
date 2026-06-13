'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Trash2, Copy, Cpu, Database, Sparkles,
  Plus, DollarSign, Wrench, Check,
} from 'lucide-react'
import { useGraphStore, selectSelectedNode } from '@/store/graph-store'
import { NODE_COLORS, NODE_LABELS, AVAILABLE_MODELS, type NodeType } from '@/lib/types'
import type { AgentNodeData, ToolNodeData, MemoryNodeData, RouterNodeData, HumanGateNodeData } from '@/lib/types'
import { cn } from '@/lib/utils'
import { CodeEditor, approxTokenCount } from './code-editor'

// ─── Tool Registry fetcher (module-level cache for instant panel reopens) ─────

type RegisteredTool = {
  id: string
  name: string
  description: string
  category: string
}

let toolsCache: RegisteredTool[] | null = null
let toolsFetchPromise: Promise<RegisteredTool[]> | null = null

function fetchTools(): Promise<RegisteredTool[]> {
  if (!toolsFetchPromise) {
    toolsFetchPromise = fetch('/api/tools').then((r) => r.json())
  }
  return toolsFetchPromise
}

function useTools() {
  const [tools, setTools] = useState<RegisteredTool[]>(toolsCache ?? [])
  const [loading, setLoading] = useState(!toolsCache)

  useEffect(() => {
    let cancelled = false
    fetchTools().then((t) => {
      if (cancelled) return
      toolsCache = t
      setTools(t)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  return { tools, loading }
}

// ─── Model pricing (USD per 1M tokens — approximate; update as needed) ────────

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o':            { input: 2.5,  output: 10  },
  'gpt-4o-mini':       { input: 0.15, output: 0.6 },
  'claude-3-5-sonnet': { input: 3,    output: 15  },
  'claude-3-opus':     { input: 15,   output: 75  },
  'claude-3-haiku':    { input: 0.25, output: 1.25},
  'mistral-7b':        { input: 0.25, output: 0.25},
  'mistral-large':     { input: 2,    output: 6   },
  'llama-3-70b':       { input: 0.6,  output: 0.6 },
}

// ─── Reusable form components with premium styling ───────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block font-mono text-[9px] font-semibold tracking-[0.12em] uppercase text-[var(--text-ghost)] mb-1.5">
      {children}
    </label>
  )
}

function TextInput({
  value, onChange, placeholder, className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        'w-full h-9 px-3 rounded-lg text-[12px] font-medium',
        'bg-[var(--surface-0)] border border-[var(--border-subtle)] text-[var(--text-primary)]',
        'placeholder:text-[var(--text-ghost)] outline-none',
        'focus:border-[#9B8AFF]/40 focus:ring-1 focus:ring-[#9B8AFF]/10 transition-all',
        className
      )}
    />
  )
}

function TextArea({
  value, onChange, rows = 4, placeholder,
}: {
  value: string
  onChange: (v: string) => void
  rows?: number
  placeholder?: string
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className={cn(
        'w-full px-3 py-2.5 rounded-lg text-[11.5px] font-mono',
        'bg-[var(--surface-0)] border border-[var(--border-subtle)] text-[var(--text-secondary)]',
        'placeholder:text-[var(--text-ghost)] outline-none resize-none leading-relaxed',
        'focus:border-[#9B8AFF]/40 focus:ring-1 focus:ring-[#9B8AFF]/10 transition-all',
      )}
    />
  )
}

function Select({
  value, onChange, options,
}: {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string; group?: string }>
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full h-9 px-3 rounded-lg text-[12px]',
        'bg-[var(--surface-0)] border border-[var(--border-subtle)] text-[var(--text-primary)]',
        'outline-none cursor-pointer appearance-none',
        'focus:border-[#9B8AFF]/40 focus:ring-1 focus:ring-[#9B8AFF]/10 transition-all',
        'bg-no-repeat bg-[right_0.75rem_center] bg-[length:10px]',
      )}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%234A5068' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function SliderField({
  label, value, onChange, min, max, step = 0.01, display, color = '#9B8AFF',
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  display?: string
  color?: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <FieldLabel>{label}</FieldLabel>
        <span className="font-mono text-[10px] font-semibold" style={{ color }}>
          {display ?? value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${color} ${pct}%, var(--surface-3) ${pct}%)`,
        }}
      />
    </div>
  )
}

function ToggleField({
  label, hint, checked, onChange, color = '#9B8AFF',
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
  color?: string
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[var(--surface-0)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)] transition-all text-left"
    >
      <div
        className="w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 transition-all"
        style={{
          background: checked ? color : 'transparent',
          border: `1px solid ${checked ? color : 'var(--border-default)'}`,
          boxShadow: checked ? `0 0 8px ${color}40` : 'none',
        }}
      >
        {checked && <Check size={10} className="text-white" strokeWidth={3} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] font-medium text-[var(--text-primary)] leading-tight">{label}</p>
        {hint && <p className="text-[9.5px] text-[var(--text-ghost)] mt-0.5 leading-tight">{hint}</p>}
      </div>
    </button>
  )
}

function PanelSection({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3.5 border-b border-[var(--border-subtle)]">
      <div className="flex items-center gap-1.5 mb-3">
        {icon && <span className="text-[var(--text-ghost)]">{icon}</span>}
        <p className="font-mono text-[9px] font-semibold tracking-[0.12em] uppercase text-[var(--text-ghost)]">
          {title}
        </p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

// ─── Tool multi-select picker ─────────────────────────────────────────────────

function ToolMultiSelect({
  selected,
  onChange,
}: {
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const { tools, loading } = useTools()
  const [open, setOpen] = useState(false)

  const toggle = (name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter((t) => t !== name))
    } else {
      onChange([...selected, name])
    }
  }

  const assigned = tools.filter((t) => selected.includes(t.name))
  const available = tools.filter((t) => !selected.includes(t.name))

  // Tools selected but not in registry (e.g. deleted) — render as ghost chips
  const orphaned = selected.filter((name) => !tools.some((t) => t.name === name))

  return (
    <div className="space-y-2">
      {/* Assigned chips */}
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {assigned.length === 0 && orphaned.length === 0 ? (
          <span className="text-[11px] text-[var(--text-ghost)] italic">No tools assigned</span>
        ) : (
          <>
            {assigned.map((t) => (
              <span
                key={t.id}
                title={t.description}
                className="font-mono text-[9px] px-2 py-[3px] rounded-md bg-[var(--surface-3)] text-[var(--text-secondary)] border border-[var(--border-subtle)] flex items-center gap-1.5"
              >
                <Wrench size={9} className="text-[#5CA4FF]" />
                {t.name}
                <button
                  onClick={() => toggle(t.name)}
                  className="text-[var(--text-ghost)] hover:text-[#FF6B81] transition-colors leading-none"
                >
                  ×
                </button>
              </span>
            ))}
            {orphaned.map((name) => (
              <span
                key={name}
                title="Not in tool registry"
                className="font-mono text-[9px] px-2 py-[3px] rounded-md bg-[#FF6B81]/8 text-[#FF6B81]/80 border border-[#FF6B81]/20 flex items-center gap-1.5"
              >
                {name}
                <button
                  onClick={() => toggle(name)}
                  className="hover:text-[#FF6B81] transition-colors leading-none"
                >
                  ×
                </button>
              </span>
            ))}
          </>
        )}
      </div>

      {/* Add tool button + dropdown */}
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          disabled={loading}
          className="w-full h-8 px-2.5 rounded-lg text-[11px] font-medium text-[#9B8AFF] hover:text-[#C4B8FF] border border-dashed border-[var(--border-subtle)] hover:border-[#9B8AFF]/30 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Plus size={11} />
          {loading ? 'Loading tools…' : 'Add tool'}
        </button>

        {open && (
          <>
            {/* Click-outside catcher */}
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-lg shadow-2xl max-h-[260px] overflow-y-auto">
              {available.length === 0 ? (
                <div className="px-3 py-2.5 text-[11px] text-[var(--text-ghost)] italic">
                  All tools assigned
                </div>
              ) : (
                available.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { toggle(t.name); setOpen(false) }}
                    className="w-full px-3 py-2 text-left hover:bg-white/[0.04] border-b border-[var(--border-subtle)] last:border-0 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="font-mono text-[11px] font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                        <Wrench size={10} className="text-[#5CA4FF]" />
                        {t.name}
                      </span>
                      <span className="font-mono text-[8px] text-[var(--text-ghost)] uppercase tracking-wider">
                        {t.category}
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--text-ghost)] line-clamp-2 leading-snug">
                      {t.description}
                    </p>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Node-type configs ───────────────────────────────────────────────────────

function AgentConfig({ id, data }: { id: string; data: AgentNodeData }) {
  const { updateNodeData } = useGraphStore()
  const upd = useCallback(
    (partial: Partial<AgentNodeData>) => updateNodeData(id, partial),
    [id, updateNodeData]
  )

  const modelOptions = AVAILABLE_MODELS.map((m) => ({
    value: m.value,
    label: `${m.label} · ${m.provider}`,
  }))

  const pricing = MODEL_PRICING[data.model]

  return (
    <>
      <PanelSection title="Model" icon={<Cpu size={10} />}>
        <div>
          <FieldLabel>Model</FieldLabel>
          <Select value={data.model} onChange={(v) => upd({ model: v })} options={modelOptions} />
        </div>
        <SliderField
          label="Temperature"
          value={data.temperature}
          onChange={(v) => upd({ temperature: v })}
          min={0} max={2} step={0.01}
          color="#9B8AFF"
        />
        <SliderField
          label="Max Tokens"
          value={data.maxTokens}
          onChange={(v) => upd({ maxTokens: v })}
          min={64} max={8192} step={64}
          display={data.maxTokens.toString()}
          color="#5CA4FF"
        />

        {/* Cost estimate badge */}
        {pricing && (
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-[var(--surface-0)] border border-[var(--border-subtle)]">
            <DollarSign size={11} className="text-[#00E5C3] flex-shrink-0" />
            <span className="font-mono text-[10px] text-[var(--text-secondary)]">
              ${pricing.input.toFixed(2)} in
              <span className="text-[var(--text-ghost)] mx-1">·</span>
              ${pricing.output.toFixed(2)} out
            </span>
            <span className="font-mono text-[9px] text-[var(--text-ghost)] tracking-wider ml-auto">
              / 1M TOK
            </span>
          </div>
        )}
      </PanelSection>

      <PanelSection title="System Prompt" icon={<Sparkles size={10} />}>
        <CodeEditor
          value={data.systemPrompt}
          onChange={(v) => upd({ systemPrompt: v })}
          placeholder="You are a helpful assistant..."
          minHeight="100px"
          maxHeight="280px"
          language="markdown"
        />
        <div className="flex items-center justify-between gap-2 text-[9px] font-mono text-[var(--text-ghost)] mt-1.5 px-0.5">
          <span title="Markdown supported · headings, **bold**, *italic*, `code`, [links](url)">
            MD
          </span>
          <span title="Approximate — actual count varies by tokenizer">
            ~{approxTokenCount(data.systemPrompt).toLocaleString()} tokens
          </span>
        </div>
      </PanelSection>

      <PanelSection title="Tools" icon={<Wrench size={10} />}>
        <ToolMultiSelect
          selected={data.tools}
          onChange={(next) => upd({ tools: next })}
        />
      </PanelSection>
    </>
  )
}

function ToolConfig({ id, data }: { id: string; data: ToolNodeData }) {
  const { updateNodeData } = useGraphStore()
  const upd = useCallback(
    (partial: Partial<ToolNodeData>) => updateNodeData(id, partial),
    [id, updateNodeData]
  )
  return (
    <>
      <PanelSection title="Function">
        <div>
          <FieldLabel>Function Name</FieldLabel>
          <TextInput value={data.functionName} onChange={(v) => upd({ functionName: v })} placeholder="my_tool_function" />
        </div>
        <div>
          <FieldLabel>Description</FieldLabel>
          <TextArea value={data.description} onChange={(v) => upd({ description: v })} rows={3} placeholder="What does this tool do..." />
        </div>
      </PanelSection>
      <PanelSection title="Return Type">
        <Select
          value={data.returnType}
          onChange={(v) => upd({ returnType: v })}
          options={[
            { value: 'string', label: 'string' },
            { value: 'dict', label: 'dict' },
            { value: 'list', label: 'list' },
            { value: 'Any', label: 'Any' },
          ]}
        />
      </PanelSection>
    </>
  )
}

function MemoryConfig({ id, data }: { id: string; data: MemoryNodeData }) {
  const { updateNodeData } = useGraphStore()
  const upd = useCallback(
    (partial: Partial<MemoryNodeData>) => updateNodeData(id, partial),
    [id, updateNodeData]
  )
  return (
    <>
      <PanelSection title="Backend" icon={<Database size={10} />}>
        <div>
          <FieldLabel>Backend</FieldLabel>
          <Select
            value={data.backend}
            onChange={(v) => upd({ backend: v as MemoryNodeData['backend'] })}
            options={[
              { value: 'qdrant',          label: 'Qdrant' },
              { value: 'postgres_vector', label: 'PostgreSQL pgvector' },
              { value: 'in_memory',       label: 'In-memory (dev)' },
            ]}
          />
        </div>
        <div>
          <FieldLabel>Collection Name</FieldLabel>
          <TextInput value={data.collectionName} onChange={(v) => upd({ collectionName: v })} placeholder="my_collection" />
        </div>
        <div>
          <FieldLabel>Embedding Model</FieldLabel>
          <Select
            value={data.embeddingModel}
            onChange={(v) => upd({ embeddingModel: v })}
            options={[
              { value: 'text-embedding-3-small', label: 'OpenAI · text-embedding-3-small' },
              { value: 'text-embedding-3-large', label: 'OpenAI · text-embedding-3-large' },
              { value: 'text-embedding-ada-002', label: 'OpenAI · ada-002 (legacy)' },
              { value: 'voyage-3',               label: 'Voyage · v3' },
              { value: 'mistral-embed',          label: 'Mistral · mistral-embed' },
              { value: 'bge-large-en-v1.5',      label: 'BAAI · bge-large-en-v1.5' },
            ]}
          />
        </div>
      </PanelSection>
      <PanelSection title="Retrieval">
        <SliderField
          label="Top-K results"
          value={data.topK}
          onChange={(v) => upd({ topK: v })}
          min={1} max={20} step={1}
          display={data.topK.toString()}
          color="#00E5C3"
        />
      </PanelSection>
    </>
  )
}

function RouterConfig({ id, data }: { id: string; data: RouterNodeData }) {
  const { updateNodeData } = useGraphStore()
  const upd = useCallback(
    (partial: Partial<RouterNodeData>) => updateNodeData(id, partial),
    [id, updateNodeData]
  )

  const updateRoute = (i: number, change: Partial<{ label: string; target: string }>) => {
    const routes = [...data.routes]
    routes[i] = { ...routes[i], ...change }
    upd({ routes })
  }

  return (
    <PanelSection title="Routing Condition">
      <div>
        <FieldLabel>Condition Expression</FieldLabel>
        <TextArea
          value={data.condition}
          onChange={(v) => upd({ condition: v })}
          rows={3}
          placeholder="state['next']"
        />
      </div>
      <div>
        <FieldLabel>Routes</FieldLabel>
        <div className="space-y-2">
          {data.routes.map((r, i) => (
            <div
              key={i}
              className="p-2 rounded-lg bg-[var(--surface-0)] border border-[var(--border-subtle)] space-y-1.5"
            >
              <div className="flex gap-1.5 items-center">
                <TextInput
                  value={r.label}
                  onChange={(v) => updateRoute(i, { label: v })}
                  placeholder="route_label"
                  className="flex-1 h-7 text-[11px]"
                />
                <button
                  onClick={() => upd({ routes: data.routes.filter((_, j) => j !== i) })}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-ghost)] hover:text-[#FF6B81] hover:bg-[#FF6B81]/8 transition-all border border-transparent hover:border-[#FF6B81]/15 flex-shrink-0"
                  title="Remove route"
                >
                  <Trash2 size={11} />
                </button>
              </div>
              <TextInput
                value={r.target}
                onChange={(v) => updateRoute(i, { target: v })}
                placeholder="target node id"
                className="h-7 text-[11px] font-mono"
              />
            </div>
          ))}
        </div>
        <button
          onClick={() => upd({ routes: [...data.routes, { label: 'new_route', target: '' }] })}
          className="text-[11px] text-[#FFB547] hover:text-[#FFD08A] transition-colors font-mono mt-2 font-medium flex items-center gap-1"
        >
          <Plus size={11} />
          Add route
        </button>
      </div>
    </PanelSection>
  )
}

function HumanGateConfig({ id, data }: { id: string; data: HumanGateNodeData }) {
  const { updateNodeData } = useGraphStore()
  const upd = useCallback(
    (partial: Partial<HumanGateNodeData>) => updateNodeData(id, partial),
    [id, updateNodeData]
  )
  return (
    <>
      <PanelSection title="Approval Prompt">
        <TextArea
          value={data.prompt}
          onChange={(v) => upd({ prompt: v })}
          rows={4}
          placeholder="Please review the output and approve or reject."
        />
      </PanelSection>
      <PanelSection title="Settings">
        <SliderField
          label="Timeout (seconds)"
          value={data.timeoutSeconds}
          onChange={(v) => upd({ timeoutSeconds: v })}
          min={30} max={3600} step={30}
          display={`${data.timeoutSeconds}s`}
          color="#FF6B81"
        />
        <ToggleField
          label="Require explicit approval"
          hint="If off, gate auto-approves on timeout instead of failing"
          checked={data.approvalRequired}
          onChange={(v) => upd({ approvalRequired: v })}
          color="#FF6B81"
        />
      </PanelSection>
    </>
  )
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export default function NodeConfigPanel() {
  const store = useGraphStore()
  const selectedNode = selectSelectedNode(store)
  const { updateNodeData, deleteNode, duplicateNode, setSelectedNode } = store

  if (!selectedNode) return null

  const { id, data } = selectedNode
  const nodeType = data.nodeType as NodeType
  const colors = NODE_COLORS[nodeType as keyof typeof NODE_COLORS]

  return (
    <AnimatePresence>
      <motion.aside
        key={id}
        initial={{ x: 24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 24, opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className="w-[280px] flex-shrink-0 bg-[var(--surface-1)]/80 backdrop-blur-xl border-l border-[var(--border-subtle)] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-[var(--border-subtle)] flex-shrink-0">
          {/* Accent dot */}
          <div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ background: colors.primary, boxShadow: `0 0 8px ${colors.glow}` }}
          />

          {/* Type badge */}
          <span
            className="font-mono text-[9px] font-semibold tracking-[0.14em] uppercase flex-shrink-0"
            style={{ color: colors.label }}
          >
            {NODE_LABELS[nodeType]}
          </span>

          {/* Editable name */}
          <input
            value={data.label}
            onChange={(e) => updateNodeData(id, { label: e.target.value })}
            className="flex-1 min-w-0 bg-transparent text-[12.5px] font-semibold text-[var(--text-primary)] outline-none border-b border-transparent focus:border-white/15 transition-colors font-display"
          />

          {/* Action buttons */}
          <div className="flex items-center gap-0.5 ml-auto flex-shrink-0">
            <button
              onClick={() => duplicateNode(id)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-ghost)] hover:text-[var(--text-secondary)] hover:bg-white/[0.04] transition-all"
              title="Duplicate"
            >
              <Copy size={12} />
            </button>
            <button
              onClick={() => deleteNode(id)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-ghost)] hover:text-[#FF6B81] hover:bg-[#FF6B81]/8 transition-all"
              title="Delete"
            >
              <Trash2 size={12} />
            </button>
            <button
              onClick={() => setSelectedNode(null)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-ghost)] hover:text-[var(--text-secondary)] hover:bg-white/[0.04] transition-all"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        {/* Scrollable config */}
        <div className="flex-1 overflow-y-auto">
          {nodeType === 'agent'      && <AgentConfig      id={id} data={data as AgentNodeData}      />}
          {nodeType === 'tool'       && <ToolConfig       id={id} data={data as ToolNodeData}       />}
          {nodeType === 'memory'     && <MemoryConfig     id={id} data={data as MemoryNodeData}     />}
          {nodeType === 'router'     && <RouterConfig     id={id} data={data as RouterNodeData}     />}
          {nodeType === 'human_gate' && <HumanGateConfig  id={id} data={data as HumanGateNodeData}  />}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-[var(--border-subtle)] flex-shrink-0">
          <p className="font-mono text-[8px] text-[var(--text-ghost)] tracking-wider">{id}</p>
        </div>
      </motion.aside>
    </AnimatePresence>
  )
}