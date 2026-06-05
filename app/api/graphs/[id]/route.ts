import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { GraphSchema } from '@/lib/types'

// GET /api/graphs/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const graph = await prisma.graph.findUniqueOrThrow({ where: { id } })
    return NextResponse.json(graph)
  } catch {
    return NextResponse.json({ error: 'Graph not found' }, { status: 404 })
  }
}

// PATCH /api/graphs/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json() as {
    name?: string
    description?: string
    graphJson?: GraphSchema
  }

  try {
    const current = await prisma.graph.findUniqueOrThrow({ where: { id } })
    const newVersion = current.version + 1

    const [graph] = await prisma.$transaction([
      // Update the main graph record
      prisma.graph.update({
        where: { id },
        data: {
          ...(body.name        && { name: body.name }),
          ...(body.description && { description: body.description }),
          ...(body.graphJson   && { graphJson: body.graphJson as any }),
          version: newVersion,
        },
      }),
      // Snapshot the previous version
      prisma.graphVersion.create({
        data: {
          graphId: id,
          version: current.version,
          snapshotJson: current.graphJson as any,
        },
      }),
    ])

    return NextResponse.json(graph)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to update graph' }, { status: 500 })
  }
}

// DELETE /api/graphs/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await prisma.graph.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Graph not found' }, { status: 404 })
  }
}
