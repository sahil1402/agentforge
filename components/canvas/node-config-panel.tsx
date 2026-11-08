'use client'

import { useCallback, type CSSProperties } from 'react'
import { X, Trash2, Copy, Plus, Wrench } from 'lucide-react'
import { useGraphStore, selectSelectedNode } from '@/store/graph-store'
import { NODE_HUE, AVAILABLE_MODELS, MODEL_PRICING, costUsd, type NodeType } from '@/lib/types'
import type { AgentNodeData, ToolNodeData, MemoryNodeData, RouterNodeData, HumanGateNodeData } from '@/lib/types'
import { cn } from '@/lib/utils'
import { CodeEditor, approxTokenCount } from './code-editor'
import { useTools } from '@/lib/use-tools'

// ─── Field primitives ────────────────────────────────────────────────────────

function Prop({ label, aside, htmlFor, children }: { label: string; aside?: React.ReactNode; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="af-prop">
      <label htmlFor={htmlFor}>{label}{aside && <span className="af-val" style={{ minWidth: 0 }}>{aside}</span>}</label>
      {children}
    </div>
  )
}

const Sect = ({ children }: { children: React.ReactNode }) => <div className="af-sect">{children}</div>

function Text({ id, value, onChange, placeholder, mono }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return <input id={id} className={cn('af-in', mono && 'af-mono')} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
}

function Area({ id, value, onChange, placeholder, mono, rows = 4 }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; rows?: number }) {
  return <textarea id={id} className={cn('af-in', mono && 'af-mono')} rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
}

function Select({ id, value, onChange, options }: {
  id: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string; group?: string }>
}) {
  const groups = [...new Set(options.map((o) => o.group ?? ''))]
  const opt = (o: { value: string; label: string }) => <option key={o.value} value={o.value}>{o.label}</option>
  return (
    <select id={id} className="af-in" value={value} onChange={(e) => onChange(e.target.value)}>
      {groups.length > 1 || groups[0]
        ? groups.map((g) => <optgroup key={g} label={g}>{options.filter((o) => (o.group ?? '') === g).map(opt)}</optgroup>)
        : options.map(opt)}
    </select>
  )
}

function Slider({ id, label, value, onChange, min, max, step, display }: {
  id: string; label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; display: string
}) {
  return (
    <Prop label={label} htmlFor={id}>
      <div className="ctl">
        <input id={id} type="range" className="af-range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="af-val">{display}</span>
      </div>
    </Prop>
  )
}

function useUpdate<T>(id: string) {
  const updateNodeData = useGraphStore((s) => s.updateNodeData)
  return useCallback((partial: Partial<T>) => updateNodeData(id, partial), [id, updateNodeData])
}

// ─── Per-type forms ──────────────────────────────────────────────────────────

function AgentConfig({ id, data }: { id: string; data: AgentNodeData }) {
  const upd = useUpdate<AgentNodeData>(id)
  const { tools, loading } = useTools()
  const price = MODEL_PRICING[data.model]
  const orphaned = data.tools.filter((name) => !tools.some((t) => t.name === name))
  const toggle = (name: string) => upd({ tools: data.tools.includes(name) ? data.tools.filter((t) => t !== name) : [...data.tools, name] })
  return (
    <>
      <Sect>Model</Sect>
      <Prop label="Model" htmlFor={`${id}-model`} aside={price && `$${price.input} / $${price.output} per 1M`}>
        <Select
          id={`${id}-model`}
          value={data.model}
          onChange={(v) => upd({ model: v })}
          options={AVAILABLE_MODELS.map((m) => ({ value: m.value, label: m.label, group: m.provider }))}
        />
      </Prop>
      <Slider id={`${id}-temp`} label="Temperature" value={data.temperature} onChange={(v) => upd({ temperature: v })} min={0} max={2} step={0.05} display={data.temperature.toFixed(2)} />
      <Slider id={`${id}-max`} label="Max tokens" value={data.maxTokens} onChange={(v) => upd({ maxTokens: v })} min={64} max={8192} step={64} display={data.maxTokens.toLocaleString()} />

      <Sect>System prompt</Sect>
      <CodeEditor value={data.systemPrompt} onChange={(v) => upd({ systemPrompt: v })} placeholder="You are a helpful assistant…" minHeight="120px" maxHeight="320px" language="markdown" />
      <p className="af-hint" style={{ marginTop: 6 }}>≈ {approxTokenCount(data.systemPrompt).toLocaleString()} tokens · markdown supported</p>

      <Sect>Tools <span style={{ fontWeight: 400 }}>· from the registry</span></Sect>
      <div className="af-tags">
        {loading && <span className="af-hint">Loading tools…</span>}
        {tools.map((t) => (
          <button key={t.id} className={cn('af-tag', data.tools.includes(t.name) && 'on')} title={t.description} aria-pressed={data.tools.includes(t.name)} onClick={() => toggle(t.name)}>
            <Wrench size={11} />{t.name}
          </button>
        ))}
        {orphaned.map((name) => (
          <button key={name} className="af-tag orphan" title="Not in the tool registry: click to remove" onClick={() => toggle(name)}>{name} ×</button>
        ))}
      </div>
      <p className="af-hint" style={{ marginTop: 6 }}>Tool nodes wired to this agent are added too. Only the agent&apos;s final answer enters shared state.</p>
    </>
  )
}

function ToolConfig({ id, data }: { id: string; data: ToolNodeData }) {
  const upd = useUpdate<ToolNodeData>(id)
  const { tools } = useTools()
  const options = [
    ...(tools.some((t) => t.name === data.functionName) ? [] : [{ value: data.functionName, label: `${data.functionName || '—'} (not in registry)` }]),
    ...tools.map((t) => ({ value: t.name, label: t.name })),
  ]
  return (
    <>
      <Sect>Function</Sect>
      <Prop label="Registry tool" htmlFor={`${id}-fn`}>
        <Select id={`${id}-fn`} value={data.functionName} onChange={(v) => upd({ functionName: v })} options={options} />
      </Prop>
      <Prop label="Description" htmlFor={`${id}-desc`}>
        <Area id={`${id}-desc`} value={data.description} onChange={(v) => upd({ description: v })} rows={3} placeholder="What does this tool do…" />
      </Prop>
      <Prop label="Return type" htmlFor={`${id}-ret`}>
        <Select id={`${id}-ret`} value={data.returnType} onChange={(v) => upd({ returnType: v })} options={['string', 'dict', 'list', 'Any'].map((v) => ({ value: v, label: v }))} />
      </Prop>
      <p className="af-hint">Connect this node to an agent to let that agent call the tool.</p>
    </>
  )
}

function MemoryConfig({ id, data }: { id: string; data: MemoryNodeData }) {
  const upd = useUpdate<MemoryNodeData>(id)
  return (
    <>
      <Sect>Backend</Sect>
      <Prop label="Backend" htmlFor={`${id}-backend`}>
        <Select
          id={`${id}-backend`}
          value={data.backend}
          onChange={(v) => upd({ backend: v as MemoryNodeData['backend'] })}
          options={[{ value: 'qdrant', label: 'Qdrant' }, { value: 'postgres_vector', label: 'PostgreSQL pgvector' }, { value: 'in_memory', label: 'In-memory (dev)' }]}
        />
      </Prop>
      <Prop label="Collection" htmlFor={`${id}-coll`}>
        <Text id={`${id}-coll`} value={data.collectionName} onChange={(v) => upd({ collectionName: v })} placeholder="my_collection" mono />
      </Prop>
      <Prop label="Embedding model" htmlFor={`${id}-emb`}>
        <Select
          id={`${id}-emb`}
          value={data.embeddingModel}
          onChange={(v) => upd({ embeddingModel: v })}
          options={['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002', 'voyage-3', 'mistral-embed', 'bge-large-en-v1.5'].map((v) => ({ value: v, label: v }))}
        />
      </Prop>
      <Sect>Retrieval</Sect>
      <Slider id={`${id}-topk`} label="Top-K results" value={data.topK} onChange={(v) => upd({ topK: v })} min={1} max={20} step={1} display={String(data.topK)} />
      <p className="af-hint" style={{ color: 'var(--warn)' }}>Memory nodes are not transpiled yet: a graph that has one cannot run.</p>
    </>
  )
}

function RouterConfig({ id, data }: { id: string; data: RouterNodeData }) {
  const upd = useUpdate<RouterNodeData>(id)
  const nodes = useGraphStore((s) => s.nodes)
  const targets = nodes.filter((n) => n.id !== id && (n.data.nodeType === 'agent' || n.data.nodeType === 'human_gate'))
  const updateRoute = (i: number, change: Partial<{ label: string; target: string }>) =>
    upd({ routes: data.routes.map((r, j) => (j === i ? { ...r, ...change } : r)) })
  return (
    <>
      <Sect>Routing condition</Sect>
      <Area id={`${id}-cond`} value={data.condition} onChange={(v) => upd({ condition: v })} rows={3} mono placeholder={'"escalate" if "refund" in last.lower() else "faq"'} />
      <p className="af-hint" style={{ marginTop: 6 }}>
        Python expression returning a route label. <code>last</code> is the last message&apos;s text; <code>state</code> is the full state.
      </p>
      <Sect>Routes</Sect>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.routes.map((r, i) => (
          <div key={i} className="af-rrow">
            <input className="af-in af-mono" value={r.label} placeholder="route_label" aria-label="Route label" onChange={(e) => updateRoute(i, { label: e.target.value })} />
            <select className="af-in" value={r.target} aria-label="Route target" onChange={(e) => updateRoute(i, { target: e.target.value })}>
              <option value="">{r.target && !targets.some((t) => t.id === r.target) ? `${r.target} (missing)` : 'Choose target…'}</option>
              {targets.map((t) => <option key={t.id} value={t.id}>{t.data.label}</option>)}
            </select>
            <button className="af-ibtn sm" aria-label="Remove route" onClick={() => upd({ routes: data.routes.filter((_, j) => j !== i) })}><X size={13} /></button>
          </div>
        ))}
        <button className="af-btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => upd({ routes: [...data.routes, { label: 'new_route', target: '' }] })}>
          <Plus size={12} />Add route
        </button>
      </div>
      <p className="af-hint" style={{ marginTop: 8 }}>Picking a target draws its edge; dragging from a route&apos;s port sets it.</p>
    </>
  )
}

function HumanGateConfig({ id, data }: { id: string; data: HumanGateNodeData }) {
  const upd = useUpdate<HumanGateNodeData>(id)
  return (
    <>
      <Sect>Approval prompt</Sect>
      <Area id={`${id}-prompt`} value={data.prompt} onChange={(v) => upd({ prompt: v })} rows={4} placeholder="Please review the output and approve or reject." />
      <Sect>Settings</Sect>
      <Slider id={`${id}-timeout`} label="Timeout" value={data.timeoutSeconds} onChange={(v) => upd({ timeoutSeconds: v })} min={30} max={3600} step={30} display={`${data.timeoutSeconds}s`} />
      <Prop label="Require explicit approval">
        <div className="ctl">
          <button className={cn('af-toggle', data.approvalRequired && 'on')} role="switch" aria-checked={data.approvalRequired} aria-label="Require explicit approval" onClick={() => upd({ approvalRequired: !data.approvalRequired })} />
          <span className="af-hint">{data.approvalRequired ? 'Timeout counts as reject' : 'Auto-approves on timeout'}</span>
        </div>
      </Prop>
    </>
  )
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export default function NodeConfigPanel() {
  const node = useGraphStore(selectSelectedNode)
  const stats = useGraphStore((s) => (node ? s.nodeStats[node.id] : undefined))
  const { updateNodeData, deleteNode, duplicateNode, setSelectedNode } = useGraphStore.getState()
  if (!node) return null

  const { id, data } = node
  const type = data.nodeType as NodeType
  const cost = stats && costUsd(data.model, stats)

  return (
    <aside className="af-inspector" aria-label="Node settings">
      <div className="af-ihead" style={{ '--hue': NODE_HUE[type] } as CSSProperties}>
        <span className="pled" />
        <input className="af-name" value={data.label} aria-label="Node name" onChange={(e) => updateNodeData(id, { label: e.target.value })} />
        <button className="af-ibtn" title="Duplicate" aria-label="Duplicate node" onClick={() => duplicateNode(id)}><Copy size={14} /></button>
        <button className="af-ibtn" title="Delete (⌫)" aria-label="Delete node" onClick={() => deleteNode(id)}><Trash2 size={14} /></button>
        <button className="af-ibtn" aria-label="Close" onClick={() => setSelectedNode(null)}><X size={15} /></button>
      </div>
      <div className="af-ibody">
        {type === 'agent' && <AgentConfig id={id} data={data as AgentNodeData} />}
        {type === 'tool' && <ToolConfig id={id} data={data as ToolNodeData} />}
        {type === 'memory' && <MemoryConfig id={id} data={data as MemoryNodeData} />}
        {type === 'router' && <RouterConfig id={id} data={data as RouterNodeData} />}
        {type === 'human_gate' && <HumanGateConfig id={id} data={data as HumanGateNodeData} />}
        {stats && (
          <div className="af-istats">
            <div><small>tokens</small><b>{(stats.inputTokens + stats.outputTokens).toLocaleString()}</b></div>
            <div><small>duration</small><b>{(stats.durationMs / 1000).toFixed(1)}s</b></div>
            <div><small>cost</small><b>{cost !== undefined ? `$${cost.toFixed(4)}` : '—'}</b></div>
          </div>
        )}
      </div>
      <div className="af-ifoot"><span className="af-note">{id}</span></div>
    </aside>
  )
}
