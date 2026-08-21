import { closeSync, openSync, readdirSync, readSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { EMPTY_TOTALS, foldUsage, transcriptFolder, type UsageTotals } from '../shared/usage'
import type { SessionUsage } from '../shared/types'

/**
 * A transcript nobody has written to for this long is a session that has ended. The
 * numbers from it would be true but about the past, and a status bar reporting the
 * past as the present is worse than one saying nothing.
 */
const STALE_MS = 15 * 60 * 1000

/** Where reading got to in each transcript, so a poll only reads what is new. */
type FileState = { offset: number; partial: string; totals: UsageTotals }
const seen = new Map<string, FileState>()

function newestTranscript(dir: string): { path: string; mtimeMs: number; size: number } | null {
  let best: { path: string; mtimeMs: number; size: number } | null = null
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return null // no folder means Claude has never run here
  }

  for (const entry of entries) {
    if (!entry.endsWith('.jsonl')) continue
    const path = join(dir, entry)
    try {
      const info = statSync(path)
      if (!best || info.mtimeMs > best.mtimeMs) {
        best = { path, mtimeMs: info.mtimeMs, size: info.size }
      }
    } catch {
      // vanished between listing and reading
    }
  }
  return best
}

function readFrom(path: string, offset: number, size: number): string {
  if (size <= offset) return ''
  const handle = openSync(path, 'r')
  try {
    const buffer = Buffer.allocUnsafe(size - offset)
    const read = readSync(handle, buffer, 0, buffer.length, offset)
    return buffer.subarray(0, read).toString('utf8')
  } finally {
    closeSync(handle)
  }
}

/**
 * The usage of the session running in `cwd`, or null when there is nothing live to
 * report. The newest transcript in the project's folder is taken to be the running
 * session - which is right unless two sessions share one directory, and then it is
 * whichever spoke last.
 */
export function readUsage(cwd: string): SessionUsage | null {
  if (!cwd) return null
  const dir = join(homedir(), '.claude', 'projects', transcriptFolder(cwd))
  const file = newestTranscript(dir)
  if (!file) return null
  if (Date.now() - file.mtimeMs > STALE_MS) return null

  let state = seen.get(file.path)
  // A file that shrank was replaced; anything remembered about it is about a
  // different file that happened to have the same name.
  if (!state || file.size < state.offset) {
    state = { offset: 0, partial: '', totals: EMPTY_TOTALS }
  }

  const text = state.partial + readFrom(file.path, state.offset, file.size)
  const lines = text.split('\n')
  // The last piece has no newline yet: it is still being written.
  const partial = lines.pop() ?? ''

  const totals = foldUsage(lines, state.totals)
  seen.set(file.path, { offset: file.size, partial, totals })

  if (totals.model === null && totals.output === 0) return null
  return {
    model: totals.model,
    contextTokens: totals.context,
    outputTokens: totals.output,
    updatedAt: file.mtimeMs
  }
}
