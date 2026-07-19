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
  test('router node → UNSUPPORTED_NODE pointing at Piece 2', () => {
    const withRouter: GraphSchema = {
      nodes: [
        agentNode('start'),
        { id: 'router', type: 'router', position: { x: 0, y: 0 },
          data: { nodeType: 'router', label: 'Router', condition: "state['x']",
            routes: [{ label: 'a', target: 'start' }] } } as GraphNode,
      ],
      edges: [{ id: 'e1', source: 'start', target: 'router' }],
    }
    expect(() => transpile(withRouter)).toThrow(TranspileError)
    try {
      transpile(withRouter)
    } catch (e) {
      const err = e as TranspileError
      expect(err.code).toBe('UNSUPPORTED_NODE')
      expect(err.piece).toContain('Piece 2')
      expect(err.message).toMatch(/router/i)
    }
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
