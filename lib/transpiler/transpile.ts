// ─── Transpiler (Pieces 1–2 of 4) ────────────────────────────────────────────────
//
// Walks a saved graph (see lib/types.ts) and renders LangGraph Python *source as a
// string*. Nothing is executed here — running the generated code is Week 4.
//
//   Piece 1: pure linear chain of agent nodes.
//   Piece 2: linear chain with ONE conditional router (2+ terminal branches).
//
// `plan()` (in ./walk.ts) classifies the graph and validates it; this file only
// renders the resulting plan. Each pattern has its own assembly template so the
// pieces stay isolated (Piece 3 adds another plan arm + template, no edits here to
// the existing paths). Templating uses nunjucks (Jinja2-style).

import path from 'node:path'
import nunjucks from 'nunjucks'
import type { GraphNode, GraphSchema, AgentNodeData, RouterNodeData } from '@/lib/types'
import { AVAILABLE_MODELS } from '@/lib/types'
import { plan, type LinearPlan, type RouterPlan } from './walk'

// ── nunjucks environment ────────────────────────────────────────────────────
// Loaded from the filesystem relative to the project root. Both `next dev`
// (Node runtime) and Jest run with cwd = repo root, so this path resolves in
// both. `trimBlocks`/`lstripBlocks` keep the generated Python indentation clean.
const env = nunjucks.configure(path.join(process.cwd(), 'lib', 'transpiler', 'templates'), {
  autoescape: false,
  trimBlocks: true,
  lstripBlocks: true,
})

// ── model → LangChain chat class ────────────────────────────────────────────
interface ProviderImport {
  cls: string
  module: string
}

const PROVIDER_IMPORTS: Record<string, ProviderImport> = {
  OpenAI: { cls: 'ChatOpenAI', module: 'langchain_openai' },
  Anthropic: { cls: 'ChatAnthropic', module: 'langchain_anthropic' },
  Mistral: { cls: 'ChatMistralAI', module: 'langchain_mistralai' },
  Meta: { cls: 'ChatOllama', module: 'langchain_ollama' },
  HuggingFace: { cls: 'ChatHuggingFaceInference', module: 'langchain_huggingface' },
}

const DEFAULT_PROVIDER = PROVIDER_IMPORTS.OpenAI

const MODEL_PROVIDER = new Map<string, string>(
  AVAILABLE_MODELS.map((m) => [m.value, m.provider]),
)

function providerFor(model: string): ProviderImport {
  const provider = MODEL_PROVIDER.get(model)
  return (provider && PROVIDER_IMPORTS[provider]) || DEFAULT_PROVIDER
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Turn a node id/label into a valid, unique Python identifier. */
function toIdentifier(raw: string, taken: Set<string>): string {
  let name = raw.replace(/[^a-zA-Z0-9_]/g, '_')
  if (!/^[a-zA-Z_]/.test(name)) name = `n_${name}`
  name = name.replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'node'
  let candidate = name
  let i = 2
  while (taken.has(candidate)) candidate = `${name}_${i++}`
  taken.add(candidate)
  return candidate
}

/** Render a Python triple-quoted string literal, escaping any embedded `"""`. */
function pyTripleQuoted(value: string): string {
  const escaped = (value ?? '').replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"')
  return `"""${escaped}"""`
}

/** Python float/int literal for temperature (keeps a decimal so it reads as float). */
function pyNumber(n: number): string {
  return Number.isFinite(n) ? String(n) : '0'
}

/** Render one agent node's function body and record its provider import. */
function renderAgentBody(
  node: GraphNode,
  name: string,
  importSet: Map<string, ProviderImport>,
): string {
  const data = node.data as AgentNodeData
  const provider = providerFor(data.model)
  importSet.set(provider.cls, provider)

  return env
    .render('agent_node.njk', {
      name,
      label: data.label,
      provider_cls: provider.cls,
      model: data.model,
      temperature: pyNumber(data.temperature),
      max_tokens: pyNumber(data.maxTokens),
      system_prompt: pyTripleQuoted(data.systemPrompt),
    })
    .trimEnd()
}

// ── main entry ──────────────────────────────────────────────────────────────

export interface TranspileResult {
  code: string
  /** Node ids in execution order — handy for the caller / future tracing. */
  order: string[]
}

/**
 * Transpile a saved graph to LangGraph Python source.
 * Supports linear chains (Piece 1) and one conditional router (Piece 2).
 * Throws {@link import('./errors').TranspileError} for unsupported / malformed graphs.
 */
export function transpile(graph: GraphSchema): TranspileResult {
  const p = plan(graph)
  return p.kind === 'router' ? transpileRouter(p) : transpileLinear(p)
}

/** Piece 1 — render a pure linear agent chain. */
function transpileLinear(p: LinearPlan): TranspileResult {
  const taken = new Set<string>()
  const importSet = new Map<string, ProviderImport>()

  const nodeViews = p.order.map((node) => {
    const name = toIdentifier(node.id, taken)
    return { name, body: renderAgentBody(node, name, importSet) }
  })

  const chainEdges = nodeViews.slice(0, -1).map((n, i) => ({
    from: n.name,
    to: nodeViews[i + 1].name,
  }))

  const code = env.render('graph.njk', {
    imports: [...importSet.values()],
    nodes: nodeViews,
    chain_edges: chainEdges,
    first_name: nodeViews[0].name,
    last_name: nodeViews[nodeViews.length - 1].name,
  })

  return {
    code: `${code.trimEnd()}\n`,
    order: p.order.map((n) => n.id),
  }
}

/** Piece 2 — render a linear chain with one conditional router. */
function transpileRouter(p: RouterPlan): TranspileResult {
  const taken = new Set<string>()
  const importSet = new Map<string, ProviderImport>()
  const nameById = new Map<string, string>()

  // Unique agent nodes (prefix + branch targets; a target may repeat across routes).
  const agentNodes: GraphNode[] = []
  const seenAgents = new Set<string>()
  for (const node of [...p.prefix, ...p.branches.map((b) => b.target)]) {
    if (seenAgents.has(node.id)) continue
    seenAgents.add(node.id)
    agentNodes.push(node)
  }

  const nodeViews = agentNodes.map((node) => {
    const name = toIdentifier(node.id, taken)
    nameById.set(node.id, name)
    return { name, body: renderAgentBody(node, name, importSet) }
  })

  const routeFnName = toIdentifier(`route_${p.router.id}`, taken)
  const routingFn = env
    .render('router_node.njk', {
      fn_name: routeFnName,
      label: (p.router.data as RouterNodeData).label ?? p.router.id,
      condition: p.condition,
    })
    .trimEnd()

  // Linear edges leading to the conditional source (START → prefix chain).
  const preEdges: Array<{ source: string; target: string }> = []
  if (p.prefix.length > 0) {
    preEdges.push({ source: 'START', target: nameById.get(p.prefix[0].id)! })
    for (let i = 0; i < p.prefix.length - 1; i++) {
      preEdges.push({
        source: `"${nameById.get(p.prefix[i].id)}"`,
        target: nameById.get(p.prefix[i + 1].id)!,
      })
    }
  }

  // Conditional edges attach to the last prefix node, or START if the router is entry.
  const routeSource =
    p.prefix.length > 0 ? `"${nameById.get(p.prefix[p.prefix.length - 1].id)}"` : 'START'

  const branchViews = p.branches.map((b) => ({
    label: b.label,
    target_name: nameById.get(b.target.id)!,
  }))
  const branchEndNames = [...new Set(branchViews.map((b) => b.target_name))]

  const code = env.render('graph_router.njk', {
    imports: [...importSet.values()],
    nodes: nodeViews,
    routing_fn: routingFn,
    add_node_names: nodeViews.map((n) => n.name),
    pre_edges: preEdges,
    route_source: routeSource,
    route_fn_name: routeFnName,
    branches: branchViews,
    branch_end_names: branchEndNames,
  })

  return {
    code: `${code.trimEnd()}\n`,
    order: [...p.prefix.map((n) => n.id), p.router.id, ...p.branches.map((b) => b.target.id)],
  }
}
