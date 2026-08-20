import { statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

/**
 * Whether a path written somewhere in the output is a file that exists, and where.
 *
 * This is the filter that makes clickable paths bearable: what shape a path has can
 * only ever be a guess - `Node.js` looks exactly like `app.js` - so the disk gets the
 * last word, and nothing is offered as a link that cannot be opened.
 */
export function resolveFile(root: string, candidate: string): string | null {
  const cleaned = candidate.trim()
  if (cleaned === '' || root === '') return null

  const tries = isAbsolute(cleaned)
    ? [cleaned]
    : [resolve(root, cleaned)]

  /*
   * A leading slash is written by hand more often than it is meant: `/src/main.ts` in
   * a message about a project means the project's `src`, not the root of the drive.
   * Tried second, so a genuinely absolute path still wins.
   */
  const stripped = cleaned.replace(/^[\\/]+/, '')
  if (stripped !== cleaned && stripped !== '') tries.push(resolve(root, stripped))

  for (const path of tries) {
    try {
      if (statSync(path).isFile()) return path
    } catch {
      // Not there, or not ours to look at. Either way it is not a link.
    }
  }
  return null
}
