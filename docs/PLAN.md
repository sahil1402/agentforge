# AgentForge — plan from Phase 2.5 to launch

Written 2026-11-06 as a handoff to a fresh chat. CLAUDE.md has the architecture and the decisions;
this file has **what is left, in order, split into tasks**. Tick boxes as tasks land.

## Where things stand

| Phase | State |
|---|---|
| 0 Cleanup · 1 Transpiler · 2 Execution engine | ✅ done, committed |
| 2.5 Hardening | ✅ agent prompts (one user turn), run input, Claude 5.5 pricing — ⬜ real-model check |
| 3 Live canvas | ⬜ partly free already: nodes light up, tokens stream, gates pause/resume |
| 4 Test harness | ⬜ `TestCase` table exists, nothing uses it |
| UI revamp | ⬜ user supplies the UI skills/plugins |
| 5 Deploy | ⬜ `GraphVersion` snapshots are saved on every PATCH; nothing reads them |
| 6 Launch | ⬜ |

`main` is 9 commits ahead of `origin` — the user pushes.

**Verified green at handoff:** `npx jest` 51/51, `backend/.venv/Scripts/python -m pytest` 19/19
(run from `backend/`), `npx tsc --noEmit`, `npx eslint .` (0/0).

## Working rules (read before the first task)

- **Commits:** authored by the user's git identity (sahil1402), **no Claude co-author trailer**,
  small commits split by concern, show the commit plan before committing. Never push.
- **Order:** sequential on `main`, one checkout. Don't polish the current UI — anything visual added
  before the revamp stays minimal (native controls are fine) and gets a `shortcut:` comment.
- **Style:** ponytail (smallest complete change; reuse what exists; every shortcut gets
  `shortcut: <limit>, <when to upgrade>`). Next.js here is v16 — read
  `node_modules/next/dist/docs/` before touching routing/APIs (AGENTS.md).
- **Run it:** Postgres in Docker (`agentforge-db`); `npm run dev` (port 3100);
  `cd backend && .venv\Scripts\activate && uvicorn app.main:app --port 8000`.
- **Done means:** jest + pytest + tsc + eslint green, plus the task's own check below. Keep the
  backend fixtures in sync after any template change: `UPDATE_FIXTURES=1 npx jest transpile`.
- **Contract the UI revamp must keep:** API routes, `lib/runs.ts`, the store's shape, and the event
  types (`NODE_START`, `NODE_END`, `TOKEN_CHUNK`, `GATE_PENDING`, `GATE_RESOLVED`, `COMPLETE`,
  `ERROR`). New endpoints added in Phases 3–4 get one line each in CLAUDE.md.

---

## Phase 2.5 — finish (blocked on an API key)

- [ ] **2.5.1 Real-model check.** User adds `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` to
  `.env.local`. Run the 3 starter templates through the canvas (research needs `TAVILY_API_KEY`
  for `web_search`, or expect a clean FAILED blamed on `planner`).
  *Check:* code_review and support COMPLETE with real text; token counts > 0; gate approve/reject
  works; no 400s. Fix whatever real providers reject (e.g. empty content, `name` on messages).

## Phase 3 — Live canvas (make a run explain itself)

- [x] **3.1 Per-node stats in events.** `backend/app/worker.py`: on NODE_END, put
  `{inputTokens, outputTokens, durationMs}` in the payload — usage from the AI message(s) that node
  wrote (task result writes), duration from NODE_START. Store keeps them per node.
  *Check:* pytest asserts code_review's NODE_END payloads carry tokens (FakeChat reports 10/5).
- [ ] **3.2 Show stats + cost on nodes.** After a node ends, it shows tokens · time · $ (price ×
  tokens). Move `MODEL_PRICING` out of `node-config-panel.tsx` into `lib/types.ts` next to
  `AVAILABLE_MODELS` so both use it. Run total in the trace panel.
  **Bug to fix here:** the trace panel counts TOKEN_CHUNK events as tokens
  (`trace-panel.tsx` `setTotalTokens((t) => t + 1)`) — use real token counts.
- [ ] **3.3 Failure on the node.** The node that ERROR blames shows a red state + the error message
  (store already has `setNodeFailed`; add the message).
- [ ] **3.4 Router path.** Routers emit no event (they're routing functions, not nodes). Derive the
  taken branch in the UI: when a node starts, light the edge from its predecessor; untaken
  branches stay dim. *Check:* support template with "refund" lights router → gate only.
- [ ] **3.5 Run history + replay.** History button (dead today) → list from the existing
  `GET /api/runs?graphId=` (last 20: status, input, duration, tokens). Clicking one sets it as the
  active run; the WebSocket already replays stored events, so the canvas re-animates. Reset node
  states before replay. *Check:* replaying a finished run shows the same path/output as live.

## Phase 4 — Test harness (regression-test a graph)

`TestCase`: `name`, `inputPayload`, `expectedPath String[]`, `expectedOutputContains?`,
`lastResult PASS|FAIL|PENDING`, `lastRunId`.

- [ ] **4.1 Decide the semantics (ask the user if unsure).** Recommended:
  - **Path** = the *set* of visited node ids equals `expectedPath` (parallel branches have no
    fixed order; the set still pins router decisions, which is what path tests are for).
  - **Output** = final output contains `expectedOutputContains` (case-insensitive).
  - **Gates in tests:** auto-approve (add `autoApprove` to the run input the engine reads, or
    resolve from Next when GATE_PENDING arrives). Needs a call.
- [ ] **4.2 Test CRUD API.** `GET/POST /api/graphs/:id/tests`, `PATCH/DELETE /api/tests/:id`.
  Validate at the boundary (name, input object, path = string[]). Follow the existing route
  style (404 for missing, `res.ok` checks).
- [ ] **4.3 Run tests.** Extract the run-creation body of `POST /api/runs` into a shared helper
  (transpile → create Run → dispatch) and reuse it. `POST /api/graphs/:id/tests/run` starts one
  run per test and returns run ids. Grading happens when a run is terminal: compute pass/fail
  from the run row + `run_events` (NODE_END node ids, COMPLETE output) and write
  `lastResult`/`lastRunId` (lazily on `GET .../tests`, so no engine callback is needed).
  *Check:* a Jest/API test with a fake-model engine run: one passing, one failing on path.
- [ ] **4.4 Tests panel (minimal UI).** TestTube button → list with last result, Run all, delete.
  **"Save run as test"** from the trace panel (prefills input, visited path, an output snippet) is
  the cheap way to create tests. Minimal styling — revamp redoes it.
- [ ] **4.5 CI.** `.github/workflows/ci.yml`: `npm ci`, `tsc`, `eslint`, `jest`, and backend
  `pytest` (fake models, no keys, no DB). Graph regression tests need DB + engine + keys — add a
  `npm run test:graphs` script that calls the tests API and exits non-zero on FAIL; wire it into CI
  only behind a secret, documented as optional.

## UI revamp (user supplies skills/plugins — wait for them)

Scope: graph library, canvas + nodes, palette, config panel, trace panel, run input (replace
`window.prompt`), history, tests panel, code preview, tool library. Keep the contract above.
Before starting, list every `shortcut:` comment in `app/` and `components/` — they're the revamp's
to-do list.

## Phase 5 — Deploy (graph → container)

- [ ] **5.1 Export a graph as a service.** `POST /api/graphs/:id/export` → zip: `graph.py`
  (transpiled), `server.py` (FastAPI `POST /invoke {input}` → `{output, tokens}`, `GET /health`,
  OpenAPI at `/docs` for free), `requirements.txt` (copy the provider pins from
  `backend/requirements.txt`), `Dockerfile`, `.env.example` (provider + tool keys the graph needs),
  README. Reuse the worker's streaming/termination logic rather than re-writing it.
  **Decide:** graphs with gates — reject with 422 for v1 (recommended) or expose a resume endpoint.
  *Check:* pytest builds the export for code_review and calls `/invoke` with fake models;
  `docker build` succeeds (manual).
- [ ] **5.2 Deploy button** downloads the zip and shows the two commands (`docker build`,
  `docker run`). Set `Graph.isDeployed` only if something reads it — otherwise skip.
- [ ] **5.3 Version history + diff.** `GET /api/graphs/:id/versions` (+ one version). UI: list,
  open a snapshot read-only, side-by-side diff of the **generated code** (transpile both) and a
  node/edge summary (added / removed / changed). The editor is CodeMirror — `@codemirror/merge` is
  the natural one-dependency diff view.

## Phase 6 — Launch

- [ ] **6.1 README truth pass** — it still says Jinja2 (it's nunjucks), Monaco (it's CodeMirror),
  Redis/Celery badges and Week 5 "Redis pub/sub", and a stale Known Tradeoffs table (Docker-in-
  Docker, NextAuth "Week 2"). Update to what exists.
- [ ] **6.2 Examples** — the 3 templates polished with real prompts; a GIF of a live run + a gate.
- [ ] **6.3 One-command local setup** — `docker-compose.yml` for Postgres + engine (+ Next), so a
  visitor runs it without the manual steps.
- [ ] **6.4 Blog post / HN launch** — user-led.

## Open decisions (owner: user)

1. **Memory nodes** — in the palette but rejected by the transpiler. Build for v1, or hide?
2. **Auth** — none today; needed only for hosted/multi-user use.
3. **Sandbox** — runs execute with the engine's privileges and keys; required before anyone else
   runs graphs on your engine (exported containers are isolated by Docker).
4. **Gate behaviour** in tests (4.1) and in deployed graphs (5.1).
5. **User's "Research Assistant" graph** has leftover nodes the transpiler rejects — clean or keep.

## Known debt (accepted for now)

- Engine restart loses in-flight runs (gates use `InMemorySaver`); startup marks them FAILED.
- Approve clicked at the exact moment a gate times out is accepted but the run ends as a timeout.
- Run input is a native `window.prompt` (revamp).
