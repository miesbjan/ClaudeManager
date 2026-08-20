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
import { renderShortcuts } from './help'
import { createUrlReader, nextRightMode, normalizeUrl } from './web'
import { clampRatio, DEFAULT_RATIO, makeSplitter } from './split'
import { paneCommand, type PaneCommand } from '../../shared/shortcuts'
import { TerminalPane } from './terminal'
import { renderTabBar, type Tab, type TabHandlers } from './tabs'
import type { PaneState, TaskbarState, Theme } from '../../shared/types'

const MD_PATTERN = /\.(md|markdown|mdown|mkd|mdx)$/i
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
const empty = document.getElementById('empty') as HTMLElement
const status = document.getElementById('statusbar') as HTMLElement
const ctxmenu = document.getElementById('ctxmenu') as HTMLElement
const findBar = document.getElementById('find') as HTMLElement
const findInput = document.getElementById('find-input') as HTMLInputElement
const findCount = document.getElementById('find-count') as HTMLElement
const helpButton = document.getElementById('help-btn') as HTMLButtonElement
const help = document.getElementById('help') as HTMLElement

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

const samePath = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()
/** By file: for anything the watcher reports, which speaks in paths. */
const indexOfPath = (path: string): number => tabs.findIndex((t) => samePath(t.path, path))
/** By tab: for anything belonging to the tab as a place, above all its shell. */
const indexOfId = (id: string): number => tabs.findIndex((t) => t.id === id)

/**
 * Unique for as long as the window lives, which is as long as any shell does. A
 * counter is enough and stays readable in a log; nothing outside this session ever
 * sees it, so it is deliberately not derived from the document.
 */
let nextTabId = 1
const baseName = (path: string): string => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? path

const tabHandlers: TabHandlers = {
  onSelect: selectTab,
  onClose: closeTab,
  onContextMenu: showContextMenu
}

async function openFiles(paths: string[], activate = true): Promise<void> {
  let target = activeIndex
  for (const path of paths) {
    const existing = indexOfPath(path)
    if (existing >= 0) {
      target = existing
      continue
    }
    const tab: Tab = {
      id: 'tab-' + nextTabId++,
      path,
      dir: '',
      html: '',
      error: null,
      scrollTop: 0,
      updatedAt: null,
      source: null,
      pendingFlash: false,
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
    target = tabs.length - 1
    await loadTab(tab)
    void window.api.watch(tab.path)
  }
  if (activate && target >= 0) activeIndex = target
  else if (activeIndex < 0 && tabs.length > 0) activeIndex = 0
  render()
  persistSession()
}

/**
 * `diff` is off for the first load of a file - every block would count as changed.
 * On a reload it is on, so the blocks the other writer touched can be flashed.
 * `tab.source` survives an unavailable file on purpose: when it reappears, the
 * diff is against what the user last saw, not against nothing.
 */
async function loadTab(tab: Tab, diff = false): Promise<void> {
  const result = await window.api.readFile(tab.path)
  tab.path = result.path
  tab.dir = result.dir
  if (result.ok) {
    const changed =
      diff && tab.source !== null && tab.source !== result.content
        ? changedLines(tab.source, result.content)
        : null
    tab.source = result.content
    tab.html = renderMarkdown(result.content, result.dir, changed)
    tab.error = null
    tab.updatedAt = Date.now()
    if (!tab.project) tab.project = await window.api.detectProject(result.dir)
    if (changed && changed.size > 0) tab.pendingFlash = true
  } else {
    tab.html = ''
    tab.error = result.error
  }
}

function closeTab(index: number): void {
  const tab = tabs[index]
  if (!tab) return
  void window.api.unwatch(tab.path)
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

function selectTab(index: number): void {
  if (index < 0 || index >= tabs.length || index === activeIndex) return
  activeIndex = index
  render()
  persistSession()
  // Opening a tab marked unavailable is as good a moment as any to look again.
  const tab = tabs[index]
  if (tab.error) void reloadPath(tab.path)
}

function cycleTab(step: number): void {
  if (tabs.length < 2) return
  selectTab((activeIndex + step + tabs.length) % tabs.length)
}

function render(): void {
  const current = tabs[activeIndex]
  if (current && isSeen(current)) applyActivity(current, { type: 'seen' })

  renderTabBar(tabbar, tabs, activeIndex, tabHandlers)

  const tab = tabs[activeIndex]
  if (!tab) {
    content.hidden = true
    content.textContent = ''
    empty.hidden = false
    status.textContent = 'No file open'
    document.title = 'Project Console'
    applyLayout()
    return
  }

  empty.hidden = true
  content.hidden = false

  if (tab.error) {
    renderError(tab)
  } else {
    // The class has to be in place before the markup is inserted, otherwise the
    // fade animation does not start. Clearing it when nothing is pending is what
    // keeps a plain tab switch from replaying an old flash.
    content.classList.toggle('flash-changes', tab.pendingFlash)
    tab.pendingFlash = false
    content.innerHTML = tab.html
  }

  viewer.scrollTop = tab.scrollTop
  if (!findBar.hidden) refreshFind(false)
  document.title = baseName(tab.path) + ' - Project Console'
  renderStatus(tab)
  applyLayout()
  ensureShell()
}

function renderError(tab: Tab): void {
  content.textContent = ''
  const box = document.createElement('div')
  box.className = 'file-error'

  const title = document.createElement('strong')
  title.textContent = 'File unavailable'
  const path = document.createElement('code')
  path.textContent = tab.path
  const message = document.createElement('p')
  message.textContent = tab.error ?? ''
  const hint = document.createElement('p')
  hint.className = 'muted'
  hint.textContent = 'Still watching - the document loads automatically if the file reappears.'

  box.append(title, path, message, hint)
  content.append(box)
}

function renderStatus(tab: Tab): void {
  if (tab.error) {
    status.textContent = tab.path + '  ·  unavailable'
    return
  }
  const updated = tab.updatedAt ? new Date(tab.updatedAt).toLocaleTimeString() : '-'
  status.textContent = tab.path + '  ·  updated ' + updated + '  ·  watching'
}

function persistSession(): void {
  const panesState: Record<string, PaneState> = {}
  for (const tab of tabs) {
    panesState[tab.path] = {
      terminal: tab.terminalOpen,
      ratio: tab.ratio,
      run: tab.runCommand,
      web: tab.webUrl,
      rightMode: tab.rightMode,
      rightRatio: tab.rightRatio,
      webManual: tab.webManual
    }
  }
  window.api.saveSession({
    files: tabs.map((t) => t.path),
    active: tabs[activeIndex]?.path ?? null,
    panes: panesState
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

async function reloadPath(path: string): Promise<void> {
  const index = indexOfPath(path)
  if (index < 0) return
  await loadTab(tabs[index], true)
  // Only the visible document needs repainting; the rest refresh on switch.
  if (index === activeIndex) render()
  else renderTabBar(tabbar, tabs, activeIndex, tabHandlers)
}

window.api.onFileEvent(({ path, type }) => {
  const index = indexOfPath(path)
  if (index < 0) return
  if (type !== 'unlink') {
    scheduleReload(path)
    return
  }
  const tab = tabs[index]
  tab.error = 'The file no longer exists on disk.'
  tab.html = ''
  if (index === activeIndex) render()
  else renderTabBar(tabbar, tabs, activeIndex, tabHandlers)
})

window.api.onOpenFiles((paths) => void openFiles(paths.filter((p) => MD_PATTERN.test(p))))

// Claimed in the main process, so they arrive even from inside the web pane.
window.api.onPaneCommand((command) => runPaneCommand(command))

/* ---------- tab context menu ---------- */

function showContextMenu(index: number, x: number, y: number): void {
  const tab = tabs[index]
  if (!tab) return
  ctxmenu.textContent = ''

  const items: Array<[string, () => void]> = [
    ['Reload', () => void reloadPath(tab.path)],
    ['Close', () => closeTab(index)],
    ['Close others', () => closeOthers(index)],
    ['Copy path', () => void navigator.clipboard.writeText(tab.path).catch(() => undefined)],
    ['Reveal in Explorer', () => void window.api.reveal(tab.path)]
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
  for (const tab of tabs) if (tab !== kept) void window.api.unwatch(tab.path)
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
    if (MD_PATTERN.test(local)) void openFiles([local])
    return
  }

  const href = anchor.getAttribute('href') ?? ''
  if (href.startsWith('#')) {
    const target = document.getElementById(decodeURIComponent(href.slice(1)))
    target?.scrollIntoView({ block: 'start' })
  }
})

viewer.addEventListener('scroll', () => {
  const tab = tabs[activeIndex]
  if (tab) tab.scrollTop = viewer.scrollTop
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
  renderTabBar(tabbar, tabs, activeIndex, tabHandlers)
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

window.api.terminal.onExit(({ id }) => {
  const index = indexOfId(id)
  if (index >= 0) applyActivity(tabs[index], { type: 'exit' })
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
    pane = new TerminalPane(tab.id, tab.project?.root ?? tab.dir, darkQuery.matches, terminalFont)
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

  if (key === 'o') {
    event.preventDefault()
    void pickFiles()
  } else if (key === 'w') {
    event.preventDefault()
    closeTab(activeIndex)
  } else if (event.key === 'Tab') {
    event.preventDefault()
    cycleTab(event.shiftKey ? -1 : 1)
  } else if (key === 'r') {
    event.preventDefault()
    const tab = tabs[activeIndex]
    if (tab) void reloadPath(tab.path)
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
  const paths = dropped
    .map((file) => window.api.getPathForFile(file))
    .filter((path) => path && MD_PATTERN.test(path))
  if (paths.length > 0) void openFiles(paths)
})

/* ---------- startup ---------- */

async function start(): Promise<void> {
  render()
  const startup = await window.api.getStartupFiles()
  setTheme(startup.theme, false)
  terminalFont = startup.font
  if (startup.files.length === 0) return
  await openFiles(startup.files, false)
  for (const tab of tabs) {
    const pane = startup.panes[tab.path]
    if (!pane) continue
    tab.terminalOpen = pane.terminal
    tab.ratio = clampRatio(pane.ratio)
    tab.runCommand = pane.run ?? null
    tab.webUrl = pane.web ?? null
    tab.rightMode = tab.webUrl === null ? 'doc' : (pane.rightMode ?? 'doc')
    tab.rightRatio = clampRatio(pane.rightRatio ?? DEFAULT_RATIO)
    tab.webManual = pane.webManual === true
  }
  const wanted = startup.active ? indexOfPath(startup.active) : -1
  activeIndex = wanted >= 0 ? wanted : 0
  render()
  persistSession()
}

void start()
