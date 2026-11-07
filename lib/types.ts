// ─── Node Types ──────────────────────────────────────────────────────────────

export type NodeType = 'agent' | 'tool' | 'memory' | 'router' | 'human_gate'

export interface BaseNodeData {
  label: string
  nodeType: NodeType
  description?: string
}

export interface AgentNodeData extends BaseNodeData {
  nodeType: 'agent'
  model: string
  systemPrompt: string
  temperature: number
  maxTokens: number
  tools: string[]
  memoryBackend?: string
}

export interface ToolNodeData extends BaseNodeData {
  nodeType: 'tool'
  functionName: string
  description: string
  parameterSchema: Record<string, unknown>
  returnType: string
}

export interface MemoryNodeData extends BaseNodeData {
  nodeType: 'memory'
  backend: 'qdrant' | 'postgres_vector' | 'in_memory'
  collectionName: string
  topK: number
  embeddingModel: string
}

export interface RouterNodeData extends BaseNodeData {
  nodeType: 'router'
  condition: string
  routes: Array<{ label: string; target: string }>
}

export interface HumanGateNodeData extends BaseNodeData {
  nodeType: 'human_gate'
  prompt: string
  timeoutSeconds: number
  approvalRequired: boolean
}

export type AnyNodeData =
  | AgentNodeData
  | ToolNodeData
  | MemoryNodeData
  | RouterNodeData
  | HumanGateNodeData

// ─── Graph Schema ────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string
  type: NodeType
  position: { x: number; y: number }
  data: AnyNodeData
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  label?: string
  type?: 'default' | 'conditional'
  condition?: string
}

export interface GraphSchema {
  nodes: GraphNode[]
  edges: GraphEdge[]
  viewport?: { x: number; y: number; zoom: number }
}

// ─── Run / Execution Types ───────────────────────────────────────────────────

export type RunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'AWAITING_HUMAN'
  | 'COMPLETE'
  | 'FAILED'

export type TraceEventType =
  | 'NODE_START'
  | 'TOKEN_CHUNK'
  | 'NODE_END'
  | 'GATE_PENDING'
  | 'GATE_RESOLVED'
  | 'COMPLETE'
  | 'ERROR'

export interface TraceEvent {
  type: TraceEventType
  nodeId?: string
  payload: Record<string, unknown>
  sequence: number
  ts: string
}

/** NODE_END payload: usage of the messages the node wrote to state, and its wall time. */
export interface NodeRunStats {
  inputTokens: number
  outputTokens: number
  durationMs: number
}

export interface RunMetadata {
  id: string
  graphId: string
  graphVersion: number
  status: RunStatus
  inputPayload: Record<string, unknown>
  outputPayload?: Record<string, unknown>
  errorMessage?: string
  durationMs?: number
  tokenCount?: number
  createdAt: string
}

// ─── Test Cases ──────────────────────────────────────────────────────────────

export type TestResult = 'PASS' | 'FAIL' | 'PENDING'

export interface TestCase {
  id: string
  graphId: string
  name: string
  inputPayload: Record<string, unknown>
  /** Node ids that must have run, compared as a set (parallel branches have no order). Empty = not checked. */
  expectedPath: string[]
  /** Case-insensitive text the final output must contain. Null = not checked. */
  expectedOutputContains: string | null
  lastResult: TestResult | null
  lastRunId: string | null
  createdAt: string
}

// ─── Graph Store Entry ───────────────────────────────────────────────────────

export interface GraphEntry {
  id: string
  name: string
  description?: string
  version: number
  isDeployed: boolean
  nodeCount: number
  lastRunAt?: string
  lastRunStatus?: RunStatus
  createdAt: string
  updatedAt: string
}

// ─── Node Visual System ──────────────────────────────────────────────────────

export interface NodeColorConfig {
  primary: string       // Main accent color
  bg: string            // Card background tint
  glow: string          // Glow/shadow color
  border: string        // Border color
  label: string         // Label text color
  gradient: string      // Gradient for accent strip
  handleBorder: string  // Handle ring color
}

export const NODE_COLORS: Record<NodeType, NodeColorConfig> = {
  agent: {
    primary:     '#9B8AFF',
    bg:          'rgba(155, 138, 255, 0.08)',
    glow:        'rgba(155, 138, 255, 0.15)',
    border:      'rgba(155, 138, 255, 0.20)',
    label:       'rgba(155, 138, 255, 0.80)',
    gradient:    'linear-gradient(90deg, #9B8AFF, #C4B8FF)',
    handleBorder:'rgba(155, 138, 255, 0.5)',
  },
  tool: {
    primary:     '#5CA4FF',
    bg:          'rgba(92, 164, 255, 0.08)',
    glow:        'rgba(92, 164, 255, 0.15)',
    border:      'rgba(92, 164, 255, 0.20)',
    label:       'rgba(92, 164, 255, 0.80)',
    gradient:    'linear-gradient(90deg, #5CA4FF, #8EC4FF)',
    handleBorder:'rgba(92, 164, 255, 0.5)',
  },
  memory: {
    primary:     '#00E5C3',
    bg:          'rgba(0, 229, 195, 0.07)',
    glow:        'rgba(0, 229, 195, 0.12)',
    border:      'rgba(0, 229, 195, 0.18)',
    label:       'rgba(0, 229, 195, 0.80)',
    gradient:    'linear-gradient(90deg, #00E5C3, #5CFFE0)',
    handleBorder:'rgba(0, 229, 195, 0.5)',
  },
  router: {
    primary:     '#FFB547',
    bg:          'rgba(255, 181, 71, 0.08)',
    glow:        'rgba(255, 181, 71, 0.12)',
    border:      'rgba(255, 181, 71, 0.20)',
    label:       'rgba(255, 181, 71, 0.80)',
    gradient:    'linear-gradient(90deg, #FFB547, #FFD08A)',
    handleBorder:'rgba(255, 181, 71, 0.5)',
  },
  human_gate: {
    primary:     '#FF6B81',
    bg:          'rgba(255, 107, 129, 0.08)',
    glow:        'rgba(255, 107, 129, 0.12)',
    border:      'rgba(255, 107, 129, 0.20)',
    label:       'rgba(255, 107, 129, 0.80)',
    gradient:    'linear-gradient(90deg, #FF6B81, #FFA0B0)',
    handleBorder:'rgba(255, 107, 129, 0.5)',
  },
}

export const NODE_LABELS: Record<NodeType, string> = {
  agent:      'Agent',
  tool:       'Tool',
  memory:     'Memory',
  router:     'Router',
  human_gate: 'Human Gate',
}

export const NODE_DESCRIPTIONS: Record<NodeType, string> = {
  agent:      'LLM agent with model, prompt & tools',
  tool:       'Python function with typed I/O',
  memory:     'Vector / graph retrieval store',
  router:     'Conditional branching logic',
  human_gate: 'Human approval checkpoint',
}

// `value` is what the editor saves; `apiModel` is the id the provider's API expects
// (emitted into generated code by the transpiler).
export const AVAILABLE_MODELS = [
  // Hosted APIs
  { value: 'gpt-4o',               label: 'GPT-4o',                provider: 'OpenAI',    apiModel: 'gpt-4o' },
  { value: 'gpt-4o-mini',          label: 'GPT-4o Mini',           provider: 'OpenAI',    apiModel: 'gpt-4o-mini' },
  { value: 'claude-opus-5-5',      label: 'Claude Opus 5.5',       provider: 'Anthropic', apiModel: 'claude-opus-5-5' },
  { value: 'claude-sonnet-5-5',    label: 'Claude Sonnet 5.5',     provider: 'Anthropic', apiModel: 'claude-sonnet-5-5' },
  { value: 'claude-haiku-5-5',     label: 'Claude Haiku 5.5',      provider: 'Anthropic', apiModel: 'claude-haiku-5-5' },
  { value: 'mistral-small-latest', label: 'Mistral Small',         provider: 'Mistral',   apiModel: 'mistral-small-latest' },
  { value: 'mistral-large-latest', label: 'Mistral Large',         provider: 'Mistral',   apiModel: 'mistral-large-latest' },
  // Local via Ollama
  { value: 'llama3:70b',           label: 'Llama 3 70B (local)',   provider: 'Ollama',    apiModel: 'llama3:70b' },
  // Open-source via HuggingFace Inference API
  { value: 'llama-3.3-70b',        label: 'Llama 3.3 70B Instruct', provider: 'HuggingFace', apiModel: 'meta-llama/Llama-3.3-70B-Instruct' },
  { value: 'mistral-small-3',      label: 'Mistral Small 3 (24B)',  provider: 'HuggingFace', apiModel: 'mistralai/Mistral-Small-24B-Instruct-2501' },
  { value: 'qwen-2.5-72b',         label: 'Qwen 2.5 72B Instruct',  provider: 'HuggingFace', apiModel: 'Qwen/Qwen2.5-72B-Instruct' },
  { value: 'deepseek-v3',          label: 'DeepSeek V3',            provider: 'HuggingFace', apiModel: 'deepseek-ai/DeepSeek-V3' },
  { value: 'phi-4',                label: 'Phi-4 (14B)',            provider: 'HuggingFace', apiModel: 'microsoft/phi-4' },
] as const

/** USD per 1M tokens — approximate; update as needed. Keyed by `AVAILABLE_MODELS[].value`. */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Hosted APIs
  'gpt-4o':            { input: 2.5,  output: 10  },
  'gpt-4o-mini':       { input: 0.15, output: 0.6 },
  'claude-opus-5-5':   { input: 4,    output: 20  },
  'claude-sonnet-5-5': { input: 2,    output: 10  },
  'claude-haiku-5-5':  { input: 0.1,  output: 0.5 }, // prompts ≤100K tokens; $0.50/$2.50 beyond
  'mistral-small-latest': { input: 0.1, output: 0.3 },
  'mistral-large-latest': { input: 2, output: 6 },
  'llama3:70b':        { input: 0,    output: 0   }, // local via Ollama
  // HuggingFace Inference API (approximate rates)
  'llama-3.3-70b':     { input: 0.88, output: 0.88 },
  'mistral-small-3':   { input: 0.20, output: 0.20 },
  'qwen-2.5-72b':      { input: 1.20, output: 1.20 },
  'deepseek-v3':       { input: 0.27, output: 1.10 },
  'phi-4':             { input: 0.07, output: 0.07 },
}

/** Estimated cost of a node's usage; undefined when the model (or its price) is unknown. */
export function costUsd(model: string | undefined, stats: NodeRunStats): number | undefined {
  const price = model ? MODEL_PRICING[model] : undefined
  return price ? (stats.inputTokens * price.input + stats.outputTokens * price.output) / 1e6 : undefined
}

/** Retired/renamed model values that may still be in saved graphs → current value. */
export const LEGACY_MODEL_ALIASES: Record<string, string> = {
  'claude-3-5-sonnet': 'claude-sonnet-5-5',
  'claude-3-opus':     'claude-opus-5-5',
  'claude-3-haiku':    'claude-haiku-5-5',
  'mistral-7b':        'mistral-small-latest',
  'mistral-large':     'mistral-large-latest',
  'llama-3-70b':       'llama3:70b',
}
