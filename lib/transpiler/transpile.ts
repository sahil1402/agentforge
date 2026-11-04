// ─── Transpiler ─────────────────────────────────────────────────────────────────
//
// Walks a saved graph (see lib/types.ts) and renders LangGraph Python *source as a
// string*. Nothing is executed here — running the generated code is Week 4.
//
// `plan()` (in ./walk.ts) validates the graph and produces a template-agnostic
// plan; this file only renders it: one nunjucks (Jinja2-style) template per node
// kind plus a single module template (`graph.njk`).

import path from 'node:path'
import nunjucks from 'nunjucks'
import type { GraphNode, GraphSchema, AgentNodeData, HumanGateNodeData } from '@/lib/types'
import { AVAILABLE_MODELS, LEGACY_MODEL_ALIASES } from '@/lib/types'
import { plan, type RegistryTool } from './walk'
import { TranspileError } from './errors'

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
  /** Name(s) imported from `module` (comma-separated when more than one). */
  cls: string
  module: string
  /** Python expression constructing the chat model. */
  llm: (model: string, temperature: string, maxTokens: string) => string
}

const PROVIDER_IMPORTS: Record<string, ProviderImport> = {
  OpenAI: {
    cls: 'ChatOpenAI',
    module: 'langchain_openai',
    llm: (m, t, n) => `ChatOpenAI(model="${m}", temperature=${t}, max_tokens=${n})`,
  },
  Anthropic: {
    cls: 'ChatAnthropic',
    module: 'langchain_anthropic',
    llm: (m, t, n) => `ChatAnthropic(model="${m}", temperature=${t}, max_tokens=${n})`,
  },
  Mistral: {
    cls: 'ChatMistralAI',
    module: 'langchain_mistralai',
    llm: (m, t, n) => `ChatMistralAI(model="${m}", temperature=${t}, max_tokens=${n})`,
  },
  Ollama: {
    cls: 'ChatOllama',
    module: 'langchain_ollama',
    llm: (m, t, n) => `ChatOllama(model="${m}", temperature=${t}, num_predict=${n})`,
  },
  HuggingFace: {
    cls: 'ChatHuggingFace, HuggingFaceEndpoint',
    module: 'langchain_huggingface',
    llm: (m, t, n) =>
      `ChatHuggingFace(llm=HuggingFaceEndpoint(repo_id="${m}", temperature=${t}, max_new_tokens=${n}))`,
  },
}

const MODELS = new Map<string, (typeof AVAILABLE_MODELS)[number]>(
  AVAILABLE_MODELS.map((m) => [m.value, m]),
)

/** Resolve an agent's saved model value to its provider + API model id. */
function resolveModel(node: GraphNode, value: string): { provider: ProviderImport; apiModel: string } {
  const model = MODELS.get(LEGACY_MODEL_ALIASES[value] ?? value)
  if (!model) {
    throw new TranspileError(
      'UNSUPPORTED_NODE',
      `Agent "${node.data?.label ?? node.id}" uses unknown model "${value}". Pick a model in the node config.`,
    )
  }
  return { provider: PROVIDER_IMPORTS[model.provider], apiModel: model.apiModel }
}

// ── helpers ─────────────────────────────────────────────────────────────────

/** Module-level names the generated code defines or imports — node names must not shadow them. */
const RESERVED = [
  'AgentState', 'Annotated', 'TypedDict', 'StateGraph', 'START', 'END', 'add_messages', 'SystemMessage',
  'HumanMessage', 'builder', 'graph', 'tool', 'interrupt', 'InMemorySaver', 'message_text', 'agent_input',
  'run_with_tools',
  'MAX_TOOL_ROUNDS', 'GateRejected', 'state',
  // Python keywords / builtins a node id could plausibly collide with
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else',
  'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not',
  'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield', 'None', 'True', 'False',
]

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

/** Render a Python triple-quoted string literal, escaping backslashes and quotes. */
function pyTripleQuoted(value: string): string {
  // Escaping every `"` (not just `"""`) also covers a value that ends in a quote.
  const escaped = (value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"""${escaped}"""`
}

/** Single-line Python string literal (JSON string syntax is valid Python). */
const pyString = (value: string) => JSON.stringify(value ?? '')

/** Python float/int literal for temperature (keeps a decimal so it reads as float). */
function pyNumber(n: number): string {
  return Number.isFinite(n) ? String(n) : '0'
}

// ── main entry ──────────────────────────────────────────────────────────────

export interface TranspileResult {
  code: string
  /** Node ids in execution order — handy for the caller / future tracing. */
  order: string[]
  /** Generated LangGraph node name → graph node id (the engine maps trace events back with it). */
  nodeIds: Record<string, string>
}

export interface TranspileOptions {
  /** Tool registry that agent tools and tool nodes resolve against. */
  tools?: RegistryTool[]
}

/**
 * Transpile a saved graph to LangGraph Python source.
 * Throws {@link TranspileError} for unsupported / malformed graphs.
 */
export function transpile(graph: GraphSchema, options: TranspileOptions = {}): TranspileResult {
  const p = plan(graph, options.tools)

  const taken = new Set<string>([...RESERVED, ...p.tools.map((t) => t.name)])
  const nameOf = new Map<string, string>()
  for (const step of p.steps) nameOf.set(step.node.id, toIdentifier(step.node.id, taken))
  for (const r of p.routers) nameOf.set(r.node.id, toIdentifier(`route_${r.node.id}`, taken))
  const ref = (id: string) => (id === 'START' || id === 'END' ? id : `"${nameOf.get(id)}"`)

  const imports = new Map<string, ProviderImport>()
  const nodes = p.steps.map((step) => {
    const name = nameOf.get(step.node.id)!
    if (step.kind === 'human_gate') {
      const data = step.node.data as HumanGateNodeData
      return env.render('gate_node.njk', {
        name,
        doc: pyTripleQuoted(data.label ?? step.node.id),
        prompt: pyTripleQuoted(data.prompt ?? ''),
        timeout: data.timeoutSeconds > 0 ? pyNumber(data.timeoutSeconds) : 'None',
        rejected: pyString(`Rejected at gate "${data.label ?? step.node.id}"`),
      }).trimEnd()
    }

    const data = step.node.data as AgentNodeData
    const { provider, apiModel } = resolveModel(step.node, data.model)
    imports.set(provider.module, provider)
    return env.render('agent_node.njk', {
      name,
      doc: pyTripleQuoted(data.label ?? step.node.id),
      llm: provider.llm(apiModel, pyNumber(data.temperature), pyNumber(data.maxTokens)),
      system_prompt: pyTripleQuoted(data.systemPrompt),
      tools: step.tools.map((t) => t.name).join(', '),
    }).trimEnd()
  })

  const routingFns = p.routers.map((r) => {
    const condition = r.condition.includes('\n') ? `(\n${r.condition}\n)` : r.condition
    return env.render('router_node.njk', {
      fn_name: nameOf.get(r.node.id),
      doc: pyTripleQuoted(`Route: ${r.node.data?.label ?? r.node.id}`),
      condition,
    }).trimEnd()
  })

  const hasGates = p.steps.some((s) => s.kind === 'human_gate')
  const routerById = new Map(p.routers.map((r) => [r.node.id, r]))

  const code = env.render('graph.njk', {
    imports: [...imports.values()],
    has_tools: p.tools.length > 0,
    has_gates: hasGates,
    tools: p.tools.map((t) => ({ name: t.name, code: t.code.trimEnd(), description: pyString(t.description) })),
    nodes,
    routing_fns: routingFns,
    node_names: p.steps.map((s) => nameOf.get(s.node.id)),
    // START edge first, then conditional edges, then the rest (reads top-to-bottom).
    start_edges: p.edges.filter((e) => e.from === 'START').map((e) => ({ from: e.from, to: ref(e.to) })),
    conditionals: p.conditionals.map((c) => ({
      from: ref(c.from),
      fn: nameOf.get(c.router),
      branches: routerById.get(c.router)!.branches.map((b) => ({ label: pyString(b.label), target: ref(b.target) })),
    })),
    edges: p.edges.filter((e) => e.from !== 'START').map((e) => ({ from: ref(e.from), to: ref(e.to) })),
    joins: p.joins.map((j) => ({ from: `[${j.from.map(ref).join(', ')}]`, to: ref(j.to) })),
  })

  const nodeIds = Object.fromEntries(p.steps.map((s) => [nameOf.get(s.node.id)!, s.node.id]))
  // Templates may be checked out with CRLF (git autocrlf); output must not depend on it.
  return { code: `${code.replace(/\r\n/g, '\n').trim()}\n`, order: p.order, nodeIds }
}
