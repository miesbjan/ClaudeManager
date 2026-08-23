import { app } from 'electron'
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Lang } from '../shared/i18n'
import { clampSize, DEFAULT_SIZE, sanitiseFamily, type TerminalFont } from '../shared/font'
import { sanitiseSession } from '../shared/session'
import type { SessionTab, Theme } from '../shared/types'
import { note } from './log'

export type WindowBounds = { x?: number; y?: number; width: number; height: number }

export type AppState = {
  /** One entry per tab: the files it held, which was shown, and the layout. */
  tabs: SessionTab[]
  activeTab: number
  bounds?: WindowBounds
  maximized?: boolean
  theme: Theme
  lang: Lang
  /** Terminal font size. The family is a preference and lives in settings.json. */
  fontSize: number
}

const THEMES: Theme[] = ['system', 'light', 'dark']
const DEFAULT_STATE: AppState = {
  tabs: [],
  activeTab: 0,
  theme: 'system',
  lang: 'en',
  fontSize: DEFAULT_SIZE
}

function stateFile(): string {
  return join(app.getPath('userData'), 'state.json')
}

/**
 * The application changed its name, and with it the folder Electron hands out. This
 * reads the old one once, so a rename does not cost you the tabs you had open; the
 * next save writes to the new place and the old file is never looked at again.
 */
function legacyStateFile(): string {
  return join(app.getPath('appData'), 'md-viewer', 'state.json')
}

/** Whatever is in the file, which is not necessarily what this build writes. */
function readState(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

export function loadState(): AppState {
  try {
    let raw: Record<string, unknown>
    try {
      raw = readState(stateFile())
    } catch (error) {
      /*
       * Missing is the ordinary case - a first run, or a rename this reads across - and
       * says nothing. Anything else is a file that exists and could not be read, which
       * means the tabs that were in it are about to appear to have never existed; that is
       * worth a line, because from the outside it looks like the application forgot.
       */
      if ((error as { code?: string })?.code !== 'ENOENT') {
        note('the session file could not be read: ' + String(error))
      }
      raw = readState(legacyStateFile())
    }
    return {
      ...sanitiseSession(raw),
      bounds: raw.bounds as WindowBounds | undefined,
      maximized: raw.maximized === true,
      theme: THEMES.includes(raw.theme as Theme) ? (raw.theme as Theme) : 'system',
      lang: raw.lang === 'cs' ? 'cs' : 'en',
      fontSize: clampSize(raw.fontSize)
    }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

/** Said once per run: this is written every few hundred milliseconds. */
let saveComplained = false

/**
 * Write the session down, whole or not at all.
 *
 * Written beside the real file and moved into place, because the file is rewritten
 * constantly and a write interrupted halfway - the machine going down, the process
 * killed - used to leave broken JSON. What that costs is not one save: the next start
 * cannot read the file, falls back to nothing, and every tab that was open appears never
 * to have existed. A rename is the one operation that cannot be seen half-done.
 */
export function saveState(state: AppState): void {
  const path = stateFile()
  const temporary = path + '.writing'
  try {
    writeFileSync(temporary, JSON.stringify(state, null, 2), 'utf8')
    renameSync(temporary, path)
    saveComplained = false
  } catch (error) {
    /*
     * Persistence is a convenience and never breaks the application - but a session that
     * silently stops being saved is tabs, places and half-written prompts quietly not
     * coming back, blamed on a crash hours later. Once is enough to say so.
     */
    if (!saveComplained) {
      saveComplained = true
      note('the session could not be saved: ' + String(error))
    }
    try {
      unlinkSync(temporary)
    } catch {
      // It may not have been created at all; there is nothing to clean up then.
    }
  }
}

/**
 * Preferences the app reads and never writes, so a hand-edited file keeps whatever
 * shape its owner gave it. `state.json` next door is the opposite: written constantly
 * and not meant to be edited. The two are separate for exactly that reason.
 */
export function loadSettings(): { terminalFontFamily?: unknown } {
  try {
    return JSON.parse(readFileSync(join(app.getPath('userData'), 'settings.json'), 'utf8'))
  } catch {
    // Absent or unreadable is the normal case; the defaults stand.
    return {}
  }
}

/** The font the terminal starts with: size from the state, family from the settings. */
export function terminalFont(state: AppState): TerminalFont {
  return {
    family: sanitiseFamily(loadSettings().terminalFontFamily),
    size: clampSize(state.fontSize)
  }
}
