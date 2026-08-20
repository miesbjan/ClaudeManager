import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  matches,
  stepSelection,
  visibleEntries,
  type PaletteEntry
} from '../src/renderer/src/palette.ts'

const entry = (rel: string, here = false, elsewhere: string | null = null): PaletteEntry => ({
  path: 'C:/proj/' + rel,
  rel,
  here,
  elsewhere
})

const rels = (list: PaletteEntry[]): string[] => list.map((e) => e.rel)

describe('matches', () => {
  it('finds a file by part of its name', () => {
    assert.equal(matches(entry('src/main/index.ts'), 'index'), true)
    assert.equal(matches(entry('src/main/index.ts'), 'DEX'), true)
    assert.equal(matches(entry('src/main/index.ts'), 'nope'), false)
  })

  // Without this, a name shared by five directories cannot be told apart.
  it('matches the path once the query has a slash in it', () => {
    assert.equal(matches(entry('src/main/index.ts'), 'main/index'), true)
    assert.equal(matches(entry('src/renderer/index.ts'), 'main/index'), false)
  })

  it('does not match the directory when the query has no slash', () => {
    assert.equal(matches(entry('src/main/index.ts'), 'main'), false)
  })

  it('takes everything for an empty query', () => {
    assert.equal(matches(entry('anything.md'), ''), true)
    assert.equal(matches(entry('anything.md'), '   '), true)
  })
})

describe('visibleEntries', () => {
  const entries = [
    entry('docs/plan.md', true),
    entry('src/main/index.ts'),
    entry('index.ts'),
    entry('src/renderer/index.ts'),
    entry('notes.md', true),
    entry('other/plan.md', false, 'release')
  ]

  /*
   * The tab bar deliberately has no strip of open files, so this is the only place that
   * list exists. Nothing typed has to mean "what do I have here".
   */
  it('shows what is open here when nothing is typed', () => {
    assert.deepEqual(rels(visibleEntries(entries, '')), ['notes.md', 'docs/plan.md'])
  })

  it('widens to the project once something is typed', () => {
    assert.deepEqual(rels(visibleEntries(entries, 'index')), [
      'index.ts',
      'src/main/index.ts',
      'src/renderer/index.ts'
    ])
  })

  it('puts what is open here first', () => {
    assert.deepEqual(rels(visibleEntries(entries, 'plan')), ['docs/plan.md', 'other/plan.md'])
  })

  it('prefers a file near the root over one buried in it', () => {
    const deep = [entry('a/b/c/d/thing.ts'), entry('thing.ts'), entry('a/thing.ts')]
    assert.deepEqual(rels(visibleEntries(deep, 'thing')), [
      'thing.ts',
      'a/thing.ts',
      'a/b/c/d/thing.ts'
    ])
  })

  it('is alphabetical when nothing else separates them', () => {
    const same = [entry('bbb.md'), entry('aaa.md'), entry('ccc.md')]
    assert.deepEqual(rels(visibleEntries(same, '.md')), ['aaa.md', 'bbb.md', 'ccc.md'])
  })

  it('stops at the limit rather than filling the screen', () => {
    const many = Array.from({ length: 200 }, (_, i) => entry(`f${i}.md`))
    assert.equal(visibleEntries(many, '.md').length, 40)
    assert.equal(visibleEntries(many, '.md', 5).length, 5)
  })

  it('keeps where an open file lives, so going there can be explained', () => {
    const [found] = visibleEntries(entries, 'other/plan')
    assert.equal(found.elsewhere, 'release')
  })
})

describe('stepSelection', () => {
  it('moves through the list', () => {
    assert.equal(stepSelection(5, 0, 1), 1)
    assert.equal(stepSelection(5, 3, -1), 2)
  })

  // Wrapping round in a filtered list means overshooting into nowhere.
  it('stops at the ends', () => {
    assert.equal(stepSelection(5, 4, 1), 4)
    assert.equal(stepSelection(5, 0, -1), 0)
  })

  it('has nothing to select in an empty list', () => {
    assert.equal(stepSelection(0, 0, 1), -1)
  })
})
