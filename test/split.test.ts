import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  clampRatio,
  DEFAULT_RATIO,
  MAX_RATIO,
  MIN_RATIO,
  ratioFromPointer
} from '../src/renderer/src/split.ts'

describe('clampRatio', () => {
  it('keeps a ratio that is already inside the range', () => {
    assert.equal(clampRatio(0.42), 0.42)
  })

  it('never lets a pane collapse', () => {
    assert.equal(clampRatio(0), MIN_RATIO)
    assert.equal(clampRatio(-3), MIN_RATIO)
    assert.equal(clampRatio(1), MAX_RATIO)
  })

  it('falls back to the default for a value that is not a number', () => {
    assert.equal(clampRatio(Number.NaN), DEFAULT_RATIO)
    assert.equal(clampRatio(Number.POSITIVE_INFINITY), DEFAULT_RATIO)
  })
})

describe('ratioFromPointer', () => {
  it('measures the divider against the container, not the window', () => {
    assert.equal(ratioFromPointer(600, 200, 800), 0.5)
  })

  it('clamps a drag past either edge', () => {
    assert.equal(ratioFromPointer(0, 200, 800), MIN_RATIO)
    assert.equal(ratioFromPointer(2000, 200, 800), MAX_RATIO)
  })

  it('survives a container that has not been laid out yet', () => {
    assert.equal(ratioFromPointer(100, 0, 0), DEFAULT_RATIO)
  })
})
