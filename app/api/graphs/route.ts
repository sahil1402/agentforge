import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { GraphSchema } from '@/lib/types'

// GET /api/graphs — list all graphs for user
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId') ?? 'dev-user' // TODO: replace with real auth

  const graphs = await prisma.graph.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      version: true,
      isDeployed: true,
      createdAt: true,
      updatedAt: true,
      graphJson: true,
      _count: { select: { runs: true } },
    },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
const enriched = graphs.map((g: any) => ({
    ...g,
    nodeCount: (g.graphJson as any)?.nodes?.length ?? 0,
  }))

  return NextResponse.json(enriched)
}

// POST /api/graphs — create a new graph
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    name: string
    description?: string
    template?: 'blank' | 'research' | 'support' | 'code_review'
    userId?: string
  }

  const userId = body.userId ?? 'dev-user'
  const templateGraph = getTemplate(body.template ?? 'blank')

  const graph = await prisma.graph.create({
    data: {
      userId,
      name: body.name,
      description: body.description,
      graphJson: templateGraph as any,
      version: 1,
    },
  })

  return NextResponse.json(graph, { status: 201 })
}

// ─── Template graphs ──────────────────────────────────────────────────────────

function getTemplate(template: string): GraphSchema {
  if (template === 'research') {
    return {
      nodes: [
        { id: 'planner', type: 'agent', position: { x: 60, y: 160 },
          data: { nodeType: 'agent', label: 'Planner', model: 'gpt-4o',
            systemPrompt: 'You are a research planner. Break the query into search sub-tasks.',
            temperature: 0.3, maxTokens: 1024, tools: [] } },
        { id: 'search', type: 'tool', position: { x: 320, y: 80 },
          data: { nodeType: 'tool', label: 'Web Search', functionName: 'tavily_search',
            description: 'Search the web for results.', parameterSchema: {}, returnType: 'list' } },
        { id: 'fetch', type: 'tool', position: { x: 320, y: 240 },
          data: { nodeType: 'tool', label: 'URL Fetcher', functionName: 'fetch_url',
            description: 'Fetch text from a URL.', parameterSchema: {}, returnType: 'string' } },
        { id: 'synth', type: 'agent', position: { x: 580, y: 160 },
          data: { nodeType: 'agent', label: 'Synthesizer', model: 'claude-3-5-sonnet',
            systemPrompt: 'Synthesize the retrieved sources into a coherent summary.',
            temperature: 0.7, maxTokens: 2048, tools: [] } },
      ],
      edges: [
        { id: 'e1', source: 'planner', target: 'search' },
        { id: 'e2', source: 'planner', target: 'fetch' },
        { id: 'e3', source: 'search',  target: 'synth' },
        { id: 'e4', source: 'fetch',   target: 'synth' },
      ],
    }
  }

  if (template === 'support') {
    return {
      nodes: [
        { id: 'router', type: 'router', position: { x: 80, y: 160 },
          data: { nodeType: 'router', label: 'Router', condition: "state['intent']",
            routes: [{ label: 'faq', target: 'faq' }, { label: 'escalate', target: 'gate' }] } },
        { id: 'faq', type: 'agent', position: { x: 340, y: 80 },
          data: { nodeType: 'agent', label: 'FAQ Agent', model: 'gpt-4o-mini',
            systemPrompt: 'Answer common customer support questions.', temperature: 0.3, maxTokens: 512, tools: [] } },
        { id: 'gate', type: 'human_gate', position: { x: 340, y: 240 },
          data: { nodeType: 'human_gate', label: 'Escalation Gate',
            prompt: 'Review this escalation request and approve or reject.', timeoutSeconds: 300, approvalRequired: true } },
      ],
      edges: [
        { id: 'e1', source: 'router', target: 'faq',  sourceHandle: 'faq' },
        { id: 'e2', source: 'router', target: 'gate', sourceHandle: 'escalate' },
      ],
    }
  }

  // blank
  return { nodes: [], edges: [] }
}
