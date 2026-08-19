import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createSignalReader,
  nextActivity,
  type ActivityState
} from '../src/renderer/src/activity.ts'

const ESC = '\x1b'
const BEL = '\x07'
const progress = (state: string, value = '0') => `${ESC}]9;4;${state};${value}${BEL}`
const title = (text: string) => `${ESC}]0;${text}${BEL}`

describe('reading signals from terminal output', () => {
  it('sees the spinner a program reports while it works', () => {
    const read = createSignalReader()
    assert.deepEqual(read(progress('3')), { bell: false, progress: 'busy' })
  })

  it('sees progress being cleared as finished', () => {
    const read = createSignalReader()
    assert.deepEqual(read(progress('0')), { bell: false, progress: 'done' })
  })

  it('treats failure and warning as something to look at', () => {
    const read = createSignalReader()
    assert.equal(read(progress('2')).progress, 'error')
    assert.equal(read(progress('4')).progress, 'error')
  })

  /*
   * The sequence that sets a window title ends with a bell, and PowerShell resets
   * the title constantly. Counting those would make every prompt ring.
   */
  it('does not mistake a title sequence for a bell', () => {
    const read = createSignalReader()
    const signals = read(`${title('C:\\Users\\me')}PS C:\\Users\\me> `)
    assert.equal(signals.bell, false)
  })

  it('still hears a real bell next to a title sequence', () => {
    const read = createSignalReader()
    assert.equal(read(`${title('build')}done${BEL}`).bell, true)
  })

  it('keeps the last statement when a chunk carries several', () => {
    const read = createSignalReader()
    assert.equal(read(progress('3') + 'working' + progress('0')).progress, 'done')
  })

  it('joins a sequence split across two chunks', () => {
    const read = createSignalReader()
    assert.equal(read(`out${ESC}]9;4;3`).progress, null)
    assert.equal(read(`;0${BEL}more`).progress, 'busy')
  })

  it('does not carry a fragment forever', () => {
    const read = createSignalReader()
    read(`${ESC}]${'x'.repeat(400)}`)
    // The oversized fragment is dropped, so a later bell is still heard.
    assert.equal(read(`plain${BEL}`).bell, true)
  })
})

describe('deciding what a tab shows', () => {
  const step = (state: ActivityState, ...events: Parameters<typeof nextActivity>[1][]) =>
    events.reduce(nextActivity, state)

  it('marks plain output as working and silence as settled', () => {
    const working = step('idle', { type: 'output', signals: { bell: false, progress: null } })
    assert.equal(working, 'working')
    assert.equal(step(working, { type: 'silence' }), 'waiting')
  })

  it('believes a program that says it has finished, without waiting for silence', () => {
    assert.equal(
      step('working', { type: 'output', signals: { bell: false, progress: 'done' } }),
      'done'
    )
  })

  /*
   * A program that reports it has finished then prints its answer. Treating that
   * tail as fresh work would flip the tab back to busy the moment it went green.
   */
  it('keeps a reported finish while the result is still being printed', () => {
    const done = step('working', { type: 'output', signals: { bell: false, progress: 'done' } })
    assert.equal(step(done, { type: 'output', signals: { bell: false, progress: null } }), 'done')
    assert.equal(step(done, { type: 'silence' }), 'done')
  })

  it('goes back to busy when the program says it is working again', () => {
    const done = step('working', { type: 'output', signals: { bell: false, progress: 'done' } })
    assert.equal(step(done, { type: 'output', signals: { bell: false, progress: 'busy' } }), 'busy')
  })

  /*
   * An agent that is thinking prints nothing for seconds at a time. Letting the
   * silence rule settle it would turn the dot green while the work is still running.
   */
  it('does not settle a program that reported it is busy', () => {
    const busy = step('idle', { type: 'output', signals: { bell: false, progress: 'busy' } })
    assert.equal(busy, 'busy')
    assert.equal(step(busy, { type: 'silence' }), 'busy')
    assert.equal(step(busy, { type: 'output', signals: { bell: false, progress: null } }), 'busy')
    assert.equal(
      step(busy, { type: 'output', signals: { bell: false, progress: 'done' } }),
      'done'
    )
  })

  it('does not settle a tab that never worked', () => {
    assert.equal(step('idle', { type: 'silence' }), 'idle')
  })

  it('keeps an alert until the tab is actually looked at', () => {
    const alert = step('working', { type: 'output', signals: { bell: true, progress: null } })
    assert.equal(alert, 'alert')
    assert.equal(step(alert, { type: 'output', signals: { bell: false, progress: 'busy' } }), 'alert')
    assert.equal(step(alert, { type: 'silence' }), 'alert')
    assert.equal(step(alert, { type: 'seen' }), 'idle')
  })

  it('treats a dead shell as an alert', () => {
    assert.equal(step('idle', { type: 'exit' }), 'alert')
  })

  it('reports a document rewritten in the background', () => {
    assert.equal(step('idle', { type: 'document' }), 'waiting')
  })

  it('lets the shell keep the tab busy after a document change', () => {
    assert.equal(
      step('idle', { type: 'document' }, { type: 'output', signals: { bell: false, progress: null } }),
      'working'
    )
  })
})
