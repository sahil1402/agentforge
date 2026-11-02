import type { GraphSchema, GraphNode } from '@/lib/types'

// ─── Starter graphs for "New graph" ──────────────────────────────────────────
// Each one exercises a transpiler pattern: tools, routing + human gate, and
// parallel fan-out / fan-in. Tool nodes name tools from the registry seed.

export type TemplateId = 'blank' | 'research' | 'support' | 'code_review'

const agent = (
  id: string, x: number, y: number, label: string, model: string, systemPrompt: string,
  temperature = 0.3, maxTokens = 1024,
): GraphNode => ({
  id, type: 'agent', position: { x, y },
  data: { nodeType: 'agent', label, model, systemPrompt, temperature, maxTokens, tools: [] },
})

const tool = (id: string, x: number, y: number, label: string, functionName: string, description: string): GraphNode => ({
  id, type: 'tool', position: { x, y },
  data: { nodeType: 'tool', label, functionName, description, parameterSchema: {}, returnType: 'Any' },
})

export function getTemplate(template: string): GraphSchema {
  if (template === 'research') {
    return {
      nodes: [
        agent('planner', 60, 200, 'Planner', 'gpt-4o',
          'You are a research planner. Use your tools to gather sources for the query, then summarize what you found.'),
        tool('search', 60, 0, 'Web Search', 'web_search', 'Search the web for results.'),
        tool('fetch', 60, 400, 'URL Fetcher', 'http_request', 'Fetch the content of a URL.'),
        agent('synth', 440, 200, 'Synthesizer', 'claude-sonnet-5-5',
          'Synthesize the gathered sources into a coherent research summary.', 0.7, 2048),
      ],
      edges: [
        // Planner → tool edges attach tools the planner can call.
        { id: 'e1', source: 'planner', target: 'search' },
        { id: 'e2', source: 'planner', target: 'fetch' },
        { id: 'e3', source: 'planner', target: 'synth' },
      ],
    }
  }

  if (template === 'support') {
    return {
      nodes: [
        { id: 'router', type: 'router', position: { x: 60, y: 200 },
          data: { nodeType: 'router', label: 'Intent Router',
            condition: '"escalate" if "refund" in last.lower() else "faq"',
            routes: [{ label: 'faq', target: 'faq' }, { label: 'escalate', target: 'gate' }] } },
        agent('faq', 440, 40, 'FAQ Agent', 'gpt-4o-mini', 'Answer common customer support questions.', 0.3, 512),
        { id: 'gate', type: 'human_gate', position: { x: 440, y: 330 },
          data: { nodeType: 'human_gate', label: 'Escalation Gate',
            prompt: 'Review this escalation request and approve or reject.', timeoutSeconds: 300, approvalRequired: true } },
        agent('escalation', 820, 330, 'Escalation Agent', 'gpt-4o',
          'Draft a careful reply for an approved escalation (e.g. a refund request).', 0.3, 1024),
      ],
      edges: [
        { id: 'e1', source: 'router', target: 'faq',  sourceHandle: 'faq' },
        { id: 'e2', source: 'router', target: 'gate', sourceHandle: 'escalate' },
        { id: 'e3', source: 'gate', target: 'escalation' },
      ],
    }
  }

  if (template === 'code_review') {
    return {
      nodes: [
        agent('analyzer', 60, 240, 'Code Analyzer', 'gpt-4o', 'Summarize what the submitted code does and where the risky parts are.'),
        agent('style', 440, 0, 'Style Checker', 'gpt-4o-mini', 'Review the code for style and readability issues only.'),
        agent('bugs', 440, 240, 'Bug Checker', 'gpt-4o', 'Review the code for correctness bugs only.'),
        agent('perf', 440, 480, 'Perf Checker', 'gpt-4o-mini', 'Review the code for performance problems only.'),
        agent('summary', 820, 240, 'Review Summarizer', 'claude-sonnet-5-5',
          'Merge the style, bug and performance reviews into one prioritized review.', 0.5, 2048),
      ],
      edges: [
        { id: 'e1', source: 'analyzer', target: 'style' },
        { id: 'e2', source: 'analyzer', target: 'bugs' },
        { id: 'e3', source: 'analyzer', target: 'perf' },
        { id: 'e4', source: 'style', target: 'summary' },
        { id: 'e5', source: 'bugs', target: 'summary' },
        { id: 'e6', source: 'perf', target: 'summary' },
      ],
    }
  }

  return { nodes: [], edges: [] }
}
