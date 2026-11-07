import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { startRun } from '@/lib/start-run'

// Transpiling reads templates from the filesystem.
export const runtime = 'nodejs'

// POST /api/runs — dispatch a new graph execution (transpile → Run row → engine, see lib/start-run.ts)
export async function POST(req: NextRequest) {
  const body = await req.json() as { graphId: string; input?: Record<string, unknown> }
  const result = await startRun(body.graphId, body.input ?? {})
  if ('error' in result) {
    const { status, ...error } = result
    return NextResponse.json(error, { status })
  }
  // Return run_id immediately — frontend opens WebSocket
  return NextResponse.json({ runId: result.runId, status: 'RUNNING' }, { status: 201 })
}

// GET /api/runs?graphId=xxx — list runs for a graph
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const graphId = searchParams.get('graphId')

  if (!graphId) {
    return NextResponse.json({ error: 'graphId required' }, { status: 400 })
  }

  const runs = await prisma.run.findMany({
    where: { graphId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      status: true,
      graphVersion: true,
      inputPayload: true,
      outputPayload: true,
      errorMessage: true,
      durationMs: true,
      tokenCount: true,
      createdAt: true,
    },
  })

  return NextResponse.json(runs)
}
