import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { RememberedFile } from '../shared/history'
import type { PlanUsage } from '../shared/limits'
import type { PaneCommand } from '../shared/shortcuts'
import type {
  AskRequest,
  PlaceSuggestions,
  FileEvent,
  FileListing,
  FileReadResult,
  FileWriteResult,
  ProjectInfo,
  SessionState,
  SessionUsage,
  StartupPayload,
  TerminalData,
  TerminalExit,
  TerminalStart,
  Theme,
  ViewerApi
} from '../shared/types'

/**
 * The only channel between the sandboxed renderer and Node/Electron.
 * Every method is an explicit, narrow operation - the rendered Markdown itself
 * has no way to reach anything beyond this surface.
 */
const api: ViewerApi = {
  openDialog: () => ipcRenderer.invoke('dialog:open') as Promise<string[]>,
  readFile: (path) => ipcRenderer.invoke('file:read', path) as Promise<FileReadResult>,
  watch: (path) => ipcRenderer.invoke('watch:add', path) as Promise<void>,
  unwatch: (path) => ipcRenderer.invoke('watch:remove', path) as Promise<void>,
  getStartupFiles: () => ipcRenderer.invoke('startup:files') as Promise<StartupPayload>,
  saveSession: (state: SessionState) => ipcRenderer.send('session:save', state),
  setTheme: (theme: Theme) => ipcRenderer.invoke('theme:set', theme) as Promise<void>,
  setLang: (lang) => ipcRenderer.invoke('lang:set', lang) as Promise<void>,
  setTerminalFontSize: (size) => ipcRenderer.send('font:size', size),
  writeFile: (path, content, seenMtimeMs) =>
    ipcRenderer.invoke('file:write', path, content, seenMtimeMs) as Promise<FileWriteResult>,
  openExternal: (url) => ipcRenderer.invoke('shell:external', url) as Promise<void>,
  reveal: (path) => ipcRenderer.invoke('shell:reveal', path) as Promise<void>,
  getPathForFile: (file) => webUtils.getPathForFile(file),
  detectProject: (dir) => ipcRenderer.invoke('project:detect', dir) as Promise<ProjectInfo | null>,
  openFolderDialog: () => ipcRenderer.invoke('dialog:folder') as Promise<string | null>,
  isDirectory: (path) => ipcRenderer.invoke('path:isDirectory', path) as Promise<boolean>,
  suggestPlaces: (parent, term) =>
    ipcRenderer.invoke('places:suggest', parent, term) as Promise<PlaceSuggestions>,
  rememberedFiles: (root) =>
    ipcRenderer.invoke('history:list', root) as Promise<RememberedFile[]>,
  noteOpenedFile: (root, path) => ipcRenderer.send('history:note', root, path),
  listFiles: (root) => ipcRenderer.invoke('files:list', root) as Promise<FileListing>,
  resolveFiles: (root, candidates) =>
    ipcRenderer.invoke('files:resolve', root, candidates) as Promise<Array<string | null>>,
  onAsk: (handler) => {
    const listener = (_event: IpcRendererEvent, request: AskRequest): void => handler(request)
    ipcRenderer.on('ask:show', listener)
    return () => ipcRenderer.removeListener('ask:show', listener)
  },
  askDrawn: (id) => ipcRenderer.send('ask:drawn', id),
  answerAsk: (id, answer) => ipcRenderer.send('ask:answer', id, answer),
  setTaskbarState: (state) => ipcRenderer.send('taskbar:set', state),
  setTaskbarBadge: (dataUrl, count) => ipcRenderer.send('taskbar:badge', dataUrl, count),
  setTray: (icon, text, tooltip, holds) =>
    ipcRenderer.send('tray:set', icon, text, tooltip, holds),
  readUsage: (cwd) => ipcRenderer.invoke('usage:read', cwd) as Promise<SessionUsage | null>,
  readPlanUsage: () => ipcRenderer.invoke('limits:read') as Promise<PlanUsage | null>,
  readClipboard: () => ipcRenderer.invoke('clipboard:read') as Promise<string>,
  note: (line) => ipcRenderer.send('window:note', line),
  dumpShells: () => ipcRenderer.invoke('terminal:dump') as Promise<string[]>,
  terminal: {
    create: (id, cwd) => ipcRenderer.invoke('terminal:create', id, cwd) as Promise<TerminalStart>,
    attach: (id, cwd) => ipcRenderer.invoke('terminal:attach', id, cwd) as Promise<string | null>,
    keep: (ids) => ipcRenderer.send('terminal:keep', ids),
    write: (id, data) => ipcRenderer.send('terminal:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('terminal:resize', id, cols, rows),
    kill: (id) => ipcRenderer.send('terminal:kill', id),
    onData: (cb) => {
      const handler = (_event: unknown, data: TerminalData): void => cb(data)
      ipcRenderer.on('terminal:data', handler)
      return () => ipcRenderer.off('terminal:data', handler)
    },
    onExit: (cb) => {
      const handler = (_event: unknown, data: TerminalExit): void => cb(data)
      ipcRenderer.on('terminal:exit', handler)
      return () => ipcRenderer.off('terminal:exit', handler)
    }
  },
  onPaneCommand: (cb) => {
    const handler = (_event: unknown, command: PaneCommand): void => cb(command)
    ipcRenderer.on('pane:command', handler)
    return () => ipcRenderer.off('pane:command', handler)
  },
  onFileEvent: (cb) => {
    const handler = (_event: unknown, data: FileEvent): void => cb(data)
    ipcRenderer.on('file:event', handler)
    return () => ipcRenderer.off('file:event', handler)
  },
  onOpenFiles: (cb) => {
    const handler = (_event: unknown, paths: string[]): void => cb(paths)
    ipcRenderer.on('files:open', handler)
    return () => ipcRenderer.off('files:open', handler)
  },
  onWebGone: (cb) => {
    const handler = (): void => cb()
    ipcRenderer.on('web:gone', handler)
    return () => ipcRenderer.off('web:gone', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
