/** Send a human-gate decision for a paused run; the execution engine resumes it. */
export async function resolveGate(runId: string, decision: 'approve' | 'reject') {
  const res = await fetch(`/api/runs/${runId}/gate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision }),
  })
  if (!res.ok) console.error(`Gate decision failed (HTTP ${res.status})`)
}

/** Stop a run on the engine (409 = it already finished, which is fine). */
export async function cancelRun(runId: string) {
  const res = await fetch(`/api/runs/${runId}/cancel`, { method: 'POST' })
  if (!res.ok && res.status !== 409) console.error(`Cancel failed (HTTP ${res.status})`)
}
