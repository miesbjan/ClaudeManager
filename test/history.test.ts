import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  asRemembered,
  forget,
  MAX_REMEMBERED,
  placeKey,
  remember,
  sanitiseHistory,
  trimPlaces,
  type RememberedFile
} from '../src/shared/history.ts'

const file = (path: string, count = 1, at = 1000): RememberedFile => ({ path, count, at })

describe('remember', () => {
  it('puts what was just opened first', () => {
    const list = remember([file('a.md'), file('b.md')], 'c.md', 2000)
    assert.deepEqual(
      list.map((entry) => entry.path),
      ['c.md', 'a.md', 'b.md']
    )
  })

  it('raises the count of a file opened again, and moves it to the front', () => {
    const list = remember([file('a.md'), file('b.md', 3)], 'b.md', 2000)
    assert.equal(list[0].path, 'b.md')
    assert.equal(list[0].count, 4)
    assert.equal(list[0].at, 2000)
    assert.equal(list.length, 2, 'the same file twice is one entry')
  })

  // Windows hands the same file over with either slash and any case.
  it('treats one file written two ways as one file', () => {
    const list = remember([file('C:/proj/a.md', 2)], 'c:\\proj\\A.md', 3000)
    assert.equal(list.length, 1)
    assert.equal(list[0].count, 3)
    assert.equal(list[0].path, 'c:\\proj\\A.md', 'the path as it was opened this time')
  })

  it('keeps the list a list', () => {
    let list: RememberedFile[] = []
    for (let i = 0; i < MAX_REMEMBERED + 10; i++) list = remember(list, `f${i}.md`, i)
    assert.equal(list.length, MAX_REMEMBERED)
    assert.equal(list[0].path, `f${MAX_REMEMBERED + 9}.md`)
  })
})

describe('forget', () => {
  it('drops what is no longer on disk and keeps the order', () => {
    const list = forget([file('a.md'), file('b.md'), file('c.md')], ['b.md'])
    assert.deepEqual(
      list.map((entry) => entry.path),
      ['a.md', 'c.md']
    )
  })
})

describe('asRemembered', () => {
  it('reads what it wrote', () => {
    assert.deepEqual(asRemembered({ path: 'a.md', count: 3, at: 5 }), {
      path: 'a.md',
      count: 3,
      at: 5
    })
  })

  it('refuses an entry with no path, and repairs the rest', () => {
    assert.equal(asRemembered({ count: 2 }), null)
    assert.equal(asRemembered(null), null)
    assert.deepEqual(asRemembered({ path: 'a.md' }), { path: 'a.md', count: 1, at: 0 })
    assert.deepEqual(asRemembered({ path: 'a.md', count: -4, at: 'soon' }), {
      path: 'a.md',
      count: 1,
      at: 0
    })
  })
})

describe('sanitiseHistory', () => {
  it('reads the shape it writes', () => {
    const places = sanitiseHistory({
      'c:/proj': [{ path: 'a.md', count: 2, at: 9 }],
      'c:/other': [{ path: 'b.md', count: 1, at: 3 }]
    })
    assert.deepEqual(Object.keys(places).sort(), ['c:/other', 'c:/proj'])
    assert.equal(places['c:/proj'][0].count, 2)
  })

  it('drops a place whose every entry was rubbish', () => {
    assert.deepEqual(sanitiseHistory({ 'c:/proj': [null, { count: 1 }] }), {})
    assert.deepEqual(sanitiseHistory({ 'c:/proj': 'nonsense' }), {})
    assert.deepEqual(sanitiseHistory(null), {})
  })
})

describe('placeKey', () => {
  it('makes one key of the ways a directory can be written', () => {
    assert.equal(placeKey('C:\\proj\\thing\\'), 'c:/proj/thing')
    assert.equal(placeKey('c:/proj/thing'), 'c:/proj/thing')
  })
})

describe('trimPlaces', () => {
  // A place nobody has opened for months is not worth a line in the file.
  it('keeps the places visited most recently', () => {
    const places = {
      old: [file('a.md', 1, 100)],
      newer: [file('b.md', 1, 500)],
      newest: [file('c.md', 1, 900)]
    }
    assert.deepEqual(Object.keys(trimPlaces(places, 2)).sort(), ['newer', 'newest'])
  })

  it('leaves a short list alone', () => {
    const places = { one: [file('a.md')] }
    assert.equal(trimPlaces(places, 10), places)
  })
})
