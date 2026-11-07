import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { gradeRun, parseTestCase } from '@/lib/test-cases'

type Params = { params: Promise<{ id: string }> }

const graphExists = async (id: string) => !!(await prisma.graph.findUnique({ where: { id }, select: { id: true } }))

// GET /api/graphs/[id]/tests — the graph's test cases. Pending results are graded here (lazily) once
// their run has ended, so the engine needs no callback.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: graphId } = await params
  if (!await graphExists(graphId)) return NextResponse.json({ error: 'Graph not found' }, { status: 404 })

  const tests = await prisma.testCase.findMany({ where: { graphId }, orderBy: { createdAt: 'asc' } })
  for (const test of tests) {
    if (test.lastResult !== 'PENDING') continue
    const run = test.lastRunId ? await prisma.run.findUnique({
      where: { id: test.lastRunId },
      select: { status: true, outputPayload: true, events: { where: { eventType: 'NODE_END' }, select: { nodeId: true } } },
    }) : null
    // A pending test whose run row is gone can never be graded: fail it rather than poll forever.
    const result = run ? gradeRun(test, run, run.events.flatMap((e) => (e.nodeId ? [e.nodeId] : []))) : 'FAIL'
    if (result === 'PENDING') continue
    test.lastResult = result
    await prisma.testCase.update({ where: { id: test.id }, data: { lastResult: result } })
  }
  return NextResponse.json(tests)
}

// POST /api/graphs/[id]/tests — create a test case
export async function POST(req: NextRequest, { params }: Params) {
  const { id: graphId } = await params
  const parsed = parseTestCase(await req.json())
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  if (!await graphExists(graphId)) return NextResponse.json({ error: 'Graph not found' }, { status: 404 })

  const test = await prisma.testCase.create({
    data: { graphId, ...parsed.data, inputPayload: parsed.data.inputPayload as Prisma.InputJsonValue },
  })
  return NextResponse.json(test, { status: 201 })
}
