/**
 * Getting to a file without a dialog, and seeing what this place holds.
 *
 * Three things are in the list and nothing else: the files open in this tab, the files
 * this place keeps - the ones opened here before, which outlive the session the way the
 * place does - and the files of its project. Files open in *other* tabs are not offered:
 * the palette works inside the place you are in. One does appear if you search for it,
 * because a file is only ever open in one place and going to it means going there; the
 * row says so, so that is a choice rather than a surprise.
 */
export type PaletteEntry = {
  /** Absolute path, as the app opens it. */
  path: string
  /** Relative to the project root, forward slashes: what is shown and matched. */
  rel: string
  /** Open in the tab this palette belongs to. */
  here: boolean
  /** Opened in this place before, whether or not it is open now. */
  remembered: boolean
  /** Open in another place, named so that going there is not a surprise. */
  elsewhere: string | null
}

/** More than this on screen at once is a wall of text, not a list. */
export const MAX_SHOWN = 40

const fileName = (rel: string): string => rel.slice(rel.lastIndexOf('/') + 1)

/**
 * Substring, deliberately, rather than the loose subsequence matching a code editor
 * does. It is predictable, it is a pure function, and if it turns out to be too strict
 * it is half an hour's work to loosen. Matching on anything cleverer invites scoring,
 * weighting and history, which is a different program.
 *
 * A query with a slash in it is about the path, so `src/main` finds what its file name
 * alone cannot.
 */
export function matches(entry: PaletteEntry, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  const haystack = needle.includes('/') ? entry.rel : fileName(entry.rel)
  return haystack.toLowerCase().includes(needle)
}

/**
 * What the palette shows. With nothing typed it answers "what do I work on here": the
 * files open in this tab and the ones this place keeps. That list is the reason the tab
 * bar has no strip of open files, and remembering it per place is what makes a project
 * opened next week start where it left off. Typing widens it to the whole project.
 *
 * Open files come first either way, then what the place remembers - both are answers
 * about this place, while the rest of the project is only a possibility. Beyond that the
 * shortest path wins, so a file near the root beats one buried in it, and ties are
 * alphabetical rather than in whatever order the disk gave them.
 */
export function visibleEntries(
  entries: readonly PaletteEntry[],
  query: string,
  limit = MAX_SHOWN
): PaletteEntry[] {
  const empty = query.trim() === ''
  const pool = entries.filter((entry) =>
    empty ? entry.here || entry.remembered : matches(entry, query)
  )

  return [...pool]
    .sort((a, b) => {
      if (a.here !== b.here) return a.here ? -1 : 1
      if (a.remembered !== b.remembered) return a.remembered ? -1 : 1
      if (a.rel.length !== b.rel.length) return a.rel.length - b.rel.length
      return a.rel.localeCompare(b.rel)
    })
    .slice(0, limit)
}

/** Moving through the list with the arrows, stopping at the ends rather than wrapping. */
export function stepSelection(count: number, current: number, step: number): number {
  if (count === 0) return -1
  return Math.min(count - 1, Math.max(0, current + step))
}
