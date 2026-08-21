import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EMPTY_TOTALS,
  foldUsage,
  formatTokens,
  transcriptFolder
} from '../src/shared/usage.ts'

describe('transcriptFolder', () => {
  it('names the folder the way Claude Code does', () => {
    assert.equal(transcriptFolder('C:\\work\\bravocore'), 'C--work-bravocore')
    assert.equal(transcriptFolder('C:\\Users\\me\\source'), 'C--Users-me-source')
  })

  it('treats both kinds of separator alike', () => {
    assert.equal(transcriptFolder('C:/Users/me/app'), 'C--Users-me-app')
  })
})

describe('foldUsage', () => {
  const turn = (usage: Record<string, number>, model = 'claude-opus-5') =>
    JSON.stringify({ type: 'assistant', message: { model, usage } })

  it('adds up what the session has written', () => {
    const totals = foldUsage(
      [turn({ output_tokens: 100 }), turn({ output_tokens: 250 })],
      EMPTY_TOTALS
    )
    assert.equal(totals.output, 350)
  })

  /*
   * Context is what the model is carrying now, so it comes from the last turn alone -
   * summing it would report a number that means nothing.
   */
  it('takes the context from the last turn rather than summing it', () => {
    const totals = foldUsage(
      [
        turn({ input_tokens: 4, cache_read_input_tokens: 1000, output_tokens: 10 }),
        turn({ input_tokens: 2, cache_read_input_tokens: 5000, cache_creation_input_tokens: 500 })
      ],
      EMPTY_TOTALS
    )
    assert.equal(totals.context, 5502)
  })

  it('remembers the model that answered', () => {
    assert.equal(foldUsage([turn({ output_tokens: 1 })], EMPTY_TOTALS).model, 'claude-opus-5')
  })

  it('carries totals across calls, so a poll only reads what is new', () => {
    const first = foldUsage([turn({ output_tokens: 100 })], EMPTY_TOTALS)
    const second = foldUsage([turn({ output_tokens: 40 })], first)
    assert.equal(second.output, 140)
  })

  /* A transcript is appended to while it is read; the last line is often half-written. */
  it('ignores a line that is not finished, and lines that carry no usage', () => {
    const totals = foldUsage(
      ['{"type":"user","message":{"content":"hi"}}', '{"message":{"usa', '', '   '],
      EMPTY_TOTALS
    )
    assert.deepEqual(totals, EMPTY_TOTALS)
  })
})

describe('formatTokens', () => {
  it('stays exact while the number is small', () => {
    assert.equal(formatTokens(0), '0')
    assert.equal(formatTokens(812), '812')
  })

  it('keeps one decimal where it carries information', () => {
    assert.equal(formatTokens(1200), '1.2k')
    assert.equal(formatTokens(9500), '9.5k')
  })

  it('drops the decimal once the number is large enough not to need it', () => {
    assert.equal(formatTokens(41_200), '41k')
    assert.equal(formatTokens(872_613), '873k')
  })

  it('switches to millions rather than printing five digits', () => {
    assert.equal(formatTokens(1_300_000), '1.3M')
  })
})
