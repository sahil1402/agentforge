import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { GraphSchema } from '@/lib/types'
import { transpile } from '@/lib/transpiler/transpile'
import { TranspileError } from '@/lib/transpiler/errors'

// Templates are read from the filesystem via nunjucks, so this route needs the
// Node.js runtime (not edge).
export const runtime = 'nodejs'

// POST /api/graphs/[id]/transpile
// Validates the graph is a pure linear agent chain and returns generated
// LangGraph Python as a string. No execution happens here — that is Week 4.
// Non-linear / unsupported graphs (router, parallel, human-gate, tool/memory)
// return 422 with a clear "not yet supported" message pointing at the piece
// that will add support.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let graphJson: GraphSchema
  try {
    const graph = await prisma.graph.findUniqueOrThrow({ where: { id } })
    graphJson = graph.graphJson as unknown as GraphSchema
  } catch {
    return NextResponse.json({ error: 'Graph not found' }, { status: 404 })
  }

  try {
    const { code, order } = transpile(graphJson)
    return NextResponse.json({ language: 'python', code, order })
  } catch (e) {
    if (e instanceof TranspileError) {
      return NextResponse.json(
        { error: e.message, code: e.code, piece: e.piece ?? null },
        { status: 422 },
      )
    }
    console.error(e)
    return NextResponse.json({ error: 'Failed to transpile graph' }, { status: 500 })
  }
}
