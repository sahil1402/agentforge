import { NextRequest, NextResponse } from 'next/server'

// POST /api/runs/[id]/cancel — stop a running run; the engine ends it with an ERROR event
// and marks it FAILED.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: runId } = await params
  try {
    const res = await fetch(`${process.env.BACKEND_URL}/runs/${runId}/cancel`, { method: 'POST' })
    if (res.status === 409) {
      return NextResponse.json({ error: 'Run is not running' }, { status: 409 })
    }
    if (!res.ok) throw new Error(`Backend responded ${res.status}`)
  } catch {
    return NextResponse.json({ error: 'Execution engine unavailable' }, { status: 503 })
  }
  return NextResponse.json({ success: true })
}
