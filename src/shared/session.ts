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

/** Long enough for any prompt worth composing, short enough not to bloat the session. */
export const MAX_PROMPT = 8000

/**
 * How much of one unsaved edit is kept.
 *
 * Generous, because losing the end of an edit is barely better than losing it - but
 * bounded, because this file is rewritten every few hundred milliseconds and a session
 * that grew without limit would be a surprise nobody asked for. Anything longer is left
 * where it is: on screen, unsaved, and said so in the status bar.
 */
export const MAX_DRAFT = 200_000

function ratio(value: unknown): number {
  return typeof value === 'number' && value > 0 && value < 1 ? value : DEFAULT_RATIO
}

/**
 * Which of the two the right side was showing, out of whatever the file says.
 *
 * Three shapes have been written over time: a flag, then three arrangements including
 * both at once, now two. A file that says "both" was written when both could be on
 * screen, and what its owner was watching is the server if there was one and the
 * document otherwise - the other is a keystroke away either way.
 */
function rightModeOf(raw: unknown, hasWeb: boolean): 'doc' | 'web' {
  const said = (raw && typeof raw === 'object' ? raw : {}) as {
    rightMode?: unknown
    showWeb?: unknown
  }
  if (said.rightMode === 'web') return 'web'
  if (said.rightMode === 'both') return hasWeb ? 'web' : 'doc'
  if (said.rightMode === 'doc') return 'doc'
  return said.showWeb === true ? 'web' : 'doc'
}

/** A layout, with anything missing or nonsensical replaced by the default. */
export function sanitisePane(raw: unknown): PaneState {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<PaneState>
  return {
    terminal: value.terminal === true,
    ratio: ratio(value.ratio),
    run: typeof value.run === 'string' ? value.run : null,
    web: typeof value.web === 'string' ? value.web : null,
    rightMode: rightModeOf(raw, typeof value.web === 'string'),
    webManual: value.webManual === true,
    /*
     * A half-written prompt is work, so it outlives a restart the way a draft of a file
     * does. Capped, because this is a prompt and not a document, and a session file that
     * grew without limit would be a surprise nobody asked for.
     */
    prompt: typeof value.prompt === 'string' ? value.prompt.slice(0, MAX_PROMPT) : '',
    promptOpen: value.promptOpen === true,
    root: typeof value.root === 'string' && value.root !== '' ? value.root : null
  }
}

/** The unsaved edits worth keeping: text, for a file this tab actually holds. */
function drafts(raw: unknown, files: string[]): Record<string, string> {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const kept: Record<string, string> = {}
  for (const path of files) {
    const text = value[path]
    if (typeof text === 'string' && text !== '') kept[path] = text.slice(0, MAX_DRAFT)
  }
  return kept
}

function paths(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === 'string') : []
}

function readTabs(raw: unknown): SessionTab[] {
  if (!Array.isArray(raw)) return []
  const tabs: SessionTab[] = []
  const taken = new Set<string>()
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const files = paths((entry as { files?: unknown }).files)
    const pane = sanitisePane((entry as { pane?: unknown }).pane)
    /*
     * A tab is a place, and a place can be a directory with nothing open in it yet -
     * that is the whole point of opening a tab over a folder. A tab holding a shell is
     * worth keeping for the same reason, since whatever runs in it is the work. What is
     * worth nothing is a tab that is none of the three: an empty box.
     */
    if (files.length === 0 && pane.root === null && !pane.terminal) continue
    const active = (entry as { active?: unknown }).active
    const name = (entry as { name?: unknown }).name
    /*
     * A name kept from the file, and only if no earlier tab already has it: two tabs
     * answering to one name would both be handed the same shell.
     */
    const id = (entry as { id?: unknown }).id
    const kept = typeof id === 'string' && id !== '' && !taken.has(id) ? id : null
    if (kept !== null) taken.add(kept)
    tabs.push({
      id: kept,
      files,
      active: typeof active === 'string' && files.includes(active) ? active : (files[0] ?? null),
      drafts: drafts((entry as { drafts?: unknown }).drafts, files),
      pane,
      name: typeof name === 'string' && name.trim() !== '' ? name.trim() : null
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
    id: null,
    files: [file],
    active: file,
    pane: sanitisePane(panes[file]),
    name: null
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
