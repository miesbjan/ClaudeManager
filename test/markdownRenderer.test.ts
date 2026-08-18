import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { changedLines } from '../src/renderer/src/diff.ts'
import { renderMarkdown, resolveLocal } from '../src/renderer/src/markdownRenderer.ts'

/**
 * The elements carrying the change marker, as `tag:text`. Asserting on this instead
 * of raw HTML keeps the tests readable and independent of markdown-it's formatting.
 */
function markedBlocks(html: string): string[] {
  const out: string[] = []
  const pattern = /<(\w+)[^>]*class="[^"]*md-changed[^"]*"[^>]*>([\s\S]*?)<\/\1>/g
  for (const match of html.matchAll(pattern)) {
    const text = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    out.push(`${match[1]}:${text}`)
  }
  for (const _ of html.matchAll(/<hr[^>]*md-changed[^>]*>/g)) out.push('hr:')
  return out
}

/** Render `after` with the blocks that differ from `before` marked. */
function renderChange(before: string, after: string): string[] {
  return markedBlocks(renderMarkdown(after, 'C:/docs', changedLines(before, after)))
}

const FENCE = '```'

const DOC = [
  '# Title',
  '',
  'First paragraph, untouched.',
  '',
  'Second paragraph, will change.',
  '',
  '## Section',
  '',
  '- alpha',
  '- beta',
  '- gamma',
  '',
  `${FENCE}js`,
  'const x = 1',
  FENCE,
  '',
  '| col | val |',
  '| --- | --- |',
  '| a   | 1   |',
  '| b   | 2   |',
  '',
  '> quoted text',
  '',
  '1. loose item one',
  '',
  '2. loose item two',
  ''
].join('\n')

describe('change marking', () => {
  it('marks a rewritten paragraph', () => {
    const after = DOC.replace('Second paragraph, will change.', 'Second paragraph, rewritten.')
    assert.deepEqual(renderChange(DOC, after), ['p:Second paragraph, rewritten.'])
  })

  it('marks a rewritten heading', () => {
    const after = DOC.replace('## Section', '## Section renamed')
    assert.deepEqual(renderChange(DOC, after), ['h2:Section renamed'])
  })

  // A tight list item renders no paragraph element, so the marker has to land on the
  // <li> instead - otherwise a changed bullet would highlight nothing.
  it('marks the list item of a tight list', () => {
    const after = DOC.replace('- beta', '- beta changed')
    assert.deepEqual(renderChange(DOC, after), ['li:beta changed'])
  })

  it('marks an inserted list item', () => {
    const after = DOC.replace('- beta\n', '- beta\n- beta2\n')
    assert.deepEqual(renderChange(DOC, after), ['li:beta2'])
  })

  // The paragraph inside a loose list item is a real element, so it carries the
  // marker and the <li> stays clean.
  it('marks the paragraph of a loose list item', () => {
    const after = DOC.replace('1. loose item one', '1. loose item ONE')
    assert.deepEqual(renderChange(DOC, after), ['p:loose item ONE'])
  })

  it('marks a changed code fence', () => {
    const after = DOC.replace('const x = 1', 'const x = 2')
    assert.deepEqual(renderChange(DOC, after), ['pre:const x = 2'])
  })

  it('marks a changed table row and nothing inside it', () => {
    const after = DOC.replace('| b   | 2   |', '| b   | 9   |')
    assert.deepEqual(renderChange(DOC, after), ['tr:b 9'])
  })

  // Marking the blockquote as well would stack two tints over the same text.
  it('marks the paragraph inside a blockquote, not the quote', () => {
    const after = DOC.replace('> quoted text', '> quoted text edited')
    assert.deepEqual(renderChange(DOC, after), ['p:quoted text edited'])
  })

  it('marks nothing when the document did not change', () => {
    assert.deepEqual(renderChange(DOC, DOC), [])
  })

  it('marks nothing on a first load, where every line is new', () => {
    assert.deepEqual(markedBlocks(renderMarkdown(DOC, 'C:/docs')), [])
  })

  it('does not leak markers into a later render', () => {
    const after = DOC.replace('- beta', '- beta changed')
    renderMarkdown(after, 'C:/docs', changedLines(DOC, after))
    assert.deepEqual(markedBlocks(renderMarkdown(DOC, 'C:/docs')), [])
  })
})

describe('rendering', () => {
  it('keeps syntax highlighting on a fence', () => {
    const html = renderMarkdown(`${FENCE}js\nconst x = 1\n${FENCE}\n`, 'C:/docs')
    assert.match(html, /<pre class="hljs"><code class="language-js">/)
    assert.match(html, /<span class="hljs-keyword">const<\/span>/)
  })

  it('marks a fence without losing its highlighting', () => {
    const before = `${FENCE}js\nconst x = 1\n${FENCE}\n`
    const after = `${FENCE}js\nconst x = 2\n${FENCE}\n`
    const html = renderMarkdown(after, 'C:/docs', changedLines(before, after))
    assert.match(html, /<pre class="hljs md-changed"><code class="language-js">/)
    assert.match(html, /<span class="hljs-number">2<\/span>/)
  })

  it('leaves an unknown language as escaped plain text', () => {
    const html = renderMarkdown(`${FENCE}nosuchlang\nfoo <b>bar</b>\n${FENCE}\n`, 'C:/docs')
    assert.match(html, /<pre class="hljs"><code>foo &lt;b&gt;bar&lt;\/b&gt;/)
  })

  it('renders task list items as disabled checkboxes', () => {
    const html = renderMarkdown('- [x] done\n- [ ] todo\n', 'C:/docs')
    assert.match(html, /class="task-checkbox" type="checkbox" disabled checked/)
    assert.match(html, /class="task-list-item"/)
  })

  it('gives headings stable ids, disambiguating duplicates', () => {
    const html = renderMarkdown('# Same\n\n# Same\n', 'C:/docs')
    assert.match(html, /<h1 id="same">/)
    assert.match(html, /<h1 id="same-1">/)
  })

  it('routes images through the asset protocol', () => {
    const html = renderMarkdown('![i](pic.png)\n', 'C:/docs')
    assert.match(html, /src="mdasset:\/\/local\/C%3A\/docs\/pic\.png"/)
    assert.match(html, /loading="lazy"/)
  })

  it('tags local and external links differently', () => {
    const html = renderMarkdown('[l](other.md) [x](https://example.com)\n', 'C:/docs')
    assert.match(html, /data-local="C:\/docs\/other\.md"/)
    assert.match(html, /data-external="https:\/\/example\.com"/)
  })

  // The security model rests on this: Markdown is display content, never markup.
  it('escapes raw HTML in the source instead of parsing it', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<b>bold?</b>\n', 'C:/docs')
    assert.match(html, /&lt;script&gt;/)
    assert.doesNotMatch(html, /<script>/)
    assert.doesNotMatch(html, /<b>/)
  })

  // markdown-it refuses the link outright, so the source stays visible as plain text
  // rather than becoming something clickable.
  it('never turns a javascript: url into a link', () => {
    const html = renderMarkdown('[click](javascript:alert(1))\n', 'C:/docs')
    assert.doesNotMatch(html, /<a\s/)
    assert.equal(html, '<p>[click](javascript:alert(1))</p>\n')
  })
})

describe('resolveLocal', () => {
  it('resolves a relative path against the document directory', () => {
    assert.equal(resolveLocal('C:/docs', 'other.md'), 'C:/docs/other.md')
  })

  it('walks out of the directory', () => {
    assert.equal(resolveLocal('C:/docs/sub', '../other.md'), 'C:/docs/other.md')
  })

  it('keeps an absolute path', () => {
    assert.equal(resolveLocal('C:/docs', 'D:/elsewhere/x.md'), 'D:/elsewhere/x.md')
  })

  it('keeps a UNC path', () => {
    assert.equal(resolveLocal('C:/docs', '//server/share/x.md'), '//server/share/x.md')
  })

  it('normalises backslashes and strips the fragment', () => {
    assert.equal(resolveLocal('C:/docs', 'sub\\x.md#heading'), 'C:/docs/sub/x.md')
  })

  it('decodes percent-encoding', () => {
    assert.equal(resolveLocal('C:/docs', 'a%20b.md'), 'C:/docs/a b.md')
  })
})
