import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  clampSize,
  DEFAULT_FAMILY,
  DEFAULT_SIZE,
  sanitiseFamily,
  sanitiseFont,
  stepSize
} from '../src/shared/font.ts'

describe('clampSize', () => {
  it('keeps a sensible size', () => {
    assert.equal(clampSize(13), 13)
    assert.equal(clampSize(20), 20)
  })

  it('rounds to whole pixels', () => {
    assert.equal(clampSize(13.4), 13)
    assert.equal(clampSize(13.6), 14)
  })

  it('holds the ends rather than letting a pane become useless', () => {
    assert.equal(clampSize(1), 8)
    assert.equal(clampSize(200), 28)
  })

  // The value arrives from a file on disk, so it can be anything at all.
  it('falls back to the default for anything that is not a number', () => {
    assert.equal(clampSize(undefined), DEFAULT_SIZE)
    assert.equal(clampSize(null), DEFAULT_SIZE)
    assert.equal(clampSize('14'), DEFAULT_SIZE)
    assert.equal(clampSize(NaN), DEFAULT_SIZE)
    assert.equal(clampSize(Infinity), DEFAULT_SIZE)
  })
})

describe('stepSize', () => {
  it('moves one step at a time', () => {
    assert.equal(stepSize(13, 1), 14)
    assert.equal(stepSize(13, -1), 12)
  })

  it('stops at the ends instead of wrapping round', () => {
    assert.equal(stepSize(8, -1), 8)
    assert.equal(stepSize(28, 1), 28)
  })
})

describe('sanitiseFamily', () => {
  it('takes whatever the file says', () => {
    assert.equal(sanitiseFamily('JetBrains Mono'), 'JetBrains Mono')
    assert.equal(sanitiseFamily('  Fira Code, monospace  '), 'Fira Code, monospace')
  })

  // An empty family would leave the terminal with no font at all.
  it('refuses to leave the terminal without a font', () => {
    assert.equal(sanitiseFamily(''), DEFAULT_FAMILY)
    assert.equal(sanitiseFamily('   '), DEFAULT_FAMILY)
    assert.equal(sanitiseFamily(undefined), DEFAULT_FAMILY)
    assert.equal(sanitiseFamily(42), DEFAULT_FAMILY)
  })
})

describe('sanitiseFont', () => {
  it('reads both halves, from wherever they came', () => {
    assert.deepEqual(sanitiseFont({ family: 'Consolas', size: 16 }), {
      family: 'Consolas',
      size: 16
    })
  })

  it('answers with something usable even for nothing at all', () => {
    assert.deepEqual(sanitiseFont(null), { family: DEFAULT_FAMILY, size: DEFAULT_SIZE })
    assert.deepEqual(sanitiseFont({}), { family: DEFAULT_FAMILY, size: DEFAULT_SIZE })
  })
})
