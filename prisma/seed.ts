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