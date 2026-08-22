import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { expandPath, matchDirs, splitTyped } from '../src/shared/place.ts'

const context = { home: 'C:/Users/me', base: 'C:/Users/me/source/thing' }

describe('expandPath', () => {
  // The case the whole thing exists for: this is how these directories are named.
  it('takes ~ for the home directory', () => {
    assert.equal(expandPath('~', context), 'C:/Users/me')
    assert.equal(expandPath('~/source/other', context), 'C:/Users/me/source/other')
  })

  it('takes a relative path from where the tab is now', () => {
    assert.equal(expandPath('docs', context), 'C:/Users/me/source/thing/docs')
    assert.equal(expandPath('./docs', context), 'C:/Users/me/source/thing/docs')
    assert.equal(expandPath('../other', context), 'C:/Users/me/source/other')
    assert.equal(expandPath('../../x', context), 'C:/Users/me/x')
  })

  it('takes an absolute path as it is, whichever slashes it was typed with', () => {
    assert.equal(expandPath('D:\\work\\repo', context), 'D:/work/repo')
    assert.equal(expandPath('D:/work/repo/', context), 'D:/work/repo')
  })

  it('keeps a drive root a root', () => {
    assert.equal(expandPath('D:', context), 'D:/')
    assert.equal(expandPath('D:\\', context), 'D:/')
  })

  it('drops the quotes a pasted path arrives in', () => {
    assert.equal(expandPath('"D:\\work\\repo"', context), 'D:/work/repo')
    assert.equal(expandPath("'~/source/thing'", context), 'C:/Users/me/source/thing')
  })

  // Climbing past the top lands on the drive root, which is a real place to be.
  it('never climbs above the root', () => {
    assert.equal(expandPath('../../../../../..', context), 'C:/')
  })

  it('has nothing to say about nothing typed', () => {
    assert.equal(expandPath('', context), null)
    assert.equal(expandPath('   ', context), null)
  })

  // A window with no tab in it has no "here", so a bare name starts at home.
  it('starts from home when the tab is nowhere yet', () => {
    assert.equal(expandPath('source/thing', { home: 'C:/Users/me', base: '' }), 'C:/Users/me/source/thing')
  })

  it('keeps a network path whole', () => {
    assert.equal(expandPath('\\\\server\\share\\dir', context), '//server/share/dir')
  })
})

describe('splitTyped', () => {
  it('separates the directory already named from the name being typed', () => {
    assert.deepEqual(splitTyped('~/source/thi'), { parent: '~/source/', partial: 'thi' })
    assert.deepEqual(splitTyped('~/source/'), { parent: '~/source/', partial: '' })
    assert.deepEqual(splitTyped('thing'), { parent: '', partial: 'thing' })
  })
})

describe('matchDirs', () => {
  const names = ['ReportTracker', 'DataStudio', 'ATLASMAIN2', 'tracker-old']

  it('offers everything while nothing is typed', () => {
    assert.deepEqual(matchDirs(names, ''), names)
  })

  it('puts what a name begins with before what it merely contains', () => {
    assert.deepEqual(matchDirs(names, 'tra'), ['tracker-old', 'ReportTracker'])
  })

  it('does not care about case, since Windows does not', () => {
    assert.deepEqual(matchDirs(names, 'atlas'), ['ATLASMAIN2'])
  })

  it('says nothing matches rather than guessing', () => {
    assert.deepEqual(matchDirs(names, 'zzz'), [])
  })
})
