import { execFile } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { homedir } from 'node:os'

/**
 * Answering "where do you want to be" while it is being typed: the directories inside
 * the one already named, and - if the machine has zoxide - the directories this person
 * actually goes to.
 *
 * Both are fail-soft. A directory that cannot be read and a zoxide that is not installed
 * mean the same thing here: no rows, no message, keep typing.
 */

/** Enough to type against; a directory with more entries than this is not browsed. */
const MAX_DIRS = 400

export function listDirectories(parent: string): string[] {
  try {
    const names: string[] = []
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      names.push(entry.name)
      if (names.length >= MAX_DIRS) break
    }
    return names.sort((a, b) => a.localeCompare(b))
  } catch {
    return [] // not there, or not ours to read
  }
}

export const homeDirectory = (): string => homedir()

/** How long zoxide gets to answer before it is treated as absent. */
const ZOXIDE_MS = 1500

/**
 * The directories zoxide would jump to for this word, best first.
 *
 * Opportunistic: it is asked only if it is on the PATH, and its database belongs to the
 * user's shell, not to us - nothing is ever written to it from here. A machine without
 * zoxide simply gets the plain directory listing, which is the whole feature anyway.
 */
export function queryZoxide(term: string): Promise<string[]> {
  const word = term.trim()
  if (word === '') return Promise.resolve([])

  return new Promise((resolve) => {
    execFile(
      'zoxide',
      ['query', '--list', word],
      { timeout: ZOXIDE_MS, windowsHide: true },
      (error, stdout) => {
        if (error) return resolve([])
        const lines = stdout
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line !== '')
        resolve(lines.slice(0, 8))
      }
    )
  })
}
