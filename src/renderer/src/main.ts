import 'highlight.js/styles/github.css'
import './styles.css'
import { changedLines } from './diff'
import { renderMarkdown } from './markdownRenderer'
import {
  createSignalReader,
  interruptsWork,
  nextActivity,
  shownActivity,
  SILENCE_MS,
  type ActivityEvent,
  type OutputSignals
} from './activity'
import { aggregateActivity, attention, countsAsFinished, type Attention } from './taskbar'
import { paintTaskbarIcon, paintTray } from './icon'
import { DEFAULT_FAMILY, DEFAULT_SIZE, stepSize, type TerminalFont } from '../../shared/font'
import {
  clearMatches,
  findInElement,
  lineAt,
  matchRanges,
  paintMatches,
  scrollToMatch,
  stepIndex,
  type TextRange
} from './find'
import { createDoc, indexAfterClose, isDirty, nextDocIndex, type Doc } from './docs'
import { renderShortcuts } from './help'
import { nextLang, translate, type Lang, type StringKey } from '../../shared/i18n'
import { formatTokens } from '../../shared/usage'
import { limitLevel, timeUntil } from '../../shared/limits'
import { stepSelection, visibleEntries, type PaletteEntry } from './palette'
import { askModal } from './modal'
import {
  chooseTarget,
  expandPath,
  matchDirs,
  parentOf,
  shorten,
  splitTyped
} from '../../shared/place'
import { detectEol, isMarkdown, toEditorText, toFileText } from './plaintext'
import { sendable } from './prompt'
import type { WebviewTag } from 'electron'
import { createUrlReader, nextRightMode, normalizeUrl, WEB_PARTITION } from '../../shared/web'
import { clampRatio, DEFAULT_RATIO, makeSplitter } from './split'
import { MAX_DRAFT, MAX_PROMPT } from '../../shared/session'
import { claimedFromShell, paneCommand, tabDigit, type PaneCommand } from '../../shared/shortcuts'
import { TerminalPane, usePty } from './terminal'
import { renderTabBar, type Tab, type TabHandlers } from './tabs'
import { activeAfterMove } from '../../shared/tabs'
import type { TaskbarState, Theme } from '../../shared/types'

const THEMES: Theme[] = ['system', 'light', 'dark']
const THEME_LABELS: Record<Theme, StringKey> = {
  system: 'toolbar.theme.system',
  light: 'toolbar.theme.light',
  dark: 'toolbar.theme.dark'
}

const openButton = document.getElementById('open-btn') as HTMLButtonElement
const folderButton = document.getElementById('folder-btn') as HTMLButtonElement
const newTabButton = document.getElementById('new-tab-btn') as HTMLButtonElement
const shellButton = document.getElementById('shell-btn') as HTMLButtonElement
const themeButton = document.getElementById('theme-btn') as HTMLButtonElement
const langButton = document.getElementById('lang-btn') as HTMLButtonElement
const panes = document.getElementById('panes') as HTMLElement
const terminalPane = document.getElementById('terminal-pane') as HTMLElement
const termHosts = document.getElementById('term-hosts') as HTMLElement
const runButton = document.getElementById('run-btn') as HTMLButtonElement
const shellProject = document.getElementById('shell-project') as HTMLElement
const webButton = document.getElementById('web-btn') as HTMLButtonElement
const webPane = document.getElementById('web-pane') as HTMLElement
const rightArea = document.getElementById('right-area') as HTMLElement
const rightSplitter = document.getElementById('right-splitter') as HTMLElement
/*
 * A webview, not an iframe: the page runs in a process of its own, which is what keeps a
 * dev server that misbehaves from taking this window - and every shell in it - with it.
 * The type comes from Electron, but only as a type; nothing here talks to Electron.
 *
 * Not a constant, because a webview whose process has died cannot be reused: giving one
 * an address kills the application outright, in the browser process, with a check
 * failure and no exception to catch. The dead element is thrown away and a new one takes
 * its place instead.
 */
let webFrame = document.getElementById('web-frame') as WebviewTag

/**
 * The address the element was last told to load.
 *
 * Kept here rather than read back off the element: a webview rewrites what it is given
 * into a canonical URL - `localhost:3000` comes back as `http://localhost:3000/` - so
 * comparing against the attribute never matches and the page would reload on every
 * repaint. Null means nothing has been loaded, which is also true of a fresh element.
 */
let webFrameUrl: string | null = null
const webUrlInput = document.getElementById('web-url') as HTMLInputElement
const splitter = document.getElementById('splitter') as HTMLElement
const tabbar = document.getElementById('tabbar') as HTMLElement
const viewer = document.getElementById('viewer') as HTMLElement
const content = document.getElementById('content') as HTMLElement
const raw = document.getElementById('raw') as HTMLTextAreaElement
const empty = document.getElementById('empty') as HTMLElement
const status = document.getElementById('status-text') as HTMLElement
const usageLabel = document.getElementById('usage') as HTMLElement
const limitsLabel = document.getElementById('limits') as HTMLElement
const ctxmenu = document.getElementById('ctxmenu') as HTMLElement
const findBar = document.getElementById('find') as HTMLElement
const findInput = document.getElementById('find-input') as HTMLInputElement
const findCount = document.getElementById('find-count') as HTMLElement
const helpButton = document.getElementById('help-btn') as HTMLButtonElement
const help = document.getElementById('help') as HTMLElement
const promptPane = document.getElementById('prompt-pane') as HTMLElement
const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement
const promptSend = document.getElementById('prompt-send') as HTMLButtonElement
const place = document.getElementById('place') as HTMLElement
const placeInput = document.getElementById('place-input') as HTMLInputElement
const placeList = document.getElementById('place-list') as HTMLUListElement
const placeNote = document.getElementById('place-note') as HTMLElement
const modal = document.getElementById('modal') as HTMLElement
const palette = document.getElementById('palette') as HTMLElement
const paletteInput = document.getElementById('palette-input') as HTMLInputElement
const paletteList = document.getElementById('palette-list') as HTMLUListElement
const paletteNote = document.getElementById('palette-note') as HTMLElement

const tabs: Tab[] = []
let activeIndex = -1
let theme: Theme = 'system'
let lang: Lang = 'en'

/** Every piece of text the window shows goes through here. */
const T = (key: StringKey, vars?: Record<string, string | number>): string =>
  translate(lang, key, vars)
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
type Found = { tab: Tab; tabIndex: number; doc: Doc; docIndex: number }

/**
 * Every copy of a file that is open, because a file may be open in more than one
 * place. Anything that follows the file itself - a rewrite on disk, a deletion, the
 * watch on it - has to reach all of them, or one place would quietly stop keeping up.
 */
function findDocs(path: string): Found[] {
  const found: Found[] = []
  for (const [tabIndex, tab] of tabs.entries()) {
    for (const [docIndex, doc] of tab.docs.entries()) {
      if (samePath(doc.path, path)) found.push({ tab, tabIndex, doc, docIndex })
    }
  }
  return found
}

/**
 * Watching is per file, not per copy, so it may only be dropped once the last copy of
 * it is gone. `except` is the copy being closed, which is still in the list.
 */
function unwatchUnlessOpenElsewhere(path: string, except: Doc): void {
  const others = findDocs(path).filter((entry) => entry.doc !== except)
  if (others.length === 0) void window.api.unwatch(path)
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
  onReorder: reorderTab,
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
  renderTabBar(tabbar, tabs, activeIndex, tabHandlers, renaming, lang)
}

function startRename(index: number): void {
  const tab = tabs[index]
  if (!tab) return
  renaming = { id: tab.id, value: tab.name ?? '' }
  renderTabBar(tabbar, tabs, activeIndex, tabHandlers, renaming, lang)
}

/** An empty name is how you go back to being named after the file on screen. */
function finishRename(index: number, name: string): void {
  const tab = tabs[index]
  renaming = null
  if (tab) tab.name = name.trim() === '' ? null : name.trim()
  paintTabs()
  persistSession()
}

/**
 * A fresh place, with nothing open in it yet.
 *
 * A restored tab brings its own name from the session file, because a shell belongs to a
 * tab by that name and outlives the window: handing out new names in file order would
 * hand a rebuilt window somebody else's shell. `keepName` also moves the counter past
 * anything restored, so a tab opened afterwards cannot collide with one.
 */
function createTab(keepName?: string | null): Tab {
  const tab: Tab = {
    id: keepName ?? 'tab-' + nextTabId++,
    docs: [],
    docIndex: -1,
    name: null,
    terminalOpen: false,
    ratio: DEFAULT_RATIO,
    zoom: null,
    activity: 'idle',
    reporting: false,
    finished: false,
    commandAt: null,
    runFrom: null,
    project: null,
    runCommand: null,
    webUrl: null,
    root: null,
    prompt: '',
    promptOpen: false,
    rightMode: 'doc',
    rightRatio: DEFAULT_RATIO,
    webManual: false,
    awaitingServer: false,
    webBroken: false
  }
  tabs.push(tab)
  return tab
}

/** Keep the counter clear of every name already in use, whoever handed it out. */
function reserveName(name: string | null | undefined): void {
  const number = typeof name === 'string' ? Number(name.replace('tab-', '')) : Number.NaN
  if (Number.isInteger(number) && number >= nextTabId) nextTabId = number + 1
}

/**
 * Files land in the tab you are in: a tab is a place, and everything you open while
 * working there belongs to it. A new place is something you ask for.
 *
 * A file already open in this tab is switched to rather than added twice. One open in
 * another tab is opened here all the same: the tabs are separate places, and two of
 * them over one project is a thing people do - being dragged to the other one instead
 * was a leftover from when a tab was a file rather than a place.
 */
async function openFiles(paths: string[], activate = true, into?: Tab): Promise<void> {
  let tab = into ?? tabs[activeIndex]
  for (const path of paths) {
    const here = tab?.docs.findIndex((doc) => samePath(doc.path, path)) ?? -1
    if (tab && here >= 0) {
      tab.docIndex = here
      if (activate) activeIndex = tabs.indexOf(tab)
      continue
    }
    if (!tab) tab = createTab()
    const doc = createDoc(path, !isMarkdown(path))
    tab.docs.push(doc)
    tab.docIndex = tab.docs.length - 1
    if (activate) activeIndex = tabs.indexOf(tab)
    await loadDoc(tab, doc)
    void window.api.watch(doc.path)
    /*
     * The place keeps what is opened in it, so `Ctrl+P` in this project offers these
     * files again next week. Only a file that actually opened: a path that turned out
     * not to be there is not something to come back to.
     */
    if (!doc.error) window.api.noteOpenedFile(placeOf(tab), doc.path)
  }
  if (activeIndex < 0 && tabs.length > 0) activeIndex = 0
  if (activate && tab) reveal(tab)
  render()
  persistSession()
}

/**
 * Whatever it takes for a pane to be on screen.
 *
 * Opening a file used to do everything except show it when the right side was on the dev
 * server or a pane was blown up: the tab was renamed, the title changed, the status bar
 * said it was loaded, and the document was behind the server the whole time. An action
 * whose only evidence is somewhere other than where you are looking reads as a broken
 * application. `Alt+1`, `Alt+2` and `Alt+3` had the same hole from the other side - they
 * asked to go to a pane and did nothing at all when that pane was not up.
 *
 * Nothing is taken away for it. The right side goes to showing both, which is one
 * `Alt+W` from either arrangement, so the choice stays where it was made; only a zoom on
 * some other pane has to go, since that is what a zoom is.
 */
function showPane(tab: Tab | undefined, which: PaneName): void {
  if (!tab) return
  if (which === 'terminal' && !tab.terminalOpen) {
    tab.terminalOpen = true
    void openShell(tab)
  }
  if (which === 'document' && tab.rightMode === 'web') tab.rightMode = 'both'
  /*
   * The web pane with no address is the pane plus its address bar, which is the way to
   * type one in - so asking for the server before there is one is a fair question.
   */
  if (which === 'web' && tab.rightMode === 'doc') tab.rightMode = 'both'
  if (tab.zoom !== null && tab.zoom !== which) tab.zoom = null
}

/** The document, by whatever route it was opened. */
function reveal(tab: Tab): void {
  showPane(tab, 'document')
}

/**
 * The directory a tab counts as being in: what it was opened over, what its project
 * turned out to be, or - for a tab that is only a file - where that file lives.
 *
 * One answer, for everything that asks. It used to be worked out in three places in
 * three slightly different orders, and the differences showed: the shell was started in
 * the directory the tab was opened over while the reading of what an agent had spent was
 * looked up under the project root. For a tab over part of a bigger project those are
 * different directories, so the numbers belonged to another session, or to none.
 */
function placeOf(tab: Tab | undefined): string {
  return tab?.root ?? tab?.project?.root ?? shownDoc(tab)?.dir ?? tab?.docs[0]?.dir ?? ''
}

/**
 * `diff` is off for the first load of a file - every block would count as changed.
 * On a reload it is on, so the blocks the other writer touched can be flashed.
 * `doc.source` survives an unavailable file on purpose: when it reappears, the
 * diff is against what the user last saw, not against nothing.
 */
async function loadDoc(tab: Tab, doc: Doc, diff = false): Promise<void> {
  const reading = ++doc.reading
  const result = await window.api.readFile(doc.path)
  // A newer read of the same file has already been asked for; that one has the truth.
  if (doc.reading !== reading) return
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
async function confirmDiscard(docs: Doc[]): Promise<boolean> {
  const dirty = docs.filter(isDirty)
  if (dirty.length === 0) return true
  const names = dirty.map((doc) => baseName(doc.path)).join(', ')
  return (await ask(T('close.unsaved', { names }), 'close.discard')) === 0
}

/**
 * A tab with something running in it is not closed on one click. The cross sits a few
 * pixels from where a tab is dragged, and the thing behind it is an agent halfway
 * through a job - so this asks, while a tab that has finished still closes at once.
 */
async function confirmInterrupt(tab: Tab): Promise<boolean> {
  if (!interruptsWork(tab.activity)) return true
  const name = tab.name ?? baseName(shownDoc(tab)?.path ?? '')
  return (await ask(T('close.busy', { name }), 'close.stop')) === 0
}

/**
 * Every question this window asks, in its own frame rather than the system's. The
 * answer is the index of the button, and the last button is always the safe one -
 * which is where Escape and the keyboard start.
 */
function ask(message: string, goAhead: StringKey): Promise<number> {
  return askModal(modal, { message, buttons: [T(goAhead), T('close.cancel')] })
}

/*
 * The main process owns the window and the shells, so it is the side that knows a close
 * has to be asked about - but it has no typeface, no palette and no language. It sends
 * which question, and this draws it.
 */
window.api.onAsk(({ id, kind }) => {
  const question =
    kind === 'quit'
      ? ask(T('tray.quitAsk'), 'tray.quitConfirm')
      : ask(T('close.window'), 'close.stop')
  // Said before the answer: from here on the main process waits for a person.
  window.api.askDrawn(id)
  void question.then((answer) => window.api.answerAsk(id, answer))
})

/**
 * Closes a tab, asking first about anything running in it and anything unsaved.
 *
 * The questions take as long as a person takes, and the window keeps working while they
 * are up: another tab can be closed, tabs can be reordered. So the tab is held by
 * identity and its position is looked up again afterwards - the index this was called
 * with describes where the tab was, not which tab it is, and acting on the stale one
 * closed a tab nobody had asked about and threw away its unsaved files unasked.
 */
async function closeTab(index: number): Promise<void> {
  const tab = tabs[index]
  if (!tab) return
  if (!(await confirmInterrupt(tab))) return
  if (!(await confirmDiscard(tab.docs))) return
  const at = indexOfId(tab.id)
  // Somebody else closed it while the question was up; there is nothing left to do.
  if (at < 0) return
  for (const doc of tab.docs) unwatchUnlessOpenElsewhere(doc.path, doc)
  /*
   * The shell is ended by name rather than through the pane. After a rebuilt window only
   * the tab on screen has one, so a tab closed without ever having been looked at would
   * have left its shell running with nobody to show it and nobody to end it.
   */
  shells.get(tab.id)?.dispose()
  shells.delete(tab.id)
  window.api.terminal.kill(tab.id)
  signalReaders.delete(tab.id)
  urlReaders.delete(tab.id)
  const silence = silenceTimers.get(tab.id)
  if (silence) window.clearTimeout(silence)
  silenceTimers.delete(tab.id)
  tabs.splice(at, 1)
  if (tabs.length === 0) activeIndex = -1
  else if (at < activeIndex) activeIndex--
  else if (at === activeIndex) activeIndex = Math.min(at, tabs.length - 1)
  render()
  reportTaskbar()
  persistSession()
}

/**
 * Closes the file on screen. The tab itself goes only when its last file does, which is
 * what makes Ctrl+W safe to press without checking what else the place holds.
 */
async function closeDoc(): Promise<void> {
  const tab = tabs[activeIndex]
  const doc = shownDoc(tab)
  if (!tab || !doc) return
  if (tab.docs.length === 1) {
    await closeTab(activeIndex)
    return
  }
  if (!(await confirmDiscard([doc]))) return
  /*
   * By identity, not by position: the question can be answered long after it was asked,
   * and Ctrl+PageDown in the meantime would otherwise throw away a different file than
   * the one that was asked about.
   */
  const at = tab.docs.indexOf(doc)
  if (at < 0) return
  unwatchUnlessOpenElsewhere(doc.path, doc)
  const next = indexAfterClose(tab.docs.length, at, tab.docIndex)
  tab.docs.splice(at, 1)
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

/**
 * Moving a tab along the bar. What follows the tab is the whole place - its shell,
 * its files, its dev server - so this is only ever the order they are shown in, and
 * the tab you were looking at stays the tab you are looking at.
 */
function reorderTab(from: number, to: number): void {
  if (from === to || from < 0 || to < 0 || from >= tabs.length || to >= tabs.length) return
  const [moved] = tabs.splice(from, 1)
  if (!moved) return
  tabs.splice(to, 0, moved)

  activeIndex = activeAfterMove(activeIndex, from, to)

  paintTabs()
  persistSession()
}

/**
 * A new place, empty: the next file you open lands in it. Its shell is open from the
 * start, because a place is opened in order to work somewhere - and with nothing else
 * in the tab, the shell is the only thing there is to do. It starts in the home
 * directory, since an empty tab belongs to no project yet.
 */
/**
 * Another place, which starts as the one you are in - a shell in a directory is what a
 * second tab is usually wanted for, and a tab that is nowhere has no shell worth having
 * and nothing for `Ctrl+P` to search. `Ctrl+G` is how you go elsewhere.
 */
function newTab(): void {
  const here = tabs[activeIndex]
  const tab = createTab()
  tab.terminalOpen = true
  tab.root = here ? (here.root ?? shownDoc(here)?.dir ?? null) : null
  tab.project = here?.project ?? null
  activeIndex = tabs.indexOf(tab)
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
  if (current && isSeen(current)) {
    applyActivity(current, { type: 'seen' })
    acknowledge()
  }

  paintTabs()

  const tab = tabs[activeIndex]
  const doc = shownDoc(tab)
  /*
   * Before the branch below, because the branch returns. A tab over a directory has no
   * document and used to leave the field showing the last tab's half-written prompt -
   * which Ctrl+Enter then sent to this tab's agent, and the first keystroke afterwards
   * saved over whatever this tab had been composing.
   */
  if (tab && promptInput.value !== tab.prompt) promptInput.value = tab.prompt
  if (!tab || !doc) {
    content.hidden = true
    content.textContent = ''
    raw.hidden = true
    raw.value = ''
    viewer.classList.remove('showing-raw')
    empty.hidden = false
    status.textContent = T('status.noFile')
    document.title = 'Project Console'
    applyLayout()
    // A place with no file in it still has its shell - and now that a new tab opens
    // with one, this is the only path that reaches it.
    ensureShell()
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

  if (showRaw) raw.scrollTop = doc.rawScrollTop
  else viewer.scrollTop = doc.scrollTop
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
  title.textContent = T('doc.unavailable.title')
  const path = document.createElement('code')
  path.textContent = doc.path
  const message = document.createElement('p')
  message.textContent = doc.error ?? ''
  const hint = document.createElement('p')
  hint.className = 'muted'
  hint.textContent = T('doc.unavailable.hint')

  box.append(title, path, message, hint)
  content.append(box)
}

/**
 * The status bar carries the state of the buffer, which is why the raw view needs no
 * bar of its own: unsaved work, a file that moved underneath it, and a truncated read
 * are all things you must be able to see without a new row of chrome.
 */
function renderStatus(tab: Tab, doc: Doc): void {
  /*
   * Something has been said that a repaint must not wipe. A file event repaints on its
   * own, so a message about a save that did not happen could be gone before it was read.
   */
  if (holdStatus) return
  if (doc.error) {
    status.textContent = doc.path + '  ·  ' + T('status.unavailable')
    return
  }
  const parts = [doc.path]
  /*
   * With no strip of open files anywhere, this is the only place that says how many a
   * tab holds and which one you are on. Shown from two upwards; with one there is
   * nothing to count.
   */
  if (tab.docs.length > 1) {
    parts.push(T('status.openHere', { index: tab.docIndex + 1, count: tab.docs.length }))
  }
  if (doc.raw) parts.push(T(doc.truncated ? 'status.truncated' : 'status.raw'))
  if (doc.draft !== null) parts.push(T('status.unsaved'))
  if (doc.staleOnDisk) parts.push(T('status.stale'))
  if (doc.draft === null && !doc.staleOnDisk) {
    parts.push(
      T('status.updated', {
        time: doc.updatedAt ? new Date(doc.updatedAt).toLocaleTimeString() : '-'
      })
    )
    parts.push(T('status.watching'))
  }
  status.textContent = parts.join('  ·  ')
}

/**
 * True while the window is being built from the session file.
 *
 * Restoring reads files and looks for projects, so it takes long enough for the
 * four-hundred-millisecond delay on saving to expire in the middle of it - and what was
 * saved then was a window half built: tabs without their directory, without their
 * layout, and the tabs not reached yet missing altogether. A crash or a quit at that
 * moment wrote that over the real thing. Nothing is saved until the window is whole.
 */
let restoring = false

/**
 * While true, the status bar keeps what it has been told rather than being redrawn from
 * the document. Cleared by the next thing a person does, since that is when they have
 * seen it - a timer would either be too short to read or long enough to lie.
 */
let holdStatus = false

/** Say something the next repaint must not take away. */
function insist(message: string): void {
  status.textContent = message
  holdStatus = true
}

function persistSession(): void {
  if (restoring) return
  /*
   * A place is worth remembering even with nothing open in it, and so is a tab holding a
   * shell - whatever runs in one is the work, and a tab left out of the file is a tab
   * whose shell nobody claims after a rebuild, which ends it. An empty box is neither.
   */
  const worth = tabs.filter((tab) => tab.docs.length > 0 || tab.root !== null || tab.terminalOpen)
  window.api.saveSession({
    tabs: worth
      .map((tab) => ({
        id: tab.id,
        files: tab.docs.map((doc) => doc.path),
        active: shownDoc(tab)?.path ?? null,
        /*
         * Unsaved edits go with the tab. They are work, like the prompt beside them, and
         * a window that has to be rebuilt used to take them with it without a word - the
         * guard against closing over one does not stop a rebuild, and after a crash there
         * is nobody left to ask. One too long for the file stays on screen and unsaved;
         * losing the end of it quietly would be worse than not keeping it.
         */
        drafts: Object.fromEntries(
          tab.docs
            .filter((doc) => doc.draft !== null && doc.draft.length <= MAX_DRAFT)
            .map((doc) => [doc.path, doc.draft as string])
        ),
        name: tab.name,
        pane: {
          terminal: tab.terminalOpen,
          ratio: tab.ratio,
          run: tab.runCommand,
          web: tab.webUrl,
          rightMode: tab.rightMode,
          rightRatio: tab.rightRatio,
          webManual: tab.webManual,
          prompt: tab.prompt,
          promptOpen: tab.promptOpen,
          root: tab.root
        }
      })),
    // An index into what is being written, not into what is on screen: the two differ
    // whenever an empty box sits in front of the tab you are in.
    activeTab: Math.max(worth.indexOf(tabs[activeIndex]), 0)
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
  for (const found of findDocs(path)) await reloadDoc(found)
}

async function reloadDoc(found: Found): Promise<void> {
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
  const found = findDocs(path)
  if (found.length === 0) return
  if (type !== 'unlink') {
    scheduleReload(path)
    return
  }
  let showing = false
  for (const entry of found) {
    entry.doc.error = T('doc.gone')
    entry.doc.html = ''
    showing ||= isShowing(entry)
  }
  if (showing) render()
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
    [T('tab.rename'), () => startRename(index)],
    ['Reload', () => void (doc && reloadPath(doc.path))],
    [T('tab.closeFile'), () => void closeDoc()],
    ['Close tab', () => void closeTab(index)],
    [T('tab.closeOthers'), () => void closeOthers(index)],
    [
      T('tab.copyPath'),
      () => void (doc && navigator.clipboard.writeText(doc.path).catch(() => undefined))
    ],
    [T('tab.reveal'), () => void (doc && window.api.reveal(doc.path))]
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

async function closeOthers(keep: number): Promise<void> {
  const kept = tabs[keep]
  if (!kept) return
  const asked = tabs.filter((tab) => tab !== kept)
  // Several tabs at once: one question about all of them, not one each.
  const busy = asked.filter((tab) => interruptsWork(tab.activity)).length
  if (busy > 0 && (await ask(T('close.busyMany', { count: busy }), 'close.stop')) !== 0) return
  if (!(await confirmDiscard(asked.flatMap((tab) => tab.docs)))) return
  /*
   * Only what was asked about: a tab opened while the question was up was never part of
   * it, and sweeping the whole list closed it without a word - along with whatever had
   * been started in it.
   */
  const going = asked.filter((tab) => tabs.includes(tab))
  if (!tabs.includes(kept)) return
  // Removed first, so a file open in two of them is not read as "open elsewhere".
  tabs.splice(0, tabs.length, ...tabs.filter((tab) => !going.includes(tab)))
  for (const tab of going) {
    for (const doc of tab.docs) unwatchUnlessOpenElsewhere(doc.path, doc)
    shells.get(tab.id)?.dispose()
    shells.delete(tab.id)
    window.api.terminal.kill(tab.id)
    signalReaders.delete(tab.id)
    urlReaders.delete(tab.id)
    const silence = silenceTimers.get(tab.id)
    if (silence) window.clearTimeout(silence)
    silenceTimers.delete(tab.id)
  }
  activeIndex = tabs.indexOf(kept)
  render()
  reportTaskbar()
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

raw.addEventListener('scroll', () => {
  const doc = shownDoc(tabs[activeIndex])
  if (doc) doc.rawScrollTop = raw.scrollTop
})

/* ---------- find in document ---------- */

let matches: Range[] = []
/**
 * The plain-text pane cannot be searched the same way: the custom highlight API paints
 * text nodes, and the text inside a textarea is not one. Offsets into its value and its
 * own selection do the job instead - which is also what you want when the next thing
 * you do is edit the line you were looking for.
 */
let rawMatches: TextRange[] = []
let matchIndex = -1

const searchingRaw = (): boolean => !raw.hidden

function showMatch(): void {
  const total = searchingRaw() ? rawMatches.length : matches.length
  findCount.textContent = total === 0 ? '0/0' : matchIndex + 1 + '/' + total

  if (searchingRaw()) {
    const found = rawMatches[matchIndex]
    if (!found) return
    /*
     * The selection is set so that leaving the search puts the caret on the match, but
     * Chromium paints no selection in a field that does not have focus - and focus has
     * to stay in the search box, or Enter would type into the file instead of stepping.
     * So the match is reported in words instead: which line, and what it says.
     */
    raw.setSelectionRange(found.start, found.end)
    revealRaw(found.start)
    const at = lineAt(raw.value, found.start)
    status.textContent = at.line + ': ' + at.content.trim().slice(0, 120)
    return
  }

  paintMatches(matches, matchIndex)
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
  matches = query && !searchingRaw() ? findInElement(content, query) : []
  rawMatches = query && searchingRaw() ? matchRanges(raw.value, query) : []
  const total = searchingRaw() ? rawMatches.length : matches.length
  if (total === 0) matchIndex = -1
  else if (fromStart || matchIndex < 0) matchIndex = 0
  else matchIndex = Math.min(matchIndex, total - 1)
  showMatch()
}

function stepFind(delta: number): void {
  const total = searchingRaw() ? rawMatches.length : matches.length
  if (total === 0) return
  matchIndex = stepIndex(matchIndex, total, delta)
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
  rawMatches = []
  matchIndex = -1
  // Back to what was being searched, so the caret is where the last match left it.
  if (searchingRaw()) raw.focus()
  else viewer.focus()
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

/* ---------- what the session has used ---------- */

/**
 * Read from the transcript Claude Code keeps anyway, so watching costs the session
 * nothing. Polled rather than watched: the file is appended to constantly while an
 * agent works, and a status bar that repaints on every line is worse than one that
 * is a few seconds behind.
 */
const USAGE_POLL_MS = 4000



/**
 * Which reading is the current one.
 *
 * Two of these can be in flight at once - the timer and every repaint start one - and
 * the older answer arriving last used to win, putting one tab's numbers under another
 * tab's name. The pattern is the same as the one guarding the place dialog.
 */
let usageQuery = 0

async function refreshUsage(): Promise<void> {
  const tab = tabs[activeIndex]
  const ticket = ++usageQuery
  if (!tab || !shells.has(tab.id)) {
    usageLabel.hidden = true
    usageLabel.textContent = ''
    return
  }
  /*
   * While the window is behind something there is no point reading the file again,
   * but whatever it last said stays on screen: a readout that blanks itself the
   * moment you look away is worse than one that is a minute stale. The same goes for
   * a read that comes back empty - between two turns there is nothing new to find.
   */
  if (!document.hasFocus()) return

  const usage = await window.api.readUsage(placeOf(tab))
  /*
   * Nothing to show, and the old value stays: between two turns there is nothing new to
   * find and a readout that blanks itself is worse than one a minute old. A reading for
   * a tab nobody is looking at any more is thrown away instead.
   */
  if (!usage || ticket !== usageQuery || tabs[activeIndex] !== tab) return

  usageLabel.hidden = false
  usageLabel.textContent =
    T('usage.context', { tokens: formatTokens(usage.contextTokens) }) +
    '  ·  ' +
    T('usage.out', { tokens: formatTokens(usage.outputTokens) })
  usageLabel.title = T('usage.title', { model: usage.model ?? 'claude' })
}

window.setInterval(() => void refreshUsage(), USAGE_POLL_MS)

/**
 * How much of the subscription is gone. This belongs to the account rather than to
 * any tab, so it is shown whatever is on screen - and it is what turns a refusal
 * later in the day from a surprise into something you saw coming.
 *
 * Read through the main process, which holds the token; the renderer only ever sees
 * the two percentages.
 */
const LIMITS_POLL_MS = 60000

/** One gauge: a label, a bar that fills as the window is spent, and the number. */
function meter(
  label: string,
  percent: number,
  resetsAt: string | null,
  now: number,
  readAt?: number
): HTMLElement {
  const wrap = document.createElement('span')
  wrap.className = 'meter ' + limitLevel(percent)

  const name = document.createElement('span')
  name.textContent = label

  const track = document.createElement('span')
  track.className = 'meter-track'
  const fill = document.createElement('span')
  fill.className = 'meter-fill'
  fill.style.width = Math.max(0, Math.min(100, percent)) + '%'
  track.append(fill)

  const value = document.createElement('span')
  value.className = 'meter-value'
  value.textContent = Math.round(percent) + '%'

  const left = timeUntil(resetsAt, now)
  wrap.title =
    T(label === '5h' ? 'limits.window' : 'limits.week') +
    ': ' +
    T('limits.used', { percent: Math.round(percent) }) +
    (left ? T('limits.resetsIn', { time: left }) : '') +
    // A kept reading says so rather than passing for the number as it stands now.
    (readAt ? T('limits.readAt', { time: new Date(readAt).toLocaleTimeString() }) : '')

  wrap.append(name, track, value)
  return wrap
}

async function refreshLimits(): Promise<void> {
  /*
   * No focus check here, unlike the session readout. This is one cached call a
   * minute, and the number matters most in the moment you come back to a window you
   * left an agent working in - which is exactly when a focus-gated read would still
   * be showing nothing.
   */
  const plan = await window.api.readPlanUsage()
  if (!plan) return

  const now = Date.now()
  const gauges: HTMLElement[] = []
  // Only a reading kept from before carries a time; a current one has nothing to add.
  const readAt = plan.readAt && now - plan.readAt > LIMITS_POLL_MS ? plan.readAt : undefined
  if (plan.windowPercent !== null) {
    gauges.push(meter('5h', plan.windowPercent, plan.windowResetsAt, now, readAt))
  }
  if (plan.weekPercent !== null) {
    gauges.push(meter('7d', plan.weekPercent, plan.weekResetsAt, now, readAt))
  }
  if (gauges.length === 0) return

  limitsLabel.textContent = ''
  limitsLabel.append(...gauges)
  limitsLabel.hidden = false
  limitsLabel.title = T('limits.note')
}

window.setInterval(() => void refreshLimits(), LIMITS_POLL_MS)
void refreshLimits()

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
  // When this run started, noted before the state moves on: output that arrives while
  // nothing was running is the beginning of one.
  const now = Date.now()
  if (event.type === 'output' && tab.activity !== 'working' && tab.activity !== 'busy') {
    tab.runFrom = now
  }

  const next = nextActivity(tab.activity, event)
  if (next === tab.activity) return

  const ranFor = tab.runFrom === null ? 0 : now - tab.runFrom
  const sinceCommand = tab.commandAt === null ? null : now - tab.commandAt
  if (countsAsFinished(tab.activity, next, ranFor, sinceCommand)) {
    tab.finished = true
    /*
     * Spent only once it has actually reported something. A run that settled in front of
     * you needed no report, and the command may well still be running - the sleep in the
     * middle of it is quiet enough to look finished twice over.
     */
    if (!isSeen(tab)) tab.commandAt = null
  }
  /*
   * Output starting again does not undo it. One command is two runs whenever it is quiet
   * in the middle - the line being echoed, then the prompt coming back six seconds later
   * - and clearing on the second one threw away the notification the first had earned.
   * What the badge says is "something happened here that you have not seen", and more
   * output does not make that less true. Only being in the tab does.
   */
  if (isSeen(tab)) tab.finished = false
  tab.activity = next
  paintTabs()
  reportTaskbar()
}

/**
 * Being in a tab is the acknowledgement, so the number drops by one as you go through
 * them. Looking at the window used to forget every tab at once, which meant three
 * finished runs were written off by glancing at one of them.
 */
function acknowledge(): void {
  const tab = tabs[activeIndex]
  if (!tab || !tab.finished || !isSeen(tab)) return
  tab.finished = false
  paintTabs()
  reportTaskbar()
}

/**
 * The window's own signal, for when it is behind something. Nothing is reported while
 * the window has focus: whatever the tabs are saying is already on screen.
 */
/**
 * What the tray shows and says. The count goes on its icon and into its tooltip, so a
 * window that is out of the way still reports what it is holding.
 */
function dressTray(waiting: Attention | null): void {
  /*
   * An agent in any tab is what makes closing the window mean hiding it. Idle counts:
   * a session sitting at its prompt is work in progress too, and it is the state of
   * the tab that says so, not whether anything is moving right now.
   */
  const holds = tabs.some((tab) => tab.reporting)
  const text: Record<string, string> = {
    show: T('tray.show'),
    quit: T('tray.quit'),
    quitAsk: T('tray.quitAsk'),
    quitConfirm: T('tray.quitConfirm'),
    cancel: T('tray.cancel'),
    closeAsk: T('close.ask'),
    closeQuit: T('close.quit'),
    closeKeep: T('close.keep')
  }
  const tooltip = waiting
    ? 'Project Console - ' + T('tray.waiting', { count: waiting.count })
    : 'Project Console'
  void paintTray(waiting, text, tooltip, holds)
}

function reportTaskbar(): void {
  const signals = tabs.map((tab) => ({
    state: shownActivity(tab.activity, tab.reporting),
    // A shell that never spoke for itself has not finished anything worth counting.
    finished: tab.finished && tab.reporting
  }))
  /*
   * The number is a counter, not a notification: it says how many places are still
   * waiting, so it is true whether or not the window is in front of you - that is what
   * makes it drop by one as you visit them. The tint and the flash below are the
   * notification, and those are only for a window nobody is looking at.
   */
  const waiting = attention(signals)
  void paintTaskbarIcon(waiting)
  const away = !document.hasFocus()
  // The tray carries it too: a hidden window has no button for it to sit on.
  void dressTray(waiting)

  const next = away ? aggregateActivity(signals) : 'none'
  if (next === reportedTaskbar) return
  reportedTaskbar = next
  window.api.setTaskbarState(next)
}

window.addEventListener('focus', () => {
  // Coming back acknowledges the tab you come back to, and only that one.
  acknowledge()
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
  const tab = tabs[index]
  if (tab && !tab.reporting && (signals.agent || signals.progress !== null)) {
    tab.reporting = true
    paintTabs()
    // From here on the cross means hiding rather than quitting.
    reportTaskbar()
  }
  applyActivity(tabs[index], { type: 'output', signals })
  scheduleSilence(tabs[index])
})

window.api.terminal.onExit(({ id, exitCode }) => {
  const index = indexOfId(id)
  if (index < 0) return
  const tab = tabs[index]
  /*
   * Whatever was speaking for itself in there has stopped speaking. Left standing, this
   * flag told the main process an agent was still in the window - and an agent in the
   * window means closing it hides it instead, so the application could no longer be
   * closed by its own cross for the rest of the session.
   */
  tab.reporting = false
  applyActivity(tab, { type: 'exit', code: exitCode })
  reportTaskbar()
})

/* ---------- shortcut help ---------- */

/** Built on demand, and rebuilt whenever the language it is written in changes. */
function paintHelp(): void {
  renderShortcuts(help, lang, {
    intro: T('help.intro'),
    heading: T('help.heading'),
    notes: T('help.notes'),
    close: T('help.close')
  })
}

/**
 * Focus moves into the panel while it is open, so Esc closes it instead of being
 * swallowed by whatever runs in the shell.
 */
function toggleHelp(): void {
  if (help.hidden) {
    if (!help.firstChild) paintHelp()
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
  if (!place.hidden && !place.contains(target)) closePlace()
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
  const mode = tab?.rightMode ?? 'doc'

  const showShell = shellOpen && (zoom === null || zoom === 'terminal')
  const showDoc = zoom === null ? mode !== 'web' : zoom === 'document'
  const showWeb = zoom === null ? mode !== 'doc' : zoom === 'web'

  terminalPane.hidden = !showShell
  promptPane.hidden = !showShell || tab?.promptOpen !== true
  viewer.hidden = !showDoc
  webPane.hidden = !showWeb
  rightArea.hidden = !showDoc && !showWeb
  // A divider only earns its place between two panes that are both on screen.
  splitter.hidden = !showShell || rightArea.hidden
  rightSplitter.hidden = !showDoc || !showWeb

  shellButton.classList.toggle('active', shellOpen)
  /*
   * Offered even with no address yet: the field to type one into lives inside the pane,
   * so hiding the pane until an address exists left no way to enter the first one. A
   * server started somewhere other than the Run button announces itself to nobody.
   */
  webButton.hidden = !tab
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
  void refreshUsage()
}

/**
 * Throw away the element and put a fresh one in its place, with nothing loaded in it.
 *
 * This is the only way back from a page that died: the crashed element cannot be given
 * an address again, and it cannot be repaired. Everything about the pane other than the
 * page - the address bar, the layout, which tab is showing - is untouched by it.
 */
function replaceWebFrame(): void {
  const fresh = document.createElement('webview') as WebviewTag
  fresh.id = 'web-frame'
  fresh.title = webFrame.title
  fresh.setAttribute('partition', WEB_PARTITION)
  webFrame.replaceWith(fresh)
  webFrame = fresh
  webFrameUrl = null
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

  /*
   * No address in this tab means nothing to show; a page from the last one would lie.
   * Emptying it means throwing the element away, because dropping the attribute leaves
   * a webview showing whatever it already had - a frame would have gone blank.
   */
  if (tab.webUrl === null) {
    if (webFrameUrl !== null) replaceWebFrame()
    return
  }

  // Only load when the address really changes; otherwise every repaint reloads the page.
  if (!webPane.hidden && !tab.webBroken && webFrameUrl !== tab.webUrl) {
    webFrame.setAttribute('src', tab.webUrl)
    webFrameUrl = tab.webUrl
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
  /*
   * A different address printed while this tab's page is on screen does not replace it.
   * A dev server announces itself once; everything after that is an agent or a log
   * mentioning a URL, and taking those threw away the running application to show a path
   * nobody asked for, or a port with nothing behind it. It is said out loud instead, so
   * an address worth having is one keystroke away rather than lost.
   *
   * With nothing on screen there is nothing to lose, so the newest address wins - which
   * is what keeps a server restarted onto another port from leaving the pane pointing at
   * the old one. A deliberate run is handled below: that is somebody asking to look.
   */
  const showing = tab.webUrl !== null && tab.rightMode !== 'doc' && !tab.webBroken
  if (!manual && !tab.awaitingServer && showing && url !== tab.webUrl) {
    if (tab === tabs[activeIndex]) status.textContent = T('web.another', { url })
    return
  }
  if (manual) tab.webManual = true
  // An address given on purpose is a request to see it, whatever happened here before.
  if (manual) tab.webBroken = false
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
    // A fresh run is a fresh page; whatever the last one did to itself is history.
    tab.webBroken = false
    if (tab.rightMode === 'doc') tab.rightMode = 'web'
    tab.zoom = null
    /*
     * A fresh run means a fresh server, so the previous page does not stay - but the
     * element is shared by every tab, and throwing it away for a tab nobody is looking at
     * blanked the page somebody was. The tab on screen gets a new element; a tab in the
     * background gets one when it comes back, since nothing of it is on screen to keep.
     */
    if (tab === tabs[activeIndex]) replaceWebFrame()
    else webFrameUrl = null
  } else if (!isNew) {
    return
  }

  persistSession()
  if (tab === tabs[activeIndex]) applyLayout()
}

/** Document, dev server, both - one key, in that order. */
function cycleRight(): void {
  const tab = tabs[activeIndex]
  if (!tab) return
  tab.rightMode = nextRightMode(tab.rightMode, tab.webUrl !== null)
  tab.zoom = null
  applyLayout()
  persistSession()
  // An empty pane is a question, so the field that answers it takes the keyboard.
  if (!tab.webUrl && !webPane.hidden) {
    webUrlInput.focus()
    webUrlInput.select()
  }
}

webButton.addEventListener('click', cycleRight)

document.getElementById('web-reload')?.addEventListener('click', () => {
  const tab = tabs[activeIndex]
  const url = tab?.webUrl
  if (!tab || !url) return
  // Asking for it again is the way back from a page that died in its own process.
  tab.webBroken = false
  /*
   * A real reload, which a frame had no way to ask for: the address used to be given a
   * changing query parameter to force one, so every reload showed the dev server a URL
   * it had never seen. This asks the page to load again, and puts it back when the page
   * is not there any more - after a crash, or before it was ever shown.
   */
  if (webFrameUrl === url) webFrame.reload()
  else {
    webFrame.setAttribute('src', url)
    webFrameUrl = url
  }
})

/*
 * The page died in its own process. Nothing here is broken by that, which is the whole
 * point of the arrangement - but the pane goes white, and a white pane that says nothing
 * is the kind of thing that gets blamed on the application around it.
 */
window.api.onWebGone(() => {
  /*
   * The element is dead from here on: it is thrown away at once, because the next
   * repaint would otherwise hand it an address and take the application with it. The tab
   * it was showing is marked so the page is not loaded again until asked for - a page
   * that dies on load would otherwise be reloaded for as long as the tab lived.
   *
   * The tab it was showing is the tab on screen: the element is shared and only ever
   * holds the active tab's page. Looking for whichever tab happened to hold that address
   * marked the wrong one when two of them pointed at the same port, and any tab at all
   * when the address had already been cleared.
   */
  const tab = tabs[activeIndex]
  if (tab) tab.webBroken = true
  replaceWebFrame()
  status.textContent = T('web.gone')
})

webUrlInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return
  const tab = tabs[activeIndex]
  if (!tab) return
  const url = normalizeUrl(webUrlInput.value)
  window.api.note('an address was typed: ' + webUrlInput.value + ' -> ' + String(url))
  if (!url) {
    webUrlInput.value = tab.webUrl ?? ''
    status.textContent = T('web.onlyLocal')
    return
  }
  setWebUrl(tab, url, true)
  if (tab.rightMode === 'doc') tab.rightMode = 'web'
  applyLayout()
  persistSession()
})

/** Start the shell of the active tab if it is meant to be open but has none yet. */
/**
 * Whether this tab has a pane with a shell behind it.
 *
 * A pane whose shell has ended stays on screen on purpose - the last thing it printed is
 * worth reading - but it is not a shell any more, and every path that asks "is there one
 * here" was answered yes by it. That is how a tab became one where Run did nothing, keys
 * went nowhere and a composed prompt was swallowed, with no way back but closing it.
 */
function hasShell(tab: Tab): boolean {
  const pane = shells.get(tab.id)
  return pane !== undefined && !pane.isDead()
}

function ensureShell(): void {
  const tab = tabs[activeIndex]
  /*
   * Only when there is no pane at all. A pane whose shell has ended keeps its last
   * screen - typing `exit` is something people mean - and it is `openShell`, reached by
   * asking for a shell rather than by repainting, that builds a new one.
   */
  if (tab && tab.terminalOpen && !shells.has(tab.id)) void openShell(tab)
}

async function openShell(tab: Tab): Promise<void> {
  let pane = shells.get(tab.id)
  /*
   * A pane that outlived its shell is thrown away and built again, which is what makes
   * a shell that ended by itself something you can come back from.
   */
  if (pane?.isDead()) {
    pane.dispose()
    shells.delete(tab.id)
    pane = undefined
  }
  if (!pane) {
    // The chosen place first: a file opened in it does not move the tab somewhere else.
    const cwd = placeOf(tab)
    pane = new TerminalPane(
      tab.id,
      cwd,
      darkQuery.matches,
      terminalFont,
      (path, line) => void openFromTerminal(path, line),
      () => {
        tab.commandAt = Date.now()
      }
    )
    // Registered before the await so a second call cannot spawn a second shell.
    shells.set(tab.id, pane)
    applyLayout()
  }
  /*
   * Outside the branch above, so a caller who finds a pane that is still starting waits
   * for it too. That is what makes "the shell is ready" true when this returns, which
   * Run and the prompt drawer both rely on - they used to be told yes and write into
   * nothing.
   */
  const error = await pane.start(termHosts)
  if (error) status.textContent = T('shell.failed', { error })
  /*
   * Whether this pane belongs on screen is decided by which tab is on screen now, not by
   * which one was when the shell was asked for. Starting a shell takes long enough for
   * that to have changed - at startup it always has, since every restored tab with a
   * shell open asks for one and only the last of them is the tab you end up in.
   *
   * It used to show itself here regardless, which left two terminals on top of each
   * other: the one belonging to the tab you were in, and one from a tab you were not.
   * What was on top was whatever finished last, so the pane could show an agent that
   * belonged to somewhere else entirely - and the next repaint, a typed address for
   * instance, would put the right one back and look exactly like the agent had died.
   */
  if (tabs[activeIndex]?.id !== tab.id) {
    applyLayout()
    return
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
  /*
   * The drawer sits inside the shell pane but outside the terminal, so asking the
   * terminal was answered no and everything - zoom, the divider keys - acted on the
   * document instead. Blowing up the document while typing a prompt took the drawer off
   * the screen under the writer's hands.
   */
  if (document.activeElement === promptInput) return 'terminal'
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
    const which = command.index === 1 ? 'terminal' : command.index === 2 ? 'document' : 'web'
    // Asking to go somewhere is asking to see it; a pane out of sight is not an answer.
    showPane(tab, which)
    applyLayout()
    focusPane(which)
    persistSession()
    return
  }
  if (command.type === 'web') {
    cycleRight()
    return
  }
  if (command.type === 'prompt') {
    togglePrompt()
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
  runButton.title = T('run.title', {
    command: command ?? T('run.choose'),
    root: project.root
  })
  shellProject.textContent =
    (project.name ?? project.kind) +
    '  ·  ' +
    (command ?? T('run.ways', { count: project.commands.length }))
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
  const pane = shells.get(tab.id)
  if (!pane || pane.isDead()) {
    /*
     * Said out loud rather than written into a shell that is not there. The flags stay
     * unset too: awaitingServer left behind would make the next address printed anywhere
     * in this tab take over the pane, long after the run it belonged to.
     */
    status.textContent = T('run.noShell')
    return
  }
  tab.awaitingServer = true
  tab.webManual = false
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

/* ---------- the prompt buffer ---------- */

/**
 * A drawer under the shell for composing a longer instruction. It belongs to the shell,
 * so opening it opens the shell too - there would be nowhere to send anything otherwise -
 * and what is in it is remembered per tab, like everything else about a place.
 */
function togglePrompt(): void {
  const tab = tabs[activeIndex]
  if (!tab) return
  tab.promptOpen = !tab.promptOpen
  if (tab.promptOpen && !tab.terminalOpen) {
    tab.terminalOpen = true
    void openShell(tab)
  }
  // A zoomed pane hides the shell, and with it the drawer; the split comes back.
  if (tab.promptOpen) tab.zoom = null
  applyLayout()
  if (tab.promptOpen) promptInput.focus()
  else shells.get(tab.id)?.focus()
  persistSession()
}

/**
 * Into the shell, and then submitted. A shell that is not running yet is started first,
 * which is the case for a tab whose drawer was open when the app last closed.
 */
async function sendPrompt(): Promise<void> {
  const tab = tabs[activeIndex]
  if (!tab) return
  const text = sendable(promptInput.value)
  if (text === null) {
    status.textContent = T('prompt.empty')
    return
  }
  if (!tab.terminalOpen) tab.terminalOpen = true
  if (!hasShell(tab)) await openShell(tab)
  const pane = shells.get(tab.id)
  if (!pane || !pane.sendPrompt(text)) {
    // Nowhere to send it: the text stays where it is, which is the whole point of it.
    status.textContent = T('prompt.noShell')
    return
  }
  /*
   * Cleared, because a sent prompt is spent: it is in the shell's own history now, and a
   * buffer that keeps it would send it twice as easily as once.
   */
  promptInput.value = ''
  tab.prompt = ''
  persistSession()
}

promptInput.addEventListener('input', () => {
  const tab = tabs[activeIndex]
  if (!tab) return
  if (promptInput.value.length > MAX_PROMPT) promptInput.value = promptInput.value.slice(0, MAX_PROMPT)
  tab.prompt = promptInput.value
  persistSession()
})

promptInput.addEventListener('keydown', (event) => {
  // Plain Enter is a newline: composing something multi-line is the whole point.
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    void sendPrompt()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    togglePrompt()
  }
})

promptSend.addEventListener('click', () => void sendPrompt())

/* ---------- typing where a tab should be ---------- */

/**
 * The place prompt: `~/source/project` typed in two seconds rather than clicked through
 * three panels of a system dialog. Directories are how projects are named out loud, so
 * naming them is the fast path; the folder picker stays for the times you are looking
 * rather than remembering.
 */
type PlaceRow = { path: string; label: string; note: string | null }

let placeRows: PlaceRow[] = []
let placeIndex = 0
let placeHome = ''
/** Whether the selection was moved by hand, which makes the row the deliberate answer. */
let placeMoved = false
/** Which request the rows belong to, so a slow answer cannot overwrite a fast one. */
let placeQuery = 0

function placeBase(tab: Tab | undefined): string {
  return tab?.root ?? shownDoc(tab)?.dir ?? ''
}

function openPlace(): void {
  const tab = tabs[activeIndex]
  placeInput.value = ''
  placeInput.placeholder = T('place.placeholder')
  placeRows = []
  placeIndex = 0
  placeMoved = false
  place.hidden = false
  placeNote.textContent = placeBase(tab) || T('place.title')
  renderPlace()
  placeInput.focus()
  void refreshPlace()
}

function closePlace(): void {
  place.hidden = true
  placeList.textContent = ''
  placeRows = []
}

/**
 * What has been typed, as rows to choose from: the directories inside the part of the
 * path that is already named, and - for a bare word - what zoxide would jump to.
 */
async function refreshPlace(): Promise<void> {
  const tab = tabs[activeIndex]
  const typed = placeInput.value
  const { parent, partial } = splitTyped(typed)
  const base = placeBase(tab)
  const ticket = ++placeQuery

  const parentPath = expandPath(parent === '' ? '.' : parent, { home: placeHome, base }) ?? base
  const suggestions = await window.api.suggestPlaces(parentPath, parent === '' ? partial : '')
  if (place.hidden || ticket !== placeQuery) return
  placeHome = suggestions.home

  const inside = matchDirs(suggestions.dirs, partial).map((name) => ({
    path: parentPath + '/' + name,
    label: name,
    note: null
  }))
  /*
   * zoxide is asked only for a bare word, because that is the case it answers: once a
   * path has a slash in it, what is meant is that path and nothing else.
   */
  const frecent = suggestions.frecent
    .map((path) => path.split('\\').join('/'))
    .filter((path) => !inside.some((row) => row.path.toLowerCase() === path.toLowerCase()))
    .map((path) => ({ path, label: path, note: T('place.frecent') }))

  placeRows = [...inside, ...frecent].slice(0, 40)
  placeIndex = Math.min(placeIndex, Math.max(placeRows.length - 1, 0))
  renderPlace()
}

function renderPlace(): void {
  placeList.textContent = ''
  const target = expandPath(placeInput.value, { home: placeHome, base: placeBase(tabs[activeIndex]) })
  placeNote.textContent = target ?? T('place.hint')

  placeRows.forEach((row, index) => {
    const item = document.createElement('li')
    item.className = 'palette-row'
    if (index === placeIndex) item.classList.add('selected')

    const name = document.createElement('span')
    name.className = 'palette-name'
    name.textContent = row.label
    item.append(name)

    if (row.note) {
      const note = document.createElement('span')
      note.className = 'palette-where'
      note.textContent = row.note
      item.append(note)
    }

    item.addEventListener('mousedown', (event) => {
      event.preventDefault()
      void goToPlace(row.path)
    })
    placeList.append(item)
  })
}

/** Tab completes to the highlighted directory and keeps typing from there. */
function completePlace(): void {
  const row = placeRows[placeIndex]
  if (!row) return
  const { parent } = splitTyped(placeInput.value)
  /*
   * A row from zoxide is a whole path of its own, not a name inside what was typed, so
   * it replaces the field rather than being appended to it.
   */
  const absolute = row.note !== null
  placeInput.value = absolute ? row.path + '/' : (parent === '' ? '' : parent) + row.label + '/'
  placeIndex = 0
  placeMoved = false
  void refreshPlace()
}

/**
 * Enter: the row if it was pointed at, the field if it names a directory, and otherwise
 * whatever the field was a prefix of. `chooseTarget` holds the order and the reasons.
 */
async function enterPlace(): Promise<void> {
  const typed = expandPath(placeInput.value, {
    home: placeHome,
    base: placeBase(tabs[activeIndex])
  })
  /*
   * Read before the question below, not inside the object it belongs to: the properties
   * of a literal are worked out in order, so the row was being read after the await -
   * long enough for a slower list of suggestions to arrive and put a different path at
   * the same index. Then Enter opened a directory the cursor had never been on.
   */
  const row = placeRows[placeIndex]?.path ?? null
  const target = chooseTarget({
    typed,
    typedIsDirectory: typed !== null && (await window.api.isDirectory(typed)),
    row,
    moved: placeMoved
  })
  if (place.hidden) return
  if (target === null) {
    placeNote.textContent = T('place.missing')
    return
  }
  await goToPlace(target)
}

/**
 * One level up, so a tree can be walked rather than typed: down the list with the
 * arrows, in with Tab, out with Shift+Tab. What is climbed is the directory being
 * listed, so a half-typed name is simply left behind, which is what going up means.
 */
function upPlace(): void {
  const base = placeBase(tabs[activeIndex])
  const { parent } = splitTyped(placeInput.value)
  const listed = expandPath(parent === '' ? '.' : parent, { home: placeHome, base })
  if (listed === null) return
  const above = parentOf(listed)
  placeInput.value = shorten(above, placeHome).replace(/\/+$/, '') + '/'
  placeIndex = 0
  placeMoved = false
  void refreshPlace()
}

async function goToPlace(path: string): Promise<void> {
  if (!(await window.api.isDirectory(path))) {
    placeNote.textContent = T('place.missing')
    return
  }
  closePlace()
  await useFolder(path)
}

placeInput.addEventListener('input', () => {
  placeIndex = 0
  // Typing means the field is the answer again, until the selection is moved by hand.
  placeMoved = false
  void refreshPlace()
})

placeInput.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    placeIndex = stepSelection(placeRows.length, placeIndex, event.key === 'ArrowDown' ? 1 : -1)
    placeMoved = placeIndex >= 0
    renderPlace()
    return
  }
  if (event.key === 'Tab') {
    event.preventDefault()
    if (event.shiftKey) upPlace()
    else completePlace()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    void enterPlace()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    closePlace()
  }
})

/* ---------- following a path out of the terminal ---------- */

/**
 * A path clicked in the shell output. It opens where every other file opens, in the tab
 * you are in, because the shell you clicked belongs to that tab.
 */
async function openFromTerminal(path: string, line: number | null): Promise<void> {
  const into = tabs[activeIndex]
  await openFiles([path])
  /*
   * Only if that tab is still the one on screen. Scrolling to a line is done to whatever
   * document is up, so switching tabs while the file was being read sent another tab's
   * document to that line number and said so in the status bar.
   */
  if (tabs[activeIndex] !== into) return
  const doc = shownDoc(tabs[activeIndex])
  if (!doc || doc.error) return
  if (line === null) return
  goToLine(line)
  status.textContent = baseName(path) + ':' + line
}

/**
 * A textarea does not scroll to its selection on its own, and there is no way to ask it
 * to, so the row is measured and the line put a third of the way down - near the top,
 * but with enough above it to see where you landed.
 */
function revealRaw(offset: number): void {
  const line = raw.value.slice(0, offset).split('\n').length - 1
  const height = Number.parseFloat(getComputedStyle(raw).lineHeight)
  if (!Number.isFinite(height)) return
  raw.scrollTop = Math.max(line * height - raw.clientHeight / 3, 0)
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
    revealRaw(start)
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
  // The same order the bar uses: a name given by hand, the file on screen, the place.
  return tab.name ?? baseName(shownDoc(tab)?.path ?? tab.root ?? '')
}

/** Where focus was when the palette took it, so closing it puts it back. */
let paletteReturn: HTMLElement | null = null

/**
 * Which opening of the palette the answers coming back belong to.
 *
 * Walking a project takes long enough to switch tabs or close and open the palette
 * again, and what arrives afterwards used to be poured into whatever was on screen: the
 * files of one project offered under the name of another, twice over if it had been
 * opened twice - and choosing one of them opened it in the tab you had moved to.
 */
let paletteQuery = 0

async function openPalette(): Promise<void> {
  const tab = tabs[activeIndex]
  if (!tab) return
  const root = placeOf(tab)
  const ticket = ++paletteQuery
  paletteReturn = document.activeElement as HTMLElement | null

  // What is open here is known already, so the list is never empty while the disk is
  // still being walked.
  const here = new Map<string, PaletteEntry>()
  for (const doc of tab.docs) {
    here.set(doc.path.toLowerCase(), {
      path: doc.path,
      rel: relativeTo(root, doc.path),
      here: true,
      remembered: false,
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

  /*
   * What the place keeps comes before the walk of the disk, because it is the answer to
   * an empty query and the walk is not: a project opened again shows its usual files
   * immediately, without waiting for its tree to be counted.
   */
  const kept = new Set<string>()
  const gone = (): boolean => palette.hidden || ticket !== paletteQuery || tabs[activeIndex] !== tab
  for (const entry of await window.api.rememberedFiles(root)) {
    if (gone()) return
    kept.add(entry.path.toLowerCase())
    const open = here.get(entry.path.toLowerCase())
    if (open) {
      open.remembered = true
      continue
    }
    paletteEntries.push({
      path: entry.path,
      rel: relativeTo(root, entry.path),
      here: false,
      remembered: true,
      elsewhere: null
    })
  }
  renderPalette()

  const listing = await window.api.listFiles(root)
  // Still the same palette, over the same place? Anything else is somebody else's answer.
  if (gone()) return

  const elsewhere = new Map<string, string>()
  for (const other of tabs) {
    if (other === tab) continue
    for (const doc of other.docs) elsewhere.set(doc.path.toLowerCase(), tabLabel(other))
  }

  for (const file of listing.files) {
    const key = file.toLowerCase()
    if (here.has(key) || kept.has(key)) continue
    paletteEntries.push({
      path: file,
      rel: relativeTo(root, file),
      here: false,
      remembered: false,
      elsewhere: elsewhere.get(key) ?? null
    })
  }
  // A file open in another tab is worth saying so about even when this place keeps it.
  for (const entry of paletteEntries) {
    if (entry.here || entry.elsewhere !== null) continue
    entry.elsewhere = elsewhere.get(entry.path.toLowerCase()) ?? null
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
    empty.textContent = paletteInput.value.trim() === '' ? T('palette.nothingHere') : T('palette.noMatch')
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
      where.textContent = entry.here
        ? T('palette.openHere')
        : T('palette.openIn', { tab: entry.elsewhere ?? '' })
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

/**
 * The session is written after an edit as well, not only after a command.
 *
 * An unsaved edit is the one thing in the window that exists nowhere else, and the window
 * can be rebuilt without asking - so it has to be written down while it is being typed.
 * Held for a moment first: this is a keystroke, and the file underneath is rewritten on a
 * delay of its own, so a message per character would be two delays doing one job.
 */
let draftSave: number | null = null
function persistDraftSoon(): void {
  if (draftSave !== null) window.clearTimeout(draftSave)
  draftSave = window.setTimeout(() => {
    draftSave = null
    persistSession()
  }, 400)
}

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
  persistDraftSoon()
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
    status.textContent = T('save.notRendered')
    return
  }
  if (doc.draft !== null && doc.raw) {
    status.textContent = T('save.unsavedFirst')
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
    status.textContent = T('save.truncated')
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
      status.textContent = T('save.stale')
    } else {
      insist(T('save.failed', { error: '' }) + result.error)
    }
    return
  }

  doc.source = text
  doc.mtimeMs = result.mtimeMs
  doc.draft = null
  persistSession()
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
  themeButton.textContent = T(THEME_LABELS[next])
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

/**
 * Text that is written once into the markup rather than redrawn - buttons, titles,
 * placeholders - has to be set again when the language changes. Everything else
 * follows from a normal render.
 */
function applyLanguage(): void {
  // What the page says it is written in, for whatever reads it rather than looks at it:
  // the spellchecker in the prompt buffer, for one.
  document.documentElement.lang = lang
  langButton.textContent = nextLang(lang).toUpperCase()
  langButton.title = T('toolbar.lang.title')

  newTabButton.textContent = T('toolbar.newTab')
  newTabButton.title = T('toolbar.newTab.title')
  openButton.textContent = T('toolbar.open')
  openButton.title = T('toolbar.open.title')
  folderButton.textContent = T('toolbar.folder')
  folderButton.title = T('toolbar.folder.title')
  shellButton.textContent = T('toolbar.shell')
  shellButton.title = T('toolbar.shell.title')
  webButton.textContent = T('toolbar.web')
  webButton.title = T('toolbar.web.title')
  themeButton.title = T('toolbar.theme.title')
  themeButton.textContent = T(THEME_LABELS[theme])
  helpButton.title = T('toolbar.help.title')

  findInput.placeholder = T('find.placeholder')
  webUrlInput.placeholder = T('web.placeholder')
  const emptyTitle = empty.querySelector('strong')
  if (emptyTitle) emptyTitle.textContent = T('empty.title')
  const emptyBody = document.getElementById('empty-body')
  if (emptyBody) emptyBody.textContent = T('empty.body')
  // The first thing a new pair of eyes sees, and the only pointer to the panel.
  const emptyIntro = document.getElementById('empty-intro')
  if (emptyIntro) emptyIntro.textContent = T('empty.intro')

  const label = (id: string, key: StringKey): void => {
    const node = document.getElementById(id)
    if (node) node.title = T(key)
  }
  label('find-prev', 'find.previous')
  label('find-next', 'find.next')
  label('find-close', 'find.close')
  label('web-reload', 'web.reload')

  const promptHint = document.getElementById('prompt-hint')
  if (promptHint) promptHint.textContent = T('prompt.hint')
  const promptSend = document.getElementById('prompt-send')
  if (promptSend) promptSend.textContent = T('prompt.send')

  dressTray(null)
  /*
   * The panel is built once and cached. Dropping it is enough while it is closed - the
   * next opening builds it again - but a panel on screen has to be redrawn now, or
   * switching the language in front of it leaves it blank.
   */
  if (help.hidden) help.textContent = ''
  else paintHelp()
  render()
  void refreshUsage()
  void refreshLimits()
}

function setLang(next: Lang, persist = true): void {
  lang = next
  if (persist) void window.api.setLang(next)
  applyLanguage()
}

langButton.addEventListener('click', () => setLang(nextLang(lang)))

/* ---------- input ---------- */

/**
 * A tab over a directory: the place first, the files later or never. It is what the
 * shell starts in and what `Ctrl+P` searches, so it answers the one thing an empty tab
 * could not - where am I.
 *
 * The tab you are in is used when it is empty and belongs nowhere yet; anything else
 * gets a place of its own rather than being moved out from under you.
 */
async function openFolder(): Promise<void> {
  const root = await window.api.openFolderDialog()
  if (root === null) return
  await useFolder(root)
}

async function useFolder(root: string): Promise<void> {
  const current = tabs[activeIndex]
  const tab = current && current.docs.length === 0 && current.root === null ? current : createTab()
  const cameFrom = placeOf(tab)
  tab.root = root
  /*
   * With its shell open, like a tab made with Ctrl+T. A place is a directory and the
   * shell running in it, so arriving somewhere and then having to ask for the shell was
   * two gestures for one intention - and it made the two ways of opening a place behave
   * differently for no reason anybody could see.
   */
  tab.terminalOpen = true
  // A pane blown up to the whole tab would hide the shell that was just asked for.
  tab.zoom = null
  activeIndex = tabs.indexOf(tab)

  /*
   * A shell already running here was started somewhere else - an empty tab taken over by
   * this place had one in the home directory - and a place whose shell is in a different
   * directory is not that place: Run would build the wrong thing, and every path printed
   * in it resolves against the wrong root. So the shell follows the place.
   *
   * Unless something is running in it, which is nobody's to end from here. Then the
   * shell stays and says so, which is at least true, and `Ctrl+`` twice is the way to
   * get a shell in the new place once whatever it was doing has finished.
   */
  const pane = shells.get(tab.id)
  const moved = pane !== undefined && cameFrom !== '' && cameFrom !== root
  const busy = moved && interruptsWork(tab.activity)
  if (moved && !busy) {
    pane.dispose()
    shells.delete(tab.id)
  }

  // The place decides what Run offers, exactly as a document's directory used to.
  tab.project = await window.api.detectProject(root)
  render()
  persistSession()
  status.textContent = busy ? T('place.shellStayed', { dir: cameFrom }) : root
}

async function pickFiles(): Promise<void> {
  const paths = await window.api.openDialog()
  if (paths.length > 0) await openFiles(paths)
}

newTabButton.addEventListener('click', newTab)
openButton.addEventListener('click', () => void pickFiles())
folderButton.addEventListener('click', () => void openFolder())

window.addEventListener('keydown', (event) => {
  // Whatever was being insisted on has now been read, or at least been given the chance.
  holdStatus = false
  if (event.key === 'Escape' && !place.hidden) {
    event.preventDefault()
    closePlace()
    return
  }

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
  /*
   * AltGr arrives as left Ctrl plus right Alt, so every Ctrl shortcut read from the
   * physical key was also a character on a keyboard that has a third level. On a Czech
   * layout AltGr+G is `]`: it opened the place dialog and the bracket was never typed,
   * anywhere in the application. Nothing here is bound to Ctrl+Alt - the pane keys use
   * Alt on its own - so refusing the combination costs nothing.
   */
  if (event.altKey) return

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
   * Going somewhere is not something to have to leave the shell for, and these are the
   * two keys for it: another place, and which place. Both are bound in Claude Code -
   * Ctrl+G opens its external editor, Ctrl+T toggles its todo list - and both are taken
   * anyway, deliberately: this is the one workflow the application exists for, and the
   * prompt buffer covers the same need as the editor Ctrl+G opened. See the decision log.
   */
  if (event.code === 'KeyT') {
    event.preventDefault()
    newTab()
    return
  }
  if (event.code === 'KeyP') {
    event.preventDefault()
    if (palette.hidden) void openPalette()
    else closePalette()
    return
  }
  if (event.code === 'KeyG') {
    event.preventDefault()
    if (place.hidden) openPlace()
    else closePlace()
    return
  }

  const digit = tabDigit(event) ?? 0

  /*
   * Keys typed into a shell belong to the shell - Ctrl+W deletes a word there and
   * Ctrl+D means end of input. So while the terminal has focus the app answers only to
   * the shifted variants and to what `claimedFromShell` takes by name, which is the
   * list the terminal itself refuses so that these arrive here at all.
   */
  if (terminalHasFocus() && !event.shiftKey && !claimedFromShell(event) && digit === 0) return

  const key = event.key.toLowerCase()

  if (key === 'e') {
    event.preventDefault()
    toggleRaw()
  } else if (key === 's') {
    event.preventDefault()
    void saveDraft()
  } else if (key === 'o') {
    event.preventDefault()
    void pickFiles()
  } else if (key === 'w') {
    event.preventDefault()
    void closeDoc()
  } else if (event.key === 'Tab') {
    event.preventDefault()
    cycleTab(event.shiftKey ? -1 : 1)
  } else if (key === 'r') {
    event.preventDefault()
    const doc = shownDoc(tabs[activeIndex])
    if (doc) void reloadPath(doc.path)
  } else if (key === 'l' && event.shiftKey) {
    /*
     * Write down what the shells have printed. For the one thing a screenshot cannot
     * answer: what the program in the pane said as it went. Pressed after something
     * strange has happened, it is the difference between a report and a guess.
     */
    event.preventDefault()
    void window.api.dumpShells().then((paths) => {
      status.textContent =
        paths.length > 0 ? T('log.written', { count: paths.length }) : T('log.nothing')
    })
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
  if (paths.length > 0) void openDropped(paths)
})

/**
 * A directory dropped in is a place, a file is a file. Windows hands both over the same
 * way, so which it is has to be asked - and a folder dropped into a viewer used to end
 * up as a document that could not be read.
 */
async function openDropped(paths: string[]): Promise<void> {
  const files: string[] = []
  for (const path of paths) {
    if (await window.api.isDirectory(path)) await useFolder(path)
    else files.push(path)
  }
  if (files.length > 0) await openFiles(files)
}

/* ---------- startup ---------- */

/*
 * Anything that goes wrong in here has nowhere to be seen: a packaged application on
 * Windows has no console, and half of what this window does is started and not waited
 * for. So both ways a failure can surface end up in the log, which is the one place
 * somebody can be pointed at afterwards. It says what it can and nothing more - a
 * message and where it came from - because this is a note to whoever reads the log, not
 * an error report.
 */
window.addEventListener('error', (event) => {
  window.api.note(
    'the window hit an error: ' +
      String(event.message) +
      (event.filename ? ' (' + event.filename + ':' + event.lineno + ')' : '')
  )
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as { message?: string } | string | undefined
  window.api.note(
    'the window dropped a promise: ' +
      (typeof reason === 'string' ? reason : (reason?.message ?? String(reason)))
  )
})

async function start(): Promise<void> {
  restoring = true
  /** How many unsaved edits came back with the session, to be said once at the end. */
  let recovered = 0
  render()
  const startup = await window.api.getStartupFiles()
  setLang(startup.lang, false)
  setTheme(startup.theme, false)
  terminalFont = startup.font
  // Before any pane is built, since it is a terminal's option and not a setting.
  usePty(startup.windowsBuild)

  // Names first, so a tab restored without one cannot be given a name still to come.
  for (const saved of startup.tabs) reserveName(saved.id)

  // One place at a time, each with the files it held and the file that was on screen.
  for (const saved of startup.tabs) {
    const tab = createTab(saved.id)
    await openFiles(saved.files, false, tab)
    const shown = saved.active ? tab.docs.findIndex((doc) => samePath(doc.path, saved.active!)) : -1
    tab.docIndex = shown >= 0 ? shown : 0
    tab.name = saved.name ?? null
    /*
     * An edit that was never saved comes back as an edit, not as the file: that is what
     * the person left on screen, and the file underneath it is exactly what they had not
     * decided about yet.
     */
    for (const doc of tab.docs) {
      const draft = saved.drafts?.[doc.path]
      if (draft !== undefined && draft !== '') {
        doc.draft = draft
        doc.raw = true
        recovered += 1
      }
    }
    tab.terminalOpen = saved.pane.terminal
    tab.ratio = clampRatio(saved.pane.ratio)
    tab.runCommand = saved.pane.run ?? null
    tab.webUrl = saved.pane.web ?? null
    tab.rightMode = tab.webUrl === null ? 'doc' : saved.pane.rightMode
    tab.rightRatio = clampRatio(saved.pane.rightRatio)
    tab.webManual = saved.pane.webManual
    tab.prompt = saved.pane.prompt
    tab.promptOpen = saved.pane.promptOpen
    tab.root = saved.pane.root
    /*
     * A tab that is a directory has no document to detect a project from, so the place
     * is asked directly - otherwise Run would be there before a restart and gone after.
     */
    if (tab.root !== null && !tab.project) tab.project = await window.api.detectProject(tab.root)
  }

  /*
   * A place whose every file has vanished is not worth restoring as an empty one - but a
   * tab opened over a directory holds nothing by design, and a tab with a shell open
   * holds whatever is running in it, which is the work. Only a tab that is none of the
   * three goes; dropping one with a shell would leave that shell unclaimed, and
   * unclaimed is how a shell gets ended.
   */
  for (let i = tabs.length - 1; i >= 0; i--) {
    const tab = tabs[i]
    if (tab.docs.length === 0 && tab.root === null && !tab.terminalOpen) tabs.splice(i, 1)
  }
  activeIndex = tabs.length === 0 ? -1 : Math.min(startup.activeTab, tabs.length - 1)
  /*
   * These are the panes that exist. Shells outlive the window they are shown in, so
   * after a reload some of them are already running and waiting to be taken over; the
   * ones belonging to a tab that did not come back are nobody's, and saying so here is
   * what ends them.
   */
  window.api.terminal.keep(tabs.map((tab) => tab.id))
  // The same for watches: what this window holds, and nothing left over from the last.
  window.api.keepWatching(tabs.flatMap((tab) => tab.docs.map((doc) => doc.path)))
  render()
  restoring = false
  persistSession()
  /*
   * Said after the render, so it is not overwritten by it. A window that quietly
   * rearranges itself looks exactly like a window that lost your work - and the shell
   * that comes back has its scrollback replayed rather than its own, so it is worth
   * knowing that this is a new window rather than the one you were looking at.
   */
  if (recovered > 0) insist(T('draft.recovered', { count: recovered }))
  else if (startup.rebuilt) status.textContent = T('window.rebuilt')
}

void start()
