import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PaneState, Theme } from '../shared/types'

export type WindowBounds = { x?: number; y?: number; width: number; height: number }

export type AppState = {
  files: string[]
  active: string | null
  bounds?: WindowBounds
  maximized?: boolean
  theme: Theme
  /** Pane layout per document path; processes are never restored, only geometry. */
  panes: Record<string, PaneState>
}

const THEMES: Theme[] = ['system', 'light', 'dark']
const DEFAULT_STATE: AppState = { files: [], active: null, theme: 'system', panes: {} }

/** State written by an older build has no pane section; missing entries default. */
function sanitisePanes(raw: unknown): Record<string, PaneState> {
  const out: Record<string, PaneState> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [path, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const { terminal, ratio } = value as Partial<PaneState>
    out[path] = {
      terminal: terminal === true,
      ratio: typeof ratio === 'number' && ratio > 0 && ratio < 1 ? ratio : 0.5
    }
  }
  return out
}

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
      theme: THEMES.includes(raw.theme as Theme) ? (raw.theme as Theme) : 'system',
      panes: sanitisePanes(raw.panes)
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
