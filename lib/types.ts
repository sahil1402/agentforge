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

export const AVAILABLE_MODELS = [
  // Hosted APIs
  { value: 'gpt-4o',               label: 'GPT-4o',                provider: 'OpenAI' },
  { value: 'gpt-4o-mini',          label: 'GPT-4o Mini',           provider: 'OpenAI' },
  { value: 'claude-3-5-sonnet',    label: 'Claude 3.5 Sonnet',     provider: 'Anthropic' },
  { value: 'claude-3-opus',        label: 'Claude 3 Opus',         provider: 'Anthropic' },
  { value: 'claude-3-haiku',       label: 'Claude 3 Haiku',        provider: 'Anthropic' },
  { value: 'mistral-7b',           label: 'Mistral 7B',            provider: 'Mistral' },
  { value: 'mistral-large',        label: 'Mistral Large',         provider: 'Mistral' },
  { value: 'llama-3-70b',          label: 'Llama 3 70B',           provider: 'Meta' },
  // Open-source via HuggingFace Inference API
  { value: 'llama-3.3-70b',        label: 'Llama 3.3 70B Instruct', provider: 'HuggingFace' },
  { value: 'mistral-small-3',      label: 'Mistral Small 3 (24B)',  provider: 'HuggingFace' },
  { value: 'qwen-2.5-72b',         label: 'Qwen 2.5 72B Instruct',  provider: 'HuggingFace' },
  { value: 'deepseek-v3',          label: 'DeepSeek V3',            provider: 'HuggingFace' },
  { value: 'phi-4',                label: 'Phi-4 (14B)',            provider: 'HuggingFace' },
] as const
