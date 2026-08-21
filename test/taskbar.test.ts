import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ActivityState } from '../src/renderer/src/activity.ts'
import {
  aggregateActivity,
  attention,
  justFinished,
  type TabSignal
} from '../src/renderer/src/taskbar.ts'

const tab = (state: ActivityState, finished = false): TabSignal => ({ state, finished })

describe('aggregateActivity', () => {
  it('says nothing when there is nothing to say', () => {
    assert.equal(aggregateActivity([]), 'none')
    assert.equal(aggregateActivity([tab('idle'), tab('idle')]), 'none')
  })

  it('shows work in progress', () => {
    assert.equal(aggregateActivity([tab('working')]), 'working')
    assert.equal(aggregateActivity([tab('busy')]), 'working')
  })

  /*
   * A shell resting at its prompt sits in a finished state forever, so the state alone
   * cannot mean "just finished". Only the flag set on the transition can.
   */
  it('does not call a resting shell finished', () => {
    assert.equal(aggregateActivity([tab('done'), tab('waiting')]), 'none')
    assert.equal(aggregateActivity([tab('done', true)]), 'done')
  })

  it('puts one that finished above one still working', () => {
    assert.equal(aggregateActivity([tab('working'), tab('waiting', true)]), 'done')
  })

  it('puts a question above anything that finished', () => {
    assert.equal(
      aggregateActivity([tab('done', true), tab('permission'), tab('working')]),
      'permission'
    )
  })

  it('puts a broken shell above everything', () => {
    assert.equal(
      aggregateActivity([tab('permission'), tab('alert'), tab('done', true)]),
      'alert'
    )
  })

  it('reads the busiest of many tabs, whatever their order', () => {
    const tabs = [tab('idle'), tab('working'), tab('idle'), tab('permission'), tab('waiting')]
    assert.equal(aggregateActivity(tabs), 'permission')
    assert.equal(aggregateActivity([...tabs].reverse()), 'permission')
  })
})

describe('justFinished', () => {
  it('is the step from running to settled', () => {
    assert.equal(justFinished('working', 'waiting'), true)
    assert.equal(justFinished('working', 'done'), true)
    assert.equal(justFinished('busy', 'done'), true)
    assert.equal(justFinished('busy', 'waiting'), true)
  })

  it('is not any other step', () => {
    assert.equal(justFinished('idle', 'working'), false)
    assert.equal(justFinished('working', 'busy'), false)
    assert.equal(justFinished('done', 'done'), false)
    assert.equal(justFinished('permission', 'working'), false)
    assert.equal(justFinished('working', 'alert'), false)
    // A tab that was never running has not finished anything.
    assert.equal(justFinished('idle', 'waiting'), false)
  })
})

describe('attention', () => {
  it('says nothing while there is nothing to go back to', () => {
    assert.equal(attention([]), null)
    assert.equal(attention([tab('idle'), tab('working'), tab('busy')]), null)
  })

  it('counts the tabs that finished while you were away', () => {
    const waiting = attention([tab('done', true), tab('waiting', true), tab('working')])
    assert.deepEqual(waiting, { count: 2, level: 'done' })
  })

  /*
   * A tab counts once however many reasons it has: the number answers "how many
   * places do I have to go", not "how many things happened".
   */
  it('counts a tab once', () => {
    assert.deepEqual(attention([tab('permission', true)]), { count: 1, level: 'permission' })
  })

  it('takes its colour from the most urgent of them', () => {
    assert.deepEqual(attention([tab('done', true), tab('permission')]), {
      count: 2,
      level: 'permission'
    })
    assert.deepEqual(attention([tab('done', true), tab('permission'), tab('alert')]), {
      count: 3,
      level: 'alert'
    })
  })

  /* A tab still running wants time, not you. */
  it('leaves the working ones out of the number', () => {
    assert.deepEqual(attention([tab('done', true), tab('working'), tab('busy')]), {
      count: 1,
      level: 'done'
    })
  })
})
