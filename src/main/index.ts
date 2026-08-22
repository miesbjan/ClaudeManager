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
  Tray
} from 'electron'
import { existsSync, statSync } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, normalize, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Lang } from '../shared/i18n'
import { FileWatcher } from './fileWatcher'
import { detectProject } from './project'
import { readPlanUsage } from './limits'
import { readUsage } from './usage'
import { listFiles } from './listFiles'
import { noteOpened, rememberedIn } from './history'
import { homeDirectory, listDirectories, queryZoxide } from './places'
import { resolveFile } from './resolveFile'
import { TerminalManager } from './terminal'
import { loadState, saveState, terminalFont, type AppState } from './store'
import { clampSize } from '../shared/font'
import { closeAction } from '../shared/closing'
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
let announcedHiding = false

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
  hidden: 'Project Console is still running',
  hiddenBody: 'Sessions carry on. Click the tray icon to come back.',
  closeAsk: 'Something is running in a shell. Close it, or keep it running in the tray?',
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
let pendingAsk: { id: number; settle: (answer: number) => void; drawn: boolean } | null = null
let nextAskId = 1

/** How long the window gets to draw the box before the system box takes over. */
const ASK_DRAW_MS = 1500

function askWindow(kind: AskKind, fallback: { message: string; buttons: string[] }): Promise<number> {
  if (!win || win.isDestroyed()) return Promise.resolve(systemAsk(fallback))

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
    pendingAsk = { id, settle, drawn: false }
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

/** Out of the way, still running, and said once - see `announcedHiding`. */
function hideWindow(): void {
  win?.hide()
  if (!tray || announcedHiding) return
  announcedHiding = true
  tray.displayBalloon({ title: trayText.hidden, content: trayText.hiddenBody })
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
  if (icon.isEmpty()) return
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
      spellcheck: false
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
   * A renderer that goes away takes the knowledge of which shell belonged to which
   * pane with it, but not the shells themselves: nothing calls dispose on the way out,
   * so every PTY it had open would be left running with no owner. A reload is exactly
   * that, and in development it happens on every saved file.
   */
  win.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) terminals?.disposeAll()
  })

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F12') {
      win?.webContents.toggleDevTools()
      return
    }

    /*
     * Pane keys are claimed here rather than in the renderer alone. A page shown in
     * the web pane is a frame of its own: once it has focus it swallows every key,
     * and Alt+W - the way back out - would never arrive. Taking them before the page
     * sees them keeps the panes reachable from wherever the cursor happens to be.
     */
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
        else hideWindow()
      })
      return
    }
    quitNow()
  })
  win.on('closed', () => {
    win = null
  })

  ensureTray()

  if (DEV_URL) void win.loadURL(DEV_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function registerIpc(): void {
  ipcMain.handle('dialog:open', async (): Promise<string[]> => {
    if (!win) return []
    const result = await dialog.showOpenDialog(win, {
      title: 'Open file',
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
    return { tabs, activeTab, theme: state.theme, lang: state.lang, font: terminalFont(state) }
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
  ipcMain.handle('dialog:folder', async (): Promise<string | null> => {
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Open folder',
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
    terminals?.resize(id, cols, rows)
  )
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
    if (win) {
      // Starting it again is how anyone comes back to a window hidden in the tray.
      showWindow()
      if (files.length > 0) win.webContents.send('files:open', files)
    }
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
