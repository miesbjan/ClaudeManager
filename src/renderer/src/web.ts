/**
 * The web pane shows a dev server running next to the document.
 *
 * Addresses are restricted to the local machine on purpose. The security model of
 * this app rests on displayed content having no way out; a pane that could load any
 * URL would be a different app. A dev server on localhost is content you started
 * yourself, from a project you opened yourself.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'])

export function isLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    return LOCAL_HOSTS.has(parsed.hostname)
  } catch {
    return false
  }
}

/** Accepts what a person would type - `3000`, `localhost:3000`, a full URL. */
export function normalizeUrl(input: string): string | null {
  const text = input.trim()
  if (text === '') return null

  const candidate = /^\d+$/.test(text)
    ? `http://localhost:${text}`
    : /^https?:\/\//i.test(text)
      ? text
      : `http://${text}`

  return isLocalUrl(candidate) ? candidate : null
}

/*
 * Dev servers announce themselves, so there is nothing to configure: Vite prints
 * "Local: http://localhost:5173/", Next prints "- Local: http://localhost:3000".
 * The escape sequences around them are excluded from the match rather than stripped.
 */
const URL_IN_OUTPUT = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/[^\s\x1b"'`<>]*)?/gi

/** The last local address printed in a chunk of terminal output. */
export function sniffLocalUrl(chunk: string): string | null {
  const matches = chunk.match(URL_IN_OUTPUT)
  if (!matches) return null

  for (let i = matches.length - 1; i >= 0; i--) {
    // Trailing punctuation belongs to the sentence, not to the address.
    const cleaned = matches[i].replace(/[.,;:)\]}]+$/, '')
    if (isLocalUrl(cleaned)) return cleaned
  }
  return null
}
