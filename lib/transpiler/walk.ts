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

import type { GraphSchema, GraphNode, NodeType } from '@/lib/types'
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
