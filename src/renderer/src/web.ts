/**
 * The web pane shows a dev server running next to the document.
 *
 * Addresses are restricted to the local machine on purpose. The security model of
 * this app rests on displayed content having no way out; a pane that could load any
 * URL would be a different app. A dev server on localhost is content you started
 * yourself, from a project you opened yourself.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]'])

/**
 * The hostnames an address can still carry once it has been normalised, which is what
 * the `frame-src` list in `index.html` has to cover. Two allowlists, one of them in
 * static HTML, cannot share a constant; `test/web.test.ts` holds them together.
 *
 * There are only two, because CSP's grammar for a host has no room for an IPv6
 * literal: Chromium answers `http://[::1]:*` with "contains an invalid source. It
 * will be ignored." Anything that cannot be written here has to be normalised into
 * something that can.
 */
export const FRAMED_HOSTS = ['localhost', '127.0.0.1'] as const

/** Loopback names that CSP cannot name, and what to call them instead. */
const REWRITE_TO_LOCALHOST = new Set(['0.0.0.0', '[::1]'])

export function isLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    return LOCAL_HOSTS.has(parsed.hostname)
  } catch {
    return false
  }
}

/**
 * Accepts what a person would type - `3000`, `localhost:3000`, a full URL - and
 * answers with an address the frame policy can actually allow.
 *
 * `0.0.0.0` is what a server prints when it binds every interface rather than an
 * address to visit, and `[::1]` is a name CSP has no syntax for. Both are the same
 * service `localhost` reaches, so both are rewritten to it. Without that they were
 * accepted, remembered, and then refused by the browser: an empty pane and nothing to
 * explain it.
 */
export function normalizeUrl(input: string): string | null {
  const text = input.trim()
  if (text === '') return null

  const candidate = /^\d+$/.test(text)
    ? `http://localhost:${text}`
    : /^https?:\/\//i.test(text)
      ? text
      : `http://${text}`

  if (!isLocalUrl(candidate)) return null

  const parsed = new URL(candidate)
  if (REWRITE_TO_LOCALHOST.has(parsed.hostname)) {
    parsed.hostname = 'localhost'
    return parsed.toString()
  }
  return candidate
}

/*
 * Dev servers announce themselves, so there is nothing to configure: Vite prints
 * "Local: http://localhost:5173/", Next prints "- Local: http://localhost:3000".
 * The escape sequences around them are excluded from the match rather than stripped.
 *
 * A port is required. Not because nothing can listen on 80, but because output
 * arrives in chunks that split anywhere: without a port, the half of an address that
 * made it into one chunk would be taken for the whole of it, and a bare
 * "http://localhost" would replace the address that actually works.
 */
const URL_IN_OUTPUT = /https?:\/\/(?:localhost|127\.0\.0\.1):\d+(?:\/[^\s\x1b"'`<>]*)?/gi

type Found = { url: string; end: number }

function findAddresses(text: string): Found[] {
  const found: Found[] = []
  for (const match of text.matchAll(URL_IN_OUTPUT)) {
    // Trailing punctuation belongs to the sentence, not to the address.
    const cleaned = match[0].replace(/[.,;:)\]}]+$/, '')
    if (isLocalUrl(cleaned)) found.push({ url: cleaned, end: (match.index ?? 0) + match[0].length })
  }
  return found
}

/** The last local address printed in a chunk of terminal output. */
export function sniffLocalUrl(chunk: string): string | null {
  const found = findAddresses(chunk)
  return found.length > 0 ? found[found.length - 1].url : null
}

/** Enough of the previous chunk to rejoin an address that was cut in half. */
const MAX_TAIL = 200

/**
 * Reads addresses out of a stream rather than a single chunk. A PTY splits its
 * output wherever it likes - including in the middle of a port number - so every
 * chunk is searched together with the tail of the one before it.
 */
export function createUrlReader(): (chunk: string) => string | null {
  let tail = ''

  return (chunk: string): string | null => {
    const text = tail + chunk
    tail = text.slice(-MAX_TAIL)

    // An address running to the very end of the buffer may still be growing - the
    // port could continue in the next chunk - so it waits there until something
    // follows it. The tail keeps it, and the next output releases it.
    const complete = findAddresses(text).filter((found) => found.end < text.length)
    return complete.length > 0 ? complete[complete.length - 1].url : null
  }
}

/** What the right side of a tab shows. */
export type RightMode = 'doc' | 'web' | 'both'

/**
 * One key cycles the three arrangements. Without an address there is nothing to put
 * beside the document, so the cycle shrinks to two: open the pane to type an address
 * into, and close it again.
 */
export function nextRightMode(mode: RightMode, hasUrl: boolean): RightMode {
  if (!hasUrl) return mode === 'doc' ? 'web' : 'doc'
  if (mode === 'doc') return 'web'
  if (mode === 'web') return 'both'
  return 'doc'
}
