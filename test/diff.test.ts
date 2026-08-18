import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { changedLines } from '../src/renderer/src/diff.ts'

/** Sorted line indices, which reads better in a failure message than a Set. */
const changed = (before: string, after: string): number[] =>
  [...changedLines(before, after)].sort((a, b) => a - b)

describe('changedLines', () => {
  it('reports nothing when the text is identical', () => {
    assert.deepEqual(changed('a\nb\nc', 'a\nb\nc'), [])
  })

  it('treats CRLF and LF as the same text', () => {
    assert.deepEqual(changed('a\r\nb', 'a\nb'), [])
  })

  it('finds a rewritten line', () => {
    assert.deepEqual(changed('a\nb\nc', 'a\nB\nc'), [1])
  })

  it('finds an insertion in the middle', () => {
    assert.deepEqual(changed('a\nb', 'a\nnew\nb'), [1])
  })

  it('finds an append', () => {
    assert.deepEqual(changed('a\nb', 'a\nb\nc'), [2])
  })

  it('finds a prepend', () => {
    assert.deepEqual(changed('a\nb', 'x\na\nb'), [0])
  })

  it('finds a replaced block', () => {
    assert.deepEqual(changed('a\nb\nc\nd', 'a\nX\nY\nd'), [1, 2])
  })

  it('is not confused by repeated lines', () => {
    assert.deepEqual(changed('x\nx\nx', 'x\nx\nx\nx'), [3])
  })

  it('reports the moved line rather than both of them', () => {
    assert.deepEqual(changed('h\np1\np2', 'h\np2\np1'), [2])
  })

  // A deletion leaves no new line to point at, so the block that closed over the
  // gap is reported - otherwise removing a paragraph would highlight nothing.
  it('reports the line a deletion closed over', () => {
    assert.deepEqual(changed('a\nb\nc', 'a\nc'), [1])
  })

  it('reports the last remaining line when the end was deleted', () => {
    assert.deepEqual(changed('a\nb\nc', 'a\nb'), [1])
  })

  it('reports the first line when everything was deleted', () => {
    assert.deepEqual(changed('a\nb', ''), [0])
  })

  it('reports every line when the document was empty before', () => {
    assert.deepEqual(changed('', 'a\nb'), [0, 1])
  })

  it('finds several edits in a document-sized text', () => {
    const base = Array.from({ length: 1200 }, (_, i) => `line ${i}`)
    const edited = [...base]
    edited[10] = 'line 10 rewritten'
    edited.splice(600, 0, 'inserted')
    edited.splice(900, 1)
    assert.deepEqual(changed(base.join('\n'), edited.join('\n')), [10, 600])
  })
})

/**
 * The exact diff allocates a cell per line pair, so it is abandoned above a cap and
 * the whole differing region is reported instead. Both texts below differ on their
 * first and last line, which defeats the prefix/suffix trim and leaves the full
 * document as the region to compare - the exact path would report 2 lines, the
 * coarse one reports all of them.
 */
describe('changedLines on a large rewrite', () => {
  const doc = (first: string, last: string, lines: number): string =>
    [first, ...Array.from({ length: lines - 2 }, (_, i) => `shared line ${i}`), last].join('\n')

  it('stays exact just below the cap', () => {
    const before = doc('old first', 'old last', 1990)
    const after = doc('new first', 'new last', 1990)
    assert.deepEqual(changed(before, after), [0, 1989])
  })

  it('falls back to the whole region above the cap', () => {
    const before = doc('old first', 'old last', 2000)
    const after = doc('new first', 'new last', 2000)
    assert.equal(changedLines(before, after).size, 2000)
  })
})
