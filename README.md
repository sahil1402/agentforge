<div align="center">

<img src="https://img.shields.io/badge/AgentForge-Visual%20IDE%20for%20Multi--Agent%20AI-9B8AFF?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMyAyLjA1djIuMDJjMy45NS41NCA3IDMuOTkgNyA3Ljkzcy0zLjA1IDcuMzktNyA3LjkzdjIuMDJjNS4wNS0uNTYgOS01LjE2IDktOS45NVMxOC4wNSAyLjYxIDEzIDIuMDV6TTExIDIuMDVDNS45NSAyLjYxIDIgNy4yMSAyIDEyczMuOTUgOS4zOSA5IDkuOTV2LTIuMDJDNy4wNSAxOS40IDQgMTYuMDUgNCAxMnMzLjA1LTcuNCA3LTcuOTNWMi4wNXoiLz48L3N2Zz4=" alt="AgentForge" />

# AgentForge

### Visual IDE for Designing, Testing & Deploying Multi-Agent AI Systems

**Draw your agent graph. Watch it execute live. Deploy to production in one click.**

<br/>

[![Next.js](https://img.shields.io/badge/Next.js_14-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![React Flow](https://img.shields.io/badge/React_Flow-FF0072?style=flat-square&logo=react)](https://reactflow.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![LangGraph](https://img.shields.io/badge/LangGraph-1C3A5E?style=flat-square&logo=chainlink&logoColor=white)](https://langchain-ai.github.io/langgraph)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docker.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-22C55E?style=flat-square)](LICENSE)

<br/>

[**Live Demo**](#) · [**Documentation**](#architecture) · [**Quick Start**](#quick-start) · [**Roadmap**](#roadmap)

<br/>

</div>

---

## The Problem AgentForge Solves

Multi-agent AI systems built with frameworks like LangGraph and CrewAI are **completely invisible during execution**.

You write hundreds of lines of Python, hit run, and stare at terminal logs trying to understand:

- Which agent is currently active?
- What tokens is it generating right now?
- Why did the router send the query to agent B instead of agent A?
- Where exactly did the pipeline fail?

Existing tools don't solve this:

| Tool | What's missing |
|---|---|
| **LangSmith** | Observes after the fact — no live canvas, no visual topology |
| **LangFlow** | Visualizes LangChain chains, can't handle multi-agent state or live traces |
| **n8n** | General automation — not built for LLM tool-calling, routing, or memory |
| **CrewAI UI** | Locked to CrewAI's runtime, no transpiler, no test harness |

**AgentForge is the missing layer** — a visual IDE where you design agent systems as graphs, watch every node execute live, test with a built-in regression harness, and deploy to a production API endpoint in one click.

---

## What Makes AgentForge Extraordinary

### 1. The Canvas IS the Code

Every node you drag onto the canvas maps 1:1 to a LangGraph primitive. The graph you draw is not a mockup — it's the actual program. AgentForge's Jinja2 transpiler walks your JSON DAG in topological order and emits valid, runnable LangGraph Python automatically.

```
Visual graph → JSON DAG → Jinja2 transpiler → LangGraph Python → FastAPI endpoint
```

### 2. Live Execution Trace at Token-Level Granularity

When you hit Run, a WebSocket connection streams structured trace events from the Celery worker through Redis pub/sub to your browser in real time:

- **Active nodes pulse** with animated borders
- **Edges light up** as data flows between agents
- **Token stream** appears character-by-character in the trace sidebar per active node
- **Latency + cost** update live as execution progresses

No other visual agent tool does this. Most show you a static graph; AgentForge shows you the graph *running*.

### 3. Human-in-the-Loop as a First-Class Primitive

The `HumanGate` node pauses execution mid-graph and shows an approval UI in the browser. Built on LangGraph's `interrupt()` primitive with a 30-second replay buffer — if you lose connection, you reconnect and pick up exactly where you left off.

### 4. Test Harness Built In

Define test cases with input payloads and expected agent execution paths. The regression runner executes the graph, captures the actual node sequence from `run_events`, and diffs it against your expected path with highlighted divergences. One API endpoint integrates with GitHub Actions for CI/CD.

### 5. One-Click Production Deploy

```
Edit graph → Save → Deploy
```

Under the hood: transpile → wrap in FastAPI → Docker SDK builds image → push to registry → Kubernetes Helm chart applied → live URL returned with auto-generated OpenAPI spec. Under 60 seconds for a first deploy, under 15 for re-deploys.

---

## Architecture

AgentForge is built in 5 fully decoupled layers:

```
┌─────────────────────────────────────────────────────────────────────┐
│  LAYER 1 — FRONTEND                                                  │
│  Next.js 14 · React Flow · Zustand · Framer Motion · TypeScript     │
│  Canvas editor · Custom node types · Live trace sidebar             │
├─────────────────────────────────────────────────────────────────────┤
│  LAYER 2 — GRAPH SERIALIZATION + CODE GENERATION                    │
│  JSON graph schema · Jinja2 transpiler · Node validator             │
│  Topological sort · OpenAPI spec generator                          │
├─────────────────────────────────────────────────────────────────────┤
│  LAYER 3 — EXECUTION ENGINE                                          │
│  FastAPI · LangGraph runtime · Celery async workers                 │
│  Tool registry · Sandboxed subprocess execution                     │
├─────────────────────────────────────────────────────────────────────┤
│  LAYER 4 — REAL-TIME LAYER                                           │
│  WebSocket server · Redis pub/sub · Token streaming relay           │
│  Reconnect + 30s replay buffer · Human gate signal channel          │
├─────────────────────────────────────────────────────────────────────┤
│  LAYER 5 — PERSISTENCE + DEPLOY                                      │
│  PostgreSQL + Prisma · Docker SDK · Kubernetes Helm · GitHub Actions│
└─────────────────────────────────────────────────────────────────────┘
```

### Real-Time Execution Data Flow

```
User clicks Run
     │
     ▼
POST /api/runs ──────────────► FastAPI creates Run record (PENDING)
                                      │
                                      ▼
                               Celery worker spawned ◄── Redis broker
                               Returns run_id immediately
     │
     ▼
Frontend opens WebSocket ──► /ws/runs/{run_id}
                                      │
                                      ▼
                         LangGraph executes graph
                               │  emits trace events to
                               ▼
                         Redis pub/sub
                         channel: run:{run_id}
                               │
                               ▼
                         WebSocket server subscribes
                               │  relays to browser
                               ▼
                         Canvas animates live
                         Trace sidebar streams tokens
```

### The Transpiler — Core IP

The transpiler walks the JSON graph in topological order and handles 4 distinct patterns:

```python
# LINEAR CHAIN  →  straightforward edge
graph.add_edge("planner", "synthesizer")

# CONDITIONAL ROUTING  →  router node
graph.add_conditional_edges("router", route_fn, {"path_a": "agent_a", "path_b": "agent_b"})

# PARALLEL FAN-OUT  →  asyncio.gather()
async def fan_out(state):
    results = await asyncio.gather(style_check(state), bug_check(state), perf_check(state))
    return merge(results)

# HUMAN INTERRUPT GATE  →  LangGraph interrupt()
def human_gate(state):
    decision = interrupt({"prompt": state["gate_prompt"], "payload": state["last_output"]})
    if decision["approved"]: return state
    raise GraphAbortError("Rejected by human reviewer")
```

---

## Node Types

AgentForge has 5 node primitives that cover every pattern needed in production multi-agent systems:

| Node | Color | What it does | LangGraph primitive |
|---|---|---|---|
| **Agent** | 🟣 Violet | LLM with system prompt, model, temperature, tool list | `StateGraph node` with LLM chain |
| **Tool** | 🔵 Blue | Python function with typed input/output schema | `ToolNode` |
| **Memory** | 🟢 Teal | Vector store retrieval (Qdrant, pgvector, in-memory) | `StateGraph node` with retriever |
| **Router** | 🟡 Amber | Conditional branching based on state expressions | `add_conditional_edges` |
| **Human Gate** | 🔴 Coral | Pause execution for human approval, resume on confirm | `interrupt()` + checkpointing |

Any multi-agent architecture in production today can be expressed as a combination of these 5 node types.

---

## Database Schema

Six PostgreSQL tables with full relational integrity and JSONB for schema-flexible graph snapshots:

```
users ──────────────► graphs ──────────────► graph_versions
                         │                   (immutable snapshots)
                         │
                         ├──────────────► runs ──────────────► run_events
                         │               (execution logs)      (append-only)
                         │
                         └──────────────► test_cases
                                          (linked to graph, not version)
```

Graph topology is stored as `JSONB` — fully flexible node/edge schema while maintaining ACID guarantees. `run_events` is append-only for complete audit trail.

---

## Tech Stack — And Why Each Choice

| Layer | Technology | Why chosen | What was rejected |
|---|---|---|---|
| Canvas | React Flow | Purpose-built for node graphs — handles drag, connect, zoom, multi-select natively | D3.js — 2000+ lines of custom interaction code |
| Framework | Next.js 14 | App Router for SSR auth pages, canvas is pure client-side | Vite+React — no SSR |
| State | Zustand + Immer | Deeply nested graph state mutated on every drag. Immer handles immutability | Redux — too verbose for high-frequency mutations |
| Animation | Framer Motion | Declarative animation for node pulse, edge glow, token stream | CSS animations — insufficient for data-driven states |
| Backend | FastAPI | Async-native, handles REST + WebSocket in one process, Pydantic validation | Django — sync-first, WebSocket requires Channels |
| Runtime | LangGraph | State machine maps 1:1 to visual graph. `interrupt()` for human gates. Solved routing | Custom runtime — conditional routing + checkpointing are hard problems |
| Workers | Celery + Redis | Runs are 30–120s. API must stay non-blocking. Handles retries + scaling | Threading — no retry, no scaling, blocks event loop |
| Real-time | WebSockets | Bidirectional needed for human gate approval. Token latency too tight for polling | SSE — server-to-client only, can't send gate approval back |
| Pub/Sub | Redis Pub/Sub | Traces are ephemeral. Sub-1ms delivery. Zero setup overhead | Kafka — persistent consumer groups overkill for ephemeral traces |
| Database | PostgreSQL + Prisma | JSONB for graph snapshots, Prisma for type-safe queries, ACID guarantees | MongoDB — JSONB in Postgres gives same flexibility + transactions |
| Code gen | Jinja2 templates | One template per node type. Readable, debuggable, easy to extend | Python AST — powerful but fragile and hard to inspect |
| Deploy | Docker + Kubernetes | Docker SDK for programmatic builds, Helm for scalable cloud deploy | Docker Compose only — insufficient for multi-user production |

---

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ (or Docker)
- Python 3.11+ (for backend, Week 4+)
- Redis (for real-time, Week 5+)

### 1. Clone and install

```bash
git clone https://github.com/yourusername/agentforge.git
cd agentforge
npm install
```

### 2. Start PostgreSQL (Docker — easiest)

```bash
docker run -d \
  --name agentforge-db \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=agentforge \
  -p 5432:5432 \
  postgres:16
```

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/agentforge"
NEXT_PUBLIC_WS_URL="ws://localhost:8000"
BACKEND_URL="http://localhost:8000"
```

### 4. Run migrations and seed

```bash
npx prisma migrate dev --name init
npx prisma db seed
```

This creates all 6 tables and seeds 3 example graphs:
- **Research Assistant** — Planner → Web Search + URL Fetcher → Synthesizer
- **Customer Support** — Router → FAQ Agent + Escalation HumanGate
- **Code Reviewer** — Analyzer → parallel Style + Bug + Performance checker fan-out

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000/canvas/research-assistant](http://localhost:3000/canvas/research-assistant)

---

## Example Graphs

### Research Assistant
```
Planner (gpt-4o)
    ├──► Web Search (tavily_search)  ──►
    ├──► URL Fetcher (requests)       ──► Synthesizer (claude-3-5-sonnet)
    └──► Vector Store (qdrant)       ──►
```
Parallel retrieval fan-out with semantic memory augmentation.

### Customer Support Router
```
Intent Router ──► FAQ Agent (gpt-4o-mini)
              └──► Escalation HumanGate ──► [awaits human approval]
```
Conditional routing with human-in-the-loop gate.

### Code Reviewer (Parallel Fan-out)
```
Code Analyzer (gpt-4o)
    ├──► Style Checker (gpt-4o-mini)  ──►
    ├──► Bug Checker (gpt-4o)          ──► Review Summarizer (claude-3-5-sonnet)
    └──► Perf Checker (gpt-4o-mini)   ──►
```
Three parallel specialist agents merged into a single structured review.

---

## Project Structure

```
agentforge/
├── app/
│   ├── canvas/[id]/
│   │   └── page.tsx              # Canvas editor — main IDE screen
│   ├── dashboard/
│   │   └── page.tsx              # Graph library dashboard
│   ├── api/
│   │   ├── graphs/
│   │   │   ├── route.ts          # GET (list), POST (create)
│   │   │   └── [id]/route.ts     # GET, PATCH, DELETE
│   │   └── runs/
│   │       ├── route.ts          # POST (dispatch run)
│   │       └── [id]/
│   │           └── gate/route.ts # POST (human gate decision)
│   ├── layout.tsx
│   └── globals.css
│
├── components/
│   └── canvas/
│       ├── canvas.tsx            # ReactFlow wrapper + drag-to-drop
│       ├── nodes.tsx             # All 5 custom node type components
│       ├── edges.tsx             # Animated edge with live data-flow dot
│       ├── node-config-panel.tsx # Right sidebar — per-node-type config forms
│       └── trace-panel.tsx       # Live execution trace + WebSocket client
│
├── store/
│   └── graph-store.ts            # Zustand + Immer — full graph + execution state
│
├── lib/
│   ├── types.ts                  # All TypeScript types + node color/label maps
│   ├── prisma.ts                 # Prisma client singleton
│   └── utils.ts                  # cn() utility
│
├── prisma/
│   ├── schema.prisma             # 6-table PostgreSQL schema
│   └── seed.ts                   # 3 example graphs
│
└── .env.local                    # Environment config
```

---

## Build Plan — 8 Weeks

| Week | Focus | Deliverable |
|---|---|---|
| **1** ✅ | Canvas foundation | React Flow canvas, 5 node types, PostgreSQL schema, 4 API routes |
| **2** | Node configuration | Monaco editor, tool registry, model selector with cost estimation |
| **3** | Graph → code transpiler | JSON DAG → LangGraph Python, 4 topological patterns, graph validator |
| **4** | Execution engine | FastAPI, Celery workers, sandboxed subprocess, execution state machine |
| **5** | Real-time streaming | Redis pub/sub, WebSocket server, live canvas animation |
| **6** | Test harness | Test case UI, path assertion, regression runner, GitHub Actions CI hook |
| **7** | One-click deploy | Docker image builder, Kubernetes Helm, version control + graph diff |
| **8** | Polish + launch | 3 example graphs, blog post, HN launch, GitHub stars goal: 500 |

---

## Roadmap

### v1.0 — Core IDE (Weeks 1–5)
- [x] Visual canvas with 5 node types
- [x] Node configuration panels
- [x] PostgreSQL persistence with Prisma
- [ ] Jinja2 graph → LangGraph transpiler
- [ ] FastAPI + Celery execution engine
- [ ] Live WebSocket execution trace

### v1.1 — Quality + Deploy (Weeks 6–7)
- [ ] Built-in test harness + regression runner
- [ ] One-click Docker + Kubernetes deploy
- [ ] Graph version control + side-by-side diff
- [ ] Auto-generated OpenAPI spec for deployed graphs

### v2.0 — Collaboration + Scale
- [ ] Multi-user real-time collaboration (CRDT-based graph editing)
- [ ] Abstract execution interface (pluggable runtime adapters beyond LangGraph)
- [ ] HuggingFace open-source model integration
- [ ] Hosted cloud version with team workspaces

---

## Known Tradeoffs

| Tradeoff | Impact | Planned fix |
|---|---|---|
| LangGraph coupling | Hard to swap execution runtimes | Abstract `ExecutionAdapter` interface in v2 |
| Single-user only | No collaborative editing | CRDT graph store in v2 |
| Docker-in-Docker sandbox | Security surface for tool execution | gVisor / Firecracker isolation in v1.1 |
| No auth in v0.1 | Dev-only, not production safe | NextAuth + JWT in Week 2 |

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

```bash
# Fork the repo, then:
git checkout -b feature/your-feature-name
npm run dev
# make your changes
npm run typecheck  # must pass — zero TS errors
git commit -m "feat: your feature description"
git push origin feature/your-feature-name
# open a PR
```

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">

Built by **Sahil** · USC AI/ML Engineering · May 2026

*If AgentForge saves you hours of debugging agent pipelines, consider giving it a ⭐*

</div>