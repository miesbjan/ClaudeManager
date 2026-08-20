import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { paneCommand, RESIZE_STEP, type KeyLike } from '../src/shared/shortcuts.ts'

function press(overrides: Partial<KeyLike>): KeyLike {
  return { key: '', code: '', altKey: true, ctrlKey: false, shiftKey: false, ...overrides }
}

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
