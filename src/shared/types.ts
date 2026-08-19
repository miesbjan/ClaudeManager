/** Types shared between main, preload and renderer. Type-only, no runtime code. */
import type { PaneCommand } from './shortcuts'

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
  panes: Record<string, PaneState>
}

/** Layout of one tab: whether the shell pane is open and how wide it is. */
export type PaneState = {
  terminal: boolean
  /** Width of the terminal pane as a fraction of the tab, 0.15-0.85. */
  ratio: number
  /** The run command chosen for this document, when the project offers several. */
  run?: string | null
  /** Address of the dev server seen for this document. */
  web?: string | null
  /** Whether the right side showed the document, the dev server, or both. */
  rightMode?: 'doc' | 'web' | 'both'
  /** Width of the document as a fraction of the right side. */
  rightRatio?: number
  /** Older state knew only "the server is showing"; kept so it still restores. */
  showWeb?: boolean
  /** The address was typed by hand rather than read from the output. */
  webManual?: boolean
}

/** The project a document belongs to, and the single command that runs it. */
export type ProjectInfo = {
  kind: 'node' | 'dotnet'
  /** Directory the command must run in. */
  root: string
  name: string | null
  /** Usually one; a monorepo offers one per app and the user picks. */
  commands: string[]
}

export type SessionState = {
  files: string[]
  active: string | null
  panes: Record<string, PaneState>
}

/** Output from a shell, addressed to the pane that owns it. */
export type TerminalData = {
  id: string
  data: string
}

export type TerminalExit = {
  id: string
  exitCode: number
}

export type TerminalStart =
  | { ok: true; shell: string }
  | { ok: false; error: string }

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
  /** Find the project a document belongs to; null when nothing is recognised. */
  detectProject(dir: string): Promise<ProjectInfo | null>
  /** Read the system clipboard, for pasting into a shell. */
  readClipboard(): Promise<string>
  /**
   * Shell panes. The renderer never names an executable - it asks for a shell in a
   * directory and the main process decides what to run.
   */
  terminal: {
    create(id: string, cwd: string): Promise<TerminalStart>
    write(id: string, data: string): void
    resize(id: string, cols: number, rows: number): void
    kill(id: string): void
    onData(cb: (event: TerminalData) => void): () => void
    onExit(cb: (event: TerminalExit) => void): () => void
  }
  /**
   * Pane keys, claimed by the main process so they work even while a page in the
   * web pane has focus and would otherwise swallow them.
   */
  onPaneCommand(cb: (command: PaneCommand) => void): () => void
  /** Watcher notifications for files opened in tabs. */
  onFileEvent(cb: (event: FileEvent) => void): () => void
  /** Files pushed by the main process (second instance / file association). */
  onOpenFiles(cb: (paths: string[]) => void): () => void
}
