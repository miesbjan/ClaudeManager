/**
 * Typing where a tab should be, instead of clicking there.
 *
 * The system folder picker is three clicks and a scroll for a path somebody can type in
 * two seconds - `~/source/thing` is how these directories are actually named out loud,
 * so it is how they should be namable here. This is the part that turns what was typed
 * into a path: everything else is a list of directories and one key.
 */

export type PlaceContext = {
  /** The user's home directory, for `~`. */
  home: string
  /** Where a relative path starts from: the place the tab is in now. */
  base: string
}

/** Forward slashes throughout, because one shape is easier to reason about than two. */
const slashes = (path: string): string => path.split('\\').join('/')

/** Quotes come along when a path is pasted from anywhere at all. */
function unquote(input: string): string {
  const trimmed = input.trim()
  const quoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  return quoted ? trimmed.slice(1, -1).trim() : trimmed
}

const hasDrive = (path: string): boolean => /^[A-Za-z]:(\/|$)/.test(path)
const isAbsolute = (path: string): boolean =>
  hasDrive(path) || path.startsWith('/') || path.startsWith('//')

/**
 * `.` and `..` resolved by hand rather than by `path`, so this stays a pure function of
 * its input and can be tested without a filesystem or a platform.
 */
function collapse(path: string): string {
  const unc = path.startsWith('//')
  const parts = path.split('/')
  const out: string[] = []
  for (const [index, part] of parts.entries()) {
    if (part === '' && index > 0) continue
    if (part === '.') continue
    if (part === '..') {
      // Never above the root: a path is not a place to be clever about.
      if (out.length > 1) out.pop()
      continue
    }
    out.push(part)
  }
  const joined = out.join('/')
  return unc ? '//' + joined.replace(/^\/+/, '') : joined
}

/**
 * What was typed, as a path. Null when nothing usable was typed - which is not an error,
 * just a prompt with nothing in it yet.
 */
export function expandPath(input: string, context: PlaceContext): string | null {
  const typed = slashes(unquote(input))
  if (typed === '') return null

  const home = slashes(context.home).replace(/\/+$/, '')
  const base = slashes(context.base).replace(/\/+$/, '')

  let absolute: string
  if (typed === '~') absolute = home
  else if (typed.startsWith('~/')) absolute = home + '/' + typed.slice(2)
  else if (isAbsolute(typed)) absolute = typed
  else if (base === '') absolute = home + '/' + typed
  else absolute = base + '/' + typed

  const collapsed = collapse(absolute)
  // A drive on its own is a root and keeps its slash; nothing else keeps a trailing one.
  if (/^[A-Za-z]:$/.test(collapsed)) return collapsed + '/'
  return collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : collapsed
}

/**
 * The part of a typed path that is settled and the part still being typed: completion
 * happens inside the directory that is already named.
 */
export function splitTyped(input: string): { parent: string; partial: string } {
  const typed = slashes(unquote(input))
  const cut = typed.lastIndexOf('/')
  if (cut < 0) return { parent: '', partial: typed }
  return { parent: typed.slice(0, cut + 1), partial: typed.slice(cut + 1) }
}

/** Directories worth offering for what has been typed so far, in reading order. */
export function matchDirs(names: string[], partial: string): string[] {
  const needle = partial.toLowerCase()
  const starts: string[] = []
  const contains: string[] = []
  for (const name of names) {
    const lower = name.toLowerCase()
    if (needle === '' || lower.startsWith(needle)) starts.push(name)
    else if (lower.includes(needle)) contains.push(name)
  }
  // What a name begins with is a stronger answer than what it merely contains.
  return [...starts, ...contains]
}
