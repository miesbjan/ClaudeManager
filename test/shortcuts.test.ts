import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  claimedFromShell,
  paneCommand,
  RESIZE_STEP,
  tabDigit,
  terminalAction,
  type KeyLike
} from '../src/shared/shortcuts.ts'

function press(overrides: Partial<KeyLike>): KeyLike {
  return { key: '', code: '', altKey: true, ctrlKey: false, shiftKey: false, ...overrides }
}

/*
 * Ctrl+T and Ctrl+G are control characters on the wire, so xterm swallows them and the
 * window never hears about them. They have to be refused in the terminal by name.
 */
describe('claimedFromShell', () => {
  it('takes the keys the app needs from inside the shell', () => {
    assert.equal(claimedFromShell(press({ code: 'KeyT', altKey: false, ctrlKey: true })), true)
    assert.equal(claimedFromShell(press({ code: 'KeyG', altKey: false, ctrlKey: true })), true)
    assert.equal(claimedFromShell(press({ code: 'KeyP', altKey: false, ctrlKey: true })), true)
  })

  /*
   * Moving between tabs and between the files in one. xterm turns these into a tab
   * character and two escape sequences and stops the event, so without being named here
   * they never reach the window - which is what "works from inside the shell" needs.
   */
  it('takes moving between tabs and documents as well', () => {
    assert.equal(claimedFromShell(press({ code: 'Tab', altKey: false, ctrlKey: true })), true)
    assert.equal(claimedFromShell(press({ code: 'PageUp', altKey: false, ctrlKey: true })), true)
    assert.equal(claimedFromShell(press({ code: 'PageDown', altKey: false, ctrlKey: true })), true)
  })

  it('leaves those keys alone without Ctrl, since then they are the shell\'s own', () => {
    assert.equal(claimedFromShell(press({ code: 'Tab', altKey: false, ctrlKey: false })), false)
    assert.equal(claimedFromShell(press({ code: 'PageUp', altKey: false, ctrlKey: false })), false)
    assert.equal(claimedFromShell(press({ code: 'Tab', altKey: true, ctrlKey: true })), false)
  })

  it('leaves everything else to the shell', () => {
    assert.equal(claimedFromShell(press({ code: 'KeyW', altKey: false, ctrlKey: true })), false)
    assert.equal(claimedFromShell(press({ code: 'KeyC', altKey: false, ctrlKey: true })), false)
    assert.equal(claimedFromShell(press({ code: 'KeyT', altKey: false, ctrlKey: false })), false)
    assert.equal(claimedFromShell(press({ code: 'KeyG', altKey: true, ctrlKey: true })), false)
  })
})

describe('paneCommand', () => {
  /*
   * The buffer sends into the shell, so the key has to work while the shell has focus -
   * which is what Alt buys: PowerShell and the TUIs in it leave Alt alone.
   */
  it('opens the prompt buffer with Alt+P', () => {
    assert.deepEqual(paneCommand(press({ key: 'p' })), { type: 'prompt' })
    assert.equal(paneCommand(press({ key: 'p', altKey: false, ctrlKey: true })), null)
  })

  it('moves focus with Alt and the arrows', () => {
    assert.deepEqual(paneCommand(press({ code: 'ArrowLeft' })), {
      type: 'focus',
      direction: 'left'
    })
    assert.deepEqual(paneCommand(press({ code: 'ArrowRight' })), {
      type: 'focus',
      direction: 'right'
    })
  })

  it('resizes when shift is held, the way tmux does', () => {
    assert.deepEqual(paneCommand(press({ code: 'ArrowRight', shiftKey: true })), {
      type: 'resize',
      delta: RESIZE_STEP
    })
    assert.deepEqual(paneCommand(press({ code: 'ArrowLeft', shiftKey: true })), {
      type: 'resize',
      delta: -RESIZE_STEP
    })
  })

  it('selects a pane by its number', () => {
    assert.deepEqual(paneCommand(press({ code: 'Digit1', key: 'ě' })), {
      type: 'focusIndex',
      index: 1
    })
    assert.deepEqual(paneCommand(press({ code: 'Digit2', key: 'š' })), {
      type: 'focusIndex',
      index: 2
    })
  })

  it('reads digits from the physical key, so a Czech layout still works', () => {
    // On that layout the unshifted top row types 'ěščř', never digits.
    assert.equal(paneCommand(press({ code: 'KeyQ', key: '1' })), null)
  })

  it('zooms on the key labelled Z, not the one in the QWERTY position', () => {
    assert.deepEqual(paneCommand(press({ key: 'z', code: 'KeyY' })), { type: 'zoom' })
    assert.equal(paneCommand(press({ key: 'y', code: 'KeyZ' })), null)
  })

  it('leaves everything else to the shell', () => {
    assert.equal(paneCommand(press({ key: 'c', code: 'KeyC', altKey: false })), null)
    assert.equal(paneCommand(press({ code: 'ArrowLeft', altKey: false })), null)
    assert.equal(paneCommand(press({ code: 'ArrowLeft', ctrlKey: true })), null)
    assert.equal(paneCommand(press({ key: 'z', ctrlKey: true })), null)
    assert.equal(paneCommand(press({ code: 'Digit1', shiftKey: true })), null)
    assert.equal(paneCommand(press({ key: 'b', code: 'KeyB' })), null)
  })
})

describe('terminalAction', () => {
  const key = (overrides: Partial<KeyLike>): KeyLike => ({
    key: '',
    code: '',
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    ...overrides
  })

  /*
   * The reason this exists: Ctrl+V used to go to the shell as a control character,
   * which every agent running in the pane ignores - so pasting looked broken.
   */
  it('pastes on Ctrl+V, shifted or not', () => {
    assert.equal(terminalAction(key({ key: 'v', ctrlKey: true })), 'paste')
    assert.equal(terminalAction(key({ key: 'V', ctrlKey: true, shiftKey: true })), 'paste')
  })

  it('leaves Ctrl+C to the shell, because it means interrupt', () => {
    assert.equal(terminalAction(key({ key: 'c', ctrlKey: true })), null)
    assert.equal(terminalAction(key({ key: 'C', ctrlKey: true, shiftKey: true })), 'copy')
  })

  it('claims nothing without Ctrl, and nothing with Alt', () => {
    assert.equal(terminalAction(key({ key: 'v' })), null)
    assert.equal(terminalAction(key({ key: 'v', shiftKey: true })), null)
    assert.equal(terminalAction(key({ key: 'v', ctrlKey: true, altKey: true })), null)
  })

  it('passes ordinary typing straight through', () => {
    for (const letter of ['a', 'z', 'x', 'enter']) {
      assert.equal(terminalAction(key({ key: letter, ctrlKey: true })), null)
    }
  })
})

describe('tabDigit', () => {
  const press = (overrides: Partial<KeyLike>): KeyLike => ({
    key: '',
    code: '',
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    ...overrides
  })

  it('reads the tab from the physical key', () => {
    assert.equal(tabDigit(press({ code: 'Digit1', ctrlKey: true })), 1)
    assert.equal(tabDigit(press({ code: 'Digit9', ctrlKey: true })), 9)
  })

  /* On a Czech layout Ctrl+Shift+1 arrives as '!', so the character is no guide. */
  it('works shifted, whatever character that produces', () => {
    assert.equal(tabDigit(press({ key: '!', code: 'Digit1', ctrlKey: true, shiftKey: true })), 1)
  })

  it('claims nothing without Ctrl, and nothing with Alt', () => {
    assert.equal(tabDigit(press({ code: 'Digit1' })), null)
    assert.equal(tabDigit(press({ code: 'Digit1', altKey: true, ctrlKey: true })), null)
  })

  /* Alt and a digit is a pane, not a tab - Ctrl acts on tabs, Alt on panes. */
  it('leaves Alt+digit to the panes', () => {
    assert.equal(tabDigit(press({ code: 'Digit2', altKey: true })), null)
    assert.ok(paneCommand(press({ code: 'Digit2', altKey: true })))
  })

  it('has nothing to say about zero or a letter', () => {
    assert.equal(tabDigit(press({ code: 'Digit0', ctrlKey: true })), null)
    assert.equal(tabDigit(press({ code: 'KeyT', ctrlKey: true })), null)
  })
})
