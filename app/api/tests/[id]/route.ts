import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { parseTestCase } from '@/lib/test-cases'

type Params = { params: Promise<{ id: string }> }

// P2025 = record does not exist
const isNotFound = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025'

// PATCH /api/tests/[id] — edit any subset of name, inputPayload, expectedPath, expectedOutputContains.
// The last result no longer applies to the edited expectations, so it is cleared.
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const parsed = parseTestCase(await req.json(), true)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  try {
    const test = await prisma.testCase.update({
      where: { id },
      data: { ...parsed.data, inputPayload: parsed.data.inputPayload as Prisma.InputJsonValue | undefined, lastResult: null },
    })
    return NextResponse.json(test)
  } catch (e) {
    if (isNotFound(e)) return NextResponse.json({ error: 'Test not found' }, { status: 404 })
    throw e
  }
}

// DELETE /api/tests/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  try {
    await prisma.testCase.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    if (isNotFound(e)) return NextResponse.json({ error: 'Test not found' }, { status: 404 })
    throw e
  }
}
