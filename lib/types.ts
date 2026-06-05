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

// ─── Graph Schema (what we serialize to PostgreSQL) ──────────────────────────

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

// ─── Node color map (used across canvas + sidebar) ───────────────────────────

export const NODE_COLORS: Record<NodeType, { bg: string; border: string; dot: string; label: string }> = {
  agent:      { bg: 'rgba(139,127,254,0.08)', border: 'rgba(139,127,254,0.28)', dot: '#8B7FFE', label: 'rgba(139,127,254,0.7)' },
  tool:       { bg: 'rgba(66,165,245,0.07)',  border: 'rgba(66,165,245,0.25)',  dot: '#42A5F5', label: 'rgba(66,165,245,0.7)' },
  memory:     { bg: 'rgba(15,217,138,0.06)',  border: 'rgba(15,217,138,0.22)',  dot: '#0FD98A', label: 'rgba(15,217,138,0.7)' },
  router:     { bg: 'rgba(255,170,44,0.07)',  border: 'rgba(255,170,44,0.25)',  dot: '#FFAA2C', label: 'rgba(255,170,44,0.7)' },
  human_gate: { bg: 'rgba(255,82,82,0.07)',   border: 'rgba(255,82,82,0.25)',   dot: '#FF5252', label: 'rgba(255,82,82,0.7)' },
}

export const NODE_LABELS: Record<NodeType, string> = {
  agent:      'Agent',
  tool:       'Tool',
  memory:     'Memory',
  router:     'Router',
  human_gate: 'Human Gate',
}

export const AVAILABLE_MODELS = [
  { value: 'gpt-4o',               label: 'GPT-4o',                provider: 'OpenAI' },
  { value: 'gpt-4o-mini',          label: 'GPT-4o Mini',           provider: 'OpenAI' },
  { value: 'claude-3-5-sonnet',    label: 'Claude 3.5 Sonnet',     provider: 'Anthropic' },
  { value: 'claude-3-opus',        label: 'Claude 3 Opus',         provider: 'Anthropic' },
  { value: 'claude-3-haiku',       label: 'Claude 3 Haiku',        provider: 'Anthropic' },
  { value: 'mistral-7b',           label: 'Mistral 7B',            provider: 'Mistral' },
  { value: 'mistral-large',        label: 'Mistral Large',         provider: 'Mistral' },
  { value: 'llama-3-70b',          label: 'Llama 3 70B',           provider: 'Meta' },
] as const
