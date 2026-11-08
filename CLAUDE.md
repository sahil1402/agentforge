@AGENTS.md

## Roadmap decisions (agreed 2026-11-02)

- Week 4 execution engine ships **without Celery/Redis** first (FastAPI background task +
  in-process WebSocket fan-out); add Celery/Redis only when multiple workers are needed.
- A canvas **Tool node = a tool its connected agent can call** (not a fixed pipeline step).
- **Kubernetes/Helm is cut from v1**; deploy = FastAPI wrapper + Dockerfile.
- Order: Phase 0 cleanup ✅ → Phase 1 transpiler ✅ → Phase 2 execution engine ✅ → Phase 2.5
  (real-model check, run input, pricing) → Phase 3 live canvas → Phase 4 test harness → **full UI
  revamp** (user supplies the UI skills/plugins; moved before deploy 2026-11-03 — don't polish the
  current UI before then) → Phase 5 deploy → Phase 6 launch. All work happens sequentially on
  `main` in one checkout (no parallel worktree).
- Commits are authored by the user (sahil1402); no Claude co-author trailer unless asked. The user
  pushes to GitHub.
- **Task plan from Phase 2.5 to launch: [docs/PLAN.md](docs/PLAN.md)** — read it first, tick tasks
  as they land.

## Execution engine (Phase 2 — complete)

`backend/` is a FastAPI app (`uvicorn app.main:app --port 8000`, venv in `backend/.venv`, reads the
repo's `.env.local`). Next owns runs; the engine owns run **status and events** from dispatch on.

- `POST /api/runs` (Next) transpiles first (422, no run row, for unsupported graphs), creates the
  Run (PENDING), then `POST {BACKEND_URL}/runs/:id/start` with `{ code, nodeIds, input }`.
  `nodeIds` = generated node name → canvas node id (`TranspileResult.nodeIds`).
- `runner.py`: one `python -m app.worker` subprocess per run (plain `subprocess` + threads, not
  asyncio subprocesses — uvicorn `--reload` on Windows can't spawn those). Every event is stored in
  `run_events` (sequence from 1, ts set by the engine) and pushed to WebSocket subscribers;
  status: RUNNING → AWAITING_HUMAN ⇄ RUNNING → COMPLETE | FAILED. Idle timeout
  `RUN_IDLE_TIMEOUT_SECONDS` (300), disabled while a gate waits.
- `worker.py`: JSON lines over stdin/stdout; streams LangGraph `tasks` (NODE_START/NODE_END; NODE_END
  carries `{inputTokens, outputTokens, durationMs}` from the messages the node wrote to state),
  `messages` (TOKEN_CHUNK, per node) and `values`; ends with exactly one COMPLETE `{output, tokens}`
  or ERROR `{message}` (blamed on the running node). Gates: GATE_PENDING `{prompt, lastOutput,
  timeoutSeconds}` → decision on stdin (or the gate's `timeout_seconds` → treated as reject) →
  GATE_RESOLVED `{decision}` → `Command(resume={interrupt_id: ...})`. Parallel gates are asked one
  at a time and resumed together; after a reject the rest are auto-rejected. The protocol writes
  to a dup of fd 1 and fd 1 → stderr, so prints (even from child processes) can't corrupt it.
- `WS /ws/runs/:id`: replays the run's events (memory while active, DB after) then streams live;
  returns as soon as the client disconnects.
- `POST /api/runs/:id/gate` (Next) only forwards; the engine records GATE_RESOLVED.
  `POST /api/runs/:id/cancel` (toolbar Stop) → engine kills the worker → ERROR "Cancelled by user".
- Engine shutdown stops all runs (FAILED "Execution engine stopped"); startup marks leftover
  RUNNING/AWAITING_HUMAN runs FAILED (and appends an ERROR event so their streams end).
- **Shortcut:** runs execute with the engine's privileges and env (API keys) — sandbox before any
  hosted/multi-user use. An engine restart loses in-flight runs (gates use `InMemorySaver`).
- Tests: `backend/tests` (pytest, `FakeChat` in `tests/fakes.py`; API tests spawn real workers via
  `tests.fake_worker`). `backend/tests/fixtures/*.json` are transpiler output, kept identical by a
  Jest test — regenerate with `UPDATE_FIXTURES=1 npx jest transpile`.
- Not yet verified against real provider APIs (no keys in `.env.local`).

## Test harness (Phase 4 — complete)

- `TestCase` = `{ name, inputPayload, expectedPath: string[], expectedOutputContains?: string }`.
  **Semantics (agreed 2026-11-06):** path = the *set* of node ids with a NODE_END equals `expectedPath`
  (empty = not checked); output = COMPLETE's output contains the text, case-insensitive (null = not
  checked); a FAILED run fails the test. Gates auto-approve: the run input carries `autoApprove: true`,
  which the worker honours (GATE_PENDING/GATE_RESOLVED are still emitted).
- `GET/POST /api/graphs/:id/tests`, `PATCH/DELETE /api/tests/:id` — CRUD, validated by `parseTestCase`
  in `lib/test-cases.ts`. `POST /api/graphs/:id/tests/run` starts one run per test through
  `lib/start-run.ts` (shared with `POST /api/runs`) and sets `lastResult = PENDING`; `GET …/tests`
  grades pending tests whose run has ended (`gradeRun`, unit-tested in Jest) and stores `lastResult`.
- UI: the console's Tests tab lists tests (Run all, delete with inline confirm); "Save as test" in the
  console summary after a COMPLETE run opens a form prefilled with the input, the visited path and the
  first output line (output assertions are brittle with real models — clear the text if a test flaps).
- CI: `.github/workflows/ci.yml` runs tsc/eslint/jest and pytest (fake models, no DB). `npm run
  test:graphs` (`scripts/test-graphs.mjs`) runs every graph's tests against a live `AGENTFORGE_URL` and
  exits non-zero on a FAIL; CI runs it only when that secret is set.

## Transpiler (Week 3 — complete)

Graph → LangGraph Python **as a string** (`POST /api/graphs/:id/transpile` →
`{ language, code, order }`; `422 { error, code, piece }` for unsupported graphs; 404 if missing).
Optional body `{ graphJson }` transpiles the editor's unsaved canvas (used by the console's **Code** tab).
Execution is the engine's job (below).

- **`lib/transpiler/walk.ts`** — one general `plan(graph, registry)`: validation + topological
  order. Node kinds are self-contained so all patterns compose:
  - `agent` → StateGraph node; tools attached to it run in a loop *inside* the node
    (`run_with_tools`), only the final answer enters shared state.
  - `human_gate` → node calling `interrupt()`; reject raises `GateRejected`; graph compiles with
    `InMemorySaver` when any gate exists.
  - `router` → NOT a node: routing function (`last` = last message text, `state` in scope) +
    `add_conditional_edges` on its single predecessor (or START). `data.routes` is authoritative;
    edges are cross-checked.
  - `tool` → NOT a node: attaches to every agent it shares an edge with; `functionName` must name a
    registry tool whose `code` defines that function. Agent `data.tools` names resolve the same way.
  - Fan-out = plain edges; fan-in = join edge `add_edge([...], x)` (waits for all branches) — except
    in graphs with routers, where fan-in is exclusive branches reconverging (plain edges).
- **Rejected (clear 422 messages):** memory nodes, cycles, ≠1 entry node, router→router, router
  with >1 incoming edge, a node feeding a router that also fans out, **parallel fan-out combined
  with routers in one graph**, tool nodes not wired to agents, unknown models / registry tools.
- **`lib/transpiler/transpile.ts`** renders the plan: model→provider mapping, identifier
  allocation (reserved names + tool names), nunjucks templates in `templates/`
  (`graph.njk`, `agent_node.njk`, `gate_node.njk`, `router_node.njk`). Strings are always escaped
  (`pyTripleQuoted` / `pyString`).
- **`lib/graph-templates.ts`** — starter graphs (research = tools, support = router + gate,
  code_review = fan-out/fan-in); used by `POST /api/graphs` and `prisma/seed.ts`.
- **Tests:** `lib/transpiler/__tests__/transpile.test.ts`, incl. `py_compile` of every template's
  output (auto-skips without Python). Generated code is executed with fake models in `backend/tests`.
- Output is always LF (templates may be checked out CRLF by git autocrlf).
- **Agent prompts:** agents share one message list, but each agent is sent `agent_input()` —
  system prompt + the whole history folded into ONE user message ("Request:", "Output from
  <node>:"; replies carry `name` = node name). Claude 5.5 models 400 on a request ending with an
  assistant turn, and earlier agents' replies are context, not the agent's own turns.

## Editor behavior worth knowing

- Router edges are kept in sync with `routes` by the store (`syncRouterEdges`): editing a route
  redraws its edge, dragging from a route handle sets its target, deleting the edge clears it.
- Routers emit no run events; `edges.tsx` lights a router's branch once its target node has run (the
  other branches stay dim).
- History (console tab) lists the last 20 runs from `GET /api/runs?graphId=`; clicking one makes it
  the active run and the WebSocket replays its stored events, so the canvas re-animates.

## UI ("Flight Deck", revamp started 2026-11-08)

Design source: the Flight Deck prototype artifact (see memory). Dark-first, light theme via
`next-themes` (`data-theme` on `<html>`). **All colors are CSS tokens in `app/globals.css`** — never
hex in components; node-type hues are `NODE_HUE` (`var(--t-agent)` …), validated colorblind-safe.
Classes are prefixed `af-`; Tailwind is only for the odd utility.

- Shell: `components/shell/` — `rail.tsx` (sections + node types to drag/click in), command palette
  (⌘K), dialog, toast, deploy dialog, graph thumbnail. Chrome state lives in `store/ui-store.ts`.
- Run stream: `lib/run-stream.tsx` (`RunStreamProvider`) owns the WebSocket, mirrors events into the
  graph store (canvas animation) and folds them into a timeline (trace, waterfall, telemetry). Replay
  = `useRunStream().replay(run)`.
- Canvas page: rail · top bar (name, version, telemetry, Save, Run popover / Stop) · React Flow canvas
  + inspector (`node-config-panel.tsx`) · bottom console (`components/console/`: Trace, Waterfall,
  Output, Tests, History, Code). Keys: ⌘S, ⌘↵, ⌘K, `G` then L/C/R/T/O/D/P, `F` fit, Esc.
- Geist loads from Google Fonts at runtime (`shortcut:` in globals.css; move to `next/font`).
- Retired model values are upgraded on `loadGraph` (`LEGACY_MODEL_ALIASES`; transpiler also maps them).
- Tailwind is v4: `app/globals.css` must use `@import "tailwindcss"` (the v3 `@tailwind` directives
  silently drop the theme — every spacing/sizing utility disappears).

## Phase 0 — Cleanup (2026-11-02)

- Models carry `apiModel`; HuggingFace emits `ChatHuggingFace(llm=HuggingFaceEndpoint(...))`,
  Ollama uses `num_predict`; unknown model → `TranspileError`.
- `GET /api/runs/:id` lives in `app/api/runs/[id]/route.ts`. Missing records → 404 (not 500);
  backend dispatch checks `res.ok`; gate decisions recorded only after the engine accepts them.
  `Run → Graph` cascades on delete (migration `run_cascade_delete`).
- `app/page.tsx` is the graph library; the run stream mirrors run events into the store so the canvas
  animates; Save/Run check responses; ⌘S/Ctrl+S saves; selection/measurement no longer marks dirty.
- `tsc`, `eslint` (0 errors / 0 warnings), and `next build` are all clean.
