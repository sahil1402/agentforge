@AGENTS.md

## Week 3 — Transpiler (Piece 1: linear chain)

Graph → Python source transpiler. Emits LangGraph code **as a string** — nothing is
executed yet (execution is Week 4).

- **Pattern supported:** pure **linear agent chain** only (Agent → Agent → Agent, no
  branching). Validated by topological walk: every node in/out-degree ≤ 1, exactly one
  start + one end, `edges == nodes - 1`. Note `edge.type` is NOT semantic (the editor
  store hard-codes `smoothstep`), so linearity is derived from topology + node `type`.
- **Endpoint:** `POST /api/graphs/:id/transpile` → `{ language, code, order }` on success;
  `422 { error, code, piece }` for unsupported/non-linear graphs; 404 if the graph is missing.
- **Template location:** `lib/transpiler/` — `walk.ts` (validation + ordering, template-agnostic),
  `transpile.ts` (render orchestration + model→provider mapping), `errors.ts` (typed
  `TranspileError`), and nunjucks (Jinja2-style) templates in `lib/transpiler/templates/`
  (`agent_node.njk`, `graph.njk`). Generated state is `TypedDict` with
  `messages: Annotated[list, add_messages]`.
- **Guard clauses (clear "not yet supported" errors, not silent mishandling):**
  `router` → Piece 2 (routing), fan-out/fan-in → Piece 3 (parallel), `human_gate` →
  Piece 4 (human gate); `tool`/`memory` nodes → agent-only chains for now.
- **Deps added:** `nunjucks` (+ `@types/nunjucks`); `jest` / `ts-jest` / `@types/jest`
  for tests (`npm test`, config in `jest.config.js`).
- **Tests:** `lib/transpiler/__tests__/transpile.test.ts` — 12 passing (2-node & 3-node
  valid chains, single-node chain, quote-escaping, plus guard-clause rejections for
  router/gate/tool/fan-out/disconnected/empty/dangling-edge). Lint clean on all new files.
- **Still pending:** Pieces 2 (conditional routing), 3 (parallel fan-out), 4 (human gate).

## Week 3 — Transpiler (Piece 2: conditional routing)

Adds a single **conditional router** (2+ branches) on top of Piece 1's linear chain.
Still string-only (no execution — Week 4).

- **Pattern supported:** linear agent **prefix** (0+ agents) → **one router** → **2+ terminal
  agent branches** (each branch → END). A router is modelled the idiomatic LangGraph way —
  a **routing function + `add_conditional_edges`**, NOT a `StateGraph` node. `condition` is a
  raw Python expression that must evaluate to one of the route **labels**.
- **Source of truth:** `RouterNodeData.routes` (`label → target`, [lib/types.ts](lib/types.ts)) is
  authoritative for the branch map; the router's outgoing **edges** are cross-checked (every
  route must have a matching router→target edge; no stray edges) so config and canvas agree.
- **Walk (isolated):** `lib/transpiler/walk.ts` gains a `plan(graph): GraphPlan` dispatcher
  returning a discriminated union — `{kind:'linear'}` (0 routers, via untouched `linearize`)
  or `{kind:'router'}` (1 router, via new `planRouter`). `linearize` and its Piece 1 guards
  are unchanged; Piece 3 adds another union arm without editing either path.
- **Templates:** new `templates/router_node.njk` (routing function) + `templates/graph_router.njk`
  (router assembly). Piece 1's `graph.njk`/`agent_node.njk` are untouched. `transpile.ts`
  dispatches on plan kind (`transpileLinear` / `transpileRouter`).
- **Guard clauses (unchanged for parallel/human-gate):** non-router fan-out and any fan-in
  (branch reconvergence) → still **Piece 3**; `human_gate` → still **Piece 4**; `tool`/`memory`
  → agent-only. New router-specific rejections: ≥2 routers (single router only for now),
  <2 routes, empty condition, duplicate labels, **route target that doesn't resolve to a node**
  (`DISCONNECTED`), route wired in config but missing its canvas edge, and **non-terminal
  branches** (branch continuation is a later piece).
- **Tests:** same file — **22 passing** (12 linear + 10 routing: valid 3-node router, 3+
  branches, no-prefix START routing, plus rejections for missing target, missing edge,
  branch continuation, human-gate, agent fan-out, two routers, <2 routes). All Piece 1
  linear-chain tests still pass. Lint clean.
- **Still pending:** Pieces 3 (parallel fan-out), 4 (human gate).
