/**
 * Finding file paths in a line of terminal output, and placing what was found back
 * onto the grid of cells the terminal draws.
 *
 * Both halves are pure on purpose: the guessing is where this feature is either
 * useful or annoying, and guessing is exactly what a test can pin down.
 */

export type PathMatch = {
  /** Where the path starts in the line, and one past where it ends. */
  start: number
  end: number
  /** The path as written, separators untouched - resolving it is somebody else's job. */
  path: string
  /** The line it pointed at, if it said one. */
  line: number | null
}

/**
 * What a path is made of. Deliberately without `:`, so a drive letter is the only
 * colon a candidate can contain and `19:38:31` cannot be read as one path.
 */
const SEGMENT = '[\\w.+\\-@$#%~]+'
const CANDIDATE = new RegExp(
  '(?:[A-Za-z]:)?[\\\\/]?' + SEGMENT + '(?:[\\\\/]' + SEGMENT + ')*',
  'g'
)

/** `:224` or `:224:12` right after the path. The column is read and then ignored. */
const POSITION = /^:(\d+)(?::\d+)?/

/**
 * A name has to have a separator or an extension, otherwise every word in the output
 * would be a link. The cost is `Dockerfile` on its own, which is a fair trade against
 * underlining prose.
 */
const EXTENSION = /\.[A-Za-z][A-Za-z0-9]{0,7}$/

/** Past this a line is output, not a path, and a long line is where the cost is. */
const MAX_MATCHES = 12
const MAX_LENGTH = 300

export function findPaths(text: string): PathMatch[] {
  const found: PathMatch[] = []
  CANDIDATE.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = CANDIDATE.exec(text)) !== null && found.length < MAX_MATCHES) {
    const start = match.index
    let path = match[0]

    /*
     * A candidate right behind `:` or a separator is part of something bigger - above
     * all a URL, where `http://localhost:5173/x` would otherwise offer `/localhost`
     * as a file. The web pane is where an address belongs, not here.
     */
    const before = start > 0 ? text[start - 1] : ' '
    if (before === ':' || before === '/' || before === '\\') continue

    // A full stop that ended a sentence is not part of the name.
    while (path.endsWith('.')) path = path.slice(0, -1)
    if (path.length === 0 || path.length > MAX_LENGTH) continue

    const separated = path.includes('/') || path.includes('\\')
    if (!separated && !EXTENSION.test(path)) continue

    const end = start + path.length
    const position = POSITION.exec(text.slice(end))
    found.push({
      start,
      end: position ? end + position[0].length : end,
      path,
      line: position ? Number(position[1]) : null
    })
    // Skip past the line number, so `12` never starts a candidate of its own.
    CANDIDATE.lastIndex = position ? end + position[0].length : end
  }

  return found
}

/**
 * The grid position of a stretch of a logical line. A wrapped line is one line to the
 * reader and several rows to the terminal, so an offset has to be divided by the width
 * to say which row it landed on. Both coordinates are 1-based, as xterm counts them.
 */
export function cellRange(
  offset: number,
  length: number,
  firstRow: number,
  cols: number
): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const last = offset + Math.max(length, 1) - 1
  return {
    start: { x: (offset % cols) + 1, y: firstRow + Math.floor(offset / cols) },
    end: { x: (last % cols) + 1, y: firstRow + Math.floor(last / cols) }
  }
}

/** Which row of a wrapped line an offset falls on, counting from `firstRow`. */
export function rowOf(offset: number, firstRow: number, cols: number): number {
  return firstRow + Math.floor(offset / cols)
}
