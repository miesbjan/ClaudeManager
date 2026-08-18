import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Theme } from '../shared/types'

export type WindowBounds = { x?: number; y?: number; width: number; height: number }

export type AppState = {
  files: string[]
  active: string | null
  bounds?: WindowBounds
  maximized?: boolean
  theme: Theme
}

const THEMES: Theme[] = ['system', 'light', 'dark']
const DEFAULT_STATE: AppState = { files: [], active: null, theme: 'system' }

function stateFile(): string {
  return join(app.getPath('userData'), 'state.json')
}

export function loadState(): AppState {
  try {
    const raw = JSON.parse(readFileSync(stateFile(), 'utf8')) as Partial<AppState>
    return {
      files: Array.isArray(raw.files) ? raw.files.filter((f) => typeof f === 'string') : [],
      active: typeof raw.active === 'string' ? raw.active : null,
      bounds: raw.bounds,
      maximized: raw.maximized === true,
      theme: THEMES.includes(raw.theme as Theme) ? (raw.theme as Theme) : 'system'
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
