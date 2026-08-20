import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cellRange, findPaths, rowOf } from '../src/renderer/src/paths.ts'

const paths = (text: string): string[] => findPaths(text).map((m) => m.path)

describe('findPaths', () => {
  it('finds what an agent writes about a file', () => {
    assert.deepEqual(paths('Edited src/main/index.ts and it works'), ['src/main/index.ts'])
  })

  it('reads the line number that follows, and ignores the column', () => {
    const [found] = findPaths('see src/main/index.ts:224:9 for the guard')
    assert.equal(found.path, 'src/main/index.ts')
    assert.equal(found.line, 224)
    // The whole reference is underlined, number included - that is what was clicked.
    assert.equal('see src/main/index.ts:224:9'.slice(found.start, found.end), 'src/main/index.ts:224:9')
  })

  it('takes a name with an extension on its own', () => {
    assert.deepEqual(paths('wrote package.json'), ['package.json'])
    assert.deepEqual(paths('put the key in .env'), ['.env'])
  })

  it('takes a Windows path with a drive letter', () => {
    assert.deepEqual(paths('reading C:\\Users\\me\\proj\\notes.md now'), [
      'C:\\Users\\me\\proj\\notes.md'
    ])
  })

  /*
   * The whole reason the colon is not part of a path: a clock in a log line would
   * otherwise be a file with a line number.
   */
  it('leaves a timestamp alone', () => {
    assert.deepEqual(paths('[19:38:31] done'), [])
  })

  it('leaves a version and a plain word alone', () => {
    assert.deepEqual(paths('v24.11.1 is ready'), [])
    assert.deepEqual(paths('npm run build finished'), [])
  })

  /*
   * Shape cannot tell `Node.js` from `app.js`, and it does not have to: what a
   * candidate is worth is settled by asking the disk whether it exists. Guessing
   * harder here would mean losing `package.json`, which is worth clicking.
   */
  it('offers a word shaped like a file, existence decides the rest', () => {
    assert.deepEqual(paths('Node.js ready'), ['Node.js'])
  })

  // An address belongs in the web pane; offering `/localhost` as a file is nonsense.
  it('does not pick a file out of a URL', () => {
    assert.deepEqual(paths('serving on http://localhost:5173/index.html'), [])
    assert.deepEqual(paths('see https://example.com/docs/readme.md'), [])
  })

  it('drops the full stop that ended the sentence', () => {
    assert.deepEqual(paths('changed src/app.ts.'), ['src/app.ts'])
  })

  it('finds a path in quotes and in brackets', () => {
    assert.deepEqual(paths('"src/a.ts" and (src/b.ts)'), ['src/a.ts', 'src/b.ts'])
  })

  it('stops before the list becomes the whole line', () => {
    const many = Array.from({ length: 30 }, (_, i) => `f${i}.md`).join(' ')
    assert.equal(findPaths(many).length, 12)
  })

  it('has nothing to say about an empty line', () => {
    assert.deepEqual(findPaths(''), [])
  })
})

describe('cellRange', () => {
  it('places a stretch inside one row', () => {
    assert.deepEqual(cellRange(4, 10, 7, 80), {
      start: { x: 5, y: 7 },
      end: { x: 14, y: 7 }
    })
  })

  // A wrapped line is one line to the reader and several rows to the terminal.
  it('carries on onto the next row when the line wrapped', () => {
    assert.deepEqual(cellRange(78, 5, 7, 80), {
      start: { x: 79, y: 7 },
      end: { x: 3, y: 8 }
    })
  })

  it('has a width of one for an empty stretch', () => {
    assert.deepEqual(cellRange(0, 0, 1, 80), {
      start: { x: 1, y: 1 },
      end: { x: 1, y: 1 }
    })
  })
})

describe('rowOf', () => {
  it('says which row an offset landed on', () => {
    assert.equal(rowOf(0, 5, 80), 5)
    assert.equal(rowOf(79, 5, 80), 5)
    assert.equal(rowOf(80, 5, 80), 6)
    assert.equal(rowOf(200, 5, 80), 7)
  })
})
