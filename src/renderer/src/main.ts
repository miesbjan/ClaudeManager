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
import {
  clearMatches,
  findInElement,
  paintMatches,
  scrollToMatch,
  stepIndex
} from './find'
import { renderShortcuts } from './help'
import { normalizeUrl, sniffLocalUrl } from './web'
import { clampRatio, DEFAULT_RATIO, makeSplitter } from './split'
import { paneCommand, type PaneCommand } from './shortcuts'
import { TerminalPane } from './terminal'
import { renderTabBar, type Tab, type TabHandlers } from './tabs'
import type { PaneState, Theme } from '../../shared/types'

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
/** One shell per tab, kept alive while the tab exists - keyed by document path. */
const shells = new Map<string, TerminalPane>()
/** Per tab: the escape-sequence reader and the timer that notices silence. */
const signalReaders = new Map<string, (chunk: string) => OutputSignals>()
const silenceTimers = new Map<string, number>()
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

const samePath = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()
const indexOfPath = (path: string): number => tabs.findIndex((t) => samePath(t.path, path))
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
      project: null,
      runCommand: null,
      webUrl: null,
      showWeb: false
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
  shells.get(tab.path)?.dispose()
  shells.delete(tab.path)
  signalReaders.delete(tab.path)
  const silence = silenceTimers.get(tab.path)
  if (silence) window.clearTimeout(silence)
  silenceTimers.delete(tab.path)
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
  if (current && isSeen(current)) current.activity = 'idle'

  renderTabBar(tabbar, tabs, activeIndex, tabHandlers)

  const tab = tabs[activeIndex]
  if (!tab) {
    content.hidden = true
    content.textContent = ''
    empty.hidden = false
    status.textContent = 'No file open'
    document.title = 'Markdown Viewer'
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
  document.title = baseName(tab.path) + ' - Markdown Viewer'
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
      showWeb: tab.showWeb
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
  // A rewrite you cannot see is the same news as output in a hidden shell.
  if (tabs[index].pendingFlash) applyActivity(tabs[index], { type: 'document' })
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
  if (!tab.terminalOpen) return !shells.has(tab.path)
  return tab.zoom !== 'document'
}

function applyActivity(tab: Tab, event: ActivityEvent): void {
  if (event.type !== 'seen' && isSeen(tab)) return
  const next = nextActivity(tab.activity, event)
  if (next === tab.activity) return
  tab.activity = next
  renderTabBar(tabbar, tabs, activeIndex, tabHandlers)
}

function scheduleSilence(tab: Tab): void {
  const pending = silenceTimers.get(tab.path)
  if (pending) window.clearTimeout(pending)
  silenceTimers.set(
    tab.path,
    window.setTimeout(() => {
      silenceTimers.delete(tab.path)
      applyActivity(tab, { type: 'silence' })
    }, SILENCE_MS)
  )
}

window.api.terminal.onData(({ id, data }) => {
  const index = indexOfPath(id)
  if (index < 0) return
  let read = signalReaders.get(id)
  if (!read) {
    read = createSignalReader()
    signalReaders.set(id, read)
  }
  // Always read, even for a tab in view: the reader carries split sequences.
  const signals = read(data)
  setWebUrl(tabs[index], sniffLocalUrl(data))
  applyActivity(tabs[index], { type: 'output', signals })
  scheduleSilence(tabs[index])
})

window.api.terminal.onExit(({ id }) => {
  const index = indexOfPath(id)
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
  const open = tab?.terminalOpen === true
  const zoom = open ? (tab?.zoom ?? null) : null

  terminalPane.hidden = !open || zoom === 'document'
  splitter.hidden = !open || zoom !== null
  viewer.hidden = zoom === 'terminal'
  shellButton.classList.toggle('active', open)

  if (tab && !terminalPane.hidden) {
    terminalPane.style.flexBasis = zoom === 'terminal' ? '100%' : String(clampRatio(tab.ratio) * 100) + '%'
  }

  for (const [path, pane] of shells) {
    pane.setVisible(!terminalPane.hidden && tab !== undefined && samePath(path, tab.path))
  }

  renderShellBar()
  renderWebPane()
}

/**
 * The right slot holds one of two things. The address is sniffed from what the dev
 * server printed when it started, so there is nothing to configure - and it can be
 * typed by hand for a server that was started elsewhere.
 */
function renderWebPane(): void {
  const tab = tabs[activeIndex]
  const showWeb = tab?.showWeb === true && tab.webUrl !== null && tab.zoom !== 'terminal'

  webButton.hidden = !tab || tab.webUrl === null
  webButton.classList.toggle('active', showWeb)
  webPane.hidden = !showWeb
  viewer.hidden = tab?.zoom === 'terminal' || showWeb

  if (!tab) return
  if (document.activeElement !== webUrlInput) webUrlInput.value = tab.webUrl ?? ''
  // Only assign src when it really changes; otherwise every render reloads the page.
  if (showWeb && tab.webUrl && webFrame.getAttribute('src') !== tab.webUrl) {
    webFrame.setAttribute('src', tab.webUrl)
  }
}

function setWebUrl(tab: Tab, url: string | null): void {
  if (url === null || tab.webUrl === url) return
  tab.webUrl = url
  persistSession()
  if (tab === tabs[activeIndex]) renderWebPane()
}

function toggleWeb(): void {
  const tab = tabs[activeIndex]
  if (!tab?.webUrl) return
  tab.showWeb = !tab.showWeb
  if (tab.showWeb && tab.zoom === 'terminal') tab.zoom = null
  applyLayout()
  persistSession()
}

webButton.addEventListener('click', toggleWeb)

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
  setWebUrl(tab, url)
  tab.showWeb = true
  applyLayout()
  persistSession()
})

/** Start the shell of the active tab if it is meant to be open but has none yet. */
function ensureShell(): void {
  const tab = tabs[activeIndex]
  if (tab && tab.terminalOpen && !shells.has(tab.path)) void openShell(tab)
}

async function openShell(tab: Tab): Promise<void> {
  let pane = shells.get(tab.path)
  if (!pane) {
    pane = new TerminalPane(tab.path, tab.project?.root ?? tab.dir, darkQuery.matches)
    // Registered before the await so a second call cannot spawn a second shell.
    shells.set(tab.path, pane)
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

/** The document pane is focusable so it can be reached by keyboard and scrolled. */
function focusPane(which: 'terminal' | 'document'): void {
  const tab = tabs[activeIndex]
  if (!tab) return
  if (which === 'terminal') {
    if (!tab.terminalOpen || tab.zoom === 'document') return
    shells.get(tab.path)?.focus()
    return
  }
  if (tab.zoom === 'terminal') return
  viewer.focus()
}

function runPaneCommand(command: PaneCommand): void {
  const tab = tabs[activeIndex]
  if (!tab) return

  if (command.type === 'focus') {
    focusPane(command.direction === 'left' ? 'terminal' : 'document')
    return
  }
  if (command.type === 'focusIndex') {
    focusPane(command.index === 1 ? 'terminal' : 'document')
    return
  }
  if (command.type === 'web') {
    toggleWeb()
    return
  }
  if (command.type === 'zoom') {
    if (!tab.terminalOpen) return
    // Zoom applies to whichever pane the user is looking at, as `prefix + z` does.
    const focused = terminalHasFocus() ? 'terminal' : 'document'
    tab.zoom = tab.zoom ? null : focused
    applyLayout()
    focusPane(tab.zoom ?? focused)
    return
  }
  if (command.type === 'resize') {
    if (!tab.terminalOpen || tab.zoom) return
    tab.ratio = clampRatio(tab.ratio + command.delta)
    applyLayout()
    shells.get(tab.path)?.resize()
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
  await openShell(tab)
  window.api.terminal.write(tab.path, command + String.fromCharCode(13))
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
  return tab ? shells.get(tab.path)?.hasFocus() === true : false
}

shellButton.addEventListener('click', toggleShell)

makeSplitter(splitter, panes, {
  onChange: (ratio) => {
    const tab = tabs[activeIndex]
    if (!tab) return
    tab.ratio = ratio
    terminalPane.style.flexBasis = String(ratio * 100) + '%'
    shells.get(tab.path)?.resize()
  },
  onCommit: (ratio) => {
    const tab = tabs[activeIndex]
    if (!tab) return
    tab.ratio = ratio
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
  if (startup.files.length === 0) return
  await openFiles(startup.files, false)
  for (const tab of tabs) {
    const pane = startup.panes[tab.path]
    if (!pane) continue
    tab.terminalOpen = pane.terminal
    tab.ratio = clampRatio(pane.ratio)
    tab.runCommand = pane.run ?? null
    tab.webUrl = pane.web ?? null
    tab.showWeb = pane.showWeb === true && tab.webUrl !== null
  }
  const wanted = startup.active ? indexOfPath(startup.active) : -1
  activeIndex = wanted >= 0 ? wanted : 0
  render()
  persistSession()
}

void start()
