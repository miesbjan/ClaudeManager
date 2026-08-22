/**
 * Which files you keep coming back to in a place.
 *
 * The palette used to answer "what is open in this tab", which is gone the moment the
 * tab is - so opening a project again meant finding the same three files again. A place
 * outlives a session, and so should its list.
 *
 * Nothing is starred by hand: what you open is what you open, and asking for a gesture
 * to mark a favourite is asking for the list to be wrong whenever the gesture is
 * forgotten. Order is recency, with the count kept because a file opened forty times is
 * not the same as one opened once even if the once was later.
 */

export type RememberedFile = {
  /** Absolute path, as the app opens it. */
  path: string
  /** How many times it has been opened in this place. */
  count: number
  /** When it was last opened, in milliseconds. */
  at: number
}

/** Enough to hold the files of a project worth returning to, not its whole tree. */
export const MAX_REMEMBERED = 20

/** Places worth remembering at all. Past this the oldest place is forgotten. */
export const MAX_PLACES = 100

const samePath = (a: string, b: string): boolean =>
  a.toLowerCase().split('\\').join('/') === b.toLowerCase().split('\\').join('/')

/**
 * The list after a file was opened: most recent first, its count raised. Capped, so a
 * place that has seen a thousand files still answers with the ones that matter.
 */
export function remember(
  list: readonly RememberedFile[],
  path: string,
  at: number
): RememberedFile[] {
  const seen = list.find((entry) => samePath(entry.path, path))
  const rest = list.filter((entry) => !samePath(entry.path, path))
  const next: RememberedFile = {
    // The path as it was opened this time: casing on Windows is whatever was typed.
    path,
    count: (seen?.count ?? 0) + 1,
    at
  }
  return [next, ...rest].slice(0, MAX_REMEMBERED)
}

/** Drop what is no longer there, keeping the order. */
export function forget(
  list: readonly RememberedFile[],
  gone: readonly string[]
): RememberedFile[] {
  return list.filter((entry) => !gone.some((path) => samePath(entry.path, path)))
}

/**
 * A file read back from disk, or null if it is not one. Everything is checked, because
 * this file is written by an older version of the app as often as by this one.
 */
export function asRemembered(raw: unknown): RememberedFile | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<RememberedFile>
  if (typeof value.path !== 'string' || value.path === '') return null
  const count = typeof value.count === 'number' && value.count > 0 ? Math.trunc(value.count) : 1
  const at = typeof value.at === 'number' && value.at > 0 ? value.at : 0
  return { path: value.path, count, at }
}

/** Every remembered place, read back from whatever the file holds. */
export function sanitiseHistory(raw: unknown): Record<string, RememberedFile[]> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, RememberedFile[]> = {}
  for (const [place, files] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(files)) continue
    const list = files
      .map(asRemembered)
      .filter((entry): entry is RememberedFile => entry !== null)
      .slice(0, MAX_REMEMBERED)
    if (list.length > 0) out[place] = list
  }
  return out
}

/** How a place is keyed: one shape of path, one case, so a place is itself. */
export function placeKey(root: string): string {
  return root.toLowerCase().split('\\').join('/').replace(/\/+$/, '')
}

/**
 * The places to keep when there are too many: the ones visited most recently, judged by
 * the newest file in each. A place nobody has opened for months is not worth a line.
 */
export function trimPlaces(
  places: Record<string, RememberedFile[]>,
  limit = MAX_PLACES
): Record<string, RememberedFile[]> {
  const keys = Object.keys(places)
  if (keys.length <= limit) return places
  const newest = (key: string): number => Math.max(0, ...places[key].map((entry) => entry.at))
  const kept = keys.sort((a, b) => newest(b) - newest(a)).slice(0, limit)
  return Object.fromEntries(kept.map((key) => [key, places[key]]))
}
