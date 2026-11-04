import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { GraphSchema } from '@/lib/types'
import { transpile, type TranspileResult } from '@/lib/transpiler/transpile'
import { TranspileError } from '@/lib/transpiler/errors'

// Transpiling reads templates from the filesystem.
export const runtime = 'nodejs'

// POST /api/runs — dispatch a new graph execution
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    graphId: string
    input: Record<string, unknown>
  }

  // 1. Fetch graph to get current version
  const graph = await prisma.graph.findUnique({
    where: { id: body.graphId },
  })
  if (!graph) {
    return NextResponse.json({ error: 'Graph not found' }, { status: 404 })
  }

  // 2. Transpile first — an unsupported graph is rejected before any run exists
  let program: TranspileResult
  try {
    const tools = await prisma.tool.findMany({ select: { name: true, description: true, code: true } })
    program = transpile(graph.graphJson as unknown as GraphSchema, { tools })
  } catch (e) {
    if (e instanceof TranspileError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 422 })
    }
    throw e
  }

  // 3. Create Run record — the engine moves it to RUNNING and owns its status from there
  const run = await prisma.run.create({
    data: {
      graphId: body.graphId,
      graphVersion: graph.version,
      status: 'PENDING',
      inputPayload: (body.input ?? {}) as Prisma.InputJsonValue,
    },
  })

  // 4. Hand the generated code to the FastAPI execution engine
  try {
    const res = await fetch(`${process.env.BACKEND_URL}/runs/${run.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code:    program.code,
        nodeIds: program.nodeIds,
        input:   body.input ?? {},
      }),
    })
    if (!res.ok) throw new Error(`Backend responded ${res.status}`)
  } catch {
    // Backend dispatch failed — mark run as failed
    await prisma.run.update({
      where: { id: run.id },
      data: { status: 'FAILED', errorMessage: 'Failed to dispatch to execution engine' },
    })
    return NextResponse.json({ error: 'Execution engine unavailable' }, { status: 503 })
  }

  // 5. Return run_id immediately — frontend opens WebSocket
  return NextResponse.json({ runId: run.id, status: 'RUNNING' }, { status: 201 })
}

// GET /api/runs?graphId=xxx — list runs for a graph
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const graphId = searchParams.get('graphId')

  if (!graphId) {
    return NextResponse.json({ error: 'graphId required' }, { status: 400 })
  }

  const runs = await prisma.run.findMany({
    where: { graphId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      status: true,
      graphVersion: true,
      inputPayload: true,
      outputPayload: true,
      errorMessage: true,
      durationMs: true,
      tokenCount: true,
      createdAt: true,
    },
  })

  return NextResponse.json(runs)
}
