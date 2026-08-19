import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { matchRanges, stepIndex } from '../src/renderer/src/find.ts'

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
