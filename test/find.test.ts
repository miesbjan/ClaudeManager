import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { lineAt, matchRanges, stepIndex } from '../src/renderer/src/find.ts'

describe('matchRanges', () => {
  it('finds every occurrence in reading order', () => {
    assert.deepEqual(matchRanges('one two one', 'one'), [
      { start: 0, end: 3 },
      { start: 8, end: 11 }
    ])
  })

  it('ignores case on both sides', () => {
    assert.deepEqual(matchRanges('Roadmap ROADMAP', 'roadmap'), [
      { start: 0, end: 7 },
      { start: 8, end: 15 }
    ])
  })

  it('does not overlap matches', () => {
    // 'aaaa' contains two non-overlapping 'aa', not three overlapping ones.
    assert.deepEqual(matchRanges('aaaa', 'aa'), [
      { start: 0, end: 2 },
      { start: 2, end: 4 }
    ])
  })

  it('returns nothing for an empty query', () => {
    assert.deepEqual(matchRanges('anything', ''), [])
  })

  it('handles a query that is not there', () => {
    assert.deepEqual(matchRanges('abc', 'zzz'), [])
  })
})

/*
 * What a match in the plain-text pane is reported by: the selection cannot be seen while
 * the search box has focus, so the line and its text are what the status bar says.
 */
describe('lineAt', () => {
  const text = 'first\nsecond\nthird'

  it('counts lines from one', () => {
    assert.deepEqual(lineAt(text, 0), { line: 1, content: 'first' })
    assert.deepEqual(lineAt(text, 6), { line: 2, content: 'second' })
  })

  it('finds the line an offset inside it belongs to', () => {
    assert.deepEqual(lineAt(text, 9), { line: 2, content: 'second' })
  })

  it('handles the last line, which has no newline after it', () => {
    assert.deepEqual(lineAt(text, 14), { line: 3, content: 'third' })
  })

  it('handles an empty line', () => {
    assert.deepEqual(lineAt('a\n\nb', 2), { line: 2, content: '' })
  })
})

describe('stepIndex', () => {
  it('walks forward and wraps at the end', () => {
    assert.equal(stepIndex(0, 3, 1), 1)
    assert.equal(stepIndex(2, 3, 1), 0)
  })

  it('walks backward and wraps at the start', () => {
    assert.equal(stepIndex(1, 3, -1), 0)
    assert.equal(stepIndex(0, 3, -1), 2)
  })

  it('starts at the first match going forward and at the last going back', () => {
    assert.equal(stepIndex(-1, 3, 1), 0)
    assert.equal(stepIndex(-1, 3, -1), 2)
  })

  it('has nowhere to go without matches', () => {
    assert.equal(stepIndex(-1, 0, 1), -1)
    assert.equal(stepIndex(0, 0, -1), -1)
  })
})
