import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'

type CoreRule = Parameters<MarkdownIt['core']['ruler']['after']>[2]

/** Directory of the document being rendered; used to resolve relative assets. */
let baseDir = ''

const md: MarkdownIt = new MarkdownIt({
  // Raw HTML in the Markdown source is escaped, never parsed. Together with the
  // renderer CSP and contextIsolation this makes injected <script> harmless.
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
  highlight: (code, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        const value = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
        return `<pre class="hljs"><code class="language-${md.utils.escapeHtml(lang)}">${value}</code></pre>`
      } catch {
        // fall through to plain rendering
      }
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(code)}</code></pre>`
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

md.core.ruler.after('inline', 'task-lists', taskLists)
md.core.ruler.push('heading-ids', headingIds)

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

/** Render Markdown to sanitised HTML, resolving assets relative to `dir`. */
export function renderMarkdown(source: string, dir: string): string {
  baseDir = dir
  return md.render(source)
}
