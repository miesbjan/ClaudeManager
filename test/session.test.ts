import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sanitisePane, sanitiseSession } from '../src/shared/session.ts'

describe('sanitisePane', () => {
  it('keeps what it is given', () => {
    const pane = sanitisePane({
      terminal: true,
      ratio: 0.3,
      run: 'npm run dev',
      web: 'http://localhost:3000',
      rightMode: 'both',
      rightRatio: 0.7,
      webManual: true
    })
    assert.deepEqual(pane, {
      terminal: true,
      ratio: 0.3,
      run: 'npm run dev',
      web: 'http://localhost:3000',
      rightMode: 'both',
      rightRatio: 0.7,
      webManual: true
    })
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
      files: ['C:/x/a.md'],
      active: 'C:/x/a.md',
      pane: sanitisePane({ terminal: true, ratio: 0.35 })
    })
    assert.equal(session.tabs[1].pane.web, 'http://localhost:5173')
    assert.equal(session.activeTab, 1, 'the document that was active becomes the active tab')
  })

  it('drops a tab with no files rather than showing an empty one', () => {
    const session = sanitiseSession({ tabs: [{ files: [] }, { files: ['a.md'] }], activeTab: 0 })
    assert.equal(session.tabs.length, 1)
    assert.deepEqual(session.tabs[0].files, ['a.md'])
  })

  it('points the active tab at one that exists', () => {
    assert.equal(sanitiseSession({ tabs: [{ files: ['a.md'] }], activeTab: 9 }).activeTab, 0)
    assert.equal(sanitiseSession({ tabs: [{ files: ['a.md'] }], activeTab: -3 }).activeTab, 0)
  })

  it('falls back to the first file when the remembered one is gone', () => {
    const session = sanitiseSession({ tabs: [{ files: ['a.md', 'b.md'], active: 'vanished.md' }] })
    assert.equal(session.tabs[0].active, 'a.md')
  })

  it('answers with nothing for nothing', () => {
    assert.deepEqual(sanitiseSession(null), { tabs: [], activeTab: 0 })
    assert.deepEqual(sanitiseSession({}), { tabs: [], activeTab: 0 })
  })
})
