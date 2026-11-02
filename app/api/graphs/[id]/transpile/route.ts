import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { GraphSchema } from '@/lib/types'
import { transpile } from '@/lib/transpiler/transpile'
import { TranspileError } from '@/lib/transpiler/errors'

// Templates are read from the filesystem via nunjucks, so this route needs the
// Node.js runtime (not edge).
export const runtime = 'nodejs'

// POST /api/graphs/[id]/transpile
// Returns generated LangGraph Python as a string. No execution happens here —
// that is Week 4. Body `{ graphJson }` is optional: when present (the editor's
// unsaved canvas) it is transpiled instead of the saved graph.
// Unsupported / malformed graphs return 422 with a clear message.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { graphJson?: GraphSchema }

  let graphJson = body.graphJson
  if (!graphJson) {
    const graph = await prisma.graph.findUnique({ where: { id } })
    if (!graph) {
      return NextResponse.json({ error: 'Graph not found' }, { status: 404 })
    }
    graphJson = graph.graphJson as unknown as GraphSchema
  }

  try {
    const tools = await prisma.tool.findMany({ select: { name: true, description: true, code: true } })
    const { code, order } = transpile(graphJson, { tools })
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
