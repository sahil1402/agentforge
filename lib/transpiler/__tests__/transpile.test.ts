import { transpile } from '@/lib/transpiler/transpile'
import { linearize } from '@/lib/transpiler/walk'
import { TranspileError } from '@/lib/transpiler/errors'
import type { GraphNode, GraphSchema } from '@/lib/types'

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

const twoNodeChain: GraphSchema = {
  nodes: [
    agentNode('planner', { label: 'Planner', model: 'gpt-4o', systemPrompt: 'You are a research planner.', temperature: 0.3, maxTokens: 1024 }),
    agentNode('writer', { label: 'Writer', model: 'claude-3-5-sonnet', systemPrompt: 'Write the final answer.', temperature: 0.7, maxTokens: 2048 }),
  ],
  edges: [{ id: 'e1', source: 'planner', target: 'writer' }],
}

const threeNodeChain: GraphSchema = {
  nodes: [
    agentNode('planner', { label: 'Planner' }),
    agentNode('researcher', { label: 'Researcher', model: 'claude-3-5-sonnet' }),
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
    expect(code).toContain('ChatAnthropic(model="claude-3-5-sonnet", temperature=0.7, max_tokens=2048)')

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

  test('human_gate node → UNSUPPORTED_NODE pointing at Piece 4', () => {
    const withGate: GraphSchema = {
      nodes: [
        agentNode('start'),
        { id: 'gate', type: 'human_gate', position: { x: 0, y: 0 },
          data: { nodeType: 'human_gate', label: 'Gate', prompt: 'ok?', timeoutSeconds: 30, approvalRequired: true } } as GraphNode,
      ],
      edges: [{ id: 'e1', source: 'start', target: 'gate' }],
    }
    const err = captureError(() => transpile(withGate))
    expect(err.code).toBe('UNSUPPORTED_NODE')
    expect(err.piece).toContain('Piece 4')
  })

  test('tool node → UNSUPPORTED_NODE (agent-only in Piece 1)', () => {
    const withTool: GraphSchema = {
      nodes: [
        agentNode('start'),
        { id: 'tool', type: 'tool', position: { x: 0, y: 0 },
          data: { nodeType: 'tool', label: 'Web Search', functionName: 'search',
            description: 'search', parameterSchema: {}, returnType: 'string' } } as GraphNode,
      ],
      edges: [{ id: 'e1', source: 'start', target: 'tool' }],
    }
    const err = captureError(() => transpile(withTool))
    expect(err.code).toBe('UNSUPPORTED_NODE')
    expect(err.message).toMatch(/agent-only/i)
  })

  test('fan-out (parallel) → NOT_LINEAR pointing at Piece 3', () => {
    const fanOut: GraphSchema = {
      nodes: [agentNode('a'), agentNode('b'), agentNode('c')],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'a', target: 'c' },
      ],
    }
    const err = captureError(() => transpile(fanOut))
    expect(err.code).toBe('NOT_LINEAR')
    expect(err.piece).toContain('Piece 3')
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

describe('linearize', () => {
  test('returns nodes in execution order regardless of array order', () => {
    const shuffled: GraphSchema = {
      nodes: [threeNodeChain.nodes[2], threeNodeChain.nodes[0], threeNodeChain.nodes[1]],
      edges: threeNodeChain.edges,
    }
    expect(linearize(shuffled).map((n) => n.id)).toEqual(['planner', 'researcher', 'writer'])
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

    // Piece 2 banner, not the Piece 1 one.
    expect(code).toContain('conditional routing, Piece 2')

    // Routing function returns the raw condition expression.
    expect(code).toContain('def route_router(state: AgentState) -> str:')
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

  test('a branch that continues to another node → rejected (branches terminal in Piece 2)', () => {
    const g: GraphSchema = {
      nodes: [
        agentNode('triage', { label: 'Triage' }),
        routerNode('router', [
          { label: 'billing', target: 'billing' },
          { label: 'support', target: 'support' },
        ]),
        agentNode('billing', { label: 'Billing' }),
        agentNode('support', { label: 'Support' }),
        agentNode('tail', { label: 'Tail' }),
      ],
      edges: [
        { id: 'e0', source: 'triage', target: 'router' },
        { id: 'e1', source: 'router', target: 'billing', sourceHandle: 'billing' },
        { id: 'e2', source: 'router', target: 'support', sourceHandle: 'support' },
        { id: 'e3', source: 'billing', target: 'tail' },
      ],
    }
    const err = captureError(() => transpile(g))
    expect(err.code).toBe('UNSUPPORTED_NODE')
    expect(err.message).toMatch(/terminal/i)
  })

  test('human_gate in a router graph stays rejected → Piece 4', () => {
    const g: GraphSchema = {
      nodes: [
        agentNode('triage', { label: 'Triage' }),
        routerNode('router', [
          { label: 'billing', target: 'billing' },
          { label: 'gate', target: 'gate' },
        ]),
        agentNode('billing', { label: 'Billing' }),
        { id: 'gate', type: 'human_gate', position: { x: 0, y: 0 },
          data: { nodeType: 'human_gate', label: 'Gate', prompt: 'ok?', timeoutSeconds: 30, approvalRequired: true } } as GraphNode,
      ],
      edges: [
        { id: 'e0', source: 'triage', target: 'router' },
        { id: 'e1', source: 'router', target: 'billing', sourceHandle: 'billing' },
        { id: 'e2', source: 'router', target: 'gate', sourceHandle: 'gate' },
      ],
    }
    const err = captureError(() => transpile(g))
    expect(err.code).toBe('UNSUPPORTED_NODE')
    expect(err.piece).toContain('Piece 4')
  })

  test('agent fan-out in a router graph stays rejected → Piece 3', () => {
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
    expect(err.piece).toContain('Piece 3')
  })

  test('two routers → not yet supported', () => {
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
    expect(err.message).toMatch(/single router/i)
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
