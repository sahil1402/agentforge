@AGENTS.md

## Roadmap decisions (agreed 2026-11-02)

- Week 4 execution engine ships **without Celery/Redis** first (FastAPI background task +
  in-process WebSocket fan-out); add Celery/Redis only when multiple workers are needed.
- A canvas **Tool node = a tool its connected agent can call** (not a fixed pipeline step).
- **Kubernetes/Helm is cut from v1**; deploy = FastAPI wrapper + Dockerfile.
- Order: Phase 0 cleanup ✅ → Phase 1 transpiler ✅ → Phase 2 execution engine → Phase 3 live
  canvas → Phase 4 test harness → Phase 5 deploy → Phase 6 polish/launch.

## Transpiler (Week 3 — complete)

Graph → LangGraph Python **as a string** (`POST /api/graphs/:id/transpile` →
`{ language, code, order }`; `422 { error, code, piece }` for unsupported graphs; 404 if missing).
Optional body `{ graphJson }` transpiles the editor's unsaved canvas (used by **Show Code**).
Nothing is executed yet — that is Phase 2.

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
- **Tests:** `lib/transpiler/__tests__/transpile.test.ts` — 46 passing, incl. `py_compile` of every
  template's output (auto-skips without Python). Generated code was also executed against real
  LangGraph 1.2 / langchain-core 1.7 with fake chat models (tool loop, gate interrupt/approve/reject,
  join runs once, uneven branches) — bring that harness into `backend/tests` in Phase 2.
- **Known runtime risk for Phase 2:** agents share one message list, so a downstream agent sees
  the previous agent's reply as the last (assistant) message — newer Claude models may reject a
  trailing assistant turn. Verify with real APIs and adjust message assembly if needed.

## Editor behavior worth knowing

- Router edges are kept in sync with `routes` by the store (`syncRouterEdges`): editing a route
  redraws its edge, dragging from a route handle sets its target, deleting the edge clears it.
- Retired model values are upgraded on `loadGraph` (`LEGACY_MODEL_ALIASES`; transpiler also maps them).
- Tailwind is v4: `app/globals.css` must use `@import "tailwindcss"` (the v3 `@tailwind` directives
  silently drop the theme — every spacing/sizing utility disappears).

## Phase 0 — Cleanup (2026-11-02)

- Models carry `apiModel`; HuggingFace emits `ChatHuggingFace(llm=HuggingFaceEndpoint(...))`,
  Ollama uses `num_predict`; unknown model → `TranspileError`.
- `GET /api/runs/:id` lives in `app/api/runs/[id]/route.ts`. Missing records → 404 (not 500);
  backend dispatch checks `res.ok`; gate decisions recorded only after the engine accepts them.
  `Run → Graph` cascades on delete (migration `run_cascade_delete`).
- `app/page.tsx` is the graph library; trace panel mirrors run events into the store so the canvas
  animates; Save/Run check responses; ⌘S/Ctrl+S saves; selection/measurement no longer marks dirty.
- `tsc`, `eslint` (0 errors / 0 warnings), and `next build` are all clean.
