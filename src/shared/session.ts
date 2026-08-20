/**
 * Reading the session back, from whatever shape it was written in.
 *
 * The file on disk outlives the code that wrote it, and a tab used to be a document:
 * one path, with its pane layout stored under that path. A tab is now a place holding
 * several files, so an older file is read as one tab per document - which is exactly
 * the arrangement it described.
 */
import type { PaneState, SessionTab } from './types'

export type Session = {
  tabs: SessionTab[]
  activeTab: number
}

const DEFAULT_RATIO = 0.5

function ratio(value: unknown): number {
  return typeof value === 'number' && value > 0 && value < 1 ? value : DEFAULT_RATIO
}

/** A layout, with anything missing or nonsensical replaced by the default. */
export function sanitisePane(raw: unknown): PaneState {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<PaneState>
  return {
    terminal: value.terminal === true,
    ratio: ratio(value.ratio),
    run: typeof value.run === 'string' ? value.run : null,
    web: typeof value.web === 'string' ? value.web : null,
    // State from before the right side knew anything but "the server is showing".
    rightMode:
      value.rightMode === 'web' || value.rightMode === 'both' || value.rightMode === 'doc'
        ? value.rightMode
        : value.showWeb === true
          ? 'web'
          : 'doc',
    rightRatio: ratio(value.rightRatio),
    webManual: value.webManual === true
  }
}

function paths(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === 'string') : []
}

function readTabs(raw: unknown): SessionTab[] {
  if (!Array.isArray(raw)) return []
  const tabs: SessionTab[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const files = paths((entry as { files?: unknown }).files)
    if (files.length === 0) continue
    const active = (entry as { active?: unknown }).active
    tabs.push({
      files,
      active: typeof active === 'string' && files.includes(active) ? active : files[0],
      pane: sanitisePane((entry as { pane?: unknown }).pane)
    })
  }
  return tabs
}

/** The older shape: a flat list of documents, each its own tab, layout keyed by path. */
function fromDocumentsPerTab(raw: Record<string, unknown>): SessionTab[] {
  const panes = (raw.panes && typeof raw.panes === 'object' ? raw.panes : {}) as Record<
    string,
    unknown
  >
  return paths(raw.files).map((file) => ({
    files: [file],
    active: file,
    pane: sanitisePane(panes[file])
  }))
}

export function sanitiseSession(raw: unknown): Session {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const tabs = 'tabs' in value ? readTabs(value.tabs) : fromDocumentsPerTab(value)

  // The remembered index has to point at a tab that exists, whatever the file said.
  const wanted =
    typeof value.activeTab === 'number'
      ? value.activeTab
      : tabs.findIndex((tab) => tab.files.includes(String(value.active)))
  const activeTab = wanted >= 0 && wanted < tabs.length ? Math.trunc(wanted) : 0

  return { tabs, activeTab }
}
