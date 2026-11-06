import { costUsd } from '@/lib/types'

const aMillionEach = { inputTokens: 1_000_000, outputTokens: 1_000_000, durationMs: 0 }

test('costUsd prices input and output tokens per million', () => {
  expect(costUsd('gpt-4o', aMillionEach)).toBe(12.5) // $2.5 in + $10 out
  expect(costUsd('llama3:70b', aMillionEach)).toBe(0) // local model
  expect(costUsd(undefined, aMillionEach)).toBeUndefined() // gates and routers have no model
  expect(costUsd('no-such-model', aMillionEach)).toBeUndefined()
})
