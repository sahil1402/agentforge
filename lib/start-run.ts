import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { GraphSchema } from '@/lib/types'
import { transpile, type TranspileResult } from '@/lib/transpiler/transpile'
import { TranspileError } from '@/lib/transpiler/errors'

export type StartRunResult =
  | { runId: string }
  | { error: string; status: 404 | 422 | 503; code?: string }

/** Transpile the graph, create its Run row and hand the code to the execution engine (shared by
 *  `POST /api/runs` and the test runner). The engine owns the run's status from dispatch on. */
export async function startRun(graphId: string, input: Record<string, unknown>): Promise<StartRunResult> {
  // 1. Fetch graph to get current version
  const graph = await prisma.graph.findUnique({ where: { id: graphId } })
  if (!graph) return { error: 'Graph not found', status: 404 }

  // 2. Transpile first — an unsupported graph is rejected before any run exists
  let program: TranspileResult
  try {
    const tools = await prisma.tool.findMany({ select: { name: true, description: true, code: true } })
    program = transpile(graph.graphJson as unknown as GraphSchema, { tools })
  } catch (e) {
    if (e instanceof TranspileError) return { error: e.message, status: 422, code: e.code }
    throw e
  }

  // 3. Create Run record — the engine moves it to RUNNING and owns its status from there
  const run = await prisma.run.create({
    data: {
      graphId,
      graphVersion: graph.version,
      status: 'PENDING',
      inputPayload: input as Prisma.InputJsonValue,
    },
  })

  // 4. Hand the generated code to the FastAPI execution engine
  try {
    const res = await fetch(`${process.env.BACKEND_URL}/runs/${run.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: program.code, nodeIds: program.nodeIds, input }),
    })
    if (!res.ok) throw new Error(`Backend responded ${res.status}`)
  } catch {
    await prisma.run.update({
      where: { id: run.id },
      data: { status: 'FAILED', errorMessage: 'Failed to dispatch to execution engine' },
    })
    return { error: 'Execution engine unavailable', status: 503 }
  }

  return { runId: run.id }
}
