import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createDoc, indexAfterClose, isDirty, nextDocIndex } from '../src/renderer/src/docs.ts'

describe('createDoc', () => {
  it('starts clean, unread and undecided', () => {
    const doc = createDoc('C:/x/a.md', false)
    assert.equal(doc.path, 'C:/x/a.md')
    assert.equal(doc.raw, false)
    assert.equal(doc.source, null)
    assert.equal(doc.draft, null)
    assert.equal(doc.mtimeMs, 0)
    assert.equal(isDirty(doc), false)
  })

  it('opens as written when told to', () => {
    assert.equal(createDoc('C:/x/a.json', true).raw, true)
  })
})

describe('nextDocIndex', () => {
  it('walks the files of a tab and wraps round', () => {
    assert.equal(nextDocIndex(3, 0, 1), 1)
    assert.equal(nextDocIndex(3, 2, 1), 0)
    assert.equal(nextDocIndex(3, 0, -1), 2)
  })

  // With one file there is nowhere to go, and that is not an error.
  it('stays put when there is nothing to switch to', () => {
    assert.equal(nextDocIndex(1, 0, 1), 0)
    assert.equal(nextDocIndex(1, 0, -1), 0)
  })

  it('has no answer for an empty tab', () => {
    assert.equal(nextDocIndex(0, 0, 1), -1)
  })
})

describe('indexAfterClose', () => {
  it('moves to the neighbour when you close what you are looking at', () => {
    assert.equal(indexAfterClose(3, 1, 1), 1)
    assert.equal(indexAfterClose(3, 2, 2), 1)
    assert.equal(indexAfterClose(3, 0, 0), 0)
  })

  it('leaves you where you are when you close something else', () => {
    assert.equal(indexAfterClose(3, 2, 0), 0)
    assert.equal(indexAfterClose(3, 0, 2), 1)
    assert.equal(indexAfterClose(3, 0, 1), 0)
  })

  // Nothing left means the tab itself goes, which the caller reads from -1.
  it('reports nothing left when the last one closes', () => {
    assert.equal(indexAfterClose(1, 0, 0), -1)
  })

  it('keeps the answer inside the list', () => {
    for (let count = 1; count <= 5; count++) {
      for (let closing = 0; closing < count; closing++) {
        for (let current = 0; current < count; current++) {
          const next = indexAfterClose(count, closing, current)
          assert.ok(next >= -1 && next < count - 1 + 1, `out of range for ${count}/${closing}/${current}`)
          if (count > 1) assert.ok(next >= 0 && next <= count - 2)
        }
      }
    }
  })
})
