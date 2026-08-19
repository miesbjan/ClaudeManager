import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  FileEvent,
  FileReadResult,
  SessionState,
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
  openExternal: (url) => ipcRenderer.invoke('shell:external', url) as Promise<void>,
  reveal: (path) => ipcRenderer.invoke('shell:reveal', path) as Promise<void>,
  getPathForFile: (file) => webUtils.getPathForFile(file),
  readClipboard: () => ipcRenderer.invoke('clipboard:read') as Promise<string>,
  terminal: {
    create: (id, cwd) => ipcRenderer.invoke('terminal:create', id, cwd) as Promise<TerminalStart>,
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
  onFileEvent: (cb) => {
    const handler = (_event: unknown, data: FileEvent): void => cb(data)
    ipcRenderer.on('file:event', handler)
    return () => ipcRenderer.off('file:event', handler)
  },
  onOpenFiles: (cb) => {
    const handler = (_event: unknown, paths: string[]): void => cb(paths)
    ipcRenderer.on('files:open', handler)
    return () => ipcRenderer.off('files:open', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
