import { gradeRun, parseTestCase } from '@/lib/test-cases'

const complete = (output: string) => ({ status: 'COMPLETE' as const, outputPayload: { output } })
const review = { expectedPath: ['analyzer', 'style', 'summary'], expectedOutputContains: 'looks good' }

test('passes when the visited set matches in any order and the output contains the text', () => {
  expect(gradeRun(review, complete('LGTM: Looks Good to me'), ['summary', 'analyzer', 'style'])).toBe('PASS')
})

test('fails on a different path', () => {
  expect(gradeRun(review, complete('looks good'), ['analyzer', 'bugs', 'summary'])).toBe('FAIL')
  expect(gradeRun(review, complete('looks good'), ['analyzer', 'style'])).toBe('FAIL') // one node missing
})

test('fails on the output or a failed run, and stays pending while running', () => {
  expect(gradeRun(review, complete('needs work'), ['analyzer', 'style', 'summary'])).toBe('FAIL')
  expect(gradeRun(review, { status: 'FAILED', outputPayload: null }, ['analyzer'])).toBe('FAIL')
  expect(gradeRun(review, { status: 'RUNNING', outputPayload: null }, ['analyzer'])).toBe('PENDING')
})

test('an empty path and a null output text are not checked', () => {
  expect(gradeRun({ expectedPath: [], expectedOutputContains: null }, complete('anything'), ['x'])).toBe('PASS')
})

test('parseTestCase validates at the boundary', () => {
  expect(parseTestCase({ name: ' refund ', inputPayload: { query: 'refund' }, expectedPath: ['gate'] })).toEqual({
    data: { name: 'refund', inputPayload: { query: 'refund' }, expectedPath: ['gate'], expectedOutputContains: null },
  })
  expect(parseTestCase({ name: '', inputPayload: {}, expectedPath: [] })).toHaveProperty('error')
  expect(parseTestCase({ name: 'x', inputPayload: [], expectedPath: [] })).toHaveProperty('error')
  expect(parseTestCase({ name: 'x', inputPayload: {}, expectedPath: [1] })).toHaveProperty('error')
  expect(parseTestCase({ name: 'x', inputPayload: {}, expectedPath: [], expectedOutputContains: 7 })).toHaveProperty('error')
  expect(parseTestCase({ expectedOutputContains: '' }, true)).toEqual({ data: { expectedOutputContains: null } })
  expect(parseTestCase({}, true)).toEqual({ data: {} })
  expect(parseTestCase('nope', true)).toHaveProperty('error')
})
