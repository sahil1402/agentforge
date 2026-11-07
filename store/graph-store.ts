import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { enableMapSet } from 'immer'
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
import { LEGACY_MODEL_ALIASES, type AnyNodeData, type GraphSchema, type NodeRunStats, type NodeType, type RouterNodeData, type RunStatus } from '@/lib/types'

// Run state keeps node ids in Sets, which immer only drafts with this plugin.
enableMapSet()

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
  nodeStats: Record<string, NodeRunStats>
  runError: string | null // message of the ERROR that ended the run (shown on the blamed node)
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
  setRunState: (runId: string, status: RunStatus, error?: string) => void
  setNodeActive: (nodeId: string) => void
  setNodeComplete: (nodeId: string, stats?: NodeRunStats) => void
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
        functionName: 'web_search',
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
        condition: '"path_a" if "yes" in last.lower() else "path_b"',
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

// ─── Router edges ────────────────────────────────────────────────────────────

/**
 * Make a router's outgoing edges match its routes: one edge per route, leaving
 * from the route's handle (handle id = route label). Routes are the source of
 * truth, so renaming or retargeting a route never leaves a dangling edge.
 */
function syncRouterEdges(state: { nodes: AppNode[]; edges: AppEdge[] }, routerId: string) {
  const router = state.nodes.find((n) => n.id === routerId)
  if (!router || router.data.nodeType !== 'router') return
  const routes = (router.data as RouterNodeData).routes.filter(
    (r) => r.target && state.nodes.some((n) => n.id === r.target),
  )
  const kept = state.edges.filter((e) => e.source !== routerId || !e.sourceHandle)
  const routed = routes.map((r) =>
    state.edges.find((e) => e.source === routerId && e.sourceHandle === r.label && e.target === r.target) ?? {
      id: `${routerId}-${r.label}-${r.target}`,
      source: routerId,
      target: r.target,
      sourceHandle: r.label,
      type: 'smoothstep',
    },
  )
  state.edges = [...kept, ...routed]
}

// ─── Counter for unique IDs ───────────────────────────────────────────────────

let nodeCounter = 0
const newNodeId = () => `node_${Date.now()}_${++nodeCounter}`

// ─── Store ───────────────────────────────────────────────────────────────────

export const useGraphStore = create<GraphState & GraphActions>()(
  immer((set) => ({
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
    nodeStats: {},
    runError: null,

    // ── Canvas mutations ──────────────────────────────────────────────────
    onNodesChange: (changes) =>
      set((state) => {
        state.nodes = applyNodeChanges(changes, state.nodes) as AppNode[]
        // Mark dirty on move/resize/remove — not on selection, and not on React Flow's
        // initial node measurement (a 'dimensions' change without `resizing`).
        const hasMutation = changes.some(
          (c) => c.type === 'position' || (c.type === 'dimensions' && c.resizing) || c.type === 'remove'
        )
        if (hasMutation) state.isDirty = true
      }),

    onEdgesChange: (changes) =>
      set((state) => {
        // Deleting a route's edge clears that route's target (routes and edges stay in sync).
        for (const c of changes) {
          if (c.type !== 'remove') continue
          const edge = state.edges.find((e) => e.id === c.id)
          const router = edge?.sourceHandle ? state.nodes.find((n) => n.id === edge.source) : undefined
          if (router?.data.nodeType !== 'router') continue
          const route = (router.data as RouterNodeData).routes.find(
            (r) => r.label === edge!.sourceHandle && r.target === edge!.target,
          )
          if (route) route.target = ''
        }
        state.edges = applyEdgeChanges(changes, state.edges)
        // Selection changes are not edits.
        if (changes.some((c) => c.type !== 'select')) state.isDirty = true
      }),

    onConnect: (connection) =>
      set((state) => {
        // Dragging from a router's route handle (re)targets that route.
        const source = state.nodes.find((n) => n.id === connection.source)
        const route = source?.data.nodeType === 'router' && connection.sourceHandle
          ? (source.data as RouterNodeData).routes.find((r) => r.label === connection.sourceHandle)
          : undefined
        if (route) {
          route.target = connection.target
          syncRouterEdges(state, source!.id)
        } else {
          state.edges = addEdge(
            { ...connection, type: 'smoothstep', animated: false },
            state.edges
          )
        }
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
          if ('routes' in data) syncRouterEdges(state, nodeId)
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
    setRunState: (runId, status, error) =>
      set((state) => {
        state.activeRunId = runId
        state.runStatus = status
        state.runError = error ?? null
        if (status === 'FAILED') { // branches still running were killed with the run
          for (const id of state.activeNodeIds) state.failedNodeIds.add(id)
          state.activeNodeIds.clear()
        }
      }),

    setNodeActive: (nodeId) =>
      set((state) => {
        state.activeNodeIds.add(nodeId)
        state.completedNodeIds.delete(nodeId)
        state.failedNodeIds.delete(nodeId)
        delete state.nodeStats[nodeId]
      }),

    setNodeComplete: (nodeId, stats) =>
      set((state) => {
        state.activeNodeIds.delete(nodeId)
        state.completedNodeIds.add(nodeId)
        if (stats) state.nodeStats[nodeId] = stats
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
        state.nodeStats = {}
        state.runError = null
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
          // Upgrade retired model values; persisted on the next save.
          data: n.data.nodeType === 'agent' && LEGACY_MODEL_ALIASES[n.data.model]
            ? { ...n.data, model: LEGACY_MODEL_ALIASES[n.data.model] }
            : n.data,
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
