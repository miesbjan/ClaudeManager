import { app } from 'electron'
import { appendFileSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * A short written record of the things that are otherwise invisible.
 *
 * Windows gives a packaged application no console, so anything printed while it runs is
 * printed to nobody - and the events worth knowing about are exactly the ones nobody is
 * watching: a window that died and was rebuilt, a shell taken over or started fresh, a
 * page in the pane that crashed. Without this, "the agent on the left disappeared" has
 * no evidence behind it and the answer is guesswork.
 *
 * Deliberately small: one line per event, no levels, no rotation beyond a cap, and every
 * failure ignored. A log that can break the application it reports on is worse than none.
 */
const LIMIT = 200 * 1024
/** How much is kept when the cap is reached. The end is the part that matters. */
const KEEP = 100 * 1024

function file(): string {
  return join(app.getPath('userData'), 'log.txt')
}

function stamp(): string {
  const now = new Date()
  const two = (n: number): string => String(n).padStart(2, '0')
  return (
    now.getFullYear() +
    '-' +
    two(now.getMonth() + 1) +
    '-' +
    two(now.getDate()) +
    ' ' +
    two(now.getHours()) +
    ':' +
    two(now.getMinutes()) +
    ':' +
    two(now.getSeconds())
  )
}

export function note(line: string): void {
  try {
    const path = file()
    try {
      if (statSync(path).size > LIMIT) {
        writeFileSync(path, readFileSync(path, 'utf8').slice(-KEEP))
      }
    } catch {
      // No file yet, or no way to read it; appending will make one.
    }
    appendFileSync(path, stamp() + '  ' + line + '\n')
  } catch {
    // A log that can break the application it reports on is worse than no log.
  }
}

/** Where the record is, for anyone who has to be told where to look. */
export function logPath(): string {
  return file()
}
