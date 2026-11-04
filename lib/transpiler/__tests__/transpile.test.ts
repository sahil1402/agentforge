import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { transpile } from '@/lib/transpiler/transpile'
import type { RegistryTool } from '@/lib/transpiler/walk'
import { TranspileError } from '@/lib/transpiler/errors'
import type { GraphNode, GraphSchema } from '@/lib/types'
import { getTemplate } from '@/lib/graph-templates'

// ── fixtures ─────────────────────────────────────────────────────────────────

function agentNode(id: string, over: Partial<GraphNode['data']> = {}): GraphNode {
  return {
    id,
    type: 'agent',
    position: { x: 0, y: 0 },
    data: {
      nodeType: 'agent',
      label: id.charAt(0).toUpperCase() + id.slice(1),
      model: 'gpt-4o',
      systemPrompt: 'You are a helpful assistant.',
      temperature: 0.7,
      maxTokens: 1024,
      tools: [],
      ...over,
    },
  } as GraphNode
}

function toolNode(id: string, functionName: string): GraphNode {
  return {
    id, type: 'tool', position: { x: 0, y: 0 },
    data: { nodeType: 'tool', label: id, functionName, description: '', parameterSchema: {}, returnType: 'Any' },
  } as GraphNode
}

function gateNode(id: string, prompt = 'Approve?'): GraphNode {
  return {
    id, type: 'human_gate', position: { x: 0, y: 0 },
    data: { nodeType: 'human_gate', label: id, prompt, timeoutSeconds: 300, approvalRequired: true },
  } as GraphNode
}

/** Mirrors the shape of the seeded registry: each tool's code defines a function of the same name. */
const REGISTRY: RegistryTool[] = [
  { name: 'web_search', description: 'Search the web.',
    code: 'import os\n\nasync def web_search(query: str, max_results: int = 5) -> list[dict]:\n    """Search the web."""\n    return [{"q": query, "key": os.environ.get("K")}]\n' },
  { name: 'http_request', description: 'Fetch a URL.',
    code: 'def http_request(url: str) -> str:\n    return url\n' },
]

const twoNodeChain: GraphSchema = {
  nodes: [
    agentNode('planner', { label: 'Planner', model: 'gpt-4o', systemPrompt: 'You are a research planner.', temperature: 0.3, maxTokens: 1024 }),
    agentNode('writer', { label: 'Writer', model: 'claude-sonnet-5-5', systemPrompt: 'Write the final answer.', temperature: 0.7, maxTokens: 2048 }),
  ],
  edges: [{ id: 'e1', source: 'planner', target: 'writer' }],
}

const threeNodeChain: GraphSchema = {
  nodes: [
    agentNode('planner', { label: 'Planner' }),
    agentNode('researcher', { label: 'Researcher', model: 'claude-sonnet-5-5' }),
    agentNode('writer', { label: 'Writer', model: 'gpt-4o-mini' }),
  ],
  edges: [
    { id: 'e1', source: 'planner', target: 'researcher' },
    { id: 'e2', source: 'researcher', target: 'writer' },
  ],
}

// ── valid chains ─────────────────────────────────────────────────────────────

describe('transpile — valid linear chains', () => {
  test('2-node chain produces a compilable-looking LangGraph module', () => {
    const { code, order } = transpile(twoNodeChain)

    expect(order).toEqual(['planner', 'writer'])

    // Imports: mixed providers pulled in exactly once each.
    expect(code).toContain('from langgraph.graph import StateGraph, START, END')
    expect(code).toContain('from langchain_openai import ChatOpenAI')
    expect(code).toContain('from langchain_anthropic import ChatAnthropic')

    // State definition.
    expect(code).toContain('class AgentState(TypedDict):')
    expect(code).toContain('messages: Annotated[list, add_messages]')

    // Node functions with the right chat class + params.
    expect(code).toContain('def planner(state: AgentState) -> AgentState:')
    expect(code).toContain('ChatOpenAI(model="gpt-4o", temperature=0.3, max_tokens=1024)')
    expect(code).toContain('def writer(state: AgentState) -> AgentState:')
    expect(code).toContain('ChatAnthropic(model="claude-sonnet-5-5", temperature=0.7, max_tokens=2048)')

    // Wiring: START → planner → writer → END, in order.
    expect(code).toContain('builder.add_node("planner", planner)')
    expect(code).toContain('builder.add_node("writer", writer)')
    expect(code).toContain('builder.add_edge(START, "planner")')
    expect(code).toContain('builder.add_edge("planner", "writer")')
    expect(code).toContain('builder.add_edge("writer", END)')
    expect(code.trimEnd().endsWith('graph = builder.compile()')).toBe(true)

    // START comes before the internal edge, which comes before END.
    expect(code.indexOf('add_edge(START')).toBeLessThan(code.indexOf('add_edge("planner", "writer")'))
    expect(code.indexOf('add_edge("planner", "writer")')).toBeLessThan(code.indexOf('add_edge("writer", END)'))
  })

  test('3-node chain wires every consecutive edge in execution order', () => {
    const { code, order } = transpile(threeNodeChain)

    expect(order).toEqual(['planner', 'researcher', 'writer'])

    for (const name of ['planner', 'researcher', 'writer']) {
      expect(code).toContain(`builder.add_node("${name}", ${name})`)
    }
    expect(code).toContain('builder.add_edge(START, "planner")')
    expect(code).toContain('builder.add_edge("planner", "researcher")')
    expect(code).toContain('builder.add_edge("researcher", "writer")')
    expect(code).toContain('builder.add_edge("writer", END)')
  })

  test('a lone agent node is a valid 1-node chain (START → node → END)', () => {
    const single: GraphSchema = { nodes: [agentNode('solo')], edges: [] }
    const { code, order } = transpile(single)
    expect(order).toEqual(['solo'])
    expect(code).toContain('builder.add_edge(START, "solo")')
    expect(code).toContain('builder.add_edge("solo", END)')
  })

  test('system prompts with embedded quotes are safely escaped', () => {
    const tricky: GraphSchema = {
      nodes: [agentNode('a', { systemPrompt: 'Say """hi""" now' })],
      edges: [],
    }
    const { code } = transpile(tricky)
    // The raw triple-quote must not survive unescaped inside the literal.
    expect(code).not.toContain('content="""Say """hi""" now"""')
    expect(code).toContain('\\"\\"\\"hi\\"\\"\\"')
  })
})

// ── guard-clause rejections ──────────────────────────────────────────────────

describe('transpile — guard clauses reject non-linear / unsupported graphs', () => {
  // Routers are handled by Piece 2 now (see the conditional-routing suites below);
  // an under-specified router (a single route → nothing to branch on) is still
  // rejected, but as an invalid router config rather than "not yet supported".
  test('under-specified router (single route) → UNSUPPORTED_NODE', () => {
    const withRouter: GraphSchema = {
      nodes: [
        agentNode('start'),
        { id: 'router', type: 'router', position: { x: 0, y: 0 },
          data: { nodeType: 'router', label: 'Router', condition: "state['x']",
            routes: [{ label: 'a', target: 'start' }] } } as GraphNode,
      ],
      edges: [{ id: 'e1', source: 'start', target: 'router' }],
    }
    const err = captureError(() => transpile(withRouter))
    expect(err.code).toBe('UNSUPPORTED_NODE')
    expect(err.message).toMatch(/router/i)
  })

  test('tool node not wired to any agent → DISCONNECTED', () => {
    const g: GraphSchema = { nodes: [agentNode('a'), toolNode('search', 'web_search')], edges: [] }
    const err = captureError(() => transpile(g, { tools: REGISTRY }))
    expect(err.code).toBe('DISCONNECTED')
    expect(err.message).toMatch(/isn't connected to an agent/)
  })

  test('tool node naming a tool missing from the registry → UNSUPPORTED_NODE', () => {
    const g: GraphSchema = {
      nodes: [agentNode('a'), toolNode('search', 'tavily_search')],
      edges: [{ id: 'e1', source: 'a', target: 'search' }],
    }
    const err = captureError(() => transpile(g, { tools: REGISTRY }))
    expect(err.code).toBe('UNSUPPORTED_NODE')
    expect(err.message).toMatch(/"tavily_search", which is not in the tool registry/)
  })

  test('tool node wired to a non-agent → UNSUPPORTED_NODE', () => {
    const g: GraphSchema = {
      nodes: [agentNode('a'), gateNode('gate'), toolNode('search', 'web_search')],
      edges: [
        { id: 'e1', source: 'a', target: 'gate' },
        { id: 'e2', source: 'gate', target: 'search' },
      ],
    }
    const err = captureError(() => transpile(g, { tools: REGISTRY }))
    expect(err.code).toBe('UNSUPPORTED_NODE')
    expect(err.message).toMatch(/can only connect to agent nodes/)
  })

  test('agent config naming an unknown registry tool → UNSUPPORTED_NODE', () => {
    const g: GraphSchema = { nodes: [agentNode('a', { tools: ['nope'] })], edges: [] }
    const err = captureError(() => transpile(g, { tools: REGISTRY }))
    expect(err.code).toBe('UNSUPPORTED_NODE')
    expect(err.message).toMatch(/"nope", which is not in the tool registry/)
  })

  test('memory node → UNSUPPORTED_NODE', () => {
    const g: GraphSchema = {
      nodes: [agentNode('a'), { id: 'm', type: 'memory', position: { x: 0, y: 0 },
        data: { nodeType: 'memory', label: 'Mem', backend: 'qdrant', collectionName: 'c', topK: 5, embeddingModel: 'e' } } as GraphNode],
      edges: [{ id: 'e1', source: 'a', target: 'm' }],
    }
    const err = captureError(() => transpile(g))
    expect(err.code).toBe('UNSUPPORTED_NODE')
    expect(err.message).toMatch(/memory nodes are not supported yet/i)
  })

  test('cycle → NOT_LINEAR', () => {
    const g: GraphSchema = {
      nodes: [agentNode('a'), agentNode('b'), agentNode('c')],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'c' },
        { id: 'e3', source: 'c', target: 'b' },
      ],
    }
    const err = captureError(() => transpile(g))
    expect(err.code).toBe('NOT_LINEAR')
    expect(err.message).toMatch(/cycle/i)
  })

  test('two disconnected chains → NOT_LINEAR (more than one start/end)', () => {
    const disjoint: GraphSchema = {
      nodes: [agentNode('a'), agentNode('b'), agentNode('c'), agentNode('d')],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'c', target: 'd' },
      ],
    }
    const err = captureError(() => transpile(disjoint))
    expect(err.code).toBe('NOT_LINEAR')
  })

  test('empty graph → EMPTY_GRAPH', () => {
    const err = captureError(() => transpile({ nodes: [], edges: [] }))
    expect(err.code).toBe('EMPTY_GRAPH')
  })

  test('dangling edge → DISCONNECTED', () => {
    const dangling: GraphSchema = {
      nodes: [agentNode('a')],
      edges: [{ id: 'e1', source: 'a', target: 'ghost' }],
    }
    const err = captureError(() => transpile(dangling))
    expect(err.code).toBe('DISCONNECTED')
  })
})

// ── walk unit ─────────────────────────────────────────────────────────────────

describe('execution order', () => {
  test('follows the edges regardless of node array order', () => {
    const shuffled: GraphSchema = {
      nodes: [threeNodeChain.nodes[2], threeNodeChain.nodes[0], threeNodeChain.nodes[1]],
      edges: threeNodeChain.edges,
    }
    expect(transpile(shuffled).order).toEqual(['planner', 'researcher', 'writer'])
  })
})

// ══ Piece 2 — conditional routing ═════════════════════════════════════════════

function routerNode(
  id: string,
  routes: Array<{ label: string; target: string }>,
  condition = "state['intent']",
): GraphNode {
  return {
    id,
    type: 'router',
    position: { x: 0, y: 0 },
    data: { nodeType: 'router', label: id.charAt(0).toUpperCase() + id.slice(1), condition, routes },
  } as GraphNode
}

/** Agent → Router → (Agent A | Agent B), fully wired with router→branch edges. */
const routerGraph: GraphSchema = {
  nodes: [
    agentNode('triage', { label: 'Triage', systemPrompt: 'Classify the request.' }),
    routerNode('router', [
      { label: 'billing', target: 'billing' },
      { label: 'support', target: 'support' },
    ]),
    agentNode('billing', { label: 'Billing', systemPrompt: 'Handle billing.' }),
    agentNode('support', { label: 'Support', systemPrompt: 'Handle support.' }),
  ],
  edges: [
    { id: 'e0', source: 'triage', target: 'router' },
    { id: 'e1', source: 'router', target: 'billing', sourceHandle: 'billing' },
    { id: 'e2', source: 'router', target: 'support', sourceHandle: 'support' },
  ],
}

describe('transpile — valid conditional routing', () => {
  test('3-node router graph emits a routing function + add_conditional_edges', () => {
    const { code, order } = transpile(routerGraph)

    // Execution order includes the router as a logical step.
    expect(order).toEqual(['triage', 'router', 'billing', 'support'])

    // Routing function returns the raw condition expression, with `last` in scope.
    expect(code).toContain('def route_router(state: AgentState) -> str:')
    expect(code).toContain('last = message_text(state["messages"][-1]) if state["messages"] else ""')
    expect(code).toContain("return state['intent']")

    // The router is NOT a StateGraph node — it is edges + a function.
    expect(code).not.toContain('add_node("router"')
    expect(code).toContain('builder.add_node("triage", triage)')
    expect(code).toContain('builder.add_node("billing", billing)')
    expect(code).toContain('builder.add_node("support", support)')

    // Conditional edges attach to the prefix's last node with the label→target map.
    expect(code).toContain('builder.add_edge(START, "triage")')
    expect(code).toContain('builder.add_conditional_edges("triage", route_router, {')
    expect(code).toContain('"billing": "billing",')
    expect(code).toContain('"support": "support",')

    // Terminal branches go to END.
    expect(code).toContain('builder.add_edge("billing", END)')
    expect(code).toContain('builder.add_edge("support", END)')
    expect(code.trimEnd().endsWith('graph = builder.compile()')).toBe(true)

    // Ordering: START edge → conditional edges → END edges.
    expect(code.indexOf('add_edge(START')).toBeLessThan(code.indexOf('add_conditional_edges'))
    expect(code.indexOf('add_conditional_edges')).toBeLessThan(code.indexOf('add_edge("billing", END)'))
  })

  test('router with 3+ branches emits every route in the map', () => {
    const g: GraphSchema = {
      nodes: [
        agentNode('triage', { label: 'Triage' }),
        routerNode('router', [
          { label: 'a', target: 'agent_a' },
          { label: 'b', target: 'agent_b' },
          { label: 'c', target: 'agent_c' },
        ]),
        agentNode('agent_a', { label: 'A' }),
        agentNode('agent_b', { label: 'B' }),
        agentNode('agent_c', { label: 'C' }),
      ],
      edges: [
        { id: 'e0', source: 'triage', target: 'router' },
        { id: 'e1', source: 'router', target: 'agent_a', sourceHandle: 'a' },
        { id: 'e2', source: 'router', target: 'agent_b', sourceHandle: 'b' },
        { id: 'e3', source: 'router', target: 'agent_c', sourceHandle: 'c' },
      ],
    }
    const { code } = transpile(g)
    expect(code).toContain('"a": "agent_a",')
    expect(code).toContain('"b": "agent_b",')
    expect(code).toContain('"c": "agent_c",')
    expect(code).toContain('builder.add_edge("agent_a", END)')
    expect(code).toContain('builder.add_edge("agent_c", END)')
  })

  test('router with no prefix routes conditional edges from START', () => {
    const g: GraphSchema = {
      nodes: [
        routerNode('router', [
          { label: 'x', target: 'a' },
          { label: 'y', target: 'b' },
        ]),
        agentNode('a', { label: 'A' }),
        agentNode('b', { label: 'B' }),
      ],
      edges: [
        { id: 'e1', source: 'router', target: 'a', sourceHandle: 'x' },
        { id: 'e2', source: 'router', target: 'b', sourceHandle: 'y' },
      ],
    }
    const { code } = transpile(g)
    expect(code).toContain('builder.add_conditional_edges(START, route_router, {')
    expect(code).not.toContain('add_edge(START,')
  })
})

describe('transpile — conditional routing guard clauses', () => {
  test('route target that does not exist → DISCONNECTED, clearly', () => {
    const g: GraphSchema = {
      nodes: [
        agentNode('triage', { label: 'Triage' }),
        routerNode('router', [
          { label: 'billing', target: 'billing' },
          { label: 'ghost', target: 'does_not_exist' },
        ]),
        agentNode('billing', { label: 'Billing' }),
      ],
      edges: [
        { id: 'e0', source: 'triage', target: 'router' },
        { id: 'e1', source: 'router', target: 'billing', sourceHandle: 'billing' },
      ],
    }
    const err = captureError(() => transpile(g))
    expect(err.code).toBe('DISCONNECTED')
    expect(err.message).toMatch(/does_not_exist/)
    expect(err.message).toMatch(/not a node/i)
  })

  test('route wired in config but with no edge on the canvas → DISCONNECTED', () => {
    const g: GraphSchema = {
      nodes: [
        agentNode('triage', { label: 'Triage' }),
        routerNode('router', [
          { label: 'billing', target: 'billing' },
          { label: 'support', target: 'support' },
        ]),
        agentNode('billing', { label: 'Billing' }),
        agentNode('support', { label: 'Support' }),
      ],
      edges: [
        { id: 'e0', source: 'triage', target: 'router' },
        { id: 'e1', source: 'router', target: 'billing', sourceHandle: 'billing' },
        // no edge for the "support" route
      ],
    }
    const err = captureError(() => transpile(g))
    expect(err.code).toBe('DISCONNECTED')
    expect(err.message).toMatch(/no connecting edge/i)
  })

  test('parallel fan-out combined with a router → NOT_LINEAR', () => {
    const g: GraphSchema = {
      nodes: [
        agentNode('a', { label: 'A' }),
        agentNode('b', { label: 'B' }),
        agentNode('c', { label: 'C' }),
        routerNode('router', [
          { label: 'x', target: 'd' },
          { label: 'y', target: 'e' },
        ]),
        agentNode('d', { label: 'D' }),
        agentNode('e', { label: 'E' }),
      ],
      edges: [
        // 'a' fans out to b and c — parallel, not a router decision
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'a', target: 'c' },
        { id: 'e3', source: 'b', target: 'router' },
        { id: 'e4', source: 'router', target: 'd', sourceHandle: 'x' },
        { id: 'e5', source: 'router', target: 'e', sourceHandle: 'y' },
      ],
    }
    const err = captureError(() => transpile(g))
    expect(err.code).toBe('NOT_LINEAR')
    expect(err.message).toMatch(/combining parallel fan-out with routers/i)
  })

  test('router routing straight into another router → UNSUPPORTED_NODE', () => {
    const g: GraphSchema = {
      nodes: [
        routerNode('r1', [{ label: 'a', target: 'a' }, { label: 'r2', target: 'r2' }]),
        agentNode('a', { label: 'A' }),
        routerNode('r2', [{ label: 'b', target: 'b' }, { label: 'c', target: 'c' }]),
        agentNode('b', { label: 'B' }),
        agentNode('c', { label: 'C' }),
      ],
      edges: [
        { id: 'e1', source: 'r1', target: 'a', sourceHandle: 'a' },
        { id: 'e2', source: 'r1', target: 'r2', sourceHandle: 'r2' },
        { id: 'e3', source: 'r2', target: 'b', sourceHandle: 'b' },
        { id: 'e4', source: 'r2', target: 'c', sourceHandle: 'c' },
      ],
    }
    const err = captureError(() => transpile(g))
    expect(err.code).toBe('UNSUPPORTED_NODE')
    expect(err.message).toMatch(/must be an agent or human gate/i)
  })

  test('router with fewer than 2 routes → rejected', () => {
    const g: GraphSchema = {
      nodes: [
        agentNode('triage', { label: 'Triage' }),
        routerNode('router', [{ label: 'only', target: 'billing' }]),
        agentNode('billing', { label: 'Billing' }),
      ],
      edges: [
        { id: 'e0', source: 'triage', target: 'router' },
        { id: 'e1', source: 'router', target: 'billing', sourceHandle: 'only' },
      ],
    }
    const err = captureError(() => transpile(g))
    expect(err.code).toBe('UNSUPPORTED_NODE')
    expect(err.message).toMatch(/at least 2 routes/i)
  })
})

// ══ Piece 3 — parallel fan-out / fan-in ═══════════════════════════════════════

describe('transpile — parallel fan-out / fan-in', () => {
  test('fan-out then fan-in emits plain fan-out edges and a single join edge', () => {
    const { code, order } = transpile(getTemplate('code_review'))
    expect(order).toEqual(['analyzer', 'style', 'bugs', 'perf', 'summary'])
    expect(code).toContain('builder.add_edge(START, "analyzer")')
    expect(code).toContain('builder.add_edge("analyzer", "style")')
    expect(code).toContain('builder.add_edge("analyzer", "bugs")')
    expect(code).toContain('builder.add_edge("analyzer", "perf")')
    // The summarizer waits for all three reviewers, so no per-branch edges into it.
    expect(code).toContain('builder.add_edge(["style", "bugs", "perf"], "summary")')
    expect(code).not.toContain('builder.add_edge("style", "summary")')
    expect(code).toContain('builder.add_edge("summary", END)')
  })

  test('fan-out without fan-in ends every branch at END', () => {
    const g: GraphSchema = {
      nodes: [agentNode('a'), agentNode('b'), agentNode('c')],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'a', target: 'c' },
      ],
    }
    const { code } = transpile(g)
    expect(code).toContain('builder.add_edge("b", END)')
    expect(code).toContain('builder.add_edge("c", END)')
  })
})

// ══ Piece 4 — human gate ══════════════════════════════════════════════════════

describe('transpile — human gate', () => {
  const gated: GraphSchema = {
    nodes: [agentNode('draft'), gateNode('review', 'Ship this draft?'), agentNode('publish')],
    edges: [
      { id: 'e1', source: 'draft', target: 'review' },
      { id: 'e2', source: 'review', target: 'publish' },
    ],
  }

  test('a gate is a node that interrupts, and the graph compiles with a checkpointer', () => {
    const { code, order } = transpile(gated)
    expect(order).toEqual(['draft', 'review', 'publish'])
    expect(code).toContain('from langgraph.types import interrupt')
    expect(code).toContain('def review(state: AgentState) -> AgentState:')
    expect(code).toContain('decision = interrupt({"prompt": """Ship this draft?""", "last_output": last, "timeout_seconds": 300})')
    expect(code).toContain('raise GateRejected("Rejected at gate \\"review\\"")')
    expect(code).toContain('builder.add_edge("draft", "review")')
    expect(code).toContain('builder.add_edge("review", "publish")')
    expect(code.trimEnd().endsWith('graph = builder.compile(checkpointer=InMemorySaver())')).toBe(true)
  })

  test('a gate timeout of 0 means wait forever (None)', () => {
    const graph: GraphSchema = { nodes: [gateNode('g')], edges: [] }
    graph.nodes[0].data = { ...graph.nodes[0].data, timeoutSeconds: 0 } as GraphNode['data']
    expect(transpile(graph).code).toContain('"timeout_seconds": None})')
  })

  test('nodeIds maps generated node names back to graph node ids', () => {
    const { nodeIds } = transpile({
      nodes: [agentNode('my-agent'), gateNode('if')],
      edges: [{ id: 'e1', source: 'my-agent', target: 'if' }],
    })
    expect(nodeIds).toEqual({ my_agent: 'my-agent', if_2: 'if' })
  })

  test('graphs without gates do not import interrupt or a checkpointer', () => {
    const { code } = transpile(twoNodeChain)
    expect(code).not.toContain('interrupt')
    expect(code).not.toContain('InMemorySaver')
  })
})

// ══ Tools — attached to agents ════════════════════════════════════════════════

describe('transpile — tools', () => {
  test('tool nodes attach to their agent: async node, bound tools, registry code emitted once', () => {
    const { code, order } = transpile(getTemplate('research'), { tools: REGISTRY })
    // Tool nodes are not steps.
    expect(order).toEqual(['planner', 'synth'])
    expect(code).not.toContain('add_node("search"')
    expect(code).toContain('from langchain_core.tools import tool')
    expect(code).toContain('async def planner(state: AgentState) -> AgentState:')
    expect(code).toContain('tools = [web_search, http_request]')
    expect(code).toContain('.bind_tools(tools)')
    expect(code).toContain('return {"messages": [await run_with_tools(llm, messages, tools)]}')
    // The agent without tools stays a plain sync node.
    expect(code).toContain('def synth(state: AgentState) -> AgentState:')
    expect(code).not.toContain('async def synth')
    // Registry code + wrapping, exactly once per tool.
    expect(code.match(/async def web_search\(/g)).toHaveLength(1)
    expect(code).toContain('web_search = tool(web_search)')
    expect(code).toContain('http_request.__doc__ = http_request.__doc__ or "Fetch a URL."')
    expect(code).toContain('builder.add_edge("planner", "synth")')
  })

  test('tools from agent config and from tool nodes are merged without duplicates', () => {
    const g: GraphSchema = {
      nodes: [agentNode('a', { tools: ['web_search'] }), toolNode('t1', 'web_search'), toolNode('t2', 'http_request')],
      edges: [
        { id: 'e1', source: 't1', target: 'a' },
        { id: 'e2', source: 'a', target: 't2' },
      ],
    }
    const { code } = transpile(g, { tools: REGISTRY })
    expect(code).toContain('tools = [web_search, http_request]')
  })

  test('a node id that collides with a tool name is renamed', () => {
    const g: GraphSchema = { nodes: [agentNode('web_search', { tools: ['web_search'] })], edges: [] }
    const { code } = transpile(g, { tools: REGISTRY })
    expect(code).toContain('builder.add_node("web_search_2", web_search_2)')
  })
})

// ══ Routing — beyond terminal branches ════════════════════════════════════════

describe('transpile — routing combinations', () => {
  test('branches can continue and reconverge (plain edges, not a join)', () => {
    const g: GraphSchema = {
      nodes: [
        agentNode('triage'),
        routerNode('router', [{ label: 'billing', target: 'billing' }, { label: 'support', target: 'support' }]),
        agentNode('billing'),
        agentNode('support'),
        agentNode('tail'),
      ],
      edges: [
        { id: 'e0', source: 'triage', target: 'router' },
        { id: 'e1', source: 'router', target: 'billing' },
        { id: 'e2', source: 'router', target: 'support' },
        { id: 'e3', source: 'billing', target: 'tail' },
        { id: 'e4', source: 'support', target: 'tail' },
      ],
    }
    const { code } = transpile(g)
    // Only one branch runs, so a join would wait forever — reconvergence uses plain edges.
    expect(code).toContain('builder.add_edge("billing", "tail")')
    expect(code).toContain('builder.add_edge("support", "tail")')
    expect(code).not.toContain('add_edge([')
    expect(code).toContain('builder.add_edge("tail", END)')
  })

  test('a route can target a human gate (support template)', () => {
    const { code, order } = transpile(getTemplate('support'))
    expect(order).toEqual(['router', 'faq', 'gate', 'escalation'])
    expect(code).toContain('builder.add_conditional_edges(START, route_router, {')
    expect(code).toContain('"escalate": "gate",')
    expect(code).toContain('return "escalate" if "refund" in last.lower() else "faq"')
    expect(code).toContain('builder.add_edge("gate", "escalation")')
  })

  test('multiple routers in sequence each get their own routing function', () => {
    const g: GraphSchema = {
      nodes: [
        routerNode('r1', [{ label: 'a', target: 'a' }, { label: 'b', target: 'b' }]),
        agentNode('a'),
        agentNode('b'),
        routerNode('r2', [{ label: 'c', target: 'c' }, { label: 'd', target: 'd' }]),
        agentNode('c'),
        agentNode('d'),
      ],
      edges: [
        { id: 'e1', source: 'r1', target: 'a' },
        { id: 'e2', source: 'r1', target: 'b' },
        { id: 'e3', source: 'a', target: 'r2' },
        { id: 'e4', source: 'r2', target: 'c' },
        { id: 'e5', source: 'r2', target: 'd' },
      ],
    }
    const { code } = transpile(g)
    expect(code).toContain('builder.add_conditional_edges(START, route_r1, {')
    expect(code).toContain('builder.add_conditional_edges("a", route_r2, {')
    expect(code).toContain('builder.add_edge("b", END)')
  })

  test('route labels with quotes are emitted as valid string literals', () => {
    const g: GraphSchema = {
      nodes: [routerNode('router', [{ label: 'say "hi"', target: 'a' }, { label: 'b', target: 'b' }]), agentNode('a'), agentNode('b')],
      edges: [{ id: 'e1', source: 'router', target: 'a' }, { id: 'e2', source: 'router', target: 'b' }],
    }
    expect(transpile(g).code).toContain('"say \\"hi\\"": "a",')
  })
})

// ── model resolution ─────────────────────────────────────────────────────────

describe('transpile — model → provider resolution', () => {
  test('legacy model values in saved graphs map to their current API id', () => {
    const { code } = transpile({ nodes: [agentNode('a', { model: 'claude-3-5-sonnet' })], edges: [] })
    expect(code).toContain('ChatAnthropic(model="claude-sonnet-5-5"')
  })

  test('HuggingFace models emit ChatHuggingFace over an endpoint with the repo id', () => {
    const { code } = transpile({ nodes: [agentNode('a', { model: 'qwen-2.5-72b', maxTokens: 512 })], edges: [] })
    expect(code).toContain('from langchain_huggingface import ChatHuggingFace, HuggingFaceEndpoint')
    expect(code).toContain('ChatHuggingFace(llm=HuggingFaceEndpoint(repo_id="Qwen/Qwen2.5-72B-Instruct", temperature=0.7, max_new_tokens=512))')
  })

  test('Ollama models use num_predict for the token limit', () => {
    const { code } = transpile({ nodes: [agentNode('a', { model: 'llama3:70b' })], edges: [] })
    expect(code).toContain('ChatOllama(model="llama3:70b", temperature=0.7, num_predict=1024)')
  })

  test('unknown model → UNSUPPORTED_NODE instead of a silent fallback', () => {
    const err = captureError(() => transpile({ nodes: [agentNode('a', { model: 'gpt-9000' })], edges: [] }))
    expect(err.code).toBe('UNSUPPORTED_NODE')
    expect(err.message).toMatch(/unknown model "gpt-9000"/)
  })
})

// ── generated code is valid Python ───────────────────────────────────────────

const PYTHON = ['python', 'python3'].find((bin) => spawnSync(bin, ['--version']).status === 0)

// Skipped (not failed) on machines without Python on PATH.
;(PYTHON ? describe : describe.skip)('transpile — output compiles as Python', () => {
  const mixedModels: GraphSchema = {
    nodes: [
      agentNode('a', { model: 'qwen-2.5-72b', systemPrompt: 'Say """hi""" and \\n done' }),
      agentNode('b', { model: 'llama3:70b' }),
    ],
    edges: [{ id: 'e1', source: 'a', target: 'b' }],
  }
  const quotedLabels: GraphSchema = {
    nodes: [agentNode('a', { label: 'Ends with a quote"' }), gateNode('g', 'Is "this" ok?\\')],
    edges: [{ id: 'e1', source: 'a', target: 'g' }],
  }
  const cases: Array<[string, GraphSchema]> = [
    ['2-node chain', twoNodeChain],
    ['3-node chain', threeNodeChain],
    ['mixed providers + tricky prompt', mixedModels],
    ['router graph', routerGraph],
    ['quoted labels + gate', quotedLabels],
    ['research template (tools)', getTemplate('research')],
    ['support template (router + gate)', getTemplate('support')],
    ['code review template (fan-out / fan-in)', getTemplate('code_review')],
  ]

  test.each(cases)('%s', (_name, graph) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'af-transpile-'))
    const file = path.join(dir, 'graph.py')
    writeFileSync(file, transpile(graph, { tools: REGISTRY }).code)
    const res = spawnSync(PYTHON!, ['-m', 'py_compile', file], { encoding: 'utf8' })
    rmSync(dir, { recursive: true, force: true })
    expect(res.stderr).toBe('')
    expect(res.status).toBe(0)
  })
})

// ── helpers ──────────────────────────────────────────────────────────────────

function captureError(fn: () => unknown): TranspileError {
  try {
    fn()
  } catch (e) {
    if (e instanceof TranspileError) return e
    throw e
  }
  throw new Error('Expected a TranspileError to be thrown, but none was.')
}
