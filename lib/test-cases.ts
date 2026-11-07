import type { RunStatus, TestCase, TestResult } from '@/lib/types'

export type TestCaseInput = Pick<TestCase, 'name' | 'inputPayload' | 'expectedPath' | 'expectedOutputContains'>

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Validate a test case from a request body. With `partial` (PATCH) any subset of the fields is
 * accepted; otherwise name, inputPayload and expectedPath are required.
 */
export function parseTestCase(body: unknown): { data: TestCaseInput } | { error: string }
export function parseTestCase(body: unknown, partial: true): { data: Partial<TestCaseInput> } | { error: string }
export function parseTestCase(body: unknown, partial = false): { data: Partial<TestCaseInput> } | { error: string } {
  if (!isPlainObject(body)) return { error: 'Body must be an object' }
  const data: Partial<TestCaseInput> = {}
  const wanted = (key: string) => !partial || key in body
  if (wanted('name')) {
    if (typeof body.name !== 'string' || !body.name.trim()) return { error: 'name must be a non-empty string' }
    data.name = body.name.trim()
  }
  if (wanted('inputPayload')) {
    if (!isPlainObject(body.inputPayload)) return { error: 'inputPayload must be an object' }
    data.inputPayload = body.inputPayload
  }
  if (wanted('expectedPath')) {
    const path = body.expectedPath
    if (!Array.isArray(path) || !path.every((p) => typeof p === 'string')) return { error: 'expectedPath must be a string[]' }
    data.expectedPath = path
  }
  if ('expectedOutputContains' in body) {
    const text = body.expectedOutputContains
    if (text !== null && typeof text !== 'string') return { error: 'expectedOutputContains must be a string or null' }
    data.expectedOutputContains = text || null
  } else if (!partial) {
    data.expectedOutputContains = null
  }
  return { data }
}

/**
 * Grade a test against its run. Path = the *set* of node ids that emitted NODE_END equals
 * `expectedPath` (parallel branches have no order; an empty path is not checked). Output = the
 * final output contains `expectedOutputContains`, case-insensitive (null = not checked).
 * PENDING until the run is terminal; a FAILED run fails the test.
 */
export function gradeRun(
  test: Pick<TestCase, 'expectedPath' | 'expectedOutputContains'>,
  run: { status: RunStatus; outputPayload: unknown },
  endedNodeIds: Iterable<string>,
): TestResult {
  if (run.status !== 'COMPLETE' && run.status !== 'FAILED') return 'PENDING'
  if (run.status === 'FAILED') return 'FAIL'
  const visited = new Set(endedNodeIds)
  const expected = new Set(test.expectedPath)
  const pathOk = expected.size === 0 || (visited.size === expected.size && [...expected].every((id) => visited.has(id)))
  const output = String((run.outputPayload as { output?: unknown } | null)?.output ?? '')
  const outputOk = !test.expectedOutputContains || output.toLowerCase().includes(test.expectedOutputContains.toLowerCase())
  return pathOk && outputOk ? 'PASS' : 'FAIL'
}
