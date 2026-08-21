import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { closeAction, type CloseState } from '../src/shared/closing.ts'

const state = (over: Partial<CloseState> = {}): CloseState => ({
  quitting: false,
  tray: true,
  guarded: false,
  shells: 0,
  ...over
})

describe('closeAction', () => {
  it('ends the application when there is nothing running', () => {
    assert.equal(closeAction(state()), 'quit')
  })

  it('hides the window when an agent was recognised', () => {
    assert.equal(closeAction(state({ guarded: true, shells: 1 })), 'hide')
  })

  /*
   * The point of the whole module: recognising an agent is done by the strings its
   * interface prints, so a reworded banner must not be able to end a session silently.
   * An unrecognised shell is a question, not a licence to quit.
   */
  it('asks when a shell is running but nothing was recognised', () => {
    assert.equal(closeAction(state({ shells: 1 })), 'ask')
    assert.equal(closeAction(state({ shells: 3 })), 'ask')
  })

  it('ends the application once a quit is already under way', () => {
    assert.equal(closeAction(state({ quitting: true, guarded: true, shells: 2 })), 'quit')
  })

  // A hidden window with no tray icon is a lost window, which is worse than a lost shell.
  it('never hides without a tray icon to come back through', () => {
    assert.equal(closeAction(state({ tray: false, guarded: true, shells: 1 })), 'quit')
    assert.equal(closeAction(state({ tray: false, shells: 1 })), 'quit')
  })
})
