import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import hljs from 'highlight.js/lib/common'

type CoreRule = Parameters<MarkdownIt['core']['ruler']['after']>[2]

/** Directory of the document being rendered; used to resolve relative assets. */
let baseDir = ''

/** Lines (0-based, as in `token.map`) that changed since the last render. */
let changedLines: Set<number> | null = null

const md: MarkdownIt = new MarkdownIt({
  // Raw HTML in the Markdown source is escaped, never parsed. Together with the
  // renderer CSP and contextIsolation this makes injected <script> harmless.
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
  // Returns the highlighted body only; the surrounding <pre> is built by the fence
  // renderer below, which is the one place that knows the block's attributes.
  highlight: (code, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
      } catch {
        // fall through to plain rendering
      }
    }
    return md.utils.escapeHtml(code)
  }
})

/** `- [ ] task` / `- [x] task` -> read-only checkbox. */
const taskLists: CoreRule = (state) => {
  const tokens = state.tokens
  for (let i = 2; i < tokens.length; i++) {
    const inline = tokens[i]
    if (inline.type !== 'inline' || !inline.children) continue
    if (tokens[i - 1].type !== 'paragraph_open') continue
    if (tokens[i - 2].type !== 'list_item_open') continue

    const match = /^\[([ xX])\]\s+/.exec(inline.content)
    if (!match) continue

    const checked = match[1].toLowerCase() === 'x'
    inline.content = inline.content.slice(match[0].length)
    const first = inline.children[0]
    if (first && first.type === 'text') first.content = first.content.replace(/^\[([ xX])\]\s+/, '')

    const box = new state.Token('html_inline', '', 0)
    box.content = `<input class="task-checkbox" type="checkbox" disabled${checked ? ' checked' : ''}> `
    inline.children.unshift(box)
    tokens[i - 2].attrJoin('class', 'task-list-item')
  }
}

/** Stable heading ids so in-document links (#some-heading) work. */
const headingIds: CoreRule = (state) => {
  const used = new Set<string>()
  const tokens = state.tokens
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'heading_open') continue
    const inline = tokens[i + 1]
    if (!inline || inline.type !== 'inline') continue
    const base =
      inline.content
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .trim()
        .replace(/\s+/g, '-') || 'section'
    let slug = base
    let n = 1
    while (used.has(slug)) slug = `${base}-${n++}`
    used.add(slug)
    tokens[i].attrSet('id', slug)
  }
}

/**
 * Tag the blocks holding changed lines so a live reload can briefly show what the
 * writer on the other side rewrote.
 *
 * Only leaf-level blocks are tagged: tinting a blockquote *and* the paragraph inside
 * it would stack two backgrounds on the same text. Tight list items are the one
 * special case - markdown-it marks their paragraphs `hidden`, so those render no
 * element to carry the class and the enclosing `<li>` is tagged instead.
 */
const LEAF_BLOCKS = new Set([
  'paragraph_open',
  'heading_open',
  'fence',
  'code_block',
  'hr',
  'tr_open'
])

const markChanges: CoreRule = (state) => {
  const lines = changedLines
  if (!lines || lines.size === 0) return

  const tokens = state.tokens
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token.map || !LEAF_BLOCKS.has(token.type)) continue
    if (!touchesChange(token.map, lines)) continue

    const target =
      token.type === 'paragraph_open' && token.hidden ? enclosingListItem(tokens, i) : token
    target?.attrJoin('class', 'md-changed')
  }
}

/** `map` is [firstLine, lastLine + 1) over the source. */
function touchesChange(map: [number, number], lines: Set<number>): boolean {
  for (let line = map[0]; line < map[1]; line++) if (lines.has(line)) return true
  return false
}

function enclosingListItem(tokens: Token[], index: number): Token | null {
  let depth = 0
  for (let i = index - 1; i >= 0; i--) {
    const type = tokens[i].type
    if (type === 'list_item_close') depth++
    else if (type === 'list_item_open') {
      if (depth === 0) return tokens[i]
      depth--
    }
  }
  return null
}

md.core.ruler.after('inline', 'task-lists', taskLists)
md.core.ruler.push('heading-ids', headingIds)
md.core.ruler.push('mark-changes', markChanges)

/**
 * markdown-it's own fence renderer puts token attributes on the inner <code> and
 * returns early whenever `highlight` hands back a <pre>, so neither the hljs theme
 * class nor a change marker can reach the <pre>. Building the block here keeps both
 * on the element that actually carries the background.
 */
md.renderer.rules.fence = (tokens, idx, options) => {
  const token = tokens[idx]
  const lang = token.info.trim().split(/\s+/)[0]
  const preClass = ['hljs', token.attrGet('class')].filter(Boolean).join(' ')
  const codeClass =
    lang && hljs.getLanguage(lang) ? ` class="language-${md.utils.escapeHtml(lang)}"` : ''
  const body = options.highlight
    ? options.highlight(token.content, lang, '')
    : md.utils.escapeHtml(token.content)
  return `<pre class="${preClass}"><code${codeClass}>${body}</code></pre>
`
}

const defaultImage = md.renderer.rules.image
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const src = token.attrGet('src')
  if (src) token.attrSet('src', toAssetUrl(baseDir, src))
  token.attrSet('loading', 'lazy')
  return defaultImage
    ? defaultImage(tokens, idx, options, env, self)
    : self.renderToken(tokens, idx, options)
}

md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  const token = tokens[idx]
  const href = token.attrGet('href') ?? ''
  if (/^(https?:|mailto:)/i.test(href)) {
    token.attrSet('data-external', href)
  } else if (!href.startsWith('#')) {
    token.attrSet('data-local', resolveLocal(baseDir, href))
  }
  return self.renderToken(tokens, idx, options)
}

/** Normalise a possibly relative, possibly Windows-style path against baseDir. */
export function resolveLocal(dir: string, target: string): string {
  let raw = target.split(/[?#]/)[0]
  try {
    raw = decodeURI(raw)
  } catch {
    // keep the raw value if it is not valid percent-encoding
  }
  raw = raw.replace(/\\/g, '/')
  const absolute = /^[a-zA-Z]:\//.test(raw) || raw.startsWith('//') || raw.startsWith('/')
  const combined = absolute ? raw : `${dir.replace(/\\/g, '/')}/${raw}`

  const out: string[] = []
  for (const part of combined.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      out.pop()
      continue
    }
    out.push(part)
  }
  const joined = out.join('/')
  return combined.startsWith('//') ? `//${joined}` : joined
}

function toAssetUrl(dir: string, src: string): string {
  if (/^(https?:|data:|mdasset:)/i.test(src)) return src
  const path = resolveLocal(dir, src)
  return `mdasset://local/${path.split('/').map(encodeURIComponent).join('/')}`
}

/**
 * Render Markdown to sanitised HTML, resolving assets relative to `dir`.
 * `changed` holds 0-based source line indices (see ./diff); the blocks containing
 * them get `class="md-changed"` so the stylesheet can flash them.
 */
export function renderMarkdown(source: string, dir: string, changed?: Set<number> | null): string {
  baseDir = dir
  changedLines = changed ?? null
  try {
    return md.render(source)
  } finally {
    changedLines = null
  }
}
