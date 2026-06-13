require('dotenv').config()
const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'dev@agentforge.local' },
    update: {},
    create: {
      id: 'dev-user',
      email: 'dev@agentforge.local',
      name: 'Dev User',
    },
  })

  // ============================================================
// Tool Registry — 4 starter tools
// ============================================================

const starterTools = [
  {
    name: "web_search",
    description: "Search the web and return top results with title, URL, and snippet.",
    category: "builtin",
    paramSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        max_results: { type: "integer", default: 5, minimum: 1, maximum: 20 },
      },
      required: ["query"],
    },
    returnSchema: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          snippet: { type: "string" },
        },
      },
    },
    code: `import httpx

async def web_search(query: str, max_results: int = 5) -> list[dict]:
    """Search the web via Tavily API."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.tavily.com/search",
            json={"query": query, "max_results": max_results},
            headers={"Authorization": f"Bearer {os.environ['TAVILY_API_KEY']}"},
        )
        results = resp.json()["results"]
    return [{"title": r["title"], "url": r["url"], "snippet": r["content"]} for r in results]
`,
  },
  {
    name: "http_request",
    description: "Make an HTTP request and return the JSON or text response.",
    category: "builtin",
    paramSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Target URL" },
        method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"], default: "GET" },
        headers: { type: "object", additionalProperties: { type: "string" } },
        body: { type: "object" },
      },
      required: ["url"],
    },
    returnSchema: {
      type: "object",
      properties: {
        status: { type: "integer" },
        body: {},
      },
    },
    code: `import httpx

async def http_request(url: str, method: str = "GET", headers: dict | None = None, body: dict | None = None) -> dict:
    """Make an HTTP request."""
    async with httpx.AsyncClient() as client:
        resp = await client.request(method, url, headers=headers or {}, json=body)
    try:
        return {"status": resp.status_code, "body": resp.json()}
    except Exception:
        return {"status": resp.status_code, "body": resp.text}
`,
  },
  {
    name: "code_exec",
    description: "Execute a Python snippet in a sandboxed subprocess and return stdout.",
    category: "builtin",
    paramSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Python code to execute" },
        timeout_s: { type: "integer", default: 10, minimum: 1, maximum: 60 },
      },
      required: ["code"],
    },
    returnSchema: {
      type: "object",
      properties: {
        stdout: { type: "string" },
        stderr: { type: "string" },
        exit_code: { type: "integer" },
      },
    },
    code: `import subprocess, sys

def code_exec(code: str, timeout_s: int = 10) -> dict:
    """Execute Python in a subprocess sandbox."""
    result = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True, text=True, timeout=timeout_s,
    )
    return {
        "stdout": result.stdout,
        "stderr": result.stderr,
        "exit_code": result.returncode,
    }
`,
  },
  {
    name: "sql_query",
    description: "Run a read-only SQL query against the configured database and return rows.",
    category: "builtin",
    paramSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "SELECT statement only" },
        limit: { type: "integer", default: 100, minimum: 1, maximum: 1000 },
      },
      required: ["query"],
    },
    returnSchema: {
      type: "array",
      items: { type: "object" },
    },
    code: `import asyncpg, os

async def sql_query(query: str, limit: int = 100) -> list[dict]:
    """Read-only SQL query."""
    if not query.strip().upper().startswith("SELECT"):
        raise ValueError("Only SELECT queries are allowed.")
    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        rows = await conn.fetch(f"{query} LIMIT {limit}")
        return [dict(r) for r in rows]
    finally:
        await conn.close()
`,
  },
];

for (const tool of starterTools) {
  await prisma.tool.upsert({
    where: { name: tool.name },
    update: {
      description: tool.description,
      paramSchema: tool.paramSchema,
      returnSchema: tool.returnSchema,
      code: tool.code,
      category: tool.category,
    },
    create: tool,
  });
  console.log(`✓ Tool: ${tool.name}`);
}

  // ============================================================
  // Graph — Research Assistant
  // ============================================================s

  await prisma.graph.upsert({
    where: { id: 'research-assistant' },
    update: {},
    create: {
      id: 'research-assistant',
      userId: user.id,
      name: 'Research Assistant',
      description: 'Planner → Web Search → Synthesizer',
      version: 1,
      graphJson: {
        nodes: [
          {
            id: 'planner',
            type: 'agent',
            position: { x: 60, y: 160 },
            data: {
              nodeType: 'agent',
              label: 'Planner',
              model: 'gpt-4o',
              systemPrompt: 'You are a research planner. Break the query into search sub-tasks.',
              temperature: 0.3,
              maxTokens: 1024,
              tools: [],
            },
          },
          {
            id: 'search',
            type: 'tool',
            position: { x: 340, y: 80 },
            data: {
              nodeType: 'tool',
              label: 'Web Search',
              functionName: 'tavily_search',
              description: 'Search the web.',
              parameterSchema: {},
              returnType: 'list',
            },
          },
          {
            id: 'synth',
            type: 'agent',
            position: { x: 600, y: 160 },
            data: {
              nodeType: 'agent',
              label: 'Synthesizer',
              model: 'claude-3-5-sonnet',
              systemPrompt: 'Synthesize retrieved sources into a research summary.',
              temperature: 0.7,
              maxTokens: 2048,
              tools: [],
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'planner', target: 'search' },
          { id: 'e2', source: 'search', target: 'synth' },
        ],
      },
    },
  })

  console.log('✓ Seeded: dev-user + research-assistant graph')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())