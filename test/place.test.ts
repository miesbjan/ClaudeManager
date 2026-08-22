import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  chooseTarget,
  expandPath,
  matchDirs,
  parentOf,
  shorten,
  splitTyped
} from '../src/shared/place.ts'

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

/*
 * Both bugs this exists for came from one wrong order: the text in the field was
 * preferred over the row the keyboard was on. Arrowing onto a directory then went
 * somewhere else, and a half-typed name was refused as "no such directory".
 */
describe('chooseTarget', () => {
  it('takes the row the keyboard was moved to, whatever the field says', () => {
    assert.equal(
      chooseTarget({ typed: 'C:/work', typedIsDirectory: true, row: 'C:/work/transit-feed', moved: true }),
      'C:/work/transit-feed'
    )
  })

  // A trailing slash names that directory, not the first thing inside it.
  it('takes a path named in full when the selection was not touched', () => {
    assert.equal(
      chooseTarget({ typed: 'C:/work', typedIsDirectory: true, row: 'C:/work/ATLAS', moved: false }),
      'C:/work'
    )
  })

  it('completes a half-typed name to what it matched', () => {
    assert.equal(
      chooseTarget({ typed: 'C:/work/bra', typedIsDirectory: false, row: 'C:/work/bravocore', moved: false }),
      'C:/work/bravocore'
    )
  })

  it('has nowhere to go when the text is not a directory and nothing matched', () => {
    assert.equal(chooseTarget({ typed: 'C:/nope', typedIsDirectory: false, row: null, moved: false }), null)
    assert.equal(chooseTarget({ typed: null, typedIsDirectory: false, row: null, moved: true }), null)
  })

  it('falls back to the text when the list is empty', () => {
    assert.equal(chooseTarget({ typed: 'C:/work', typedIsDirectory: true, row: null, moved: true }), 'C:/work')
  })
})

/* Walking up a tree with the keyboard, which is what Shift+Tab does. */
describe('parentOf', () => {
  it('goes one level up', () => {
    assert.equal(parentOf('C:/work/bravocore'), 'C:/work')
    assert.equal(parentOf('C:/work/bravocore/'), 'C:/work')
    assert.equal(parentOf('C:/work'), 'C:/')
  })

  it('stays at the root, which has nothing above it', () => {
    assert.equal(parentOf('C:/'), 'C:/')
    assert.equal(parentOf('/'), '/')
  })
})

describe('shorten', () => {
  it('writes the home directory the way it was typed', () => {
    assert.equal(shorten('C:/Users/me/source/thing', 'C:/Users/me'), '~/source/thing')
    assert.equal(shorten('C:/Users/me', 'C:/Users/me'), '~')
  })

  // A prefix is not a parent: sourced is not inside source.
  it('only shortens on a boundary', () => {
    assert.equal(shorten('C:/Users/mexico/x', 'C:/Users/me'), 'C:/Users/mexico/x')
  })

  it('leaves anything outside home alone', () => {
    assert.equal(shorten('D:/work', 'C:/Users/me'), 'D:/work')
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
