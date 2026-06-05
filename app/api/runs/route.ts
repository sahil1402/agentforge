import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST /api/runs — dispatch a new graph execution
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    graphId: string
    input: Record<string, unknown>
  }

  // 1. Fetch graph to get current version
  const graph = await prisma.graph.findUniqueOrThrow({
    where: { id: body.graphId },
  })

  // 2. Create Run record immediately — status PENDING
  const run = await prisma.run.create({
    data: {
      graphId: body.graphId,
      graphVersion: graph.version,
      status: 'PENDING',
      inputPayload: body.input,
    },
  })

  // 3. Enqueue Celery task via HTTP to the FastAPI backend
  //    The FastAPI backend proxies the task to Celery
  try {
    await fetch(`${process.env.BACKEND_URL}/runs/${run.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId:     run.id,
        graphJson: graph.graphJson,
        input:     body.input,
      }),
    })
  } catch (e) {
    // Backend dispatch failed — mark run as failed
    await prisma.run.update({
      where: { id: run.id },
      data: { status: 'FAILED', errorMessage: 'Failed to dispatch to execution engine' },
    })
    return NextResponse.json({ error: 'Execution engine unavailable' }, { status: 503 })
  }

  // 4. Update run status to RUNNING
  await prisma.run.update({
    where: { id: run.id },
    data: { status: 'RUNNING' },
  })

  // 5. Return run_id immediately — frontend opens WebSocket
  return NextResponse.json({ runId: run.id, status: 'RUNNING' }, { status: 201 })
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
