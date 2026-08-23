/**
 * One open file inside a tab.
 *
 * A tab is a place - a directory, a shell, a dev server - and a place holds several
 * files over the course of an afternoon: the document being steered by, another one
 * next to it, a source file where a key was pasted. Everything here belongs to the
 * file. Everything about the place stays on the tab, which is why switching the shown
 * file moves neither the shell nor the project.
 */
export type Doc = {
  /**
   * Which read of this file is the current one.
   *
   * A file being rewritten by an agent can be read twice at once - the watcher notices
   * again while the first read is still in flight - and the older answer arriving last
   * wrote the older content in, with the status bar saying "updated" over it and the
   * change highlight measured against the wrong version.
   */
  reading: number
  path: string
  dir: string
  /** Rendered Markdown, empty for anything shown as written. */
  html: string
  error: string | null
  /** Where the reader was, kept per document so a tab switch returns to it. */
  scrollTop: number
  /**
   * The same, for the plain-text pane. Two numbers because they measure different
   * things: one is a place in the rendered layout, the other a place in the text, and
   * putting one into the other lands somewhere random.
   */
  rawScrollTop: number
  updatedAt: number | null
  /** Last content seen on disk; the next reload is diffed against it. */
  source: string | null
  /** Modification time of that content, which decides whether a save is safe. */
  mtimeMs: number
  /** Showing the file as written rather than rendered. Always true for non-Markdown. */
  raw: boolean
  /** Unsaved edits. Null means the buffer is the file; anything else is yours. */
  draft: string | null
  /** Only the head of the file was read, so it must not be written back. */
  truncated: boolean
  /** The file moved on while you were editing, so a save would overwrite that. */
  staleOnDisk: boolean
  /** A refused save arms the next one, which is the way to overwrite deliberately. */
  forceSave: boolean
  /** A reload produced changed blocks that have not been shown to the user yet. */
  pendingFlash: boolean
}

export function createDoc(path: string, raw: boolean): Doc {
  return {
    path,
    reading: 0,
    dir: '',
    html: '',
    error: null,
    scrollTop: 0,
    rawScrollTop: 0,
    updatedAt: null,
    source: null,
    mtimeMs: 0,
    raw,
    draft: null,
    truncated: false,
    staleOnDisk: false,
    forceSave: false,
    pendingFlash: false
  }
}

/** Whether this file has edits that closing it would throw away. */
export function isDirty(doc: Doc): boolean {
  return doc.draft !== null
}

/**
 * The next file in the tab, wrapping round. With one file there is nowhere to go, and
 * the answer is the file you are on rather than an error.
 */
export function nextDocIndex(count: number, current: number, step: number): number {
  if (count < 2) return count === 1 ? 0 : -1
  return (current + step + count) % count
}

/**
 * Which file is shown after one is closed. Closing what you are looking at moves you
 * to its neighbour rather than to the far end of the list; closing something else
 * leaves you where you are.
 */
export function indexAfterClose(count: number, closing: number, current: number): number {
  if (count <= 1) return -1
  if (closing < current) return current - 1
  if (closing > current) return current
  return Math.min(current, count - 2)
}
