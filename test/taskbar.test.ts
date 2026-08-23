import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ActivityState } from '../src/renderer/src/activity.ts'
import {
  aggregateActivity,
  attention,
  countsAsFinished,
  COMMAND_WINDOW_MS,
  MIN_RUN_MS,
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

describe('countsAsFinished', () => {
  const long = MIN_RUN_MS + 1000
  const blink = 120
  const asked = 1000
  const unasked = null

  it('is the step from running to settled', () => {
    assert.equal(countsAsFinished('working', 'waiting', long, unasked), true)
    assert.equal(countsAsFinished('working', 'done', long, unasked), true)
    assert.equal(countsAsFinished('busy', 'done', long, unasked), true)
    assert.equal(countsAsFinished('busy', 'waiting', long, unasked), true)
  })

  it('is not any other step', () => {
    assert.equal(countsAsFinished('idle', 'working', long, asked), false)
    assert.equal(countsAsFinished('working', 'busy', long, asked), false)
    assert.equal(countsAsFinished('done', 'done', long, asked), false)
    assert.equal(countsAsFinished('permission', 'working', long, asked), false)
    assert.equal(countsAsFinished('working', 'alert', long, asked), false)
    // A tab that was never running has not finished anything.
    assert.equal(countsAsFinished('idle', 'waiting', long, asked), false)
  })

  /*
   * The bug this exists for: a TUI repainting its input box, or a prompt redrawing
   * itself, is a burst of milliseconds followed by quiet - which by shape alone looks
   * exactly like a run that ended. The badge came back seconds after every
   * acknowledgement until the number meant nothing.
   */
  it('does not believe quiet a moment after output nobody asked for', () => {
    assert.equal(countsAsFinished('working', 'waiting', blink, unasked), false)
    assert.equal(countsAsFinished('working', 'waiting', MIN_RUN_MS - 1, unasked), false)
  })

  /*
   * Pressing Enter in a shell is a statement of intent no repaint can imitate, and the
   * clock cannot stand in for it: a command that sleeps for six seconds and prints one
   * line looks like two short bursts to anything watching output alone.
   */
  it('believes a run somebody asked for, however the timing looks', () => {
    assert.equal(countsAsFinished('working', 'waiting', blink, asked), true)
    assert.equal(countsAsFinished('busy', 'waiting', 0, asked), true)
  })

  /* A command from an hour ago vouches for nothing: that is a repaint, not an answer. */
  it('stops believing a command once it is old', () => {
    assert.equal(countsAsFinished('working', 'waiting', blink, COMMAND_WINDOW_MS + 1), false)
    assert.equal(countsAsFinished('working', 'waiting', blink, COMMAND_WINDOW_MS), true)
  })

  // A program's own word about itself needs no corroboration from either.
  it('believes a program that reports it has finished, however short the run', () => {
    assert.equal(countsAsFinished('working', 'done', blink, unasked), true)
    assert.equal(countsAsFinished('busy', 'done', 0, unasked), true)
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
