import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { promptSummary, sendable } from '../src/renderer/src/prompt.ts'

describe('sendable', () => {
  it('sends the prompt as written', () => {
    assert.equal(sendable('rewrite the reader\nkeep the tests'), 'rewrite the reader\nkeep the tests')
  })

  /*
   * The newline that submits is sent after the text, so a trailing one of its own would
   * submit half a prompt - which is the exact problem the buffer exists to avoid.
   */
  it('drops the blank lines a buffer collects while being written', () => {
    assert.equal(sendable('do the thing\n\n'), 'do the thing')
    assert.equal(sendable('do the thing   \n \n'), 'do the thing')
  })

  it('has nothing to send for an empty buffer', () => {
    assert.equal(sendable(''), null)
    assert.equal(sendable('\n \n\t'), null)
  })

  it('keeps the blank lines inside a prompt, which are part of it', () => {
    assert.equal(sendable('first para\n\nsecond para'), 'first para\n\nsecond para')
  })
})

describe('promptSummary', () => {
  it('is the first line that says something', () => {
    assert.equal(promptSummary('\n\nfix the guard'), 'fix the guard')
  })

  it('counts the rest, so a long prompt is not mistaken for a short one', () => {
    assert.equal(promptSummary('one\ntwo\nthree'), 'one (+2)')
  })

  it('has nothing to say about an empty buffer', () => {
    assert.equal(promptSummary('   \n\n'), null)
  })
})
