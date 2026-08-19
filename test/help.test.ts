import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SHORTCUTS } from '../src/renderer/src/help.ts'
import { paneCommand, type KeyLike } from '../src/renderer/src/shortcuts.ts'

const rows = SHORTCUTS.flatMap((section) => section.rows)
const listed = rows.map((row) => row.keys).join(' | ')

describe('shortcut help', () => {
  it('describes every row it lists', () => {
    for (const row of rows) {
      assert.ok(row.keys.trim().length > 0, 'a row without keys')
      assert.ok(row.action.trim().length > 0, `no action for ${row.keys}`)
    }
  })

  /*
   * The panel is the only place a user finds out these keys exist, so a binding
   * that works but is not listed is a bug. This checks the pane commands, which
   * are the ones nobody would guess.
   */
  it('mentions each pane command the app answers to', () => {
    const bindings: Array<[string, KeyLike]> = [
      ['Alt+←', { key: '', code: 'ArrowLeft', altKey: true, ctrlKey: false, shiftKey: false }],
      ['Alt+→', { key: '', code: 'ArrowRight', altKey: true, ctrlKey: false, shiftKey: false }],
      ['Alt+1', { key: 'ě', code: 'Digit1', altKey: true, ctrlKey: false, shiftKey: false }],
      ['Alt+2', { key: 'š', code: 'Digit2', altKey: true, ctrlKey: false, shiftKey: false }],
      ['Alt+Z', { key: 'z', code: 'KeyY', altKey: true, ctrlKey: false, shiftKey: false }],
      [
        'Alt+Shift+←',
        { key: '', code: 'ArrowLeft', altKey: true, ctrlKey: false, shiftKey: true }
      ]
    ]

    for (const [label, event] of bindings) {
      assert.ok(paneCommand(event), `${label} is not handled at all`)
      const stem = label.split('+').slice(0, -1).join('+')
      assert.ok(listed.includes(stem), `${label} is missing from the help panel`)
    }
  })

  it('keeps the panel short enough to stay glanceable', () => {
    assert.ok(rows.length <= 24, `the panel has grown to ${rows.length} rows`)
  })
})
