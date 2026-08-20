import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeTheme,
  net,
  protocol,
  shell
} from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'
import { FileWatcher } from './fileWatcher'
import { detectProject } from './project'
import { TerminalManager } from './terminal'
import { loadState, saveState, terminalFont, type AppState } from './store'
import { clampSize } from '../shared/font'
import { paneCommand } from '../shared/shortcuts'
import type {
  FileReadResult,
  SessionState,
  StartupPayload,
  TaskbarState,
  Theme
} from '../shared/types'

const MD_PATTERN = /\.(md|markdown|mdown|mkd|mdx)$/i
const DEV_URL = process.env['ELECTRON_RENDERER_URL']

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
let session: SessionState = { files: state.files, active: state.active, panes: state.panes }
const cliFiles = collectMarkdownArgs(process.argv)
let saveTimer: NodeJS.Timeout | null = null

function collectMarkdownArgs(argv: string[]): string[] {
  return argv.slice(1).filter((arg) => !arg.startsWith('-') && MD_PATTERN.test(arg))
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
  state.files = session.files
  state.active = session.active
  state.panes = session.panes
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

  win.on('close', persistNow)
  win.on('closed', () => {
    win = null
  })

  if (DEV_URL) void win.loadURL(DEV_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function registerIpc(): void {
  ipcMain.handle('dialog:open', async (): Promise<string[]> => {
    if (!win) return []
    const result = await dialog.showOpenDialog(win, {
      title: 'Open Markdown file',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'mdx'] },
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
        const content = await readFile(full, 'utf8')
        return { ok: true, path: full, dir, content, mtimeMs: info.mtimeMs }
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

  ipcMain.handle('watch:add', (_event, path: string) => {
    watcher?.add(normalize(path))
  })

  ipcMain.handle('watch:remove', (_event, path: string) => {
    watcher?.remove(normalize(path))
  })

  ipcMain.handle('startup:files', (): StartupPayload => {
    const files = [...session.files]
    for (const file of cliFiles) if (!files.includes(file)) files.push(file)
    const active = cliFiles[cliFiles.length - 1] ?? session.active
    return { files, active, theme: state.theme, panes: state.panes, font: terminalFont(state) }
  })

  // Size is app state, like the theme. The family stays a hand-edited preference.
  ipcMain.on('font:size', (_event, size: number) => {
    state.fontSize = clampSize(size)
    persistSoon()
  })

  ipcMain.handle('theme:set', (_event, theme: Theme) => {
    applyTheme(theme)
    persistSoon()
  })

  ipcMain.on('session:save', (_event, next: SessionState) => {
    session = {
      files: Array.isArray(next?.files) ? next.files : [],
      active: typeof next?.active === 'string' ? next.active : null,
      panes: next?.panes && typeof next.panes === 'object' ? next.panes : {}
    }
    persistSoon()
  })

  ipcMain.handle('project:detect', (_event, dir: string) => detectProject(normalize(dir)))

  /*
   * The taskbar button is the only place a state can be read without finding the
   * window first. Windows colours the button from the progress bar, which fits these
   * states exactly and needs no icon of its own - the app does not have one yet.
   */
  ipcMain.on('taskbar:set', (_event, state: TaskbarState) => {
    if (!win || win.isDestroyed()) return
    const shown = TASKBAR[state] ?? TASKBAR.none
    win.setProgressBar(shown.progress, { mode: shown.mode })
    // Flashing is for the states that want you back, and only while you are away.
    win.flashFrame(shown.wantsYou && !win.isFocused())
  })

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
    const files = collectMarkdownArgs(argv)
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
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

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('will-quit', () => globalShortcut.unregisterAll())

  app.on('before-quit', () => {
    persistNow()
    terminals?.disposeAll()
    void watcher?.dispose()
  })
}
