/** Types shared between main, preload and renderer. Type-only, no runtime code. */
import type { TerminalFont } from './font'
import type { RememberedFile } from './history'
import type { Lang } from './i18n'
import type { PlanUsage } from './limits'
import type { PaneCommand } from './shortcuts'

export type FileReadResult =
  | {
      ok: true
      path: string
      dir: string
      content: string
      mtimeMs: number
      /** Only the head of the file is here, so it must not be written back. */
      truncated: boolean
    }
  | { ok: false; path: string; dir: string; error: string }

/**
 * The answer to a save. `stale` means the file changed since it was read, which is
 * the one case the caller is expected to do something about rather than retry.
 */
export type FileWriteResult =
  | { ok: true; mtimeMs: number }
  | { ok: false; reason: 'stale' | 'denied' | 'failed'; error: string }

export type FileEvent = {
  path: string
  type: 'change' | 'unlink'
}

/** 'system' follows Windows; the other two force the palette. */
export type Theme = 'system' | 'light' | 'dark'

/**
 * What the taskbar button shows for the whole window: the most urgent thing any tab
 * has to say. Crosses the IPC boundary, hence here rather than next to the renderer
 * logic that computes it.
 */
/**
 * A question the main process needs answered but the window should draw: closing the
 * window with something running in it, and quitting from the tray. Which question it
 * is travels, not its words - the window is the side that knows the language.
 */
export type AskKind = 'close' | 'quit'

export type AskRequest = { id: number; kind: AskKind }

/**
 * What could be meant by what has been typed into the place prompt: the directories
 * inside the one already named, and - where zoxide is installed - the ones this person
 * actually goes to. Home travels with it so the window need not know the platform.
 */
export type PlaceSuggestions = { home: string; dirs: string[]; frecent: string[] }

export type SummaryResult = { ok: true; text: string } | { ok: false; error: string }

export type TaskbarState = 'none' | 'working' | 'done' | 'permission' | 'alert'

export type StartupPayload = {
  tabs: SessionTab[]
  activeTab: number
  theme: Theme
  lang: Lang
  font: TerminalFont
  /**
   * The Windows build this is running on, or null anywhere else.
   *
   * xterm behaves differently when it knows a ConPTY is on the other end: growing the
   * terminal adds empty rows instead of pulling rows back out of the scrollback, because
   * ConPTY reprints the screen with its own view of it. Without that, making the terminal
   * taller - closing the prompt drawer, a smaller font, a taller window - left the old
   * rows and the reprinted ones on top of each other.
   */
  windowsBuild: number | null
  /**
   * This window is a replacement for one that died, rather than the first one of the
   * session. The shells kept running and have been taken back, but the screen was
   * rebuilt from the session file - so the tab bar may have moved and anything the
   * window itself was holding is gone. Said out loud, because a window that silently
   * rearranges itself is indistinguishable from a window that lost your work.
   */
  rebuilt: boolean
}

/** Layout of one tab: whether the shell pane is open and how wide it is. */
export type PaneState = {
  terminal: boolean
  /** Width of the terminal pane as a fraction of the tab, 0.15-0.85. */
  ratio: number
  /** The run command chosen here, when the project offers several. */
  run: string | null
  /** Address of the dev server seen in this place. */
  web: string | null
  /** Whether the right side showed the document or the dev server. */
  rightMode: 'doc' | 'web'
  /** The address was typed by hand rather than read from the output. */
  webManual: boolean
  /**
   * The directory this tab is a place over, chosen rather than derived. Null for a tab
   * that only ever had a file opened in it, where the file's own directory is the place.
   */
  root: string | null
  /** The prompt being composed for this shell, and whether its drawer is open. */
  prompt: string
  promptOpen: boolean
  /**
   * Older state knew only "the server is showing". Read on the way in and never
   * written, which is why it is the one optional field here.
   */
  showWeb?: boolean
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

/** One place, with the files it holds and which of them was on screen. */
export type SessionTab = {
  /**
   * Which tab this is, kept rather than derived.
   *
   * A shell belongs to a tab by this name, and shells outlive the window they are shown
   * in - so a window rebuilt from this file asks for its shells back by it. Handing the
   * names out again in file order looked like the same thing and is not: close a tab,
   * reorder two, drop an empty one, and every name afterwards points at a different tab
   * than it did. That was the difference between taking a shell back and killing it, and
   * for two tabs over one directory it was worse than either - they swapped agents.
   *
   * Absent in a file written before this existed, in which case the window names the tab
   * itself and nothing is lost beyond that one restore.
   */
  id?: string | null
  files: string[]
  active: string | null
  /**
   * Unsaved edits, by the path they belong to.
   *
   * A draft is work, exactly like the half-written prompt beside it, and it used to live
   * only in the window's memory - so a window that had to be rebuilt took it with it,
   * silently. `beforeunload` does not stop a rebuild (measured, not assumed), and after a
   * crash there is nothing left to ask anyway; the only way to keep an edit is to have
   * written it down before.
   */
  drafts?: Record<string, string>
  pane: PaneState
  /** A name given by hand, which beats the name of the file being shown. */
  name?: string | null
}

/** Every file of a project worth opening, and whether the cap cut the answer short. */
export type FileListing = {
  files: string[]
  truncated: boolean
}

export type SessionState = {
  tabs: SessionTab[]
  activeTab: number
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

/** What the session in a tab's shell has used so far. */
export type SessionUsage = {
  model: string | null
  /** Everything the model had in front of it on its last turn. */
  contextTokens: number
  /** Added up over the session. */
  outputTokens: number
  updatedAt: number
}

export interface ViewerApi {
  /** Native file dialog; returns selected absolute paths (may be empty). */
  /**
   * Pick files to open. `startIn` is where the dialog opens - the directory the tab is
   * already in, which is where the file being looked for nearly always is.
   */
  openDialog(startIn?: string): Promise<string[]>
  /** Read a file as UTF-8 text. Never throws; failures come back as ok:false. */
  readFile(path: string): Promise<FileReadResult>
  /** Start watching a file for external changes. */
  watch(path: string): Promise<void>
  /**
   * These are the files this window has open. Anything else being watched belongs to a
   * window that no longer exists, and is let go.
   */
  keepWatching(paths: string[]): void
  /** Stop watching a file. */
  unwatch(path: string): Promise<void>
  /** Files to restore on launch (previous session + files passed on the command line). */
  getStartupFiles(): Promise<StartupPayload>
  /** Persist the open-file list so it can be restored next launch. */
  saveSession(state: SessionState): void
  /** Switch the palette; also persisted for the next launch. */
  setTheme(theme: Theme): Promise<void>
  /** Switch the interface language; also persisted for the next launch. */
  setLang(lang: Lang): Promise<void>
  /** Remember the terminal font size, the way the theme is remembered. */
  setTerminalFontSize(size: number): void
  /**
   * Write a file the user has open. `seenMtimeMs` is the modification time the
   * renderer last read: if the file has moved on since, the write is refused rather
   * than quietly winning over whoever else wrote it.
   */
  writeFile(path: string, content: string, seenMtimeMs: number): Promise<FileWriteResult>
  /** Open http/https/mailto links in the default browser. */
  openExternal(url: string): Promise<void>
  /** Show the file in Windows Explorer. */
  reveal(path: string): Promise<void>
  /** Resolve a dropped File to its absolute path (needs Electron webUtils). */
  getPathForFile(file: File): string
  /** Find the project a document belongs to; null when nothing is recognised. */
  detectProject(dir: string): Promise<ProjectInfo | null>
  /** Pick a directory for a tab to be a place over. Null when nothing was chosen. */
  openFolderDialog(startIn?: string): Promise<string | null>
  /** Whether a dropped path is a directory rather than a file. */
  isDirectory(path: string): Promise<boolean>
  /** Directories to offer for a half-typed path, plus whatever zoxide would suggest. */
  suggestPlaces(parent: string, term: string): Promise<PlaceSuggestions>
  /** The files this place keeps, most recent first: what has been opened here before. */
  rememberedFiles(root: string): Promise<RememberedFile[]>
  /** A file was opened in a place, which is what makes it remembered there. */
  noteOpenedFile(root: string, path: string): void
  /**
   * Stop offering this file in this place. For the one opened by mistake, which the
   * place would otherwise keep at the top of the list for ever.
   */
  forgetFileHere(root: string, path: string): void
  /** Files under a directory, for the palette. Build output and dot-dirs are skipped. */
  listFiles(root: string): Promise<FileListing>
  /**
   * Which of these are files that exist, resolved against `root` when relative. One
   * answer per candidate, in the same order, null for the ones that are not files.
   */
  resolveFiles(root: string, candidates: string[]): Promise<Array<string | null>>
  /** Questions from the main process, drawn by the window and answered by index. */
  onAsk(handler: (request: AskRequest) => void): () => void
  /** The box is on screen: the wait is now for a person, not for the window. */
  askDrawn(id: number): void
  answerAsk(id: number, answer: number): void
  /**
   * Put the state of the busiest tab on the taskbar button, so it can be read without
   * finding the window first. The renderer decides what the aggregate is; the main
   * process only knows how to show it.
   */
  setTaskbarState(state: TaskbarState): void
  /**
   * The badge for the taskbar button - how many tabs are waiting - drawn by the
   * renderer, or null when none are. `count` is for the description a screen reader
   * reads out.
   */
  setTaskbarBadge(dataUrl: string | null, count: number): void

  /**
   * The tray icon and the words on its menu. Closing the window hides it there rather
   * than ending the application, so this is the way back - and the renderer is the
   * side that knows both the language and what the icon should look like.
   */
  setTray(
    icon: string | null,
    text: Record<string, string>,
    tooltip: string,
    /** Whether an agent is in one of the tabs, which is what closing must not kill. */
    holds: boolean
  ): void
  /**
   * Ask the agent what has been happening in this place. Runs the CLI in print mode,
   * outside any shell, and only ever because somebody pressed the button.
   */
  askSummary(cwd: string, prompt: string): Promise<SummaryResult>
  /** How much the Claude session running in this directory has used, if any is. */
  readUsage(cwd: string): Promise<SessionUsage | null>
  /** How much of the subscription is used - the same numbers `/usage` reports. */
  readPlanUsage(): Promise<PlanUsage | null>
  /** Read the system clipboard, for pasting into a shell. */
  readClipboard(): Promise<string>
  /**
   * Write down one line about something only the window can see - a pane built or
   * thrown away, a layout that changed. The main process keeps the log; this is how
   * the half of the story that happens up here gets into it.
   */
  note(line: string): void
  /**
   * Write what every shell has printed to a file each, and answer with the paths. The
   * label distinguishes one dump from the next, so a pair taken around one event can be
   * compared instead of overwriting each other.
   */
  dumpShells(label?: string): Promise<string[]>
  /**
   * Shell panes. The renderer never names an executable - it asks for a shell in a
   * directory and the main process decides what to run.
   */
  terminal: {
    create(id: string, cwd: string): Promise<TerminalStart>
    /**
     * Take over the shell this pane had before the window was reloaded, if it is still
     * running in the main process. Answers with what has been printed in it so far, or
     * null when there is nothing to take over and a new shell has to be started.
     *
     * The directory is part of the question rather than decoration: tab ids are handed
     * out in order and a stale session file could hand the same id to a different tab,
     * and a shell adopted into the wrong place is worse than a new one.
     */
    attach(id: string, cwd: string): Promise<string | null>
    /**
     * These are the panes that exist; anything else running is nobody's. Sent once the
     * window knows what it has, which is how a shell whose tab is gone gets cleaned up
     * now that a reload no longer kills them all.
     */
    keep(ids: string[]): void
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
  /**
   * The page in the web pane died. It runs in a process of its own, so this is news
   * rather than the end of the application - but the pane goes blank, and a blank pane
   * with no explanation is the kind of thing that gets blamed on the app around it.
   */
  onWebGone(cb: () => void): () => void
}
