import { readdirSync, type Dirent } from 'node:fs'
import { join } from 'node:path'
import { MAX_LISTED_FILES, skipDirectory, skipFile } from '../shared/files'

export type FileListing = {
  /** Absolute paths, in whatever order the walk found them. */
  files: string[]
  /** The cap was reached, so this is not the whole project. */
  truncated: boolean
}

/**
 * Every file of a project worth opening, found by walking down from its root.
 *
 * Breadth first, so that hitting the cap leaves the files nearest the root rather than
 * whichever branch happened to be walked first - the shallow ones are the ones somebody
 * is looking for.
 */
export function listFiles(root: string): FileListing {
  const files: string[] = []
  const queue: string[] = [root]
  let truncated = false

  while (queue.length > 0 && !truncated) {
    const dir = queue.shift()!
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      // Unreadable directories are somebody else's problem; skip and carry on.
      continue
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!skipDirectory(entry.name)) queue.push(join(dir, entry.name))
        continue
      }
      if (!entry.isFile() || skipFile(entry.name)) continue
      files.push(join(dir, entry.name))
      if (files.length >= MAX_LISTED_FILES) {
        truncated = true
        break
      }
    }
  }

  return { files, truncated }
}
