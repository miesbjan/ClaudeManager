import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { COMMITS, PERMISSION_MODE, summaryPrompt, tidySummary } from '../src/shared/summary.ts'

describe('summaryPrompt', () => {
  it('asks in the language the window is speaking', () => {
    assert.ok(summaryPrompt('cs').includes('commitů'))
    assert.ok(summaryPrompt('en').includes('commits'))
  })

  it('carries the number of commits it is given', () => {
    assert.ok(summaryPrompt('en', 25).includes('25 commits'))
    assert.ok(summaryPrompt('cs', 3).includes('3 commitů'))
  })

  /*
   * The point of the button is a summary in the language of what the thing does. Asked
   * without saying so, an agent answers with file names, which is what the user
   * explicitly did not want.
   */
  it('asks for the business side, not the files', () => {
    const en = summaryPrompt('en').toLowerCase()
    assert.ok(en.includes('not of which files changed'))
    assert.ok(en.includes('done') && en.includes('next'))
    assert.ok(en.includes('five points'))
  })

  it('tells it to change nothing', () => {
    assert.ok(summaryPrompt('en').toLowerCase().includes('read only'))
    assert.ok(summaryPrompt('cs').toLowerCase().includes('jen čti'))
  })
})

describe('what the summary is allowed to do', () => {
  /*
   * A summary that edits what it summarises is not a summary. Plan mode is the whole
   * guarantee, so it is worth a test of its own: a list of allowed tools would have
   * been the obvious way and cannot survive a Windows shell, which eats its brackets.
   */
  it('asks in the mode that may read everything and write nothing', () => {
    assert.equal(PERMISSION_MODE, 'plan')
    assert.ok(!/[()*,]/.test(PERMISSION_MODE), 'a shell must not be able to mangle it')
  })

  it('looks back a fixed distance, tuned by use', () => {
    assert.equal(typeof COMMITS, 'number')
    assert.ok(COMMITS > 0 && COMMITS <= 50)
  })
})

describe('tidySummary', () => {
  /* Print mode often opens with a sentence about what it is about to do. */
  it('drops the throat-clearing before the answer', () => {
    const text = ['Sure - let me look at the history.', '', '## Done', '- something'].join('\n')
    assert.equal(tidySummary(text), ['## Done', '- something'].join('\n'))
  })

  it('keeps an answer that starts with the answer', () => {
    const text = ['- one', '- two'].join('\n')
    assert.equal(tidySummary(text), text)
  })

  it('leaves prose alone rather than eating it', () => {
    const text = 'Nothing has happened in this repository yet.'
    assert.equal(tidySummary(text), text)
  })
})
