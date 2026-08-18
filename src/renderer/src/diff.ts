/**
 * Line diff used to show what an external writer (editor, generator, agent) just
 * changed. The result is a set of *0-based line indices of the new text*, which is
 * exactly what markdown-it's `token.map` uses, so the renderer can tag the blocks
 * those lines belong to without any further translation.
 */

/**
 * Above this many DP cells the exact diff is abandoned and the whole differing
 * region is reported as changed. 4M cells is a 2000x2000 changed region, far more
 * than any hand-written document reaches; the fallback keeps a pathological case
 * from allocating hundreds of megabytes.
 */
const MAX_CELLS = 4_000_000

/** Split the way markdown-it does, so indices line up with `token.map`. */
function splitLines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n')
}

/** Map every distinct line to an int so the diff compares numbers, not strings. */
function intern(a: string[], b: string[]): { a: Int32Array; b: Int32Array } {
  const ids = new Map<string, number>()
  const encode = (lines: string[]): Int32Array => {
    const out = new Int32Array(lines.length)
    lines.forEach((line, i) => {
      let id = ids.get(line)
      if (id === undefined) {
        id = ids.size
        ids.set(line, id)
      }
      out[i] = id
    })
    return out
  }
  return { a: encode(a), b: encode(b) }
}

/**
 * Lines of `after` that are not part of the longest common subsequence with
 * `before` - i.e. inserted or rewritten. Deletions leave no line to mark, so the
 * line that closed over the gap is marked instead: the block around a removed
 * paragraph lights up rather than nothing at all.
 */
export function changedLines(before: string, after: string): Set<number> {
  const oldLines = splitLines(before)
  const newLines = splitLines(after)
  const changed = new Set<number>()

  let start = 0
  const maxStart = Math.min(oldLines.length, newLines.length)
  while (start < maxStart && oldLines[start] === newLines[start]) start++

  let end = 0
  const maxEnd = maxStart - start
  while (
    end < maxEnd &&
    oldLines[oldLines.length - 1 - end] === newLines[newLines.length - 1 - end]
  ) {
    end++
  }

  const oldMid = oldLines.slice(start, oldLines.length - end)
  const newMid = newLines.slice(start, newLines.length - end)

  if (newMid.length === 0) {
    // Pure deletion: mark the line the removed text was replaced by, clamped to
    // the document, so an empty document reports nothing.
    if (oldMid.length > 0 && newLines.length > 0) {
      changed.add(Math.min(start, newLines.length - 1))
    }
    return changed
  }

  if (oldMid.length === 0 || (oldMid.length + 1) * (newMid.length + 1) > MAX_CELLS) {
    for (let i = 0; i < newMid.length; i++) changed.add(start + i)
    return changed
  }

  const { a, b } = intern(oldMid, newMid)
  const rows = a.length + 1
  const cols = b.length + 1
  const lcs = new Int32Array(rows * cols)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * cols + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * cols + j + 1] + 1
          : Math.max(lcs[(i + 1) * cols + j], lcs[i * cols + j + 1])
    }
  }

  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
    } else if (lcs[(i + 1) * cols + j] >= lcs[i * cols + j + 1]) {
      i++ // line dropped from the old text
    } else {
      changed.add(start + j)
      j++
    }
  }
  for (; j < b.length; j++) changed.add(start + j)

  return changed
}
