import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { startRun } from '@/lib/start-run'

// Transpiling reads templates from the filesystem.
export const runtime = 'nodejs'

// POST /api/graphs/[id]/tests/run — start one run per test case (gates auto-approve) and mark each
// test PENDING; GET /api/graphs/[id]/tests grades them once the runs end.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: graphId } = await params
  if (!await prisma.graph.findUnique({ where: { id: graphId }, select: { id: true } })) {
    return NextResponse.json({ error: 'Graph not found' }, { status: 404 })
  }

  const tests = await prisma.testCase.findMany({ where: { graphId }, orderBy: { createdAt: 'asc' } })
  const started: Array<{ testId: string; runId?: string; error?: string }> = []
  for (const test of tests) {
    const result = await startRun(graphId, { ...(test.inputPayload as Record<string, unknown>), autoApprove: true })
    if ('runId' in result) {
      await prisma.testCase.update({ where: { id: test.id }, data: { lastRunId: result.runId, lastResult: 'PENDING' } })
      started.push({ testId: test.id, runId: result.runId })
    } else {
      await prisma.testCase.update({ where: { id: test.id }, data: { lastRunId: null, lastResult: 'FAIL' } })
      started.push({ testId: test.id, error: result.error })
    }
  }
  return NextResponse.json({ started }, { status: 202 })
}
