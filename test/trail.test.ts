import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Trail } from '../src/shared/trail.ts'

describe('Trail', () => {
  it('keeps everything while it fits', () => {
    const trail = new Trail(100)
    trail.add('one ')
    trail.add('two ')
    trail.add('three')
    assert.equal(trail.text(), 'one two three')
    assert.equal(trail.length(), 13)
  })

  it('drops the oldest output first', () => {
    const trail = new Trail(10)
    trail.add('aaaaa')
    trail.add('bbbbb')
    trail.add('ccccc')
    assert.equal(trail.text(), 'bbbbbccccc')
  })

  /* The end of the stream is the part that matters, so it is never the part dropped. */
  it('keeps the newest chunk even when it is bigger than the limit', () => {
    const trail = new Trail(4)
    trail.add('old')
    trail.add('a very long line of output')
    assert.equal(trail.text(), 'a very long line of output')
  })

  it('is empty until something is written', () => {
    const trail = new Trail(10)
    assert.equal(trail.text(), '')
    trail.add('')
    assert.equal(trail.text(), '')
    assert.equal(trail.length(), 0)
  })

  it('answers the same thing twice', () => {
    const trail = new Trail(10)
    trail.add('ab')
    trail.add('cd')
    assert.equal(trail.text(), 'abcd')
    assert.equal(trail.text(), 'abcd')
    trail.add('ef')
    assert.equal(trail.text(), 'abcdef')
  })
})
