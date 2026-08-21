import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { activeAfterMove, computeLabels, slotAt } from '../src/shared/tabs.ts'

describe('slotAt', () => {
  // Four tabs, 100 wide, side by side: middles at 50, 150, 250, 350.
  const bounds = [
    { left: 0, right: 100 },
    { left: 100, right: 200 },
    { left: 200, right: 300 },
    { left: 300, right: 400 }
  ]

  it('keeps a tab where it is until it passes a neighbour', () => {
    assert.equal(slotAt(bounds, 10, 0), 0)
    assert.equal(slotAt(bounds, 149, 0), 0)
  })

  /*
   * Dragging the first tab right: it takes the second slot the moment the pointer is
   * past the middle of the second tab, and the third once past the middle of that.
   */
  it('moves one slot per neighbour passed, dragging right', () => {
    assert.equal(slotAt(bounds, 151, 0), 1)
    assert.equal(slotAt(bounds, 251, 0), 2)
    assert.equal(slotAt(bounds, 351, 0), 3)
  })

  it('does the same dragging left', () => {
    assert.equal(slotAt(bounds, 351, 3), 3)
    assert.equal(slotAt(bounds, 249, 3), 2)
    assert.equal(slotAt(bounds, 149, 3), 1)
    assert.equal(slotAt(bounds, 49, 3), 0)
  })

  it('cannot be dragged off either end', () => {
    assert.equal(slotAt(bounds, -5000, 2), 0)
    assert.equal(slotAt(bounds, 5000, 2), 3)
    assert.equal(slotAt([], 42, 0), 0)
  })
})

describe('activeAfterMove', () => {
  /* Reordering changes the order and nothing else. */
  it('follows the tab you are looking at when it is the one moved', () => {
    assert.equal(activeAfterMove(2, 2, 0), 0)
    assert.equal(activeAfterMove(0, 0, 3), 3)
  })

  it('shifts the active tab when something moves across it', () => {
    // The active tab is 2; tab 0 is dragged to the end, so 2 becomes 1.
    assert.equal(activeAfterMove(2, 0, 3), 1)
    // The active tab is 1; tab 3 is dragged to the front, so 1 becomes 2.
    assert.equal(activeAfterMove(1, 3, 0), 2)
  })

  it('leaves it alone when the move happens elsewhere', () => {
    assert.equal(activeAfterMove(0, 2, 3), 0)
    assert.equal(activeAfterMove(3, 0, 1), 3)
    assert.equal(activeAfterMove(1, 1, 1), 1)
  })
})

describe('computeLabels with the same file in two places', () => {
  const SAME = 'C:/work/app/docs/roadmap.md'

  /*
   * Extending the path is how two files of the same name are told apart, but the same
   * file twice cannot be - and walking to the full path put the whole path in every
   * tab while still saying nothing.
   */
  it('leaves both as the plain name', () => {
    assert.deepEqual(computeLabels([SAME, SAME]), ['roadmap.md', 'roadmap.md'])
  })

  it('still tells different files of the same name apart', () => {
    assert.deepEqual(computeLabels(['C:/a/docs/roadmap.md', 'C:/b/docs/roadmap.md']), [
      'a/docs/roadmap.md',
      'b/docs/roadmap.md'
    ])
  })

  it('handles a copy alongside a different file of that name', () => {
    const labels = computeLabels([SAME, SAME, 'C:/other/roadmap.md'])
    assert.deepEqual(labels.slice(0, 2), ['roadmap.md', 'roadmap.md'])
    assert.equal(labels[2], 'other/roadmap.md')
  })
})
