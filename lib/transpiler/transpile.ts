// ─── Linear-chain transpiler (Piece 1 of 4) ─────────────────────────────────────
//
// Walks a saved graph (see lib/types.ts) that is a pure linear chain of agent
// nodes and renders LangGraph Python *source as a string*. Nothing is executed
// here — running the generated code is Week 4.
//
// Templating uses nunjucks (Jinja2-style) with the templates in ./templates.
// The walk/validation logic lives in ./walk.ts and is intentionally kept
// separate so Pieces 2–4 add new render paths without touching it.

import path from 'node:path'
import nunjucks from 'nunjucks'
import type { GraphSchema, GraphNode, AgentNodeData } from '@/lib/types'
import { AVAILABLE_MODELS } from '@/lib/types'
import { linearize } from './walk'

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

// ── main entry ──────────────────────────────────────────────────────────────

export interface TranspileResult {
  code: string
  /** Node ids in execution order — handy for the caller / future tracing. */
  order: string[]
}

/**
 * Transpile a linear agent chain to LangGraph Python source.
 * Throws {@link import('./errors').TranspileError} for non-linear / unsupported graphs.
 */
export function transpile(graph: GraphSchema): TranspileResult {
  const ordered: GraphNode[] = linearize(graph)

  const taken = new Set<string>()
  const importSet = new Map<string, ProviderImport>()

  const nodeViews = ordered.map((node) => {
    const data = node.data as AgentNodeData
    const provider = providerFor(data.model)
    importSet.set(provider.cls, provider)

    const name = toIdentifier(node.id, taken)
    const body = env.render('agent_node.njk', {
      name,
      label: data.label,
      provider_cls: provider.cls,
      model: data.model,
      temperature: pyNumber(data.temperature),
      max_tokens: pyNumber(data.maxTokens),
      system_prompt: pyTripleQuoted(data.systemPrompt),
    }).trimEnd()

    return { name, body }
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
    order: ordered.map((n) => n.id),
  }
}
