// Runs every graph's test cases on a live AgentForge (AGENTFORGE_URL, default http://localhost:3100)
// and exits 1 if any test is not PASS. Needs the database, the engine and provider keys to be up.
const base = (process.env.AGENTFORGE_URL ?? 'http://localhost:3100').replace(/\/$/, '')

const api = async (path, init) => {
  const res = await fetch(base + path, init)
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} -> HTTP ${res.status}`)
  return res.json()
}

const deadline = Date.now() + 10 * 60_000
let failed = 0
for (const graph of await api('/api/graphs')) {
  const { started } = await api(`/api/graphs/${graph.id}/tests/run`, { method: 'POST' })
  if (started.length === 0) continue
  let tests
  do {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    tests = await api(`/api/graphs/${graph.id}/tests`) // grades pending tests whose run has ended
  } while (tests.some((t) => t.lastResult === 'PENDING') && Date.now() < deadline)
  for (const t of tests) {
    console.log(`${t.lastResult ?? 'PENDING'}\t${graph.name} / ${t.name}`)
    if (t.lastResult !== 'PASS') failed++
  }
}
process.exit(failed ? 1 : 0)
