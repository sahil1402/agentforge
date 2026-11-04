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

  // Forward the decision to the execution engine; it resumes the run and records
  // the GATE_RESOLVED event itself (it owns run events and their sequence).
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

  return NextResponse.json({ success: true, decision })
}
