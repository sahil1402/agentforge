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
