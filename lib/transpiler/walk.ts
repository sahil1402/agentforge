// ─── Graph walk: validation + execution plan ───────────────────────────────────
//
// Turns a saved graph into a validated, template-agnostic {@link GraphPlan}. One
// general walk covers every supported pattern, because each node kind is
// self-contained and composes with the others:
//
//   agent       → a StateGraph node. Tools attached to it run in a loop *inside*
//                 the node, so a tool-using agent composes like any other agent.
//   human_gate  → a StateGraph node that calls interrupt() (raises on reject).
//   router      → NOT a node: a routing function + add_conditional_edges on the
//                 router's single predecessor (or START).
//   tool        → NOT a node: attached to every agent it shares an edge with.
//
// Wiring: plain edges for chains and parallel fan-out; fan-in waits for all
// incoming branches (a join) unless the graph routes, where fan-in can only be
// exclusive branches reconverging (plain edges).
//
// IMPORTANT: `edge.type` is NOT semantic in saved graphs — the editor store
// hard-codes `type: 'smoothstep'` (a React Flow visual type). Structure is derived
// purely from topology and node `type`.

import type { GraphSchema, GraphNode, NodeType, RouterNodeData, ToolNodeData, AgentNodeData } from '@/lib/types'
import { TranspileError } from './errors'

/** A tool from the registry (DB `tools` table) — `code` defines a function named `name`. */
export interface RegistryTool {
  name: string
  description: string
  code: string
}

export interface RouterBranch {
  /** Route key returned by the routing function; the conditional-map key. */
  label: string
  /** Destination node id (agent or human gate). */
  target: string
}

export interface PlanRouter {
  node: GraphNode
  /** Raw Python expression; must evaluate to one of the branch labels. */
  condition: string
  branches: RouterBranch[]
}

export interface PlanStep {
  kind: 'agent' | 'human_gate'
  node: GraphNode
  /** Registry tools this agent can call (always empty for gates). */
  tools: RegistryTool[]
}

/** Edge endpoints are node ids, or 'START' / 'END'. */
export interface GraphPlan {
  /** StateGraph nodes (agents + gates) in topological order. */
  steps: PlanStep[]
  routers: PlanRouter[]
  /** Plain edges, in emission order. */
  edges: Array<{ from: string; to: string }>
  /** Fan-in joins: `to` runs once every `from` has finished. */
  joins: Array<{ from: string[]; to: string }>
  /** Conditional edges: `from` (a node id or 'START') → router id. */
  conditionals: Array<{ from: string; router: string }>
  /** Every registry tool used anywhere, deduplicated. */
  tools: RegistryTool[]
  /** Node ids (routers included) in execution order. */
  order: string[]
}

function nodeKind(node: GraphNode): NodeType {
  // Prefer the top-level `type`; fall back to `data.nodeType`. Both are written
  // by the editor and normally agree.
  return (node.type ?? node.data?.nodeType) as NodeType
}

const labelOf = (node: GraphNode) => node.data?.label ?? node.id

/**
 * Validate a saved graph and return its execution plan.
 * `registry` is the tool registry that agent / tool-node tool names resolve against.
 * Throws {@link TranspileError} for unsupported or malformed graphs.
 */
export function plan(graph: GraphSchema, registry: RegistryTool[] = []): GraphPlan {
  const nodes = graph.nodes ?? []
  const edges = graph.edges ?? []
  if (nodes.length === 0) {
    throw new TranspileError('EMPTY_GRAPH', 'Graph has no nodes to transpile.')
  }

  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) {
      throw new TranspileError('DISCONNECTED', `Edge "${e.id}" references a node that no longer exists.`)
    }
  }

  for (const node of nodes) {
    const kind = nodeKind(node)
    if (kind === 'memory') {
      throw new TranspileError('UNSUPPORTED_NODE', `Node "${labelOf(node)}" is a memory node. Memory nodes are not supported yet.`)
    }
    if (!['agent', 'human_gate', 'router', 'tool'].includes(kind)) {
      throw new TranspileError('UNSUPPORTED_NODE', `Node "${labelOf(node)}" has unknown type "${kind}".`)
    }
  }

  // 1. Tools: agent config (`data.tools`) + tool nodes on the canvas.
  const toolsByAgent = attachTools(nodes, edges, byId, registry)

  // 2. Control graph: everything except tool nodes and their edges.
  const isTool = (id: string) => nodeKind(byId.get(id)!) === 'tool'
  const control = nodes.filter((n) => !isTool(n.id))
  const controlEdges = edges.filter((e) => !isTool(e.source) && !isTool(e.target))

  const succ = new Map<string, string[]>(control.map((n) => [n.id, []]))
  const pred = new Map<string, string[]>(control.map((n) => [n.id, []]))
  for (const e of controlEdges) {
    succ.get(e.source)!.push(e.target)
    pred.get(e.target)!.push(e.source)
  }

  // 3. Routers: validate, and order each router's successors by route.
  const routers = control.filter((n) => nodeKind(n) === 'router').map((r) => planRouter(r, byId, succ, pred))
  for (const r of routers) succ.set(r.node.id, r.branches.map((b) => b.target))
  const routerIds = new Set(routers.map((r) => r.node.id))

  for (const n of control) {
    if (routerIds.has(n.id)) continue
    const out = succ.get(n.id)!
    if (out.some((t) => routerIds.has(t)) && out.length > 1) {
      throw new TranspileError(
        'NOT_LINEAR',
        `"${labelOf(n)}" feeds a router and other nodes. A node that feeds a router can't also fan out.`,
      )
    }
    if (routers.length > 0 && out.length > 1) {
      throw new TranspileError(
        'NOT_LINEAR',
        `"${labelOf(n)}" fans out in a graph that also routes. Combining parallel fan-out with routers isn't supported yet.`,
      )
    }
  }

  // 4. Exactly one entry node.
  const entries = control.filter((n) => pred.get(n.id)!.length === 0)
  if (entries.length !== 1) {
    throw new TranspileError(
      'NOT_LINEAR',
      `Graph must have exactly one entry node (found ${entries.length}). Connect every node into a single flow.`,
    )
  }

  // 5. Topological order (Kahn). Anything left over sits on a cycle.
  const inDeg = new Map(control.map((n) => [n.id, pred.get(n.id)!.length]))
  const order: string[] = []
  const queue = [entries[0].id]
  while (queue.length > 0) {
    const id = queue.shift()!
    order.push(id)
    for (const t of succ.get(id)!) {
      inDeg.set(t, inDeg.get(t)! - 1)
      if (inDeg.get(t) === 0) queue.push(t)
    }
  }
  if (order.length !== control.length) {
    throw new TranspileError('NOT_LINEAR', 'Graph contains a cycle. Loops between nodes are not supported.')
  }

  // 6. Wiring.
  const isJoin = (id: string) => routers.length === 0 && pred.get(id)!.length > 1
  const planEdges: GraphPlan['edges'] = []
  const conditionals: GraphPlan['conditionals'] = []
  const entry = entries[0].id
  if (routerIds.has(entry)) conditionals.push({ from: 'START', router: entry })
  else planEdges.push({ from: 'START', to: entry })

  const steps: PlanStep[] = []
  for (const id of order) {
    if (routerIds.has(id)) continue
    const node = byId.get(id)!
    steps.push({ kind: nodeKind(node) as PlanStep['kind'], node, tools: toolsByAgent.get(id) ?? [] })

    const out = succ.get(id)!
    if (out.length === 0) planEdges.push({ from: id, to: 'END' })
    else if (routerIds.has(out[0])) conditionals.push({ from: id, router: out[0] })
    else for (const t of out) if (!isJoin(t)) planEdges.push({ from: id, to: t })
  }
  const joins = order.filter(isJoin).map((id) => ({ from: pred.get(id)!, to: id }))

  const tools = [...new Map(steps.flatMap((s) => s.tools).map((t) => [t.name, t])).values()]
  return { steps, routers, edges: planEdges, joins, conditionals, tools, order }
}

/** Resolve each agent's tools from its config and from tool nodes it is wired to. */
function attachTools(
  nodes: GraphNode[],
  edges: GraphSchema['edges'],
  byId: Map<string, GraphNode>,
  registry: RegistryTool[],
): Map<string, RegistryTool[]> {
  const registryByName = new Map(registry.map((t) => [t.name, t]))
  const toolsByAgent = new Map<string, Map<string, RegistryTool>>()
  const add = (agentId: string, tool: RegistryTool) => {
    if (!toolsByAgent.has(agentId)) toolsByAgent.set(agentId, new Map())
    toolsByAgent.get(agentId)!.set(tool.name, tool)
  }
  const resolve = (name: string, owner: string): RegistryTool => {
    const tool = registryByName.get(name)
    if (!tool) {
      throw new TranspileError('UNSUPPORTED_NODE', `${owner} uses tool "${name}", which is not in the tool registry.`)
    }
    if (!new RegExp(`def\\s+${name}\\s*\\(`).test(tool.code)) {
      throw new TranspileError('UNSUPPORTED_NODE', `Registry tool "${name}" must define a Python function named "${name}".`)
    }
    return tool
  }

  for (const node of nodes) {
    if (nodeKind(node) !== 'agent') continue
    for (const name of (node.data as AgentNodeData).tools ?? []) add(node.id, resolve(name, `Agent "${labelOf(node)}"`))
  }

  for (const node of nodes) {
    if (nodeKind(node) !== 'tool') continue
    const incident = edges.filter((e) => e.source === node.id || e.target === node.id)
    if (incident.length === 0) {
      throw new TranspileError('DISCONNECTED', `Tool node "${labelOf(node)}" isn't connected to an agent.`)
    }
    const tool = resolve((node.data as ToolNodeData).functionName, `Tool node "${labelOf(node)}"`)
    for (const e of incident) {
      const other = byId.get(e.source === node.id ? e.target : e.source)!
      if (nodeKind(other) !== 'agent') {
        throw new TranspileError(
          'UNSUPPORTED_NODE',
          `Tool node "${labelOf(node)}" can only connect to agent nodes (it connects to "${labelOf(other)}").`,
        )
      }
      add(other.id, tool)
    }
  }

  return new Map([...toolsByAgent].map(([id, m]) => [id, [...m.values()]]))
}

/** Validate one router's config against the canvas. `data.routes` is authoritative. */
function planRouter(
  router: GraphNode,
  byId: Map<string, GraphNode>,
  succ: Map<string, string[]>,
  pred: Map<string, string[]>,
): PlanRouter {
  const name = labelOf(router)
  const data = router.data as RouterNodeData

  const condition = (data.condition ?? '').trim()
  if (condition.length === 0) {
    throw new TranspileError('UNSUPPORTED_NODE', `Router "${name}" has an empty condition expression.`)
  }

  const routes = data.routes ?? []
  if (routes.length < 2) {
    throw new TranspileError(
      'UNSUPPORTED_NODE',
      `Router "${name}" needs at least 2 routes to branch (found ${routes.length}).`,
    )
  }

  const branches: RouterBranch[] = []
  const seenLabels = new Set<string>()
  for (const r of routes) {
    const label = (r.label ?? '').trim()
    if (label.length === 0) {
      throw new TranspileError('UNSUPPORTED_NODE', `Router "${name}" has a route with an empty label.`)
    }
    if (seenLabels.has(label)) {
      throw new TranspileError('UNSUPPORTED_NODE', `Router "${name}" has a duplicate route label "${label}".`)
    }
    seenLabels.add(label)

    const target = r.target ? byId.get(r.target) : undefined
    if (!target) {
      throw new TranspileError(
        'DISCONNECTED',
        `Route "${label}" points to target "${r.target ?? ''}", which is not a node in the graph.`,
      )
    }
    const kind = nodeKind(target)
    if (kind !== 'agent' && kind !== 'human_gate') {
      throw new TranspileError(
        'UNSUPPORTED_NODE',
        `Route "${label}" target "${labelOf(target)}" must be an agent or human gate node.`,
      )
    }
    branches.push({ label, target: target.id })
  }

  // Routes and canvas must agree: every route has a router→target edge, and no stray edges.
  const outTargets = new Set(succ.get(router.id))
  for (const b of branches) {
    if (!outTargets.has(b.target)) {
      throw new TranspileError(
        'DISCONNECTED',
        `Route "${b.label}" (→ "${labelOf(byId.get(b.target)!)}") has no connecting edge from the router on the canvas.`,
      )
    }
  }
  const branchTargets = new Set(branches.map((b) => b.target))
  for (const t of outTargets) {
    if (!branchTargets.has(t)) {
      throw new TranspileError(
        'DISCONNECTED',
        `Router "${name}" has an edge to "${labelOf(byId.get(t)!)}" that is not one of its routes.`,
      )
    }
  }

  if (pred.get(router.id)!.length > 1) {
    throw new TranspileError(
      'NOT_LINEAR',
      `Router "${name}" has more than one incoming edge. A router routes the output of a single node.`,
    )
  }

  return { node: router, condition, branches }
}
