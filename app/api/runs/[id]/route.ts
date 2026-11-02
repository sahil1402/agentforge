import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/runs/[id] — get run status + events
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: runId } = await params

  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: {
      events: {
        orderBy: { sequence: 'asc' },
        take: 200,
      },
    },
  })
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  return NextResponse.json(run)
}
