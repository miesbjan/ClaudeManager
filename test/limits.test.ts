import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { limitLevel, parsePlanUsage, timeUntil } from '../src/shared/limits.ts'

describe('parsePlanUsage', () => {
  it('reads both windows out of the answer', () => {
    const usage = parsePlanUsage({
      five_hour: { utilization: 42.6, resets_at: '2026-08-21T14:00:00Z' },
      seven_day: { utilization: 18, resets_at: '2026-08-25T09:00:00Z' }
    })
    assert.deepEqual(usage, {
      windowPercent: 42.6,
      windowResetsAt: '2026-08-21T14:00:00Z',
      weekPercent: 18,
      weekResetsAt: '2026-08-25T09:00:00Z'
    })
  })

  /*
   * The endpoint is undocumented, so its shape is treated as a rumour: anything that
   * is not a number is simply not shown, and nothing here may throw.
   */
  it('takes what it recognises and drops the rest', () => {
    const usage = parsePlanUsage({
      five_hour: { utilization: 12 },
      seven_day: { utilization: 'quite a lot', resets_at: 42 }
    })
    assert.deepEqual(usage, {
      windowPercent: 12,
      windowResetsAt: null,
      weekPercent: null,
      weekResetsAt: null
    })
  })

  it('says nothing rather than something empty', () => {
    assert.equal(parsePlanUsage({}), null)
    assert.equal(parsePlanUsage({ five_hour: {} }), null)
    assert.equal(parsePlanUsage(null), null)
    assert.equal(parsePlanUsage('nope'), null)
  })
})

describe('timeUntil', () => {
  const now = Date.parse('2026-08-21T10:00:00Z')

  it('counts minutes while there is under an hour to go', () => {
    assert.equal(timeUntil('2026-08-21T10:25:00Z', now), '25 min')
  })

  it('counts hours and minutes for the rest of the day', () => {
    assert.equal(timeUntil('2026-08-21T12:14:00Z', now), '2 h 14 min')
  })

  it('switches to days once hours stop being readable', () => {
    assert.equal(timeUntil('2026-08-23T13:00:00Z', now), '2 d 3 h')
  })

  it('has nothing to say about a time that has passed, or no time at all', () => {
    assert.equal(timeUntil('2026-08-21T09:00:00Z', now), null)
    assert.equal(timeUntil(null, now), null)
    assert.equal(timeUntil('not a date', now), null)
  })
})

describe('limitLevel', () => {
  it('stays quiet while there is room', () => {
    assert.equal(limitLevel(0), 'quiet')
    assert.equal(limitLevel(74.9), 'quiet')
    assert.equal(limitLevel(null), 'quiet')
  })

  it('warns from three quarters and shouts from nine tenths', () => {
    assert.equal(limitLevel(75), 'warn')
    assert.equal(limitLevel(89), 'warn')
    assert.equal(limitLevel(90), 'critical')
    assert.equal(limitLevel(100), 'critical')
  })
})
