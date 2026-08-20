import 'highlight.js/styles/github.css'
import './styles.css'
import { changedLines } from './diff'
import { renderMarkdown } from './markdownRenderer'
import {
  createSignalReader,
  nextActivity,
  SILENCE_MS,
  type ActivityEvent,
  type OutputSignals
} from './activity'
import { aggregateActivity, justFinished } from './taskbar'
import { DEFAULT_FAMILY, DEFAULT_SIZE, stepSize, type TerminalFont } from '../../shared/font'
import {
  clearMatches,
  findInElement,
  paintMatches,
  scrollToMatch,
  stepIndex
} from './find'
import { createDoc, indexAfterClose, isDirty, nextDocIndex, type Doc } from './docs'
import { renderShortcuts } from './help'
import { stepSelection, visibleEntries, type PaletteEntry } from './palette'
import { detectEol, isMarkdown, toEditorText, toFileText } from './plaintext'
import { createUrlReader, nextRightMode, normalizeUrl } from './web'
import { clampRatio, DEFAULT_RATIO, makeSplitter } from './split'
import { paneCommand, type PaneCommand } from '../../shared/shortcuts'
import { TerminalPane } from './terminal'
import { renderTabBar, type Tab, type TabHandlers } from './tabs'
import type { TaskbarState, Theme } from '../../shared/types'

const THEMES: Theme[] = ['system', 'light', 'dark']
const THEME_LABELS: Record<Theme, string> = {
  system: 'Theme: Auto',
  light: 'Theme: Light',
  dark: 'Theme: Dark'
}

const openButton = document.getElementById('open-btn') as HTMLButtonElement
const shellButton = document.getElementById('shell-btn') as HTMLButtonElement
const themeButton = document.getElementById('theme-btn') as HTMLButtonElement
const panes = document.getElementById('panes') as HTMLElement
const terminalPane = document.getElementById('terminal-pane') as HTMLElement
const termHosts = document.getElementById('term-hosts') as HTMLElement
const runButton = document.getElementById('run-btn') as HTMLButtonElement
const shellProject = document.getElementById('shell-project') as HTMLElement
const webButton = document.getElementById('web-btn') as HTMLButtonElement
const webPane = document.getElementById('web-pane') as HTMLElement
const rightArea = document.getElementById('right-area') as HTMLElement
const rightSplitter = document.getElementById('right-splitter') as HTMLElement
const webFrame = document.getElementById('web-frame') as HTMLIFrameElement
const webUrlInput = document.getElementById('web-url') as HTMLInputElement
const splitter = document.getElementById('splitter') as HTMLElement
const tabbar = document.getElementById('tabbar') as HTMLElement
const viewer = document.getElementById('viewer') as HTMLElement
const content = document.getElementById('content') as HTMLElement
const raw = document.getElementById('raw') as HTMLTextAreaElement
const empty = document.getElementById('empty') as HTMLElement
const status = document.getElementById('statusbar') as HTMLElement
const ctxmenu = document.getElementById('ctxmenu') as HTMLElement
const findBar = document.getElementById('find') as HTMLElement
const findInput = document.getElementById('find-input') as HTMLInputElement
const findCount = document.getElementById('find-count') as HTMLElement
const helpButton = document.getElementById('help-btn') as HTMLButtonElement
const help = document.getElementById('help') as HTMLElement
const palette = document.getElementById('palette') as HTMLElement
const paletteInput = document.getElementById('palette-input') as HTMLInputElement
const paletteList = document.getElementById('palette-list') as HTMLUListElement
const paletteNote = document.getElementById('palette-note') as HTMLElement

const tabs: Tab[] = []
let activeIndex = -1
let theme: Theme = 'system'
const reloadTimers = new Map<string, number>()
let reportedTaskbar: TaskbarState = 'none'
let terminalFont: TerminalFont = { family: DEFAULT_FAMILY, size: DEFAULT_SIZE }
/** One shell per tab, alive while the tab is - keyed by tab id, not by document. */
const shells = new Map<string, TerminalPane>()
/** Per tab: the escape-sequence reader and the timer that notices silence. */
const signalReaders = new Map<string, (chunk: string) => OutputSignals>()
const urlReaders = new Map<string, (chunk: string) => string | null>()
const silenceTimers = new Map<string, number>()
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

/*
 * The same file arrives written in different ways: the dialog and a dropped file give
 * Windows separators, a link inside a document gives forward ones, and the command line
 * gives whatever was typed. Comparing them as they come opens a second copy of a file
 * that is already open, and then there are two drafts of it.
 */
const samePath = (a: string, b: string): boolean =>
  a.toLowerCase().split('/').join('\\') === b.toLowerCase().split('/').join('\\')

/** The file on screen in a tab, or undefined for a tab with nothing open. */
const shownDoc = (tab: Tab | undefined): Doc | undefined => tab?.docs[tab.docIndex]

/**
 * Where a file is open, if it is. The watcher speaks in paths and a path is open in at
 * most one place, because opening one already open brings you to it instead.
 */
function findDoc(path: string): { tab: Tab; tabIndex: number; doc: Doc; docIndex: number } | null {
  for (const [tabIndex, tab] of tabs.entries()) {
    const docIndex = tab.docs.findIndex((doc) => samePath(doc.path, path))
    if (docIndex >= 0) return { tab, tabIndex, doc: tab.docs[docIndex], docIndex }
  }
  return null
}

/** By tab: for anything belonging to the tab as a place, above all its shell. */
const indexOfId = (id: string): number => tabs.findIndex((t) => t.id === id)

/**
 * Unique for as long as the window lives, which is as long as any shell does. A
 * counter is enough and stays readable in a log; nothing outside this session ever
 * sees it, so it is deliberately not derived from the document.
 */
let nextTabId = 1
const baseName = (path: string): string => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? path

/** The tab being named by hand, and what has been typed into it so far. */
let renaming: { id: string; value: string } | null = null

const tabHandlers: TabHandlers = {
  onSelect: selectTab,
  onClose: closeTab,
  onContextMenu: showContextMenu,
  onRenameStart: startRename,
  onRenameEdit: (value) => {
    if (renaming) renaming.value = value
  },
  onRename: finishRename,
  onRenameCancel: () => {
    renaming = null
    paintTabs()
  }
}

/**
 * The bar repaints on every chunk of shell output, which would take a half-typed name
 * with it. While a field is up it is left alone; the dots catch up when it is gone.
 */
function paintTabs(): void {
  if (renaming && tabbar.querySelector('.tab-rename')) return
  renderTabBar(tabbar, tabs, activeIndex, tabHandlers, renaming)
}

function startRename(index: number): void {
  const tab = tabs[index]
  if (!tab) return
  renaming = { id: tab.id, value: tab.name ?? '' }
  renderTabBar(tabbar, tabs, activeIndex, tabHandlers, renaming)
}

/** An empty name is how you go back to being named after the file on screen. */
function finishRename(index: number, name: string): void {
  const tab = tabs[index]
  renaming = null
  if (tab) tab.name = name.trim() === '' ? null : name.trim()
  paintTabs()
  persistSession()
}

/** A fresh place, with nothing open in it yet. */
function createTab(): Tab {
  const tab: Tab = {
    id: 'tab-' + nextTabId++,
    docs: [],
    docIndex: -1,
    name: null,
    terminalOpen: false,
    ratio: DEFAULT_RATIO,
    zoom: null,
    activity: 'idle',
    finished: false,
    project: null,
    runCommand: null,
    webUrl: null,
    rightMode: 'doc',
    rightRatio: DEFAULT_RATIO,
    webManual: false,
    awaitingServer: false
  }
  tabs.push(tab)
  return tab
}

/**
 * Files land in the tab you are in: a tab is a place, and everything you open while
 * working there belongs to it. A new place is something you ask for.
 *
 * A file already open anywhere brings you to it rather than opening a second copy -
 * two views of one file would mean two drafts of it, and one of them losing.
 */
async function openFiles(paths: string[], activate = true, into?: Tab): Promise<void> {
  let tab = into ?? tabs[activeIndex]
  for (const path of paths) {
    const found = findDoc(path)
    if (found) {
      if (activate) {
        activeIndex = found.tabIndex
        found.tab.docIndex = found.docIndex
      }
      tab = found.tab
      continue
    }
    if (!tab) tab = createTab()
    const doc = createDoc(path, !isMarkdown(path))
    tab.docs.push(doc)
    tab.docIndex = tab.docs.length - 1
    if (activate) activeIndex = tabs.indexOf(tab)
    await loadDoc(tab, doc)
    void window.api.watch(doc.path)
  }
  if (activeIndex < 0 && tabs.length > 0) activeIndex = 0
  render()
  persistSession()
}

/**
 * `diff` is off for the first load of a file - every block would count as changed.
 * On a reload it is on, so the blocks the other writer touched can be flashed.
 * `doc.source` survives an unavailable file on purpose: when it reappears, the
 * diff is against what the user last saw, not against nothing.
 */
async function loadDoc(tab: Tab, doc: Doc, diff = false): Promise<void> {
  const result = await window.api.readFile(doc.path)
  doc.path = result.path
  doc.dir = result.dir
  if (result.ok) {
    const changed =
      diff && doc.source !== null && doc.source !== result.content
        ? changedLines(doc.source, result.content)
        : null
    doc.source = result.content
    doc.mtimeMs = result.mtimeMs
    doc.truncated = result.truncated
    doc.html = isMarkdown(doc.path) ? renderMarkdown(result.content, result.dir, changed) : ''
    doc.error = null
    doc.updatedAt = Date.now()
    // The project belongs to the place, so the first file to name one settles it.
    if (!tab.project) tab.project = await window.api.detectProject(result.dir)
    if (changed && changed.size > 0) doc.pendingFlash = true
  } else {
    doc.html = ''
    doc.error = result.error
  }
}

/**
 * Anything unsaved has to be asked about before it is thrown away. There is no visible
 * list of what a tab holds, so closing one blind could take several files with it.
 */
function confirmDiscard(docs: Doc[]): boolean {
  const dirty = docs.filter(isDirty)
  if (dirty.length === 0) return true
  const names = dirty.map((doc) => baseName(doc.path)).join(', ')
  return window.confirm(`Unsaved changes in ${names}. Close and lose them?`)
}

function closeTab(index: number): void {
  const tab = tabs[index]
  if (!tab) return
  if (!confirmDiscard(tab.docs)) return
  for (const doc of tab.docs) void window.api.unwatch(doc.path)
  shells.get(tab.id)?.dispose()
  shells.delete(tab.id)
  signalReaders.delete(tab.id)
  urlReaders.delete(tab.id)
  const silence = silenceTimers.get(tab.id)
  if (silence) window.clearTimeout(silence)
  silenceTimers.delete(tab.id)
  tabs.splice(index, 1)
  if (tabs.length === 0) activeIndex = -1
  else if (index < activeIndex) activeIndex--
  else if (index === activeIndex) activeIndex = Math.min(index, tabs.length - 1)
  render()
  persistSession()
}

/**
 * Closes the file on screen. The tab itself goes only when its last file does, which is
 * what makes Ctrl+W safe to press without checking what else the place holds.
 */
function closeDoc(): void {
  const tab = tabs[activeIndex]
  const doc = shownDoc(tab)
  if (!tab || !doc) return
  if (tab.docs.length === 1) {
    closeTab(activeIndex)
    return
  }
  if (!confirmDiscard([doc])) return
  void window.api.unwatch(doc.path)
  const next = indexAfterClose(tab.docs.length, tab.docIndex, tab.docIndex)
  tab.docs.splice(tab.docIndex, 1)
  tab.docIndex = next
  render()
  persistSession()
}

/** The next file in this place, wrapping round. */
function cycleDoc(step: number): void {
  const tab = tabs[activeIndex]
  if (!tab || tab.docs.length < 2) return
  tab.docIndex = nextDocIndex(tab.docs.length, tab.docIndex, step)
  render()
  persistSession()
}

function selectTab(index: number): void {
  if (index < 0 || index >= tabs.length || index === activeIndex) return
  activeIndex = index
  render()
  persistSession()
  // Opening a tab marked unavailable is as good a moment as any to look again.
  const doc = shownDoc(tabs[index])
  if (doc?.error) void reloadPath(doc.path)
}

function cycleTab(step: number): void {
  if (tabs.length < 2) return
  selectTab((activeIndex + step + tabs.length) % tabs.length)
}

function render(): void {
  const current = tabs[activeIndex]
  if (current && isSeen(current)) applyActivity(current, { type: 'seen' })

  paintTabs()

  const tab = tabs[activeIndex]
  const doc = shownDoc(tab)
  if (!tab || !doc) {
    content.hidden = true
    content.textContent = ''
    raw.hidden = true
    raw.value = ''
    viewer.classList.remove('showing-raw')
    empty.hidden = false
    status.textContent = 'No file open'
    document.title = 'Project Console'
    applyLayout()
    return
  }

  empty.hidden = true
  const showRaw = doc.raw && !doc.error
  raw.hidden = !showRaw
  content.hidden = showRaw
  viewer.classList.toggle('showing-raw', showRaw)

  if (doc.error) {
    renderError(doc)
  } else if (showRaw) {
    // Nothing rendered is left behind: hidden or not, a stale document is still there
    // to be found by Ctrl+F.
    content.textContent = ''
    // The draft wins over the file: the point is that a reload cannot take it away.
    const text = doc.draft ?? toEditorText(doc.source ?? '')
    if (raw.value !== text) raw.value = text
    raw.readOnly = doc.truncated
  } else {
    // The class has to be in place before the markup is inserted, otherwise the
    // fade animation does not start. Clearing it when nothing is pending is what
    // keeps a plain tab switch from replaying an old flash.
    content.classList.toggle('flash-changes', doc.pendingFlash)
    doc.pendingFlash = false
    content.innerHTML = doc.html
  }

  viewer.scrollTop = doc.scrollTop
  if (!findBar.hidden) refreshFind(false)
  document.title = baseName(doc.path) + ' - Project Console'
  renderStatus(tab, doc)
  applyLayout()
  ensureShell()
}

function renderError(doc: Doc): void {
  content.textContent = ''
  const box = document.createElement('div')
  box.className = 'file-error'

  const title = document.createElement('strong')
  title.textContent = 'File unavailable'
  const path = document.createElement('code')
  path.textContent = doc.path
  const message = document.createElement('p')
  message.textContent = doc.error ?? ''
  const hint = document.createElement('p')
  hint.className = 'muted'
  hint.textContent = 'Still watching - the document loads automatically if the file reappears.'

  box.append(title, path, message, hint)
  content.append(box)
}

/**
 * The status bar carries the state of the buffer, which is why the raw view needs no
 * bar of its own: unsaved work, a file that moved underneath it, and a truncated read
 * are all things you must be able to see without a new row of chrome.
 */
function renderStatus(tab: Tab, doc: Doc): void {
  if (doc.error) {
    status.textContent = doc.path + '  ·  unavailable'
    return
  }
  const parts = [doc.path]
  /*
   * With no strip of open files anywhere, this is the only place that says how many a
   * tab holds and which one you are on. Shown from two upwards; with one there is
   * nothing to count.
   */
  if (tab.docs.length > 1) {
    parts.push(`${tab.docIndex + 1}/${tab.docs.length} open here - Ctrl+PageUp/PageDown`)
  }
  if (doc.raw) parts.push(doc.truncated ? 'first 2 MB only, read-only' : 'raw')
  if (doc.draft !== null) parts.push('unsaved - Ctrl+S')
  if (doc.staleOnDisk) parts.push('changed on disk while you were editing')
  if (doc.draft === null && !doc.staleOnDisk) {
    parts.push('updated ' + (doc.updatedAt ? new Date(doc.updatedAt).toLocaleTimeString() : '-'))
    parts.push('watching')
  }
  status.textContent = parts.join('  ·  ')
}

function persistSession(): void {
  window.api.saveSession({
    tabs: tabs
      .filter((tab) => tab.docs.length > 0)
      .map((tab) => ({
        files: tab.docs.map((doc) => doc.path),
        active: shownDoc(tab)?.path ?? null,
        name: tab.name,
        pane: {
          terminal: tab.terminalOpen,
          ratio: tab.ratio,
          run: tab.runCommand,
          web: tab.webUrl,
          rightMode: tab.rightMode,
          rightRatio: tab.rightRatio,
          webManual: tab.webManual
        }
      })),
    activeTab: Math.max(activeIndex, 0)
  })
}

/* ---------- live reload ---------- */

function scheduleReload(path: string): void {
  const pending = reloadTimers.get(path)
  if (pending) window.clearTimeout(pending)
  reloadTimers.set(
    path,
    window.setTimeout(() => {
      reloadTimers.delete(path)
      void reloadPath(path)
    }, 60)
  )
}

/** Whether this file is the one on screen, and so whether repainting is needed. */
function isShowing(found: { tabIndex: number; docIndex: number }): boolean {
  return found.tabIndex === activeIndex && found.docIndex === tabs[activeIndex]?.docIndex
}

async function reloadPath(path: string): Promise<void> {
  const found = findDoc(path)
  if (!found) return
  const { tab, doc } = found
  /*
   * The one rule this pane lives or dies by. Somebody else wrote the file while there
   * are unsaved edits here, so nothing is reloaded and nothing is thrown away; the
   * status bar says so and the choice is the user's. Saving now is refused once, which
   * is what makes overwriting a deliberate act rather than an accident.
   */
  if (doc.draft !== null) {
    doc.staleOnDisk = true
    if (isShowing(found)) renderStatus(tab, doc)
    paintTabs()
    return
  }
  await loadDoc(tab, doc, true)
  // Only the visible document needs repainting; the rest refresh on switch.
  if (isShowing(found)) render()
  else paintTabs()
}

window.api.onFileEvent(({ path, type }) => {
  const found = findDoc(path)
  if (!found) return
  if (type !== 'unlink') {
    scheduleReload(path)
    return
  }
  found.doc.error = 'The file no longer exists on disk.'
  found.doc.html = ''
  if (isShowing(found)) render()
  else paintTabs()
})

window.api.onOpenFiles((paths) => void openFiles(paths))

// Claimed in the main process, so they arrive even from inside the web pane.
window.api.onPaneCommand((command) => runPaneCommand(command))

/* ---------- tab context menu ---------- */

function showContextMenu(index: number, x: number, y: number): void {
  const tab = tabs[index]
  if (!tab) return
  ctxmenu.textContent = ''

  const doc = shownDoc(tab)
  const items: Array<[string, () => void]> = [
    ['Rename tab', () => startRename(index)],
    ['Reload', () => void (doc && reloadPath(doc.path))],
    ['Close file', closeDoc],
    ['Close tab', () => closeTab(index)],
    ['Close other tabs', () => closeOthers(index)],
    [
      'Copy path',
      () => void (doc && navigator.clipboard.writeText(doc.path).catch(() => undefined))
    ],
    ['Reveal in Explorer', () => void (doc && window.api.reveal(doc.path))]
  ]

  for (const [label, action] of items) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.addEventListener('click', () => {
      hideContextMenu()
      action()
    })
    ctxmenu.append(button)
  }

  ctxmenu.hidden = false
  const rect = ctxmenu.getBoundingClientRect()
  ctxmenu.style.left = Math.min(x, window.innerWidth - rect.width - 4) + 'px'
  ctxmenu.style.top = Math.min(y, window.innerHeight - rect.height - 4) + 'px'
}

function hideContextMenu(): void {
  ctxmenu.hidden = true
}

function closeOthers(keep: number): void {
  const kept = tabs[keep]
  if (!kept) return
  const others = tabs.filter((tab) => tab !== kept)
  if (!confirmDiscard(others.flatMap((tab) => tab.docs))) return
  for (const tab of others) {
    for (const doc of tab.docs) void window.api.unwatch(doc.path)
    shells.get(tab.id)?.dispose()
    shells.delete(tab.id)
  }
  tabs.splice(0, tabs.length, kept)
  activeIndex = 0
  render()
  persistSession()
}

window.addEventListener('mousedown', (event) => {
  if (!ctxmenu.hidden && !ctxmenu.contains(event.target as Node)) hideContextMenu()
})
window.addEventListener('blur', hideContextMenu)

/* ---------- links and scrolling ---------- */

content.addEventListener('click', (event) => {
  const anchor = (event.target as HTMLElement).closest('a')
  if (!anchor) return
  event.preventDefault()

  const external = anchor.getAttribute('data-external')
  if (external) {
    void window.api.openExternal(external)
    return
  }

  const local = anchor.getAttribute('data-local')
  if (local) {
    if (isMarkdown(local)) void openFiles([local])
    return
  }

  const href = anchor.getAttribute('href') ?? ''
  if (href.startsWith('#')) {
    const target = document.getElementById(decodeURIComponent(href.slice(1)))
    target?.scrollIntoView({ block: 'start' })
  }
})

viewer.addEventListener('scroll', () => {
  const doc = shownDoc(tabs[activeIndex])
  if (doc) doc.scrollTop = viewer.scrollTop
})

/* ---------- find in document ---------- */

let matches: Range[] = []
let matchIndex = -1

function showMatch(): void {
  paintMatches(matches, matchIndex)
  findCount.textContent = matches.length === 0 ? '0/0' : matchIndex + 1 + '/' + matches.length
  const current = matches[matchIndex]
  if (current) scrollToMatch(viewer, current)
}

/**
 * Recomputes the matches. Ranges point into the rendered document, so a live
 * reload invalidates them - hence this also runs after every render while the bar
 * is open, keeping the position rather than jumping back to the first hit.
 */
function refreshFind(fromStart: boolean): void {
  const query = findInput.value
  matches = query ? findInElement(content, query) : []
  if (matches.length === 0) matchIndex = -1
  else if (fromStart || matchIndex < 0) matchIndex = 0
  else matchIndex = Math.min(matchIndex, matches.length - 1)
  showMatch()
}

function stepFind(delta: number): void {
  if (matches.length === 0) return
  matchIndex = stepIndex(matchIndex, matches.length, delta)
  showMatch()
}

function openFind(): void {
  findBar.hidden = false
  findInput.focus()
  findInput.select()
  refreshFind(true)
}

function closeFind(): void {
  findBar.hidden = true
  clearMatches()
  matches = []
  matchIndex = -1
  viewer.focus()
}

findInput.addEventListener('input', () => refreshFind(true))
findInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return
  event.preventDefault()
  stepFind(event.shiftKey ? -1 : 1)
})
document.getElementById('find-next')?.addEventListener('click', () => stepFind(1))
document.getElementById('find-prev')?.addEventListener('click', () => stepFind(-1))
document.getElementById('find-close')?.addEventListener('click', closeFind)

/* ---------- tab activity ---------- */

/**
 * A tab counts as seen only when its output is actually on screen: the active tab
 * with a hidden - but still running - shell keeps collecting, because nothing that
 * happened in it was visible.
 */
function isSeen(tab: Tab): boolean {
  if (tab !== tabs[activeIndex]) return false
  if (!tab.terminalOpen) return !shells.has(tab.id)
  return tab.zoom !== 'document'
}

/**
 * The dot is a status light, so every event counts, including on the tab you are
 * looking at. Being seen only settles an alert - see `nextActivity`.
 */
function applyActivity(tab: Tab, event: ActivityEvent): void {
  const next = nextActivity(tab.activity, event)
  if (next === tab.activity) return
  if (justFinished(tab.activity, next)) tab.finished = true
  if (next === 'working' || next === 'busy') tab.finished = false
  tab.activity = next
  paintTabs()
  reportTaskbar()
}

/**
 * The window's own signal, for when it is behind something. Nothing is reported while
 * the window has focus: whatever the tabs are saying is already on screen.
 */
function reportTaskbar(): void {
  const next = document.hasFocus()
    ? 'none'
    : aggregateActivity(tabs.map((tab) => ({ state: tab.activity, finished: tab.finished })))
  if (next === reportedTaskbar) return
  reportedTaskbar = next
  window.api.setTaskbarState(next)
}

window.addEventListener('focus', () => {
  // Coming back is the acknowledgement; what finished while you were away is old news.
  for (const tab of tabs) tab.finished = false
  reportTaskbar()
})
window.addEventListener('blur', reportTaskbar)

function scheduleSilence(tab: Tab): void {
  const pending = silenceTimers.get(tab.id)
  if (pending) window.clearTimeout(pending)
  silenceTimers.set(
    tab.id,
    window.setTimeout(() => {
      silenceTimers.delete(tab.id)
      applyActivity(tab, { type: 'silence' })
    }, SILENCE_MS)
  )
}

window.api.terminal.onData(({ id, data }) => {
  const index = indexOfId(id)
  if (index < 0) return
  let read = signalReaders.get(id)
  if (!read) {
    read = createSignalReader()
    signalReaders.set(id, read)
  }
  // Always read, even for a tab in view: the reader carries split sequences.
  const signals = read(data)

  let readUrl = urlReaders.get(id)
  if (!readUrl) {
    readUrl = createUrlReader()
    urlReaders.set(id, readUrl)
  }
  setWebUrl(tabs[index], readUrl(data))
  applyActivity(tabs[index], { type: 'output', signals })
  scheduleSilence(tabs[index])
})

window.api.terminal.onExit(({ id, exitCode }) => {
  const index = indexOfId(id)
  if (index >= 0) applyActivity(tabs[index], { type: 'exit', code: exitCode })
})

/* ---------- shortcut help ---------- */

/**
 * Focus moves into the panel while it is open, so Esc closes it instead of being
 * swallowed by whatever runs in the shell.
 */
function toggleHelp(): void {
  if (help.hidden) {
    if (!help.firstChild) renderShortcuts(help)
    help.hidden = false
    help.focus()
  } else {
    help.hidden = true
  }
  helpButton.classList.toggle('active', !help.hidden)
}

helpButton.addEventListener('click', toggleHelp)

window.addEventListener('mousedown', (event) => {
  const target = event.target as Node
  if (!help.hidden && !help.contains(target) && target !== helpButton) toggleHelp()
  if (!palette.hidden && !palette.contains(target)) closePalette()
})

/* ---------- shell pane ---------- */

/**
 * The shell pane belongs to the active tab. Every terminal keeps its own host
 * element alive and merely hidden, so switching tabs - or closing the pane - never
 * disturbs a process running inside it. Only closing the tab kills the shell.
 */
function applyLayout(): void {
  const tab = tabs[activeIndex]
  const shellOpen = tab?.terminalOpen === true
  const zoom = tab?.zoom ?? null
  const mode = tab?.webUrl ? tab.rightMode : 'doc'

  const showShell = shellOpen && (zoom === null || zoom === 'terminal')
  const showDoc = zoom === null ? mode !== 'web' : zoom === 'document'
  const showWeb = zoom === null ? mode !== 'doc' : zoom === 'web'

  terminalPane.hidden = !showShell
  viewer.hidden = !showDoc
  webPane.hidden = !showWeb
  rightArea.hidden = !showDoc && !showWeb
  // A divider only earns its place between two panes that are both on screen.
  splitter.hidden = !showShell || rightArea.hidden
  rightSplitter.hidden = !showDoc || !showWeb

  shellButton.classList.toggle('active', shellOpen)
  webButton.hidden = !tab || tab.webUrl === null
  webButton.classList.toggle('active', showWeb)

  if (tab && showShell) {
    terminalPane.style.flexBasis = rightArea.hidden
      ? '100%'
      : String(clampRatio(tab.ratio) * 100) + '%'
  }
  if (tab && showDoc) {
    viewer.style.flexBasis = showWeb ? String(clampRatio(tab.rightRatio) * 100) + '%' : '100%'
  }

  for (const [id, pane] of shells) {
    pane.setVisible(showShell && tab !== undefined && id === tab.id)
  }

  renderShellBar()
  renderWebFrame()
}

/**
 * The right slot holds one of two things. The address is sniffed from what the dev
 * server printed when it started, so there is nothing to configure - and it can be
 * typed by hand for a server that was started elsewhere.
 */
function renderWebFrame(): void {
  const tab = tabs[activeIndex]
  if (!tab) return
  if (document.activeElement !== webUrlInput) webUrlInput.value = tab.webUrl ?? ''
  // Only assign src when it really changes; otherwise every render reloads the page.
  if (!webPane.hidden && tab.webUrl && webFrame.getAttribute('src') !== tab.webUrl) {
    webFrame.setAttribute('src', tab.webUrl)
  }
}

function setWebUrl(tab: Tab, url: string | null, manual = false): void {
  if (url === null) return
  /*
   * An address typed by hand is a correction, so later output must not undo it -
   * a dev server keeps printing, and one stray address would take the pane away
   * again. Pressing Run hands control back, since a new run announces itself.
   */
  if (!manual && tab.webManual) return
  if (manual) tab.webManual = true
  const isNew = tab.webUrl !== url
  tab.webUrl = url

  /*
   * Clicking Run means "start it and let me look at it", so the address a deliberate
   * run announces opens the pane by itself. This has to happen even when the address
   * is the one from last time - which is the usual case - so the check cannot sit
   * behind "did the address change". An address printed by anything else only lights
   * the button.
   */
  if (tab.awaitingServer) {
    tab.awaitingServer = false
    if (tab.rightMode === 'doc') tab.rightMode = 'web'
    tab.zoom = null
    // A fresh run means a fresh server; do not leave the previous page in the frame.
    webFrame.removeAttribute('src')
  } else if (!isNew) {
    return
  }

  persistSession()
  if (tab === tabs[activeIndex]) applyLayout()
}

/** Document, dev server, both - one key, in that order. */
function cycleRight(): void {
  const tab = tabs[activeIndex]
  if (!tab?.webUrl) return
  tab.rightMode = nextRightMode(tab.rightMode, true)
  tab.zoom = null
  applyLayout()
  persistSession()
}

webButton.addEventListener('click', cycleRight)

document.getElementById('web-reload')?.addEventListener('click', () => {
  const url = tabs[activeIndex]?.webUrl
  if (url) webFrame.setAttribute('src', url + (url.includes('?') ? '&' : '?') + 'reload=' + Date.now())
})

webUrlInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return
  const tab = tabs[activeIndex]
  if (!tab) return
  const url = normalizeUrl(webUrlInput.value)
  if (!url) {
    webUrlInput.value = tab.webUrl ?? ''
    status.textContent = 'Only addresses on this machine can be shown here.'
    return
  }
  setWebUrl(tab, url, true)
  if (tab.rightMode === 'doc') tab.rightMode = 'web'
  applyLayout()
  persistSession()
})

/** Start the shell of the active tab if it is meant to be open but has none yet. */
function ensureShell(): void {
  const tab = tabs[activeIndex]
  if (tab && tab.terminalOpen && !shells.has(tab.id)) void openShell(tab)
}

async function openShell(tab: Tab): Promise<void> {
  let pane = shells.get(tab.id)
  if (!pane) {
    const cwd = tab.project?.root ?? shownDoc(tab)?.dir ?? tab.docs[0]?.dir ?? ''
    pane = new TerminalPane(tab.id, cwd, darkQuery.matches, terminalFont, (path, line) =>
      void openFromTerminal(path, line)
    )
    // Registered before the await so a second call cannot spawn a second shell.
    shells.set(tab.id, pane)
    applyLayout()
    const error = await pane.start(termHosts)
    if (error) status.textContent = 'Shell: ' + error
  }
  pane.setVisible(true)
  pane.focus()
}

function toggleShell(): void {
  const tab = tabs[activeIndex]
  if (!tab) return
  tab.terminalOpen = !tab.terminalOpen
  // A hidden pane cannot stay zoomed; the next opening starts from the split again.
  tab.zoom = null
  applyLayout()
  if (tab.terminalOpen) void openShell(tab)
  else (document.activeElement as HTMLElement | null)?.blur()
  persistSession()
}

type PaneName = 'terminal' | 'document' | 'web'

/** The panes on screen, left to right - the order Alt and the arrows walk. */
function visiblePanes(): PaneName[] {
  const panes: PaneName[] = []
  if (!terminalPane.hidden) panes.push('terminal')
  if (!viewer.hidden) panes.push('document')
  if (!webPane.hidden) panes.push('web')
  return panes
}

function focusedPane(): PaneName {
  if (terminalHasFocus()) return 'terminal'
  const active = document.activeElement
  if (active === webFrame || active === webPane || webPane.contains(active)) return 'web'
  return 'document'
}

/** The document pane is focusable so it can be reached by keyboard and scrolled. */
function focusPane(which: PaneName): void {
  if (!visiblePanes().includes(which)) return
  if (which === 'terminal') {
    const tab = tabs[activeIndex]
    if (tab) shells.get(tab.id)?.focus()
    return
  }
  if (which === 'web') {
    /*
     * The pane, not the page inside it. A cross-origin frame is handled by its own
     * process and swallows every key it gets, so keyboard navigation deliberately
     * stops at the edge of it; only a click puts the cursor into the page itself.
     */
    webPane.focus()
    return
  }
  viewer.focus()
}

/** Moves along the visible panes rather than wrapping: the ends are the ends. */
function stepPane(delta: number): void {
  const panes = visiblePanes()
  if (panes.length < 2) return
  const at = panes.indexOf(focusedPane())
  const from = at < 0 ? (delta > 0 ? -1 : panes.length) : at
  const next = from + delta
  if (next < 0 || next >= panes.length) return
  focusPane(panes[next])
}

function runPaneCommand(command: PaneCommand): void {
  const tab = tabs[activeIndex]
  if (!tab) return

  if (command.type === 'focus') {
    stepPane(command.direction === 'left' ? -1 : 1)
    return
  }
  if (command.type === 'focusIndex') {
    focusPane(command.index === 1 ? 'terminal' : command.index === 2 ? 'document' : 'web')
    return
  }
  if (command.type === 'web') {
    cycleRight()
    return
  }
  if (command.type === 'zoom') {
    if (tab.zoom === null && visiblePanes().length < 2) return
    // Zoom applies to whichever pane the user is looking at, as `prefix + z` does.
    const focused = focusedPane()
    tab.zoom = tab.zoom ? null : focused
    applyLayout()
    focusPane(tab.zoom ?? focused)
    return
  }
  if (command.type === 'resize') {
    if (tab.zoom) return
    // The divider that moves is the one beside the pane being worked in.
    if (focusedPane() === 'terminal' && !splitter.hidden) {
      tab.ratio = clampRatio(tab.ratio + command.delta)
    } else if (!rightSplitter.hidden) {
      tab.rightRatio = clampRatio(tab.rightRatio + command.delta)
    } else if (!splitter.hidden) {
      tab.ratio = clampRatio(tab.ratio + command.delta)
    } else {
      return
    }
    applyLayout()
    shells.get(tab.id)?.resize()
    persistSession()
  }
}

/**
 * One action per project: start it. Building is what running does first, and
 * anything else is a command you type into the shell that is already there.
 */
function chosenCommand(tab: Tab): string | null {
  const project = tab.project
  if (!project) return null
  if (tab.runCommand && project.commands.includes(tab.runCommand)) return tab.runCommand
  return project.commands.length === 1 ? project.commands[0] : null
}

function renderShellBar(): void {
  const tab = tabs[activeIndex]
  const project = tab?.project ?? null
  runButton.hidden = project === null
  if (!tab || !project) {
    shellProject.textContent = ''
    return
  }
  const command = chosenCommand(tab)
  runButton.title = (command ?? 'choose what to run') + String.fromCharCode(10) + 'in ' + project.root
  shellProject.textContent =
    (project.name ?? project.kind) +
    '  ·  ' +
    (command ?? project.commands.length + ' ways to run')
}

/** A monorepo offers one command per app; the choice is remembered per document. */
function showRunMenu(tab: Tab): void {
  const project = tab.project
  if (!project) return
  ctxmenu.textContent = ''

  for (const command of project.commands) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = command
    button.addEventListener('click', () => {
      hideContextMenu()
      tab.runCommand = command
      persistSession()
      renderShellBar()
      void sendRun(tab, command)
    })
    ctxmenu.append(button)
  }

  ctxmenu.hidden = false
  const box = runButton.getBoundingClientRect()
  const menu = ctxmenu.getBoundingClientRect()
  ctxmenu.style.left = Math.min(box.left, window.innerWidth - menu.width - 4) + 'px'
  ctxmenu.style.top = Math.min(box.bottom + 4, window.innerHeight - menu.height - 4) + 'px'
}

async function sendRun(tab: Tab, command: string): Promise<void> {
  if (!tab.terminalOpen) {
    tab.terminalOpen = true
    tab.zoom = null
    applyLayout()
    persistSession()
  }
  tab.awaitingServer = true
  tab.webManual = false
  await openShell(tab)
  window.api.terminal.write(tab.id, command + String.fromCharCode(13))
}

async function runProject(): Promise<void> {
  const tab = tabs[activeIndex]
  if (!tab?.project) return
  const command = chosenCommand(tab)
  if (!command) {
    showRunMenu(tab)
    return
  }
  await sendRun(tab, command)
}

runButton.addEventListener('click', () => void runProject())

function terminalHasFocus(): boolean {
  const tab = tabs[activeIndex]
  return tab ? shells.get(tab.id)?.hasFocus() === true : false
}

shellButton.addEventListener('click', toggleShell)

makeSplitter(splitter, panes, {
  onChange: (ratio) => {
    const tab = tabs[activeIndex]
    if (!tab) return
    tab.ratio = ratio
    terminalPane.style.flexBasis = String(ratio * 100) + '%'
    shells.get(tab.id)?.resize()
  },
  onCommit: (ratio) => {
    const tab = tabs[activeIndex]
    if (!tab) return
    tab.ratio = ratio
    persistSession()
  }
})

makeSplitter(rightSplitter, rightArea, {
  onChange: (ratio) => {
    const tab = tabs[activeIndex]
    if (!tab) return
    tab.rightRatio = ratio
    viewer.style.flexBasis = String(ratio * 100) + '%'
  },
  onCommit: (ratio) => {
    const tab = tabs[activeIndex]
    if (!tab) return
    tab.rightRatio = ratio
    persistSession()
  }
})

// The palette follows nativeTheme, so one media query covers all three modes.
darkQuery.addEventListener('change', () => {
  for (const pane of shells.values()) pane.setTheme(darkQuery.matches)
})

/* ---------- following a path out of the terminal ---------- */

/**
 * A path clicked in the shell output. It opens where every other file opens, in the tab
 * you are in, because the shell you clicked belongs to that tab.
 */
async function openFromTerminal(path: string, line: number | null): Promise<void> {
  await openFiles([path])
  const doc = shownDoc(tabs[activeIndex])
  if (!doc || doc.error) return
  if (line !== null) goToLine(line)
  status.textContent = baseName(path) + (line === null ? '' : ':' + line)
}

/**
 * Land on a line. In the plain-text pane it can be pointed at exactly, so the line is
 * selected; in a rendered document the block it belongs to is as close as it honestly
 * gets, because one source line and one rendered line are not the same thing.
 */
function goToLine(line: number): void {
  const target = Math.max(line - 1, 0)

  if (!raw.hidden) {
    const lines = raw.value.split('\n')
    let start = 0
    for (let i = 0; i < target && i < lines.length; i++) start += lines[i].length + 1
    raw.focus()
    raw.setSelectionRange(start, start + (lines[target]?.length ?? 0))
    /*
     * A textarea does not scroll to its selection on its own, and there is no way to
     * ask it to, so the row is measured and the line put a third of the way down -
     * near the top, but with enough above it to see where you landed.
     */
    const height = Number.parseFloat(getComputedStyle(raw).lineHeight)
    if (Number.isFinite(height)) {
      raw.scrollTop = Math.max(target * height - raw.clientHeight / 3, 0)
    }
    return
  }

  const blocks = [...content.querySelectorAll<HTMLElement>('[data-line]')]
  let landing: HTMLElement | null = null
  for (const block of blocks) {
    if (Number(block.dataset.line) > target) break
    landing = block
  }
  ;(landing ?? content.firstElementChild)?.scrollIntoView({ block: 'start' })
}

/* ---------- go to file ---------- */

/** What the palette is offering, rebuilt each time it opens. */
let paletteEntries: PaletteEntry[] = []
let paletteIndex = 0

/** The place a palette search happens in: the project, or where the file sits. */
function paletteRoot(tab: Tab): string {
  return tab.project?.root ?? shownDoc(tab)?.dir ?? tab.docs[0]?.dir ?? ''
}

const forwardSlashes = (path: string): string => path.split('\\').join('/')

/** Shown relative to the root, or in full when it lives outside it. */
function relativeTo(root: string, path: string): string {
  let a = forwardSlashes(root)
  while (a.endsWith('/')) a = a.slice(0, -1)
  const b = forwardSlashes(path)
  return b.toLowerCase().startsWith(a.toLowerCase() + '/') ? b.slice(a.length + 1) : b
}

/** How a place is named when a row has to say a file is open in another one. */
function tabLabel(tab: Tab): string {
  return tab.name ?? baseName(shownDoc(tab)?.path ?? '')
}

/** Where focus was when the palette took it, so closing it puts it back. */
let paletteReturn: HTMLElement | null = null

async function openPalette(): Promise<void> {
  const tab = tabs[activeIndex]
  if (!tab) return
  const root = paletteRoot(tab)
  paletteReturn = document.activeElement as HTMLElement | null

  // What is open here is known already, so the list is never empty while the disk is
  // still being walked.
  const here = new Map<string, PaletteEntry>()
  for (const doc of tab.docs) {
    here.set(doc.path.toLowerCase(), {
      path: doc.path,
      rel: relativeTo(root, doc.path),
      here: true,
      elsewhere: null
    })
  }
  paletteEntries = [...here.values()]
  paletteIndex = 0
  paletteInput.value = ''
  palette.hidden = false
  paletteNote.textContent = root
  renderPalette()
  paletteInput.focus()

  if (root === '') return
  const listing = await window.api.listFiles(root)
  // Still the same palette? Opening and closing quickly must not repopulate it.
  if (palette.hidden) return

  const elsewhere = new Map<string, string>()
  for (const other of tabs) {
    if (other === tab) continue
    for (const doc of other.docs) elsewhere.set(doc.path.toLowerCase(), tabLabel(other))
  }

  for (const file of listing.files) {
    const key = file.toLowerCase()
    if (here.has(key)) continue
    paletteEntries.push({
      path: file,
      rel: relativeTo(root, file),
      here: false,
      elsewhere: elsewhere.get(key) ?? null
    })
  }
  paletteNote.textContent = listing.truncated
    ? root + '  ·  first ' + listing.files.length + ' files only'
    : root
  renderPalette()
}

function closePalette(): void {
  palette.hidden = true
  paletteList.textContent = ''
  paletteEntries = []
  /*
   * Hiding the field only blurs it, which would leave the keyboard talking to nothing -
   * and being sent back to the shell you opened this from is what you expect anyway.
   */
  if (paletteReturn?.isConnected) paletteReturn.focus()
  paletteReturn = null
}

function renderPalette(): void {
  const shown = visibleEntries(paletteEntries, paletteInput.value)
  paletteIndex = Math.min(paletteIndex, Math.max(shown.length - 1, 0))
  paletteList.textContent = ''

  if (shown.length === 0) {
    const empty = document.createElement('li')
    empty.className = 'palette-empty'
    empty.textContent = paletteInput.value.trim() === '' ? 'Nothing open here' : 'No match'
    paletteList.append(empty)
    return
  }

  shown.forEach((entry, index) => {
    const row = document.createElement('li')
    row.className = 'palette-row'
    if (index === paletteIndex) row.classList.add('selected')

    const name = document.createElement('span')
    name.className = 'palette-name'
    name.textContent = entry.rel
    row.append(name)

    if (entry.here || entry.elsewhere) {
      const where = document.createElement('span')
      where.className = 'palette-where'
      where.textContent = entry.here ? 'open here' : 'open in ' + entry.elsewhere
      row.append(where)
    }

    row.addEventListener('mousedown', (event) => {
      event.preventDefault()
      void choosePalette(entry)
    })
    paletteList.append(row)
  })
}

async function choosePalette(entry: PaletteEntry): Promise<void> {
  closePalette()
  await openFiles([entry.path])
}

paletteInput.addEventListener('input', () => {
  paletteIndex = 0
  renderPalette()
})

paletteInput.addEventListener('keydown', (event) => {
  const shown = visibleEntries(paletteEntries, paletteInput.value)
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    paletteIndex = stepSelection(shown.length, paletteIndex, event.key === 'ArrowDown' ? 1 : -1)
    renderPalette()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const chosen = shown[paletteIndex]
    if (chosen) void choosePalette(chosen)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closePalette()
  }
})

/* ---------- the raw view and saving ---------- */

raw.addEventListener('input', () => {
  const tab = tabs[activeIndex]
  const doc = shownDoc(tab)
  if (!tab || !doc) return
  const onDisk = toEditorText(doc.source ?? '')
  // Back to what the file says counts as clean, so undoing an edit clears the mark.
  doc.draft = raw.value === onDisk ? null : raw.value
  if (doc.draft === null) {
    doc.staleOnDisk = false
    doc.forceSave = false
  }
  renderStatus(tab, doc)
})

/**
 * Rendered or as written. Only Markdown has two ways to show it; anything else has
 * only the one, and saying so is better than a key that appears not to work.
 */
function toggleRaw(): void {
  const tab = tabs[activeIndex]
  const doc = shownDoc(tab)
  if (!tab || !doc) return
  if (!isMarkdown(doc.path)) {
    status.textContent = 'Nothing to render here - this file is shown as it is written'
    return
  }
  if (doc.draft !== null && doc.raw) {
    status.textContent = 'Unsaved edits here - save with Ctrl+S first, or undo them'
    return
  }
  doc.raw = !doc.raw
  render()
  if (doc.raw) raw.focus()
}

async function saveDraft(): Promise<void> {
  const tab = tabs[activeIndex]
  const doc = shownDoc(tab)
  if (!tab || !doc || doc.draft === null) return
  if (doc.truncated) {
    status.textContent = 'Only the first 2 MB of this file was read, so it cannot be saved'
    return
  }

  const eol = detectEol(doc.source ?? '')
  const text = toFileText(doc.draft, eol)
  // A negative time is the deliberate override; anything else is checked in main.
  const result = await window.api.writeFile(doc.path, text, doc.forceSave ? -1 : doc.mtimeMs)

  if (!result.ok) {
    if (result.reason === 'stale') {
      doc.staleOnDisk = true
      doc.forceSave = true
      status.textContent = 'Changed on disk since you opened it - Ctrl+S again to overwrite'
    } else {
      status.textContent = 'Could not save: ' + result.error
    }
    return
  }

  doc.source = text
  doc.mtimeMs = result.mtimeMs
  doc.draft = null
  doc.staleOnDisk = false
  doc.forceSave = false
  // The preview has to catch up with what was just written, without a change flash:
  // this is your own edit, and highlighting it back at you says nothing.
  if (isMarkdown(doc.path)) doc.html = renderMarkdown(text, doc.dir, null)
  doc.updatedAt = Date.now()
  render()
}

/**
 * The window closing is the one way to lose unsaved work that nothing else catches:
 * a tab close asks, but Alt+F4 and the cross ask nobody. Electron cancels the close
 * when this returns anything at all and shows no dialog of its own, so the refusal has
 * to explain itself where the rest of the state already is.
 */
window.addEventListener('beforeunload', (event) => {
  const dirty = tabs.flatMap((tab) => tab.docs).filter(isDirty)
  if (dirty.length === 0) return
  const names = dirty.map((doc) => baseName(doc.path)).join(', ')
  status.textContent = `Unsaved changes in ${names} - save with Ctrl+S or undo them, then close again`
  event.returnValue = false
})

/* ---------- theme ---------- */

/**
 * The palette itself is pure CSS (prefers-color-scheme); the main process just
 * tells Chromium what to report, so light/dark also applies to native chrome.
 */
function setTheme(next: Theme, persist = true): void {
  theme = next
  themeButton.textContent = THEME_LABELS[next]
  if (persist) void window.api.setTheme(next)
}

function cycleTheme(): void {
  setTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length])
}

/**
 * The size applies to every shell at once, open or hidden: one setting for the app,
 * not one per pane. Only the size is remembered here - the family is a preference,
 * read from a file at startup and never written back.
 */
function stepFontSize(by: number): void {
  const size = stepSize(terminalFont.size, by)
  if (size === terminalFont.size) return
  terminalFont = { ...terminalFont, size }
  for (const pane of shells.values()) pane.setFont(terminalFont)
  window.api.setTerminalFontSize(size)
  status.textContent = 'Terminal font size ' + size
}

themeButton.addEventListener('click', cycleTheme)

/* ---------- input ---------- */

async function pickFiles(): Promise<void> {
  const paths = await window.api.openDialog()
  if (paths.length > 0) await openFiles(paths)
}

openButton.addEventListener('click', () => void pickFiles())

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !palette.hidden) {
    event.preventDefault()
    closePalette()
    return
  }

  if (event.key === 'Escape' && !help.hidden) {
    event.preventDefault()
    toggleHelp()
    return
  }

  if (event.key === 'Escape' && !findBar.hidden && findBar.contains(document.activeElement)) {
    event.preventDefault()
    closeFind()
    return
  }

  const pane = paneCommand(event)
  if (pane) {
    event.preventDefault()
    runPaneCommand(pane)
    return
  }

  if (!(event.ctrlKey || event.metaKey)) return

  if (event.code === 'Backquote') {
    event.preventDefault()
    toggleShell()
    return
  }

  if (event.code === 'PageDown' || event.code === 'PageUp') {
    event.preventDefault()
    cycleDoc(event.code === 'PageDown' ? 1 : -1)
    return
  }

  /*
   * Claimed even while the shell has focus, like Ctrl+` - the moment you want the
   * terminal font changed is the moment you are typing in the terminal, and neither
   * PowerShell nor the TUIs in it use these two. Read from the physical key, because
   * on a Czech layout the characters printed on them are not the US ones.
   */
  if (event.code === 'Equal' || event.code === 'NumpadAdd') {
    event.preventDefault()
    stepFontSize(1)
    return
  }
  if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
    event.preventDefault()
    stepFontSize(-1)
    return
  }

  /*
   * Keys typed into a shell belong to the shell - Ctrl+W deletes a word there and
   * Ctrl+D means end of input. So while the terminal has focus the app answers only
   * to the shifted variants, plus Ctrl+Tab, which no shell uses.
   */
  if (terminalHasFocus() && !event.shiftKey && event.key !== 'Tab') return

  const key = event.key.toLowerCase()
  // Read digits from the physical key: Ctrl+Shift+1 arrives as '!' on many layouts.
  const digit = event.code.startsWith('Digit') ? Number(event.code.slice(5)) : 0

  if (key === 't') {
    event.preventDefault()
    // A new place, empty: the next file you open lands in it.
    activeIndex = tabs.indexOf(createTab())
    render()
    persistSession()
  } else if (key === 'e') {
    event.preventDefault()
    toggleRaw()
  } else if (key === 's') {
    event.preventDefault()
    void saveDraft()
  } else if (key === 'o') {
    event.preventDefault()
    void pickFiles()
  } else if (event.code === 'KeyP') {
    event.preventDefault()
    if (palette.hidden) void openPalette()
    else closePalette()
  } else if (key === 'w') {
    event.preventDefault()
    closeDoc()
  } else if (event.key === 'Tab') {
    event.preventDefault()
    cycleTab(event.shiftKey ? -1 : 1)
  } else if (key === 'r') {
    event.preventDefault()
    const doc = shownDoc(tabs[activeIndex])
    if (doc) void reloadPath(doc.path)
  } else if (key === 'f') {
    event.preventDefault()
    openFind()
  } else if (key === 'd') {
    event.preventDefault()
    cycleTheme()
  } else if (digit >= 1 && digit <= 9) {
    event.preventDefault()
    selectTab(digit - 1)
  }
})

for (const type of ['dragenter', 'dragover'] as const) {
  window.addEventListener(type, (event) => {
    event.preventDefault()
    document.body.classList.add('dragging')
  })
}
for (const type of ['dragleave', 'dragend'] as const) {
  window.addEventListener(type, () => document.body.classList.remove('dragging'))
}
window.addEventListener('drop', (event) => {
  event.preventDefault()
  document.body.classList.remove('dragging')
  const dropped = [...(event.dataTransfer?.files ?? [])]
  /*
   * Anything dropped is opened, not only Markdown: what cannot be rendered is shown as
   * it is written. A file the user drags in is a file the user chose - unlike a link
   * inside a document, which stays limited to Markdown on purpose.
   */
  const paths = dropped.map((file) => window.api.getPathForFile(file)).filter(Boolean)
  if (paths.length > 0) void openFiles(paths)
})

/* ---------- startup ---------- */

async function start(): Promise<void> {
  render()
  const startup = await window.api.getStartupFiles()
  setTheme(startup.theme, false)
  terminalFont = startup.font

  // One place at a time, each with the files it held and the file that was on screen.
  for (const saved of startup.tabs) {
    const tab = createTab()
    await openFiles(saved.files, false, tab)
    const shown = saved.active ? tab.docs.findIndex((doc) => samePath(doc.path, saved.active!)) : -1
    tab.docIndex = shown >= 0 ? shown : 0
    tab.name = saved.name ?? null
    tab.terminalOpen = saved.pane.terminal
    tab.ratio = clampRatio(saved.pane.ratio)
    tab.runCommand = saved.pane.run ?? null
    tab.webUrl = saved.pane.web ?? null
    tab.rightMode = tab.webUrl === null ? 'doc' : saved.pane.rightMode
    tab.rightRatio = clampRatio(saved.pane.rightRatio)
    tab.webManual = saved.pane.webManual
  }

  // A place whose every file has vanished is not worth restoring as an empty one.
  for (let i = tabs.length - 1; i >= 0; i--) if (tabs[i].docs.length === 0) tabs.splice(i, 1)
  activeIndex = tabs.length === 0 ? -1 : Math.min(startup.activeTab, tabs.length - 1)
  render()
  persistSession()
}

void start()
