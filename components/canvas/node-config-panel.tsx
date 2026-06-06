'use client'

import { useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Trash2, Copy, Cpu, Database, Sparkles } from 'lucide-react'
import { useGraphStore, selectSelectedNode } from '@/store/graph-store'
import { NODE_COLORS, NODE_LABELS, AVAILABLE_MODELS, type NodeType } from '@/lib/types'
import type { AgentNodeData, ToolNodeData, MemoryNodeData, RouterNodeData, HumanGateNodeData } from '@/lib/types'
import { cn } from '@/lib/utils'

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
      </PanelSection>

      <PanelSection title="System Prompt" icon={<Sparkles size={10} />}>
        <TextArea
          value={data.systemPrompt}
          onChange={(v) => upd({ systemPrompt: v })}
          rows={5}
          placeholder="You are a helpful assistant..."
        />
      </PanelSection>

      <PanelSection title="Tools">
        <div className="flex flex-wrap gap-1.5 min-h-[28px]">
          {data.tools.length === 0 ? (
            <span className="text-[11px] text-[var(--text-ghost)] italic">No tools assigned</span>
          ) : (
            data.tools.map((t) => (
              <span
                key={t}
                className="font-mono text-[9px] px-2 py-[3px] rounded-md bg-[var(--surface-3)] text-[var(--text-secondary)] border border-[var(--border-subtle)] flex items-center gap-1.5 group"
              >
                {t}
                <button
                  onClick={() => upd({ tools: data.tools.filter((x) => x !== t) })}
                  className="text-[var(--text-ghost)] hover:text-[#FF6B81] transition-colors"
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
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
              { value: 'qdrant', label: 'Qdrant' },
              { value: 'postgres_vector', label: 'PostgreSQL pgvector' },
              { value: 'in_memory', label: 'In-memory (dev)' },
            ]}
          />
        </div>
        <div>
          <FieldLabel>Collection Name</FieldLabel>
          <TextInput value={data.collectionName} onChange={(v) => upd({ collectionName: v })} placeholder="my_collection" />
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
  return (
    <PanelSection title="Routing Condition">
      <div>
        <FieldLabel>Condition Expression</FieldLabel>
        <TextArea value={data.condition} onChange={(v) => upd({ condition: v })} rows={3} placeholder="state['next']" />
      </div>
      <div>
        <FieldLabel>Routes</FieldLabel>
        {data.routes.map((r, i) => (
          <div key={i} className="flex gap-2 mb-1.5">
            <TextInput
              value={r.label}
              onChange={(v) => {
                const routes = [...data.routes]
                routes[i] = { ...routes[i], label: v }
                upd({ routes })
              }}
              placeholder="route_label"
              className="flex-1"
            />
            <button
              onClick={() => upd({ routes: data.routes.filter((_, j) => j !== i) })}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-ghost)] hover:text-[#FF6B81] hover:bg-[#FF6B81]/8 transition-all border border-transparent hover:border-[#FF6B81]/15"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <button
          onClick={() => upd({ routes: [...data.routes, { label: 'new_route', target: '' }] })}
          className="text-[11px] text-[#9B8AFF] hover:text-[#C4B8FF] transition-colors font-mono mt-1 font-medium"
        >
          + Add route
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
        <TextArea value={data.prompt} onChange={(v) => upd({ prompt: v })} rows={4} placeholder="Please review the output and approve or reject." />
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
