import 'highlight.js/styles/github.css'
import './styles.css'
import { changedLines } from './diff'
import { renderMarkdown } from './markdownRenderer'
import { renderTabBar, type Tab, type TabHandlers } from './tabs'
import type { Theme } from '../../shared/types'

const MD_PATTERN = /\.(md|markdown|mdown|mkd|mdx)$/i
const THEMES: Theme[] = ['system', 'light', 'dark']
const THEME_LABELS: Record<Theme, string> = {
  system: 'Theme: Auto',
  light: 'Theme: Light',
  dark: 'Theme: Dark'
}

const openButton = document.getElementById('open-btn') as HTMLButtonElement
const themeButton = document.getElementById('theme-btn') as HTMLButtonElement
const tabbar = document.getElementById('tabbar') as HTMLElement
const viewer = document.getElementById('viewer') as HTMLElement
const content = document.getElementById('content') as HTMLElement
const empty = document.getElementById('empty') as HTMLElement
const status = document.getElementById('statusbar') as HTMLElement
const ctxmenu = document.getElementById('ctxmenu') as HTMLElement

const tabs: Tab[] = []
let activeIndex = -1
let theme: Theme = 'system'
const reloadTimers = new Map<string, number>()

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
      pendingFlash: false
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
}

function cycleTab(step: number): void {
  if (tabs.length < 2) return
  selectTab((activeIndex + step + tabs.length) % tabs.length)
}

function render(): void {
  renderTabBar(tabbar, tabs, activeIndex, tabHandlers)

  const tab = tabs[activeIndex]
  if (!tab) {
    content.hidden = true
    content.textContent = ''
    empty.hidden = false
    status.textContent = 'No file open'
    document.title = 'Markdown Viewer'
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
  document.title = baseName(tab.path) + ' - Markdown Viewer'
  renderStatus(tab)
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
  window.api.saveSession({
    files: tabs.map((t) => t.path),
    active: tabs[activeIndex]?.path ?? null
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
  if (!(event.ctrlKey || event.metaKey)) return
  const key = event.key.toLowerCase()

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
  } else if (key === 'd') {
    event.preventDefault()
    cycleTheme()
  } else if (key >= '1' && key <= '9') {
    event.preventDefault()
    selectTab(Number(key) - 1)
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
  const wanted = startup.active ? indexOfPath(startup.active) : -1
  activeIndex = wanted >= 0 ? wanted : 0
  render()
  persistSession()
}

void start()
