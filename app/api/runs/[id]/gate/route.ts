import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST /api/runs/[id]/gate — approve or reject a human gate
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: runId } = await params
  const { decision } = await req.json() as { decision: 'approve' | 'reject' }

  if (decision !== 'approve' && decision !== 'reject') {
    return NextResponse.json({ error: 'decision must be approve or reject' }, { status: 400 })
  }

  // Verify run is in AWAITING_HUMAN state
  const run = await prisma.run.findUniqueOrThrow({ where: { id: runId } })

  if (run.status !== 'AWAITING_HUMAN') {
    return NextResponse.json(
      { error: `Run is in ${run.status} state, not AWAITING_HUMAN` },
      { status: 409 }
    )
  }

  // Record the gate resolution event
  const lastEvent = await prisma.runEvent.findFirst({
    where: { runId, eventType: 'GATE_PENDING' },
    orderBy: { sequence: 'desc' },
  })

  await prisma.runEvent.create({
    data: {
      runId,
      eventType: 'GATE_RESOLVED',
      payload: { decision },
      sequence: (lastEvent?.sequence ?? 0) + 1,
    },
  })

  // Forward decision to the FastAPI execution engine
  // The Celery worker is paused waiting for this signal via Redis
  await fetch(`${process.env.BACKEND_URL}/runs/${runId}/gate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision }),
  })

  return NextResponse.json({ success: true, decision })
}

// GET /api/runs/[id] — get run status + events
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: runId } = await params

  const run = await prisma.run.findUniqueOrThrow({
    where: { id: runId },
    include: {
      events: {
        orderBy: { sequence: 'asc' },
        take: 200,
      },
    },
  })

  return NextResponse.json(run)
}
