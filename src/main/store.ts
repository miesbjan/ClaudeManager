import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Lang } from '../shared/i18n'
import { clampSize, DEFAULT_SIZE, sanitiseFamily, type TerminalFont } from '../shared/font'
import { sanitiseSession } from '../shared/session'
import type { SessionTab, Theme } from '../shared/types'

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
    } catch {
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

export function saveState(state: AppState): void {
  try {
    writeFileSync(stateFile(), JSON.stringify(state, null, 2), 'utf8')
  } catch {
    // Persistence is a convenience; never break the app over it.
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
