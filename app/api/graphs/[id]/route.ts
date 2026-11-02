import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { GraphSchema } from '@/lib/types'

// GET /api/graphs/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const graph = await prisma.graph.findUnique({ where: { id } })
  if (!graph) {
    return NextResponse.json({ error: 'Graph not found' }, { status: 404 })
  }
  return NextResponse.json(graph)
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
    const current = await prisma.graph.findUnique({ where: { id } })
    if (!current) {
      return NextResponse.json({ error: 'Graph not found' }, { status: 404 })
    }
    const newVersion = current.version + 1

    const [graph] = await prisma.$transaction([
      // Update the main graph record
      prisma.graph.update({
        where: { id },
        data: {
          ...(body.name        && { name: body.name }),
          ...(body.description && { description: body.description }),
          ...(body.graphJson   && { graphJson: body.graphJson as unknown as Prisma.InputJsonValue }),
          version: newVersion,
        },
      }),
      // Snapshot the previous version
      prisma.graphVersion.create({
        data: {
          graphId: id,
          version: current.version,
          snapshotJson: current.graphJson as Prisma.InputJsonValue,
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
  } catch (e) {
    // P2025 = record to delete does not exist
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ error: 'Graph not found' }, { status: 404 })
    }
    console.error(e)
    return NextResponse.json({ error: 'Failed to delete graph' }, { status: 500 })
  }
}
