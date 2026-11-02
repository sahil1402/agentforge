import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { GraphSchema } from '@/lib/types'
import { getTemplate, type TemplateId } from '@/lib/graph-templates'

// GET /api/graphs — list all graphs for user
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId') ?? 'dev-user' // TODO: replace with real auth

  const graphs = await prisma.graph.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      version: true,
      isDeployed: true,
      createdAt: true,
      updatedAt: true,
      graphJson: true,
      _count: { select: { runs: true } },
    },
  })

  const enriched = graphs.map((g) => ({
    ...g,
    nodeCount: (g.graphJson as unknown as GraphSchema | null)?.nodes?.length ?? 0,
  }))

  return NextResponse.json(enriched)
}

// POST /api/graphs — create a new graph
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    name: string
    description?: string
    template?: TemplateId
    userId?: string
  }

  const userId = body.userId ?? 'dev-user'
  const templateGraph = getTemplate(body.template ?? 'blank')

  const graph = await prisma.graph.create({
    data: {
      userId,
      name: body.name,
      description: body.description,
      graphJson: templateGraph as unknown as Prisma.InputJsonValue,
      version: 1,
    },
  })

  return NextResponse.json(graph, { status: 201 })
}
