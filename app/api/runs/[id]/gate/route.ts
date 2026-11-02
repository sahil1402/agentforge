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
  const run = await prisma.run.findUnique({ where: { id: runId } })
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  if (run.status !== 'AWAITING_HUMAN') {
    return NextResponse.json(
      { error: `Run is in ${run.status} state, not AWAITING_HUMAN` },
      { status: 409 }
    )
  }

  // Forward decision to the FastAPI execution engine first — only record the
  // resolution once the engine has actually accepted it.
  // The Celery worker is paused waiting for this signal via Redis
  try {
    const res = await fetch(`${process.env.BACKEND_URL}/runs/${runId}/gate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    })
    if (!res.ok) throw new Error(`Backend responded ${res.status}`)
  } catch {
    return NextResponse.json({ error: 'Execution engine unavailable' }, { status: 503 })
  }

  // Record the gate resolution event
  const lastEvent = await prisma.runEvent.findFirst({
    where: { runId },
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

  return NextResponse.json({ success: true, decision })
}
