import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  forget,
  placeKey,
  remember,
  sanitiseHistory,
  trimPlaces,
  type RememberedFile
} from '../shared/history'
import { note } from './log'

/**
 * The files each place keeps, on disk beside the session.
 *
 * A file of its own, not part of `state.json`, because the two answer different
 * questions: the session is what is open now and is rewritten every time anything
 * moves, this is what has been open here and only grows. Losing one should never mean
 * losing the other.
 */
let places: Record<string, RememberedFile[]> | null = null

function file(): string {
  return join(app.getPath('userData'), 'places.json')
}

function load(): Record<string, RememberedFile[]> {
  if (places) return places
  try {
    places = sanitiseHistory(JSON.parse(readFileSync(file(), 'utf8')))
  } catch {
    places = {} // no file yet, or one nobody can read
  }
  return places
}

function save(): void {
  if (!places) return
  try {
    writeFileSync(file(), JSON.stringify(trimPlaces(places)))
  } catch (error) {
    /*
     * Not worth breaking anything over - but Ctrl+P offering nothing in a place you have
     * worked in for weeks is a puzzle, and this is the answer to it.
     */
    note('the files a place remembers could not be saved: ' + String(error))
  }
}

/**
 * A file this place should stop offering.
 *
 * Opening the wrong file is a slip, and until now the place remembered it for good: it
 * came back at the top of Ctrl+P every time, in a project it has nothing to do with.
 * Forgetting is only about the offer - the file itself is not touched.
 */
export function forgetOpened(root: string, path: string): void {
  if (root === '' || path === '') return
  const all = load()
  const key = placeKey(root)
  const list = all[key]
  if (!list) return
  all[key] = forget(list, [path])
  save()
  note('the place ' + root + ' will stop offering ' + path)
}

/** A file was opened in a place: it goes to the front of that place's list. */
export function noteOpened(root: string, path: string): void {
  if (root === '' || path === '') return
  const all = load()
  const key = placeKey(root)
  all[key] = remember(all[key] ?? [], path, Date.now())
  save()
}

/**
 * What this place holds, most recent first, minus whatever has since been deleted or
 * renamed - a list offering files that are not there is worse than a short list, and
 * checking is a handful of `stat` calls on a list of twenty.
 */
export function rememberedIn(root: string): RememberedFile[] {
  if (root === '') return []
  const all = load()
  const key = placeKey(root)
  const list = all[key] ?? []
  if (list.length === 0) return []

  const gone = list
    .filter((entry) => {
      try {
        return !statSync(entry.path).isFile()
      } catch {
        return true
      }
    })
    .map((entry) => entry.path)

  if (gone.length > 0) {
    all[key] = forget(list, gone)
    save()
  }
  return all[key]
}
