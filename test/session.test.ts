import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MAX_DRAFT, MAX_PROMPT, sanitisePane, sanitiseSession } from '../src/shared/session.ts'

describe('sanitisePane', () => {
  it('keeps what it is given', () => {
    const pane = sanitisePane({
      terminal: true,
      ratio: 0.3,
      run: 'npm run dev',
      web: 'http://localhost:3000',
      rightMode: 'both',
      rightRatio: 0.7,
      webManual: true,
      prompt: 'rewrite the reader',
      promptOpen: true,
      root: 'C:/proj'
    })
    assert.deepEqual(pane, {
      terminal: true,
      ratio: 0.3,
      run: 'npm run dev',
      web: 'http://localhost:3000',
      rightMode: 'both',
      rightRatio: 0.7,
      webManual: true,
      prompt: 'rewrite the reader',
      promptOpen: true,
      root: 'C:/proj'
    })
  })

  it('has no place of its own until one is chosen', () => {
    assert.equal(sanitisePane({}).root, null)
    assert.equal(sanitisePane({ root: '' }).root, null)
    assert.equal(sanitisePane({ root: 42 }).root, null)
  })

  /*
   * A prompt is work in progress and outlives a restart, but it is a prompt and not a
   * document: an unbounded one in the session file would be a surprise.
   */
  it('keeps a prompt within a size a session file can carry', () => {
    const long = sanitisePane({ prompt: 'x'.repeat(MAX_PROMPT + 500) })
    assert.equal(long.prompt.length, MAX_PROMPT)
  })

  it('has an empty buffer, closed, for a place that never had one', () => {
    const pane = sanitisePane({})
    assert.equal(pane.prompt, '')
    assert.equal(pane.promptOpen, false)
  })

  it('replaces a ratio that would leave a pane invisible', () => {
    assert.equal(sanitisePane({ ratio: 0 }).ratio, 0.5)
    assert.equal(sanitisePane({ ratio: 1 }).ratio, 0.5)
    assert.equal(sanitisePane({ ratio: 'wide' }).ratio, 0.5)
  })

  // Written before the right side could hold two things at once.
  it('reads the older way of saying the server is showing', () => {
    assert.equal(sanitisePane({ showWeb: true }).rightMode, 'web')
    assert.equal(sanitisePane({ showWeb: false }).rightMode, 'doc')
  })

  it('survives rubbish', () => {
    assert.equal(sanitisePane(null).terminal, false)
    assert.equal(sanitisePane('nonsense').rightMode, 'doc')
  })
})

describe('sanitiseSession', () => {
  it('reads the shape it writes', () => {
    const session = sanitiseSession({
      tabs: [
        { files: ['a.md', 'b.json'], active: 'b.json', pane: { terminal: true, ratio: 0.4 } },
        { files: ['c.md'], active: 'c.md', pane: {} }
      ],
      activeTab: 1
    })
    assert.equal(session.tabs.length, 2)
    assert.deepEqual(session.tabs[0].files, ['a.md', 'b.json'])
    assert.equal(session.tabs[0].active, 'b.json')
    assert.equal(session.tabs[0].pane.terminal, true)
    assert.equal(session.activeTab, 1)
  })

  /*
   * The file on disk outlives the code. A tab used to be one document, with its layout
   * stored under the document's path, and that describes exactly one tab per file.
   */
  it('reads a session written when a tab was a document', () => {
    const session = sanitiseSession({
      files: ['C:/x/a.md', 'C:/x/b.md'],
      active: 'C:/x/b.md',
      panes: {
        'C:/x/a.md': { terminal: true, ratio: 0.35 },
        'C:/x/b.md': { terminal: false, web: 'http://localhost:5173' }
      }
    })
    assert.equal(session.tabs.length, 2)
    assert.deepEqual(session.tabs[0], {
      // A file from back then carries no name for its tab; the window gives it one.
      id: null,
      files: ['C:/x/a.md'],
      active: 'C:/x/a.md',
      pane: sanitisePane({ terminal: true, ratio: 0.35 }),
      // Nothing was ever named by hand back then.
      name: null
    })
    assert.equal(session.tabs[1].pane.web, 'http://localhost:5173')
    assert.equal(session.activeTab, 1, 'the document that was active becomes the active tab')
  })

  it('drops a tab that is neither a file nor a place', () => {
    const session = sanitiseSession({ tabs: [{ files: [] }, { files: ['a.md'] }], activeTab: 0 })
    assert.equal(session.tabs.length, 1)
    assert.deepEqual(session.tabs[0].files, ['a.md'])
  })

  /*
   * An unsaved edit is work, and the window it lived in can be rebuilt without warning.
   * Kept with the tab that holds the file, capped, and only for files that tab has.
   */
  it('keeps unsaved edits, for the files the tab holds', () => {
    const session = sanitiseSession({
      tabs: [
        {
          files: ['a.md', 'b.md'],
          drafts: { 'a.md': 'half a sentence', 'c.md': 'not open here', 'b.md': '' }
        }
      ],
      activeTab: 0
    })
    assert.deepEqual(session.tabs[0].drafts, { 'a.md': 'half a sentence' })
  })

  it('caps one edit rather than the file', () => {
    const long = 'x'.repeat(MAX_DRAFT + 500)
    const session = sanitiseSession({ tabs: [{ files: ['a.md'], drafts: { 'a.md': long } }] })
    assert.equal(session.tabs[0].drafts?.['a.md'].length, MAX_DRAFT)
  })

  it('has no edits to keep when the file says nothing about them', () => {
    const session = sanitiseSession({ tabs: [{ files: ['a.md'] }], activeTab: 0 })
    assert.deepEqual(session.tabs[0].drafts, {})
  })

  /*
   * The name of a tab is what a shell belongs to, and shells outlive the window: a
   * rebuilt window asks for them back by it. Handing the names out again in file order
   * would give a tab somebody else's shell, so what the file says is kept.
   */
  it('keeps the name each tab was written under', () => {
    const session = sanitiseSession({
      tabs: [
        { id: 'tab-7', files: ['a.md'] },
        { id: 'tab-2', files: ['b.md'] }
      ],
      activeTab: 0
    })
    assert.deepEqual(
      session.tabs.map((tab) => tab.id),
      ['tab-7', 'tab-2']
    )
  })

  it('refuses a name twice over, since one shell cannot belong to two tabs', () => {
    const session = sanitiseSession({
      tabs: [
        { id: 'tab-1', files: ['a.md'] },
        { id: 'tab-1', files: ['b.md'] }
      ],
      activeTab: 0
    })
    assert.equal(session.tabs[0].id, 'tab-1')
    assert.equal(session.tabs[1].id, null, 'the second one is named by the window instead')
  })

  it('has no name to keep when the file was written before names were', () => {
    const session = sanitiseSession({ tabs: [{ files: ['a.md'] }], activeTab: 0 })
    assert.equal(session.tabs[0].id, null)
  })

  /*
   * A tab with a shell open holds whatever runs in it. Left out of the file, that shell
   * is unclaimed after a rebuilt window - and unclaimed is how a shell gets ended.
   */
  it('keeps a tab that is only a shell', () => {
    const session = sanitiseSession({
      tabs: [{ files: [], pane: { terminal: true } }],
      activeTab: 0
    })
    assert.equal(session.tabs.length, 1)
    assert.equal(session.tabs[0].pane.terminal, true)
  })

  /*
   * A tab opened over a directory holds nothing yet and is still the place you were
   * working in - dropping it on restart would lose the one thing it was.
   */
  it('keeps a tab that is a directory with nothing open in it', () => {
    const session = sanitiseSession({
      tabs: [{ files: [], pane: { root: 'C:/proj', terminal: true } }],
      activeTab: 0
    })
    assert.equal(session.tabs.length, 1)
    assert.deepEqual(session.tabs[0].files, [])
    assert.equal(session.tabs[0].active, null)
    assert.equal(session.tabs[0].pane.root, 'C:/proj')
  })

  it('points the active tab at one that exists', () => {
    assert.equal(sanitiseSession({ tabs: [{ files: ['a.md'] }], activeTab: 9 }).activeTab, 0)
    assert.equal(sanitiseSession({ tabs: [{ files: ['a.md'] }], activeTab: -3 }).activeTab, 0)
  })

  it('falls back to the first file when the remembered one is gone', () => {
    const session = sanitiseSession({ tabs: [{ files: ['a.md', 'b.md'], active: 'vanished.md' }] })
    assert.equal(session.tabs[0].active, 'a.md')
  })

  it('keeps a name given by hand', () => {
    const session = sanitiseSession({
      tabs: [{ files: ['a.md'], active: 'a.md', pane: {}, name: '  the plan  ' }]
    })
    assert.equal(session.tabs[0].name, 'the plan')
  })

  it('treats an empty name as none at all', () => {
    const named = (name: unknown) =>
      sanitiseSession({ tabs: [{ files: ['a.md'], active: 'a.md', pane: {}, name }] }).tabs[0].name
    assert.equal(named('   '), null)
    assert.equal(named(''), null)
    assert.equal(named(42), null)
    assert.equal(named(undefined), null)
  })

  it('answers with nothing for nothing', () => {
    assert.deepEqual(sanitiseSession(null), { tabs: [], activeTab: 0 })
    assert.deepEqual(sanitiseSession({}), { tabs: [], activeTab: 0 })
  })
})
