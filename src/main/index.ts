import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  net,
  protocol,
  shell,
  Tray,
  type Input
} from 'electron'
import { existsSync, statSync } from 'node:fs'
import { release } from 'node:os'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, normalize, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Lang } from '../shared/i18n'
import { FileWatcher } from './fileWatcher'
import { detectProject } from './project'
import { readPlanUsage } from './limits'
import { askSummary } from './summary'
import { readUsage } from './usage'
import { listFiles } from './listFiles'
import { forgetOpened, noteOpened, rememberedIn } from './history'
import { homeDirectory, listDirectories, queryZoxide } from './places'
import { resolveFile } from './resolveFile'
import { note } from './log'
import { TerminalManager } from './terminal'
import { loadState, saveState, terminalFont, type AppState } from './store'
import { clampSize } from '../shared/font'
import { closeAction } from '../shared/closing'
import { isLocalUrl } from '../shared/web'
import { sanitisePane, sanitiseSession } from '../shared/session'
import { paneCommand } from '../shared/shortcuts'
import type {
  AskKind,
  FileReadResult,
  FileWriteResult,
  SessionState,
  StartupPayload,
  TaskbarState,
  Theme
} from '../shared/types'

const DEV_URL = process.env['ELECTRON_RENDERER_URL']

/*
 * Running from source there is no packaged executable to take an icon from, so the
 * window is handed the generated one. In a packaged app this path does not exist and
 * the icon on the exe is what Windows uses.
 */
const DEV_ICON = join(__dirname, '../../build/icon.ico')

/**
 * Closing the window leaves the application running behind a tray icon whenever an
 * agent is in one of the tabs, because what is running in it does not stop being
 * useful when the window is out of the way: an agent halfway through a job would
 * otherwise be killed by the same click that tidies the desktop. With no agent
 * anywhere the cross ends the application as it always did. Quitting outright is a
 * separate act, from the tray menu.
 *
 * This buys exactly one thing - surviving the window - and no more. The shells live
 * in this process, so quitting, logging out or rebooting still ends them; sessions
 * that outlive the application are a different machine altogether.
 */
let tray: Tray | null = null
let quitting = false

/**
 * Whether the window is holding anything that closing it would kill - an agent in one
 * of the tabs, running or waiting for you. Told by the renderer, which is the side
 * that knows what is in them.
 *
 * With nothing to protect, the cross means what it always meant: the application ends
 * and leaves nothing behind. Tabs, layout and names are in the session file either
 * way, so what is lost by quitting is a shell at a prompt, which is nothing.
 */
let guarded = false

/** Filled in by the renderer, which is the side that knows the language. */
let trayText = {
  show: 'Show Project Console',
  quit: 'Quit',
  quitAsk: 'Quit Project Console? Anything running in it will stop.',
  quitConfirm: 'Quit',
  cancel: 'Cancel',
  closeAsk: 'Something is running in a shell. Close it, or leave it running?',
  closeQuit: 'Close and stop it',
  closeKeep: 'Keep it running'
}

function trayIcon(): Electron.NativeImage {
  const file = join(app.getAppPath(), 'build', 'icon.png')
  const image = nativeImage.createFromPath(file)
  return image.isEmpty() ? image : image.resize({ width: 16, height: 16 })
}

/**
 * A question the window draws for us, in its own frame instead of the system's box.
 *
 * The system box is still here as a fallback, and it is not decoration: this is asked
 * at the moment something is about to be lost, so a renderer that is reloading, wedged
 * or gone must not turn the question into silence.
 *
 * What the fallback waits for is the window saying it has drawn the box - not the answer
 * itself. A person reading the question takes as long as they take, and a timeout on
 * that put a second, system-drawn copy of the question on the screen beside the first.
 */
let pendingAsk: {
  id: number
  settle: (answer: number) => void
  drawn: boolean
  /** The answer that changes nothing, for when the question has to be given up on. */
  safe: number
} | null = null
let nextAskId = 1

/** How long the window gets to draw the box before the system box takes over. */
const ASK_DRAW_MS = 1500

/**
 * Give up on the question the window was drawing, whatever it was.
 *
 * A question is a promise somebody is waiting on - to close the window, to quit - and the
 * window can vanish while it is on screen. Then the answer never comes, the promise never
 * settles, and the intention behind it is silently dropped: a cross that stops working, a
 * Quit that does nothing. Ending it with the safe answer is the least it can do.
 */
function abandonAsk(why: string): void {
  if (!pendingAsk) return
  note('the question on screen was abandoned (' + why + ')')
  // The last button is the one that changes nothing; `askWindow` puts it there.
  pendingAsk.settle(pendingAsk.safe)
}

function askWindow(kind: AskKind, fallback: { message: string; buttons: string[] }): Promise<number> {
  if (!win || win.isDestroyed()) return Promise.resolve(systemAsk(fallback))
  /*
   * One at a time. A second question used to take the slot and leave the first waiting for
   * an answer that could no longer reach it - so the window kept a box nobody's reply
   * would settle, and whatever it was asking about never happened.
   */
  if (pendingAsk) {
    note('a question was asked while one was already up; the new one is refused')
    return Promise.resolve(fallback.buttons.length - 1)
  }

  const id = nextAskId++
  return new Promise<number>((resolve) => {
    let settled = false
    const settle = (answer: number): void => {
      if (settled) return
      settled = true
      pendingAsk = null
      clearTimeout(timer)
      resolve(answer)
    }
    const timer = setTimeout(() => {
      if (pendingAsk?.id === id && !pendingAsk.drawn) settle(systemAsk(fallback))
    }, ASK_DRAW_MS)
    pendingAsk = { id, settle, drawn: false, safe: fallback.buttons.length - 1 }
    win?.webContents.send('ask:show', { id, kind })
  })
}

function systemAsk(fallback: { message: string; buttons: string[] }): number {
  return dialog.showMessageBoxSync({
    type: 'question',
    buttons: fallback.buttons,
    defaultId: fallback.buttons.length - 1,
    cancelId: fallback.buttons.length - 1,
    message: fallback.message
  })
}

function showWindow(): void {
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

/**
 * Shown first, because quitting can be refused: unsaved edits stop the window from
 * closing and say so in its status bar, which is no use behind a hidden window. And if
 * it is refused, this is no longer a quit - leaving the flag set would make the next
 * close destroy the window instead of hiding it.
 */
function quitNow(): void {
  showWindow()
  quitting = true
  app.quit()
  setTimeout(() => {
    quitting = false
  }, 1000)
}

function askThenQuit(): void {
  // Shown before the question, because the question is drawn inside it.
  showWindow()
  void askWindow('quit', {
    message: trayText.quitAsk,
    buttons: [trayText.quitConfirm, trayText.cancel]
  }).then((answer) => {
    if (answer === 0) quitNow()
  })
}

/**
 * Out of the way, still running.
 *
 * Said nothing about it on purpose. It used to raise a system notification the first time,
 * which has to be dismissed or waited out and lands in the notification centre either
 * way - a cost paid every session for one sentence. The tray icon is the answer to where
 * the window went, its tooltip says so, and the `?` panel says it in advance.
 *
 * The accelerator goes with the window. Whether hiding produces a blur, and therefore
 * whether the handler that gives it up runs, is not something to depend on: a hidden
 * application holding a system-wide key would be taking it from everything else.
 */
function hideWindow(): void {
  globalShortcut.unregister('Alt+W')
  win?.hide()
}

function refreshTray(): void {
  if (!tray) return
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: trayText.show, click: showWindow },
      { type: 'separator' },
      { label: trayText.quit, click: askThenQuit }
    ])
  )
}

/**
 * Without an icon there would be no way back to a hidden window, so the tray has to
 * exist before closing is allowed to mean hiding. If it cannot be made, closing keeps
 * its old meaning and the application ends - a lost session is bad, a window that
 * cannot be reopened is worse.
 */
function ensureTray(): void {
  if (tray) return
  const icon = trayIcon()
  if (icon.isEmpty()) {
    /*
     * No icon, no tray, and therefore nowhere to put a hidden window: closing it has to
     * end the application instead. Worth a line, because everything downstream of it -
     * the balloon, the menu, closing behaving differently - then quietly does not happen.
     */
    note('there is no tray icon, so closing the window will end the application')
    return
  }
  tray = new Tray(icon)
  tray.setToolTip('Project Console')
  tray.on('click', showWindow)
  refreshTray()
}

/**
 * How much of a file is read at all. A console shows logs, and a log has no upper
 * size; past this the head is shown and the pane says so, because the beginning of a
 * log is still worth more than nothing. What is truncated can never be saved.
 */
const MAX_TEXT_BYTES = 2 * 1024 * 1024

/**
 * How each aggregate state looks on the taskbar button. Windows tints the progress bar
 * per mode, which happens to be exactly this set of meanings: a moving bar for work in
 * progress, full green for finished, yellow for stopped and waiting, red for broken.
 * `wantsYou` marks the ones worth flashing the button for.
 */
const TASKBAR: Record<
  TaskbarState,
  { progress: number; mode: 'none' | 'normal' | 'indeterminate' | 'error' | 'paused'; wantsYou: boolean }
> = {
  none: { progress: -1, mode: 'none', wantsYou: false },
  working: { progress: 0.5, mode: 'indeterminate', wantsYou: false },
  done: { progress: 1, mode: 'normal', wantsYou: true },
  permission: { progress: 1, mode: 'paused', wantsYou: true },
  alert: { progress: 1, mode: 'error', wantsYou: true }
}

/**
 * Images referenced from Markdown live next to the document, anywhere on disk.
 * A tiny custom scheme lets the renderer load them without `file://` access and
 * works identically in dev (http origin) and in the packaged app.
 */
protocol.registerSchemesAsPrivileged([
  { scheme: 'mdasset', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

/**
 * Names the folder Electron hands out for state, which is also where the
 * single-instance lock lives. A development run takes a name of its own, so it gets
 * its own session and its own lock: the installed app keeps the tabs you were working
 * in, and both can run side by side - which matters when the app being built is also
 * the app being used.
 */
app.setName(app.isPackaged ? 'project-console' : 'project-console-dev')

let win: BrowserWindow | null = null
let watcher: FileWatcher | null = null
let terminals: TerminalManager | null = null
/** The next window is a replacement for one that died, and should say so. */
let rebuilt = false

const state: AppState = loadState()
let session: SessionState = { tabs: state.tabs, activeTab: state.activeTab }
const cliFiles = collectFileArgs(process.argv)
let saveTimer: NodeJS.Timeout | null = null

/**
 * Files named on the command line, of any kind: what the user asks for by typing it is
 * not what the file association sends. Explorer only ever hands over the extensions
 * the installer registered; a person at a prompt may well want a log.
 *
 * A development run is passed this very script as an argument, and its position is not
 * something to rely on - so it is recognised by name rather than by index. Getting that
 * wrong opens the app's own bundle as a document.
 */
function collectFileArgs(argv: string[]): string[] {
  const entry = __filename.toLowerCase()
  return argv.slice(1).filter((arg) => {
    if (arg.startsWith('-')) return false
    // Absolute from here on: a relative argument would be stored as typed.
    const full = resolve(arg)
    if (full.toLowerCase() === entry) return false
    // Only something that is actually a file: a development launch also passes the
    // project directory, and a path that does not exist could not be opened anyway.
    try {
      return statSync(full).isFile()
    } catch {
      return false
    }
  }).map((arg) => resolve(arg))
}

/** Every file the window has open, across all tabs: what a write may touch. */
function openPaths(): string[] {
  return session.tabs.flatMap((tab) => tab.files)
}

function persistSoon(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(persistNow, 400)
  saveTimer.unref?.()
}

function persistNow(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (win && !win.isDestroyed()) {
    state.maximized = win.isMaximized()
    if (!state.maximized) state.bounds = win.getBounds()
  }
  state.tabs = session.tabs
  state.activeTab = session.activeTab
  saveState(state)
}

/** 'system' hands the choice back to Windows; light/dark force the palette. */
function applyTheme(theme: Theme): void {
  state.theme = theme
  nativeTheme.themeSource = theme
}

function openExternal(url: string): void {
  if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url)
}

/**
 * Pane keys are claimed in the main process rather than in the renderer alone.
 *
 * A page in the web pane runs in a process of its own: once it has focus it swallows
 * every key, and Alt+W - the way back out - would never arrive. Taking them before the
 * page sees them keeps the panes reachable from wherever the cursor happens to be.
 */
function claimPaneKey(event: { preventDefault: () => void }, input: Input): void {
  const command = paneCommand({
    key: input.key,
    code: input.code,
    altKey: input.alt,
    ctrlKey: input.control,
    shiftKey: input.shift,
    metaKey: input.meta
  })
  if (!command) return
  event.preventDefault()
  win?.webContents.send('pane:command', command)
}

function createWindow(): void {
  win = new BrowserWindow({
    width: state.bounds?.width ?? 900,
    height: state.bounds?.height ?? 700,
    x: state.bounds?.x,
    y: state.bounds?.y,
    show: false,
    // Matches the renderer's prefers-color-scheme palette, so there is no flash.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16181d' : '#ffffff',
    title: 'Project Console',
    ...(existsSync(DEV_ICON) ? { icon: DEV_ICON } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      /*
       * The dev server in the right-hand pane. As an iframe it was same-site with the
       * app, so Chromium ran it in this window's process: a page that spun or ran out
       * of memory killed the console around it, along with every shell and every agent
       * running in one. A webview with its own partition cannot be in our process.
       */
      webviewTag: true
    }
  })

  if (state.maximized) win.maximize()
  win.once('ready-to-show', () => win?.show())

  // Rendered Markdown must never navigate the app or spawn windows.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const isAppUrl = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith('file://')
    if (isAppUrl) return
    event.preventDefault()
    openExternal(url)
  })
  /*
   * A renderer that goes away takes the knowledge of which shell belonged to which pane
   * with it, but not the shells themselves - they run here. That knowledge is now
   * rebuilt instead of being written off: the window asks for its shells back by tab id
   * (`terminal:attach`) and then says which ones it claimed (`terminal:keep`), and the
   * ones nobody claimed are ended there.
   *
   * It used to kill every shell on a main-frame navigation, which is correct about
   * ownership and far too expensive to be right: a reload happens on every saved file
   * in development, and it took running agents with it every time. Being able to lose
   * the window without losing the work is worth more than the simplicity was.
   */
  win.webContents.on('render-process-gone', (_event, details) => {
    abandonAsk('the window went away while it was on screen')
    if (details.reason === 'clean-exit') {
      note('the window went away (clean-exit); leaving it alone')
      return
    }
    note('the window went away (' + details.reason + '); rebuilding it')
    rebuilt = true
    // The shells are still running; a window is the one part of this that is cheap.
    win?.webContents.reload()
  })

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F12') {
      win?.webContents.toggleDevTools()
      return
    }
    claimPaneKey(event, input)
  })

  /*
   * The embedded page is content, not part of the application, so it is given as
   * little as possible: no preload, no Node, sandboxed, and an address it is allowed
   * to be at. This is the gate the pane's rules are actually enforced at - the CSP in
   * index.html no longer governs a page that is not a frame of this document.
   */
  win.webContents.on('will-attach-webview', (event, preferences, params) => {
    delete preferences.preload
    preferences.nodeIntegration = false
    preferences.contextIsolation = true
    preferences.sandbox = true
    if (!isLocalUrl(params.src)) event.preventDefault()
  })

  win.webContents.on('did-attach-webview', (_event, guest) => {
    // Its own process means its own keys: pane keys have to be claimed here as well.
    guest.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown') claimPaneKey(event, input)
    })
    /*
     * Nothing here is a shell, so the page dying is now a message rather than a
     * disaster - which is the entire point of it living somewhere else.
     */
    guest.on('render-process-gone', (_e, details) => {
      note('the page in the web pane went away (' + details.reason + ')')
      win?.webContents.send('web:gone')
    })
    // A page must not be able to navigate itself somewhere off the machine.
    guest.on('will-navigate', (event, url) => {
      if (!isLocalUrl(url)) event.preventDefault()
    })
    guest.setWindowOpenHandler(({ url }) => {
      openExternal(url)
      return { action: 'deny' }
    })
  })

  /*
   * One key has to work even from inside the embedded page: the way back out of it.
   * A cross-origin frame runs in its own process, so neither the renderer nor
   * before-input-event ever sees its keys. An accelerator held only while this
   * window has focus is the one mechanism that reaches over that boundary.
   */
  win.on('focus', () => {
    // Being here is the answer to whatever the button was flashing about.
    win?.flashFrame(false)
    try {
      globalShortcut.register('Alt+W', () => win?.webContents.send('pane:command', { type: 'web' }))
    } catch {
      // Another application holds it; the button and a click still work.
    }
  })
  win.on('blur', () => globalShortcut.unregister('Alt+W'))
  // Belt to the same brace as `hideWindow`: hidden windows hold no global keys.
  win.on('hide', () => globalShortcut.unregister('Alt+W'))

  win.on('close', (event) => {
    persistNow()
    const action = closeAction({
      quitting,
      tray: tray !== null,
      guarded,
      shells: terminals?.count() ?? 0
    })
    if (action === 'quit' && quitting) return

    /*
     * Refused first and acted on afterwards, whatever the answer: a modal opened from
     * inside this handler does not reliably hold the close, which was learned the hard
     * way when the unsaved-edits guard lived here rather than in the renderer.
     */
    event.preventDefault()
    if (action === 'hide') {
      hideWindow()
      return
    }
    if (action === 'ask') {
      void askWindow('close', {
        message: trayText.closeAsk,
        buttons: [trayText.closeQuit, trayText.closeKeep]
      }).then((answer) => {
        if (answer === 0) quitNow()
        /*
         * Keeping it means keeping it where it can be found. With a tray icon that is
         * out of the way behind it; without one there is nowhere to put it, so the
         * window simply stays - the close was refused before the question was asked.
         */
        else if (tray) hideWindow()
      })
      return
    }
    quitNow()
  })
  win.on('closed', () => {
    abandonAsk('the window closed')
    win = null
  })

  ensureTray()

  if (DEV_URL) void win.loadURL(DEV_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

/**
 * A resize, recorded. Not every one of them: dragging the divider produces a size per
 * frame, and a log that says the same thing forty times says nothing at all.
 */
const lastSize = new Map<string, string>()
function resizeNoted(id: string, cols: number, rows: number): void {
  const size = cols + 'x' + rows
  if (lastSize.get(id) !== size) {
    lastSize.set(id, size)
    note('shell ' + id + ' resized to ' + size)
  }
  terminals?.resize(id, cols, rows)
}

/**
 * Which Windows this is, as a build number, or null when it is not Windows at all.
 *
 * The terminal in the window needs it: xterm turns on the behaviour ConPTY expects only
 * when it is told what it is talking to, and the renderer is sandboxed and cannot ask.
 */
function windowsBuild(): number | null {
  if (process.platform !== 'win32') return null
  const build = Number(release().split('.')[2])
  return Number.isInteger(build) ? build : null
}

/**
 * A directory said in the way a file dialog understands as "start here".
 *
 * What it is given is split into a folder and a name for the box, so a directory without
 * a separator on the end has its last part read as the name - and the dialog opens in the
 * parent, one place next to the one that was asked for.
 */
function asFolder(path: string): string {
  const full = normalize(path)
  return full.endsWith(sep) ? full : full + sep
}

function registerIpc(): void {
  ipcMain.handle('dialog:open', async (_event, startIn?: string): Promise<string[]> => {
    if (!win) return []
    const result = await dialog.showOpenDialog(win, {
      title: 'Open file',
      /*
       * Where the tab already is, rather than wherever the last dialog happened to be.
       * A tab is a place - a directory with a shell in it - so the file being looked for
       * is almost always in that directory or below it, and starting anywhere else means
       * clicking back to it every time. Omitted when the tab is no place yet, which is
       * when the system's own idea of "last time" is the best answer available.
       *
       * With the separator on the end, because this is a folder and not a file. Windows
       * splits what it is given into a folder and a name to put in the box, so a bare
       * `C:\work\project` opened `C:\work` with "project" typed in - which is the
       * folder next door to the one that was asked for, and looks like the dialog
       * ignoring the request entirely.
       */
      ...(startIn ? { defaultPath: asFolder(startIn) } : {}),
      properties: ['openFile', 'multiSelections'],
      // Markdown first because it is the common case, but any text file is fair game.
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'mdx'] },
        { name: 'Text', extensions: ['txt', 'json', 'log', 'yml', 'yaml', 'env', 'ini', 'csv'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('file:read', async (_event, path: string): Promise<FileReadResult> => {
    const full = normalize(path)
    const dir = dirname(full)

    // A file being rewritten can be briefly locked. One retry turns that from a tab
    // marked unavailable into a delay nobody notices; a file that is really gone
    // fails with ENOENT twice and is reported straight away.
    for (let attempt = 0; ; attempt++) {
      try {
        const info = await stat(full)
        if (!info.isFile()) return { ok: false, path: full, dir, error: 'Not a file' }

        /*
         * Read bytes rather than text, for two reasons. A NUL byte is the one reliable
         * sign that this is not a text file - an extension proves nothing, a `.log`
         * can be binary and a file with no extension can be perfectly readable. And a
         * cap has to apply to what is read, not to what is decoded: a 200 MB log would
         * otherwise be pulled into memory before anyone could object.
         */
        const bytes = await readFile(full)
        const head = bytes.subarray(0, MAX_TEXT_BYTES)
        if (head.includes(0)) {
          return { ok: false, path: full, dir, error: 'Not a text file' }
        }
        return {
          ok: true,
          path: full,
          dir,
          content: head.toString('utf8'),
          mtimeMs: info.mtimeMs,
          truncated: bytes.byteLength > head.byteLength
        }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (attempt > 0 || code === 'ENOENT') {
          const message = error instanceof Error ? error.message : String(error)
          return { ok: false, path: full, dir, error: message }
        }
        await new Promise((resolve) => setTimeout(resolve, 120))
      }
    }
  })

  /**
   * The third rule of the security section, enforced here rather than merely written
   * down: a write goes only to a file the window has open. The session is the list of
   * those, so the renderer cannot name a path of its own even if something in it went
   * wrong. The modification time the renderer last saw decides the rest - if the file
   * has moved on, the write is refused and whoever else wrote it keeps their work.
   */
  ipcMain.handle(
    'file:write',
    async (_event, path: string, content: string, seenMtimeMs: number): Promise<FileWriteResult> => {
      const full = normalize(path)
      if (!openPaths().some((file) => file.toLowerCase() === full.toLowerCase())) {
        return { ok: false, reason: 'denied', error: 'That file is not open in this window' }
      }
      try {
        const before = await stat(full)
        /*
         * A negative time is the deliberate override: the renderer sends it only after
         * a refusal has been shown and the same key pressed again, which is what makes
         * overwriting somebody else's write an act rather than an accident.
         */
        if (seenMtimeMs >= 0 && Math.abs(before.mtimeMs - seenMtimeMs) > 1) {
          return { ok: false, reason: 'stale', error: 'The file changed on disk' }
        }
        await writeFile(full, content, 'utf8')
        const after = await stat(full)
        return { ok: true, mtimeMs: after.mtimeMs }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { ok: false, reason: 'failed', error: message }
      }
    }
  )

  ipcMain.handle('watch:add', (_event, path: string) => {
    watcher?.add(normalize(path))
  })

  /*
   * Everything the window is actually watching. A window that went away asked for
   * watches it never gave up, and the rebuilt one asks only for what it has - so this is
   * where the leftovers go, the way unclaimed shells do.
   */
  ipcMain.on('watch:keep', (_event, paths: string[]) => {
    watcher?.keepOnly(paths.map((path) => normalize(path)))
  })

  ipcMain.handle('watch:remove', (_event, path: string) => {
    watcher?.remove(normalize(path))
  })

  ipcMain.handle('startup:files', (): StartupPayload => {
    const tabs = session.tabs.map((tab) => ({ ...tab, files: [...tab.files] }))

    /*
     * Files named on the command line join the tab that was on screen, which is the
     * same rule the window follows while it runs. With no tabs at all they make one.
     */
    if (cliFiles.length > 0) {
      const index = tabs.length > 0 ? Math.min(Math.max(session.activeTab, 0), tabs.length - 1) : -1
      if (index < 0) {
        tabs.push({
          files: [...cliFiles],
          active: cliFiles[cliFiles.length - 1],
          pane: sanitisePane(null)
        })
      } else {
        for (const file of cliFiles) {
          if (!tabs[index].files.includes(file)) tabs[index].files.push(file)
        }
        tabs[index].active = cliFiles[cliFiles.length - 1]
      }
    }

    const activeTab = tabs.length > 0 ? Math.min(Math.max(session.activeTab, 0), tabs.length - 1) : 0
    // Asked once: the window that hears about it is the one that had to be rebuilt.
    const wasRebuilt = rebuilt
    rebuilt = false
    return {
      tabs,
      activeTab,
      theme: state.theme,
      lang: state.lang,
      font: terminalFont(state),
      windowsBuild: windowsBuild(),
      rebuilt: wasRebuilt
    }
  })

  // Size is app state, like the theme. The family stays a hand-edited preference.
  ipcMain.on('font:size', (_event, size: number) => {
    state.fontSize = clampSize(size)
    persistSoon()
  })

  ipcMain.handle('lang:set', (_event, lang: Lang) => {
    state.lang = lang === 'cs' ? 'cs' : 'en'
    persistSoon()
  })

  ipcMain.handle('theme:set', (_event, theme: Theme) => {
    applyTheme(theme)
    persistSoon()
  })

  ipcMain.on('session:save', (_event, next: SessionState) => {
    session = sanitiseSession(next)
    persistSoon()
  })

  ipcMain.handle('project:detect', (_event, dir: string) => detectProject(normalize(dir)))

  /**
   * A directory, for a tab that is a place rather than a file. Separate from the file
   * dialog because Windows has no picker that offers both, and pretending otherwise
   * means a folder chosen in a file dialog, which cannot be done.
   */
  ipcMain.handle('dialog:folder', async (_event, startIn?: string): Promise<string | null> => {
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Open folder',
      // The same courtesy, and the same trailing separator - see `asFolder`.
      ...(startIn ? { defaultPath: asFolder(startIn) } : {}),
      properties: ['openDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  /**
   * Where a tab could be, for the prompt that is typed instead of clicked: the
   * directories inside the one named so far, and what zoxide would jump to for a bare
   * word. Home comes along because the renderer has no business knowing the platform.
   */
  ipcMain.handle('places:suggest', async (_event, parent: string, term: string) => ({
    home: homeDirectory(),
    dirs: listDirectories(normalize(parent)),
    frecent: term === '' ? [] : await queryZoxide(term)
  }))

  /** Whether a path dropped into the window is a directory, so it can become the place. */
  ipcMain.handle('path:isDirectory', (_event, path: string) => {
    try {
      return statSync(normalize(path)).isDirectory()
    } catch {
      return false
    }
  })

  /**
   * The files this place keeps: what has been opened here before, so a project opened
   * again offers the same few files rather than an empty list.
   */
  ipcMain.handle('history:list', (_event, root: string) => rememberedIn(normalize(root)))

  ipcMain.on('history:note', (_event, root: string, path: string) => {
    noteOpened(normalize(root), normalize(path))
  })

  ipcMain.on('history:forget', (_event, root: string, path: string) => {
    forgetOpened(normalize(root), normalize(path))
  })

  ipcMain.handle('files:list', (_event, root: string) => listFiles(normalize(root)))

  ipcMain.handle('files:resolve', (_event, root: string, candidates: string[]) =>
    candidates.map((candidate) => resolveFile(normalize(root), candidate))
  )

  /*
   * The taskbar button is the only place a state can be read without finding the
   * window first. Windows colours the button from the progress bar, which fits these
   * states exactly. How many tabs are waiting is a separate signal, drawn onto the
   * icon itself - see `taskbar:icon` below.
   */
  // Drawn: the question is on screen, so it is now waiting for a person, not for code.
  ipcMain.on('ask:drawn', (_event, id: number) => {
    if (pendingAsk?.id === id) pendingAsk.drawn = true
  })

  ipcMain.on('ask:answer', (_event, id: number, answer: number) => {
    if (pendingAsk?.id === id) pendingAsk.settle(answer)
  })

  ipcMain.on('taskbar:set', (_event, state: TaskbarState) => {
    if (!win || win.isDestroyed()) return
    const shown = TASKBAR[state] ?? TASKBAR.none
    win.setProgressBar(shown.progress, { mode: shown.mode })
    // Flashing is for the states that want you back, and only while you are away.
    win.flashFrame(shown.wantsYou && !win.isFocused())
  })

  /*
   * The badge with the number of tabs waiting for you, hung on the corner of the
   * taskbar button. This is the one mechanism Windows keeps up to date: the icon of
   * a window can be replaced too, and allows any corner, but the taskbar holds on to
   * the icon it first associated with the executable and ignores what comes later.
   */
  /*
   * The tray is dressed from the renderer, which is the side that knows the language
   * and already draws the icon with its badge - the main process only hangs things up.
   */
  ipcMain.on(
    'tray:set',
    (_event, icon: string | null, text: typeof trayText, tip: string, holds: boolean) => {
      guarded = holds
      trayText = { ...trayText, ...text }
      if (!tray) return
      tray.setToolTip(tip)
      if (icon) {
        const image = nativeImage.createFromDataURL(icon)
        if (!image.isEmpty()) tray.setImage(image.resize({ width: 16, height: 16 }))
      } else {
        const plain = trayIcon()
        if (!plain.isEmpty()) tray.setImage(plain)
      }
      refreshTray()
    }
  )

  ipcMain.on('taskbar:badge', (_event, dataUrl: string | null, count: number) => {
    if (!win || win.isDestroyed()) return
    if (!dataUrl) {
      win.setOverlayIcon(null, '')
      return
    }
    const image = nativeImage.createFromDataURL(dataUrl)
    if (!image.isEmpty()) win.setOverlayIcon(image, `${count} waiting`)
  })

  // Only ever from the button; nothing here starts an agent on its own.
  ipcMain.handle('summary:ask', (_event, cwd: string, prompt: string) =>
    askSummary(normalize(cwd), prompt)
  )

  ipcMain.handle('usage:read', (_event, cwd: string) => readUsage(cwd))

  // The token this needs never leaves the main process; the renderer gets percentages.
  ipcMain.handle('limits:read', () => readPlanUsage())

  ipcMain.handle('clipboard:read', () => clipboard.readText())

  ipcMain.handle('terminal:create', (_event, id: string, cwd: string) =>
    terminals?.create(id, cwd) ?? { ok: false, error: 'Terminals are not ready' }
  )
  // Keystrokes and resizes are frequent and need no answer.
  ipcMain.on('terminal:write', (_event, id: string, data: string) => terminals?.write(id, data))
  ipcMain.on('terminal:resize', (_event, id: string, cols: number, rows: number) =>
    // Written down because a size is the one thing the window sends a running program
    // without being asked to, and a program that redraws on it can dislike the answer.
    resizeNoted(id, cols, rows)
  )
  ipcMain.handle(
    'terminal:attach',
    (_event, id: string, cwd: string) => terminals?.attach(id, cwd) ?? null
  )
  ipcMain.on('terminal:keep', (_event, ids: string[]) => {
    terminals?.keepOnly(ids)
    // The sizes last reported belong to the shells that are left, and to no others.
    for (const id of [...lastSize.keys()]) if (!ids.includes(id)) lastSize.delete(id)
  })
  /*
   * Write down what every shell has printed, on request. The one question a screenshot
   * cannot answer is what the program in the pane said as it went: a program that draws
   * a screen clears up after itself on the way out, and its last words go with it.
   */
  ipcMain.handle('terminal:dump', async (_event, label?: string): Promise<string[]> => {
    const written: string[] = []
    const suffix = typeof label === 'string' && /^[a-z-]{1,20}$/.test(label) ? '-' + label : ''
    for (const shell of terminals?.dump() ?? []) {
      const file = join(app.getPath('userData'), 'shell-' + shell.id + suffix + '.txt')
      const head = 'shell ' + shell.id + ' in ' + shell.cwd + ' (asked for ' + shell.asked + ')'
      try {
        await writeFile(file, head + '\n\n' + shell.text, 'utf8')
        written.push(file)
      } catch (error) {
        note('could not write ' + file + ': ' + String(error))
      }
    }
    note('wrote what the shells have printed: ' + (written.join(', ') || 'nothing to write'))
    return written
  })
  /** One line from the window, for the things only the window can see. */
  ipcMain.on('window:note', (_event, line: string) => note('window: ' + line))
  ipcMain.on('terminal:kill', (_event, id: string) => terminals?.kill(id))

  ipcMain.handle('shell:external', (_event, url: string) => {
    openExternal(url)
  })

  ipcMain.handle('shell:reveal', (_event, path: string) => {
    shell.showItemInFolder(normalize(path))
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const files = collectFileArgs(argv)
    /*
     * Starting it again is how anyone comes back to a window hidden in the tray - and if
     * there is no window at all, starting it again should be exactly that: a window.
     * Whether the application can be running without one was never established; this
     * makes the answer not matter, which is cheaper than finding out.
     */
    if (!win) createWindow()
    showWindow()
    if (files.length > 0) win?.webContents.send('files:open', files)
  })

  app.whenReady().then(() => {
    protocol.handle('mdasset', async (request) => {
      try {
        const url = new URL(request.url)
        const local = decodeURIComponent(url.pathname).replace(/^\/+/, '')
        return await net.fetch(pathToFileURL(local).toString())
      } catch {
        return new Response('Not found', { status: 404 })
      }
    })

    const toRenderer = (channel: string, payload: unknown): void => {
      if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
    }

    watcher = new FileWatcher((event) => toRenderer('file:event', event))
    terminals = new TerminalManager(
      (event) => toRenderer('terminal:data', event),
      (event) => toRenderer('terminal:exit', event)
    )

    // No application menu: keeps the UI minimal and leaves Ctrl+O/W/Tab to the renderer.
    Menu.setApplicationMenu(null)
    applyTheme(state.theme)

    registerIpc()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  /*
   * Reached only when the window really closed - hiding it prevents the close, so this
   * never fires for a window that went to the tray. Getting here therefore means there
   * was nothing to keep running for.
   */
  app.on('window-all-closed', () => {
    app.quit()
  })

  /*
   * Everything destructive waits for `will-quit`, the first moment a quit cannot be
   * refused any more. `before-quit` runs before the window is even asked to close, and
   * unsaved edits refuse that close - so tearing the shells down there killed the
   * agents of a quit that then did not happen, leaving the window back on screen with
   * dead shells and no file watcher.
   */
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    terminals?.disposeAll()
    void watcher?.dispose()
  })

  app.on('before-quit', () => {
    quitting = true
    persistNow()
  })
}
