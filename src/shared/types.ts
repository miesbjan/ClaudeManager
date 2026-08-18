/** Types shared between main, preload and renderer. Type-only, no runtime code. */

export type FileReadResult =
  | { ok: true; path: string; dir: string; content: string; mtimeMs: number }
  | { ok: false; path: string; dir: string; error: string }

export type FileEvent = {
  path: string
  type: 'change' | 'unlink'
}

/** 'system' follows Windows; the other two force the palette. */
export type Theme = 'system' | 'light' | 'dark'

export type StartupPayload = {
  files: string[]
  active: string | null
  theme: Theme
}

export type SessionState = {
  files: string[]
  active: string | null
}

export interface ViewerApi {
  /** Native file dialog; returns selected absolute paths (may be empty). */
  openDialog(): Promise<string[]>
  /** Read a file as UTF-8 text. Never throws; failures come back as ok:false. */
  readFile(path: string): Promise<FileReadResult>
  /** Start watching a file for external changes. */
  watch(path: string): Promise<void>
  /** Stop watching a file. */
  unwatch(path: string): Promise<void>
  /** Files to restore on launch (previous session + files passed on the command line). */
  getStartupFiles(): Promise<StartupPayload>
  /** Persist the open-file list so it can be restored next launch. */
  saveSession(state: SessionState): void
  /** Switch the palette; also persisted for the next launch. */
  setTheme(theme: Theme): Promise<void>
  /** Open http/https/mailto links in the default browser. */
  openExternal(url: string): Promise<void>
  /** Show the file in Windows Explorer. */
  reveal(path: string): Promise<void>
  /** Resolve a dropped File to its absolute path (needs Electron webUtils). */
  getPathForFile(file: File): string
  /** Watcher notifications for files opened in tabs. */
  onFileEvent(cb: (event: FileEvent) => void): () => void
  /** Files pushed by the main process (second instance / file association). */
  onOpenFiles(cb: (paths: string[]) => void): () => void
}
