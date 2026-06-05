import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import {
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react'
import type { AnyNodeData, GraphSchema, NodeType, RunStatus } from '@/lib/types'

// ─── Types ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppNode = Node<any>
export type AppEdge = Edge

interface GraphState {
  // Graph identity
  graphId: string | null
  graphName: string
  graphVersion: number
  isDirty: boolean
  isSaving: boolean

  // Canvas state
  nodes: AppNode[]
  edges: AppEdge[]

  // Selection
  selectedNodeId: string | null

  // Run state
  activeRunId: string | null
  runStatus: RunStatus | null
  activeNodeIds: Set<string>
  completedNodeIds: Set<string>
  failedNodeIds: Set<string>
}

interface GraphActions {
  // Canvas mutations
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void

  // Node CRUD
  addNode: (type: NodeType, position: { x: number; y: number }) => void
  updateNodeData: (nodeId: string, data: Partial<AnyNodeData>) => void
  deleteNode: (nodeId: string) => void
  duplicateNode: (nodeId: string) => void

  // Selection
  setSelectedNode: (nodeId: string | null) => void

  // Graph metadata
  setGraphId: (id: string) => void
  setGraphName: (name: string) => void
  setGraphVersion: (version: number) => void
  markDirty: () => void
  markSaved: () => void

  // Execution state
  setRunState: (runId: string, status: RunStatus) => void
  setNodeActive: (nodeId: string) => void
  setNodeComplete: (nodeId: string) => void
  setNodeFailed: (nodeId: string) => void
  clearRunState: () => void

  // Load graph
  loadGraph: (schema: GraphSchema, meta: { id: string; name: string; version: number }) => void
}

// ─── Default node data factories ─────────────────────────────────────────────

const defaultNodeData = (type: NodeType, label: string): AnyNodeData => {
  switch (type) {
    case 'agent':
      return {
        nodeType: 'agent',
        label,
        model: 'gpt-4o',
        systemPrompt: 'You are a helpful assistant.',
        temperature: 0.7,
        maxTokens: 1024,
        tools: [],
      }
    case 'tool':
      return {
        nodeType: 'tool',
        label,
        functionName: 'my_tool',
        description: 'A tool that does something useful.',
        parameterSchema: { query: { type: 'string', description: 'The input query' } },
        returnType: 'string',
      }
    case 'memory':
      return {
        nodeType: 'memory',
        label,
        backend: 'qdrant',
        collectionName: 'default',
        topK: 5,
        embeddingModel: 'text-embedding-3-small',
      }
    case 'router':
      return {
        nodeType: 'router',
        label,
        condition: 'state["next"]',
        routes: [
          { label: 'path_a', target: '' },
          { label: 'path_b', target: '' },
        ],
      }
    case 'human_gate':
      return {
        nodeType: 'human_gate',
        label,
        prompt: 'Please review the output and approve or reject.',
        timeoutSeconds: 300,
        approvalRequired: true,
      }
  }
}

// ─── Counter for unique IDs ───────────────────────────────────────────────────

let nodeCounter = 0
const newNodeId = () => `node_${Date.now()}_${++nodeCounter}`

// ─── Store ───────────────────────────────────────────────────────────────────

export const useGraphStore = create<GraphState & GraphActions>()(
  immer((set, get) => ({
    // Initial state
    graphId: null,
    graphName: 'Untitled Graph',
    graphVersion: 1,
    isDirty: false,
    isSaving: false,
    nodes: [],
    edges: [],
    selectedNodeId: null,
    activeRunId: null,
    runStatus: null,
    activeNodeIds: new Set(),
    completedNodeIds: new Set(),
    failedNodeIds: new Set(),

    // ── Canvas mutations ──────────────────────────────────────────────────
    onNodesChange: (changes) =>
      set((state) => {
        state.nodes = applyNodeChanges(changes, state.nodes) as AppNode[]
        // Mark dirty on move/resize but not selection changes
        const hasMutation = changes.some(
          (c) => c.type === 'position' || c.type === 'dimensions' || c.type === 'remove'
        )
        if (hasMutation) state.isDirty = true
      }),

    onEdgesChange: (changes) =>
      set((state) => {
        state.edges = applyEdgeChanges(changes, state.edges)
        state.isDirty = true
      }),

    onConnect: (connection) =>
      set((state) => {
        state.edges = addEdge(
          { ...connection, type: 'smoothstep', animated: false },
          state.edges
        )
        state.isDirty = true
      }),

    // ── Node CRUD ─────────────────────────────────────────────────────────
    addNode: (type, position) =>
      set((state) => {
        const label = `${type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')} ${
          state.nodes.filter((n) => n.data.nodeType === type).length + 1
        }`
        const newNode: AppNode = {
          id: newNodeId(),
          type,
          position,
          data: defaultNodeData(type, label),
        }
        state.nodes.push(newNode)
        state.isDirty = true
      }),

    updateNodeData: (nodeId, data) =>
      set((state) => {
        const node = state.nodes.find((n) => n.id === nodeId)
        if (node) {
          Object.assign(node.data, data)
          state.isDirty = true
        }
      }),

    deleteNode: (nodeId) =>
      set((state) => {
        state.nodes = state.nodes.filter((n) => n.id !== nodeId)
        state.edges = state.edges.filter(
          (e) => e.source !== nodeId && e.target !== nodeId
        )
        if (state.selectedNodeId === nodeId) state.selectedNodeId = null
        state.isDirty = true
      }),

    duplicateNode: (nodeId) =>
      set((state) => {
        const node = state.nodes.find((n) => n.id === nodeId)
        if (!node) return
        const duplicate: AppNode = {
          ...node,
          id: newNodeId(),
          position: { x: node.position.x + 40, y: node.position.y + 40 },
          data: { ...node.data, label: `${node.data.label} (copy)` },
        }
        state.nodes.push(duplicate)
        state.isDirty = true
      }),

    // ── Selection ─────────────────────────────────────────────────────────
    setSelectedNode: (nodeId) =>
      set((state) => {
        state.selectedNodeId = nodeId
      }),

    // ── Graph metadata ────────────────────────────────────────────────────
    setGraphId: (id) => set((state) => { state.graphId = id }),
    setGraphName: (name) => set((state) => { state.graphName = name; state.isDirty = true }),
    setGraphVersion: (version) => set((state) => { state.graphVersion = version }),
    markDirty: () => set((state) => { state.isDirty = true }),
    markSaved: () => set((state) => { state.isDirty = false; state.isSaving = false }),

    // ── Execution state ───────────────────────────────────────────────────
    setRunState: (runId, status) =>
      set((state) => {
        state.activeRunId = runId
        state.runStatus = status
      }),

    setNodeActive: (nodeId) =>
      set((state) => {
        state.activeNodeIds.add(nodeId)
        state.completedNodeIds.delete(nodeId)
        state.failedNodeIds.delete(nodeId)
      }),

    setNodeComplete: (nodeId) =>
      set((state) => {
        state.activeNodeIds.delete(nodeId)
        state.completedNodeIds.add(nodeId)
      }),

    setNodeFailed: (nodeId) =>
      set((state) => {
        state.activeNodeIds.delete(nodeId)
        state.failedNodeIds.add(nodeId)
      }),

    clearRunState: () =>
      set((state) => {
        state.activeRunId = null
        state.runStatus = null
        state.activeNodeIds = new Set()
        state.completedNodeIds = new Set()
        state.failedNodeIds = new Set()
      }),

    // ── Load graph ────────────────────────────────────────────────────────
    loadGraph: (schema, meta) =>
      set((state) => {
        state.graphId = meta.id
        state.graphName = meta.name
        state.graphVersion = meta.version
        state.nodes = schema.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data,
        })) as AppNode[]
        state.edges = schema.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          label: e.label,
          type: 'smoothstep',
        }))
        state.isDirty = false
        state.selectedNodeId = null
      }),
  }))
)

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectSelectedNode = (state: GraphState & GraphActions) =>
  state.selectedNodeId
    ? state.nodes.find((n) => n.id === state.selectedNodeId) ?? null
    : null
