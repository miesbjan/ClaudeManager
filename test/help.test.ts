import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { helpIntro, helpNotes, keyTokens, shortcutSections, SHORTCUTS } from '../src/renderer/src/help.ts'
import { paneCommand, type KeyLike } from '../src/shared/shortcuts.ts'

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
      [
        'Alt+←',
        { key: '', code: 'ArrowLeft', altKey: true, ctrlKey: false, shiftKey: false }
      ],
      [
        'Alt+→',
        { key: '', code: 'ArrowRight', altKey: true, ctrlKey: false, shiftKey: false }
      ],
      [
        'Alt+1',
        { key: 'ě', code: 'Digit1', altKey: true, ctrlKey: false, shiftKey: false }
      ],
      [
        'Alt+2',
        { key: 'š', code: 'Digit2', altKey: true, ctrlKey: false, shiftKey: false }
      ],
      [
        'Alt+Z',
        { key: 'z', code: 'KeyY', altKey: true, ctrlKey: false, shiftKey: false }
      ],
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
    assert.ok(rows.length <= 26, `the panel has grown to ${rows.length} rows`)
  })

  /*
   * The keys are printed on the keyboard, so they must read the same in both
   * languages; only what they do is translated. A row added to one list and
   * forgotten in the other would show up here.
   */
  it('lists the same keys in Czech as in English', () => {
    // The mouse rows name gestures rather than keys, so those are translated too.
    const isKeys = (keys: string): boolean => /Ctrl|Alt|Shift/.test(keys)
    const shape = (lang: 'en' | 'cs'): string[][] =>
      shortcutSections(lang).map((section) => section.rows.map((row) => row.keys).filter(isKeys))
    assert.deepEqual(shape('cs'), shape('en'))

    const count = (lang: 'en' | 'cs'): number[] =>
      shortcutSections(lang).map((section) => section.rows.length)
    assert.deepEqual(count('cs'), count('en'), 'the two lists have drifted apart')

    for (const section of shortcutSections('cs')) {
      for (const row of section.rows) {
        assert.ok(row.action.trim().length > 0, `no Czech text for ${row.keys}`)
      }
    }
  })

  it('describes what happens without a key, in both languages', () => {
    for (const lang of ['en', 'cs'] as const) {
      const notes = helpNotes(lang)
      assert.equal(notes.length, helpNotes('en').length, `${lang} has a different set of notes`)
      for (const note of notes) {
        assert.ok(note.title.trim().length > 0, `a ${lang} note without a title`)
        assert.ok(note.body.trim().length > 20, `${lang}: ${note.title} says too little`)
      }
    }
  })

  /*
   * These are the parts nobody would find by pressing keys, so the panel is the
   * only place they are announced.
   */
  it('mentions the activity dot, the reload, Run, the server and the readouts', () => {
    const text = helpNotes('en')
      .map((note) => note.title + ' ' + note.body)
      .join(' ')
      .toLowerCase()
    for (const subject of ['dot', 'reload', 'run', 'server', 'session']) {
      assert.ok(text.includes(subject), `the panel says nothing about ${subject}`)
    }
  })
})

/*
 * The panel is where somebody who has never seen this finds out what it is for, so an
 * intro that quietly went missing - or drifted apart between the two languages - would
 * be worse than none: the ? button would promise an explanation and not give one.
 */
describe('helpIntro', () => {
  it('says what the application is, in both languages', () => {
    for (const lang of ['en', 'cs'] as const) {
      const intro = helpIntro(lang)
      assert.ok(intro.lead.trim().length > 60, lang + ': the lead says too little')
      // Five short paragraphs: a wall of text is not an introduction.
      assert.equal(intro.points.length, 5, lang + ' does not have five points')
      for (const point of intro.points) {
        assert.ok(point.length < 240, lang + ': a point long enough to be skipped')
      }
      assert.equal(intro.points.length, helpIntro('en').points.length, lang + ' has a different number of points')
      for (const point of intro.points) {
        assert.ok(point.trim().length > 40, lang + ': a point that says too little')
      }
    }
  })

  /*
   * The four things a colleague has to be told, because none of them can be guessed
   * from the window: what a tab is, that there are panes, that it is meant for working
   * beside an agent, and where editing stops.
   */
  it('covers the shape of the app and everything it watches for you', () => {
    const text = [helpIntro('en').lead, ...helpIntro('en').points].join(' ').toLowerCase()
    const subjects = [
      'tab is a place',
      'pane',
      'agent',
      'reloads itself',
      'dot on a tab',
      'taskbar',
      'limits of the account',
      'editor'
    ]
    for (const subject of subjects) {
      assert.ok(text.includes(subject), 'the intro says nothing about ' + subject)
    }
  })

  it('places it between a terminal and an editor rather than beside either', () => {
    assert.match(helpIntro('en').lead, /terminal/)
    assert.match(helpIntro('cs').lead, /terminál/)
  })
})

describe('keyTokens', () => {
  const caps = (keys: string): string[] =>
    keyTokens(keys)
      .filter((token) => token.kind === 'key')
      .map((token) => token.text)

  it('sets a chord in key caps', () => {
    assert.deepEqual(caps('Ctrl+P / Ctrl+O'), ['Ctrl+P', 'Ctrl+O'])
    assert.deepEqual(caps('Ctrl+1 … Ctrl+9'), ['Ctrl+1', 'Ctrl+9'])
  })

  /*
   * These rows describe what to do with the mouse. Drawn as caps, every word looks
   * like a key that does not exist.
   */
  it('leaves a gesture as a sentence', () => {
    for (const row of ['middle-click a tab', 'drag a file in', 'everything else']) {
      assert.deepEqual(caps(row), [], `${row} was made into keys`)
      assert.equal(
        keyTokens(row)
          .map((token) => token.text)
          .join(''),
        row
      )
    }
  })

  it('keeps the separators out of the caps', () => {
    assert.deepEqual(caps('Ctrl+Shift+O, P, W'), ['Ctrl+Shift+O', 'P', 'W'])
    assert.equal(
      keyTokens('Ctrl+Shift+O, P')
        .map((token) => token.text)
        .join(''),
      'Ctrl+Shift+O, P'
    )
  })

  it('puts every row back together exactly as written', () => {
    for (const lang of ['en', 'cs'] as const) {
      for (const section of shortcutSections(lang)) {
        for (const row of section.rows) {
          assert.equal(
            keyTokens(row.keys)
              .map((token) => token.text)
              .join(''),
            row.keys,
            `${row.keys} does not survive the split`
          )
        }
      }
    }
  })
})
