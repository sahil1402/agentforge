// ─── Linear-chain topological walk ──────────────────────────────────────────────
//
// Piece 1 of 4. This module validates that a saved graph is a *pure linear chain*
// of agent nodes (Agent → Agent → Agent) and returns the nodes in execution order.
//
// It deliberately knows nothing about templating or LangGraph — Pieces 2–4
// (routing / parallel / human-gate) extend the transpiler by adding new render
// paths, not by editing this walk. The only thing that changes here is which
// node types are rejected, and that guard lives in ONE place (`assertAgentOnly`).
//
// IMPORTANT: `edge.type` is NOT semantic in saved graphs — the editor store
// hard-codes `type: 'smoothstep'` (a React Flow visual type). Linearity is
// therefore derived purely from topology (in/out degree) and node `type`.

import type { GraphSchema, GraphNode, NodeType, RouterNodeData } from '@/lib/types'
import { TranspileError } from './errors'

/** Where support for a not-yet-handled node type is coming from. */
const PIECE_FOR: Partial<Record<NodeType, string>> = {
  router: 'Piece 2 (conditional routing)',
  human_gate: 'Piece 4 (human gate)',
}

function nodeKind(node: GraphNode): NodeType {
  // Prefer the top-level `type`; fall back to `data.nodeType`. Both are written
  // by the editor and normally agree.
  return (node.type ?? node.data?.nodeType) as NodeType
}

/** Reject every node Piece 1 does not handle, with a message that says why. */
function assertAgentOnly(nodes: GraphNode[]): void {
  for (const node of nodes) {
    const kind = nodeKind(node)
    if (kind === 'agent') continue

    const label = node.data?.label ?? node.id
    if (kind === 'router' || kind === 'human_gate') {
      throw new TranspileError(
        'UNSUPPORTED_NODE',
        `Node "${label}" is a ${kind} node. Branching / gates are not yet supported — ${PIECE_FOR[kind]}.`,
        PIECE_FOR[kind],
      )
    }
    // tool / memory (or anything else): agent-only chains for now.
    throw new TranspileError(
      'UNSUPPORTED_NODE',
      `Node "${label}" is a ${kind} node. Piece 1 supports agent-only linear chains for now.`,
    )
  }
}

/**
 * Validate the graph is a single linear chain of agent nodes and return those
 * nodes in execution order (start → end). Throws {@link TranspileError} otherwise.
 */
export function linearize(graph: GraphSchema): GraphNode[] {
  const nodes = graph.nodes ?? []
  const edges = graph.edges ?? []

  if (nodes.length === 0) {
    throw new TranspileError('EMPTY_GRAPH', 'Graph has no nodes to transpile.')
  }

  // 1. Guard: only agent nodes. Do this first so a router/gate graph reports the
  //    router/gate reason rather than a generic "not linear" one.
  assertAgentOnly(nodes)

  const ids = new Set(nodes.map((n) => n.id))
  const outDeg = new Map<string, number>()
  const inDeg = new Map<string, number>()
  const next = new Map<string, string>() // source → target (single, valid once we know it's linear)
  for (const id of ids) {
    outDeg.set(id, 0)
    inDeg.set(id, 0)
  }

  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) {
      throw new TranspileError(
        'DISCONNECTED',
        `Edge "${e.id}" references a node that no longer exists.`,
      )
    }
    outDeg.set(e.source, outDeg.get(e.source)! + 1)
    inDeg.set(e.target, inDeg.get(e.target)! + 1)
    next.set(e.source, e.target)
  }

  // 2. Guard: no fan-out / fan-in. A node with 2+ outgoing or incoming edges is
  //    parallel execution (Piece 3), not a linear chain.
  for (const id of ids) {
    if (outDeg.get(id)! > 1 || inDeg.get(id)! > 1) {
      throw new TranspileError(
        'NOT_LINEAR',
        'Graph branches (a node has multiple in/out edges). Parallel fan-out is not yet supported — Piece 3.',
        'Piece 3 (parallel fan-out)',
      )
    }
  }

  // 3. Exactly one start (in-degree 0) and one end (out-degree 0).
  const starts = [...ids].filter((id) => inDeg.get(id) === 0)
  const ends = [...ids].filter((id) => outDeg.get(id) === 0)
  if (starts.length !== 1 || ends.length !== 1) {
    throw new TranspileError(
      'NOT_LINEAR',
      'Graph is not a single linear chain (expected exactly one start and one end node).',
    )
  }

  // 4. Edge count fixes total length: a chain of N nodes has exactly N-1 edges.
  //    Catches cycles and disconnected sub-chains before we even walk.
  if (edges.length !== nodes.length - 1) {
    throw new TranspileError(
      'NOT_LINEAR',
      'Graph is not a single connected linear chain (unexpected number of edges).',
    )
  }

  // 5. Walk start → end following the single outgoing edge each step.
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const order: GraphNode[] = []
  const seen = new Set<string>()
  let cur: string | undefined = starts[0]
  while (cur !== undefined) {
    if (seen.has(cur)) {
      throw new TranspileError('NOT_LINEAR', 'Graph contains a cycle.')
    }
    seen.add(cur)
    order.push(byId.get(cur)!)
    cur = next.get(cur)
  }

  if (order.length !== nodes.length) {
    throw new TranspileError('DISCONNECTED', 'Graph has nodes not connected to the chain.')
  }

  return order
}

// ─── Conditional routing (Piece 2 of 4) ──────────────────────────────────────────
//
// Piece 2 adds ONE router node with 2+ branches on top of Piece 1's linear chain.
// It is layered as a dispatcher (`plan`) that keeps `linearize` (and its Piece 1
// guards) completely untouched: graphs with no router still go through `linearize`,
// so the human-gate and parallel-fan-out rejections above are unchanged. Router
// logic is isolated in `planRouter` so Piece 3 (parallel) can add another arm to
// the union without editing either path.
//
// A router is modelled the idiomatic LangGraph way — a routing *function* plus
// `add_conditional_edges`, NOT a StateGraph node. `data.routes` (label → target)
// is authoritative for the branch map; edges are cross-checked for topology.

export interface RouterBranch {
  /** Route key returned by the routing function; the conditional-map key. */
  label: string
  /** Destination agent node (terminal in Piece 2). */
  target: GraphNode
}

export interface LinearPlan {
  kind: 'linear'
  /** Agent nodes in execution order (start → end). */
  order: GraphNode[]
}

export interface RouterPlan {
  kind: 'router'
  /** Linear agent chain feeding into the router (may be empty → router is entry). */
  prefix: GraphNode[]
  /** The single router node (not emitted as a StateGraph node). */
  router: GraphNode
  /** Raw Python condition expression; must evaluate to one of the branch labels. */
  condition: string
  /** label → terminal branch agent node. */
  branches: RouterBranch[]
}

export type GraphPlan = LinearPlan | RouterPlan

/**
 * Classify a saved graph and return a validated plan for rendering.
 * - 0 routers → linear chain (Piece 1, via {@link linearize}).
 * - 1 router  → conditional routing (Piece 2, via {@link planRouter}).
 * - 2+ routers → not yet supported.
 * Throws {@link TranspileError} for unsupported / malformed graphs.
 */
export function plan(graph: GraphSchema): GraphPlan {
  const nodes = graph.nodes ?? []
  if (nodes.length === 0) {
    throw new TranspileError('EMPTY_GRAPH', 'Graph has no nodes to transpile.')
  }

  const routers = nodes.filter((n) => nodeKind(n) === 'router')
  if (routers.length === 0) {
    return { kind: 'linear', order: linearize(graph) }
  }
  if (routers.length > 1) {
    throw new TranspileError(
      'UNSUPPORTED_NODE',
      `Graph has ${routers.length} router nodes. Only a single router is supported for now — multiple routers are a later piece.`,
    )
  }
  return planRouter(graph, routers[0])
}

/** Reject unsupported node kinds in a router graph (parallel/human-gate stay out). */
function assertRouterGraphKinds(nodes: GraphNode[], router: GraphNode): void {
  for (const node of nodes) {
    if (node.id === router.id) continue
    const kind = nodeKind(node)
    if (kind === 'agent') continue

    const label = node.data?.label ?? node.id
    if (kind === 'human_gate') {
      throw new TranspileError(
        'UNSUPPORTED_NODE',
        `Node "${label}" is a human_gate node. Human gates are not yet supported — ${PIECE_FOR.human_gate}.`,
        PIECE_FOR.human_gate,
      )
    }
    // tool / memory / an unexpected extra router: agents (+ one router) only.
    throw new TranspileError(
      'UNSUPPORTED_NODE',
      `Node "${label}" is a ${kind} node. Router graphs support agent nodes and a single router for now.`,
    )
  }
}

/** Validate the single-router pattern and return a {@link RouterPlan}. */
function planRouter(graph: GraphSchema, router: GraphNode): RouterPlan {
  const nodes = graph.nodes ?? []
  const edges = graph.edges ?? []

  // 1. Node kinds: one router, the rest agents (human-gate → Piece 4, else agent-only).
  assertRouterGraphKinds(nodes, router)

  const ids = new Set(nodes.map((n) => n.id))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const routerLabel = router.data?.label ?? router.id

  // 2. Routing spec is authoritative (data.routes + condition).
  const data = router.data as RouterNodeData
  const condition = (data.condition ?? '').trim()
  if (condition.length === 0) {
    throw new TranspileError('UNSUPPORTED_NODE', `Router "${routerLabel}" has an empty condition expression.`)
  }

  const routes = data.routes ?? []
  if (routes.length < 2) {
    throw new TranspileError(
      'UNSUPPORTED_NODE',
      `Router "${routerLabel}" needs at least 2 routes to branch (found ${routes.length}).`,
    )
  }

  const seenLabels = new Set<string>()
  const branches: RouterBranch[] = []
  for (const r of routes) {
    const label = (r.label ?? '').trim()
    if (label.length === 0) {
      throw new TranspileError('UNSUPPORTED_NODE', `Router "${routerLabel}" has a route with an empty label.`)
    }
    if (seenLabels.has(label)) {
      throw new TranspileError('UNSUPPORTED_NODE', `Router "${routerLabel}" has a duplicate route label "${label}".`)
    }
    seenLabels.add(label)

    if (!r.target || !ids.has(r.target)) {
      throw new TranspileError(
        'DISCONNECTED',
        `Route "${label}" points to target "${r.target ?? ''}", which is not a node in the graph.`,
      )
    }
    const targetNode = byId.get(r.target)!
    if (nodeKind(targetNode) !== 'agent') {
      throw new TranspileError(
        'UNSUPPORTED_NODE',
        `Route "${label}" target "${targetNode.data?.label ?? targetNode.id}" must be an agent node.`,
      )
    }
    branches.push({ label, target: targetNode })
  }

  // 3. Degrees from edges (validate endpoints exist).
  const outDeg = new Map<string, number>()
  const inDeg = new Map<string, number>()
  for (const id of ids) {
    outDeg.set(id, 0)
    inDeg.set(id, 0)
  }
  const routerOutTargets = new Set<string>()
  const nextOf = new Map<string, string>() // non-router source → target (linear)
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) {
      throw new TranspileError('DISCONNECTED', `Edge "${e.id}" references a node that no longer exists.`)
    }
    outDeg.set(e.source, outDeg.get(e.source)! + 1)
    inDeg.set(e.target, inDeg.get(e.target)! + 1)
    if (e.source === router.id) routerOutTargets.add(e.target)
    else nextOf.set(e.source, e.target)
  }

  // 4. Parallel guards stay rejected (Piece 3): non-router fan-out, and any fan-in
  //    (branch reconvergence). Only the router may have out-degree > 1.
  for (const id of ids) {
    if (id !== router.id && outDeg.get(id)! > 1) {
      throw new TranspileError(
        'NOT_LINEAR',
        'A non-router node has multiple outgoing edges (parallel fan-out). Not yet supported — Piece 3.',
        'Piece 3 (parallel fan-out)',
      )
    }
    if (inDeg.get(id)! > 1) {
      throw new TranspileError(
        'NOT_LINEAR',
        'A node has multiple incoming edges (fan-in / branch reconvergence). Not yet supported — Piece 3.',
        'Piece 3 (parallel fan-out)',
      )
    }
  }

  // 5. Edge cross-check: every route has a router→target edge, and the router has
  //    no stray edges to non-route targets (routes and canvas must agree).
  const branchTargetIds = new Set(branches.map((b) => b.target.id))
  for (const b of branches) {
    if (!routerOutTargets.has(b.target.id)) {
      throw new TranspileError(
        'DISCONNECTED',
        `Route "${b.label}" (→ "${b.target.data?.label ?? b.target.id}") has no connecting edge from the router on the canvas.`,
      )
    }
  }
  for (const t of routerOutTargets) {
    if (!branchTargetIds.has(t)) {
      throw new TranspileError(
        'DISCONNECTED',
        `Router "${routerLabel}" has an edge to "${byId.get(t)?.data?.label ?? t}" that is not one of its routes.`,
      )
    }
  }

  // 6. Branch targets are terminal in Piece 2 (each → END).
  for (const b of branches) {
    if (outDeg.get(b.target.id)! > 0) {
      throw new TranspileError(
        'UNSUPPORTED_NODE',
        `Branch "${b.label}" (→ "${b.target.data?.label ?? b.target.id}") continues to another node. Piece 2 keeps branches terminal; branch continuation is a later piece.`,
      )
    }
  }

  // 7. Prefix: a single linear agent chain into the router (or the router is entry).
  const starts = [...ids].filter((id) => inDeg.get(id) === 0)
  if (starts.length !== 1) {
    throw new TranspileError(
      'NOT_LINEAR',
      `A router graph must have exactly one entry node (found ${starts.length}).`,
    )
  }

  const prefix: GraphNode[] = []
  const start = starts[0]
  if (start !== router.id) {
    const seen = new Set<string>()
    let cur: string | undefined = start
    while (cur !== undefined && cur !== router.id) {
      if (seen.has(cur)) {
        throw new TranspileError('NOT_LINEAR', 'Graph contains a cycle before the router.')
      }
      seen.add(cur)
      const node = byId.get(cur)!
      if (nodeKind(node) !== 'agent') {
        throw new TranspileError(
          'UNSUPPORTED_NODE',
          `Node "${node.data?.label ?? node.id}" before the router must be an agent node.`,
        )
      }
      prefix.push(node)
      cur = nextOf.get(cur)
    }
    if (cur !== router.id) {
      throw new TranspileError('NOT_LINEAR', 'The path from the entry node does not lead into the router.')
    }
  }

  // 8. Connectivity: every node is prefix, the router, or a branch target.
  const accounted = new Set<string>([router.id, ...prefix.map((n) => n.id), ...branchTargetIds])
  if (accounted.size !== ids.size) {
    throw new TranspileError('DISCONNECTED', 'Graph has nodes not connected to the router flow.')
  }

  return { kind: 'router', prefix, router, condition, branches }
}
