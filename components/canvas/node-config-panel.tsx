'use client'

import { useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Trash2, Copy } from 'lucide-react'
import { useGraphStore, selectSelectedNode } from '@/store/graph-store'
import { NODE_COLORS, NODE_LABELS, AVAILABLE_MODELS, type NodeType } from '@/lib/types'
import type { AgentNodeData, ToolNodeData, MemoryNodeData, RouterNodeData, HumanGateNodeData } from '@/lib/types'
import { cn } from '@/lib/utils'

// ─── Small reusable field components ─────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block font-mono text-[9px] font-semibold tracking-[0.1em] uppercase text-[#4A506A] mb-1.5">
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
        'w-full h-8 px-3 rounded-md text-[12px] font-medium',
        'bg-[#0D1017] border border-white/[0.07] text-[#F1F2F8]',
        'placeholder:text-[#4A506A] outline-none',
        'focus:border-[#8B7FFE]/50 transition-colors',
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
        'w-full px-3 py-2 rounded-md text-[11.5px] font-mono',
        'bg-[#0D1017] border border-white/[0.07] text-[#9BA0BC]',
        'placeholder:text-[#4A506A] outline-none resize-none leading-relaxed',
        'focus:border-[#8B7FFE]/50 transition-colors',
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
        'w-full h-8 px-3 rounded-md text-[12px]',
        'bg-[#0D1017] border border-white/[0.07] text-[#F1F2F8]',
        'outline-none cursor-pointer',
        'focus:border-[#8B7FFE]/50 transition-colors',
      )}
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
  label, value, onChange, min, max, step = 0.01, display,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  display?: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <FieldLabel>{label}</FieldLabel>
        <span className="font-mono text-[10px] text-[#8B7FFE]">
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
        className="w-full h-1 rounded-full appearance-none cursor-pointer accent-[#8B7FFE]"
        style={{ background: `linear-gradient(to right, #8B7FFE ${((value - min) / (max - min)) * 100}%, #1A1F30 0)` }}
      />
    </div>
  )
}

function PanelSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-white/[0.05]">
      <p className="font-mono text-[9px] font-semibold tracking-[0.1em] uppercase text-[#4A506A] mb-3">
        {title}
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

// ─── Node-type-specific config sections ──────────────────────────────────────

function AgentConfig({ id, data }: { id: string; data: AgentNodeData }) {
  const { updateNodeData } = useGraphStore()
  const upd = useCallback(
    (partial: Partial<AgentNodeData>) => updateNodeData(id, partial),
    [id, updateNodeData]
  )

  const modelOptions = AVAILABLE_MODELS.map((m) => ({
    value: m.value,
    label: `${m.label} (${m.provider})`,
  }))

  return (
    <>
      <PanelSection title="Model">
        <div>
          <FieldLabel>Model</FieldLabel>
          <Select value={data.model} onChange={(v) => upd({ model: v })} options={modelOptions} />
        </div>
        <SliderField
          label="Temperature"
          value={data.temperature}
          onChange={(v) => upd({ temperature: v })}
          min={0} max={2} step={0.01}
        />
        <SliderField
          label="Max Tokens"
          value={data.maxTokens}
          onChange={(v) => upd({ maxTokens: v })}
          min={64} max={8192} step={64}
          display={data.maxTokens.toString()}
        />
      </PanelSection>

      <PanelSection title="System Prompt">
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
            <span className="text-[11px] text-[#4A506A]">No tools assigned</span>
          ) : (
            data.tools.map((t) => (
              <span
                key={t}
                className="font-mono text-[9px] px-2 py-0.5 rounded bg-[#1A1F30] text-[#9BA0BC] border border-white/[0.06] flex items-center gap-1"
              >
                {t}
                <button
                  onClick={() => upd({ tools: data.tools.filter((x) => x !== t) })}
                  className="text-[#4A506A] hover:text-[#FF5252] transition-colors"
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
          <TextInput
            value={data.functionName}
            onChange={(v) => upd({ functionName: v })}
            placeholder="my_tool_function"
          />
        </div>
        <div>
          <FieldLabel>Description</FieldLabel>
          <TextArea
            value={data.description}
            onChange={(v) => upd({ description: v })}
            rows={3}
            placeholder="What does this tool do..."
          />
        </div>
      </PanelSection>
      <PanelSection title="Return Type">
        <div>
          <FieldLabel>Return Type</FieldLabel>
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
        </div>
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
      <PanelSection title="Backend">
        <div>
          <FieldLabel>Backend</FieldLabel>
          <Select
            value={data.backend}
            onChange={(v) => upd({ backend: v as MemoryNodeData['backend'] })}
            options={[
              { value: 'qdrant', label: 'Qdrant' },
              { value: 'postgres_vector', label: 'PostgreSQL pgvector' },
              { value: 'in_memory', label: 'In-memory (dev only)' },
            ]}
          />
        </div>
        <div>
          <FieldLabel>Collection Name</FieldLabel>
          <TextInput
            value={data.collectionName}
            onChange={(v) => upd({ collectionName: v })}
            placeholder="my_collection"
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
        <TextArea
          value={data.condition}
          onChange={(v) => upd({ condition: v })}
          rows={3}
          placeholder="state['next']"
        />
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
          </div>
        ))}
        <button
          onClick={() => upd({ routes: [...data.routes, { label: 'new_route', target: '' }] })}
          className="text-[11px] text-[#8B7FFE] hover:text-[#A89DFF] transition-colors font-mono mt-1"
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
        />
      </PanelSection>
    </>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

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
        initial={{ x: 20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 20, opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
        className="w-[260px] flex-shrink-0 bg-[#0D1017] border-l border-white/[0.07] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.07] flex-shrink-0">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: colors.dot }}
          />
          <span
            className="font-mono text-[9px] font-semibold tracking-widest uppercase"
            style={{ color: colors.label }}
          >
            {NODE_LABELS[nodeType as NodeType]}
          </span>

          {/* Node name — inline edit */}
          <input
            value={data.label}
            onChange={(e) => updateNodeData(id, { label: e.target.value })}
            className="flex-1 min-w-0 bg-transparent text-[12.5px] font-semibold text-[#F1F2F8] outline-none border-b border-transparent focus:border-white/20 transition-colors font-display"
          />

          {/* Actions */}
          <div className="flex items-center gap-1 ml-auto flex-shrink-0">
            <button
              onClick={() => duplicateNode(id)}
              className="w-6 h-6 flex items-center justify-center rounded text-[#4A506A] hover:text-[#9BA0BC] hover:bg-white/[0.05] transition-all"
              title="Duplicate"
            >
              <Copy size={12} />
            </button>
            <button
              onClick={() => deleteNode(id)}
              className="w-6 h-6 flex items-center justify-center rounded text-[#4A506A] hover:text-[#FF5252] hover:bg-[#FF5252]/10 transition-all"
              title="Delete node"
            >
              <Trash2 size={12} />
            </button>
            <button
              onClick={() => setSelectedNode(null)}
              className="w-6 h-6 flex items-center justify-center rounded text-[#4A506A] hover:text-[#9BA0BC] hover:bg-white/[0.05] transition-all"
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

        {/* Footer — node ID */}
        <div className="px-4 py-2.5 border-t border-white/[0.05] flex-shrink-0">
          <p className="font-mono text-[9px] text-[#4A506A]">id: {id}</p>
        </div>
      </motion.aside>
    </AnimatePresence>
  )
}
