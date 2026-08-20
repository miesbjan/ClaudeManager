/**
 * Search inside the rendered document.
 *
 * Matches are painted with the CSS custom highlight API rather than by wrapping
 * text in elements: the document keeps the exact markup markdown-it produced, a
 * match may cross element boundaries without special handling, and clearing the
 * search cannot leave anything behind.
 */
export type TextRange = { start: number; end: number }

/** Case-insensitive, non-overlapping, in reading order. */
export function matchRanges(text: string, query: string): TextRange[] {
  const found: TextRange[] = []
  if (!query) return found

  const haystack = text.toLowerCase()
  const needle = query.toLowerCase()
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at < 0) return found
    found.push({ start: at, end: at + needle.length })
    from = at + needle.length
  }
}

/**
 * Which line an offset falls on, 1-based, and what that line says. For reporting a
 * match in text that cannot be highlighted where it sits.
 */
export function lineAt(text: string, offset: number): { line: number; content: string } {
  const start = text.lastIndexOf('\n', Math.max(offset - 1, 0)) + 1
  const end = text.indexOf('\n', offset)
  return {
    line: text.slice(0, start).split('\n').length,
    content: text.slice(start, end < 0 ? text.length : end)
  }
}

/** Next or previous match, wrapping around; -1 when there is nothing to step to. */
export function stepIndex(current: number, total: number, delta: number): number {
  if (total <= 0) return -1
  const from = current < 0 ? (delta > 0 ? -1 : 0) : current
  return (((from + delta) % total) + total) % total
}

type Piece = { node: Text; start: number }

function textPieces(root: HTMLElement): { text: string; pieces: Piece[] } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const pieces: Piece[] = []
  let text = ''
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const textNode = node as Text
    pieces.push({ node: textNode, start: text.length })
    text += textNode.data
  }
  return { text, pieces }
}

function pieceAt(pieces: Piece[], offset: number): Piece | null {
  let low = 0
  let high = pieces.length - 1
  let best: Piece | null = null
  while (low <= high) {
    const mid = (low + high) >> 1
    if (pieces[mid].start <= offset) {
      best = pieces[mid]
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return best
}

/** Ranges for every occurrence of `query` in the element's text. */
export function findInElement(root: HTMLElement, query: string): Range[] {
  const { text, pieces } = textPieces(root)
  const ranges: Range[] = []

  for (const match of matchRanges(text, query)) {
    const startPiece = pieceAt(pieces, match.start)
    const endPiece = pieceAt(pieces, match.end - 1)
    if (!startPiece || !endPiece) continue
    const range = document.createRange()
    range.setStart(startPiece.node, match.start - startPiece.start)
    range.setEnd(endPiece.node, match.end - endPiece.start)
    ranges.push(range)
  }
  return ranges
}

const ALL = 'find-match'
const CURRENT = 'find-current'

export function paintMatches(ranges: Range[], current: number): void {
  const registry = CSS.highlights
  if (!registry) return
  registry.set(ALL, new Highlight(...ranges))
  const active = ranges[current]
  if (active) registry.set(CURRENT, new Highlight(active))
  else registry.delete(CURRENT)
}

export function clearMatches(): void {
  CSS.highlights?.delete(ALL)
  CSS.highlights?.delete(CURRENT)
}

/** Bring a match into view, leaving it a third of the way down rather than at the edge. */
export function scrollToMatch(scroller: HTMLElement, range: Range): void {
  const box = range.getBoundingClientRect()
  const view = scroller.getBoundingClientRect()
  if (box.height === 0 && box.width === 0) return
  if (box.top >= view.top + 40 && box.bottom <= view.bottom - 20) return
  scroller.scrollTop += box.top - view.top - view.height / 3
}
