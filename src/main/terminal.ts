import { spawn, type IPty } from 'node-pty'
import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { note } from './log'
import { Trail } from '../shared/trail'
import type { TerminalData, TerminalExit, TerminalStart } from '../shared/types'

const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24

/**
 * How much of each shell's output is kept for a window that has to be rebuilt.
 *
 * Generous, because the thing being put back is usually an agent mid-conversation and
 * the screen it draws is most of this on its own; still bounded, because a shell can
 * print for hours and nobody is going to read the beginning of that.
 */
const TRAIL_LIMIT = 256 * 1024

/** A running shell, and what it has said. */
type Live = {
  pty: IPty
  /**
   * The directory the pane asked for. This, and not where the shell actually ended up,
   * is what an adopting pane has to agree with: a place that does not exist falls back
   * to the home directory, and comparing against the fallback would mean a tab over a
   * directory that has since been deleted lost its shell - and whatever was running in
   * it - on every rebuilt window.
   */
  asked: string
  /** Where it is really running, which is the same thing unless the place was gone. */
  cwd: string
  trail: Trail
}

/**
 * Two paths naming the same directory, as far as deciding whether a shell belongs to a
 * pane goes. Windows says C:\Dev and C:\dev are the same place and so does this.
 */
function samePlace(a: string, b: string): boolean {
  const normal = (p: string): string =>
    (process.platform === 'win32' ? p.toLowerCase() : p).replace(/[\\/]+$/, '')
  return normal(a) === normal(b)
}

/**
 * Shells are resolved here, never named by the renderer: a pane asks for "a shell
 * in this directory" and gets whatever this process decides to run. That keeps the
 * IPC surface from becoming a way to execute an arbitrary binary.
 */
function findOnPath(exe: string): string | null {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  for (const dir of dirs) {
    const candidate = join(dir, exe)
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // keep looking
    }
  }
  return null
}

function resolveShell(): { file: string; args: string[] } {
  if (process.platform !== 'win32') {
    return { file: process.env.SHELL || '/bin/bash', args: [] }
  }
  // PowerShell 7 when it is installed, Windows PowerShell otherwise.
  const pwsh = findOnPath('pwsh.exe')
  if (pwsh) return { file: pwsh, args: ['-NoLogo'] }
  const powershell = findOnPath('powershell.exe')
  if (powershell) return { file: powershell, args: ['-NoLogo'] }
  return { file: process.env.COMSPEC || 'cmd.exe', args: [] }
}

/**
 * `BROWSER=none` is the convention Vite, Create React App and others follow to mean
 * "do not launch a browser". A project with `server.open: true` would otherwise
 * throw the page into the system browser, which is the one place this app exists to
 * avoid sending it. Unset it in the shell (`$env:BROWSER = ''`) to get that back.
 */
function shellEnv(): Record<string, string> {
  return { ...(process.env as Record<string, string>), BROWSER: 'none' }
}

export class TerminalManager {
  private terminals = new Map<string, Live>()

  constructor(
    private readonly onData: (event: TerminalData) => void,
    private readonly onExit: (event: TerminalExit) => void
  ) {}

  create(id: string, cwd: string): TerminalStart {
    this.kill(id)

    let workingDir = cwd
    try {
      if (!statSync(workingDir).isDirectory()) workingDir = process.env.USERPROFILE ?? process.cwd()
    } catch {
      workingDir = process.env.USERPROFILE ?? process.cwd()
    }

    const shell = resolveShell()
    try {
      const term = spawn(shell.file, shell.args, {
        name: 'xterm-256color',
        cols: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
        cwd: workingDir,
        env: shellEnv()
      })
      const live: Live = { pty: term, asked: cwd, cwd: workingDir, trail: new Trail(TRAIL_LIMIT) }
      term.onData((data) => {
        live.trail.add(data)
        this.onData({ id, data })
      })
      term.onExit(({ exitCode }) => {
        this.terminals.delete(id)
        note('shell ' + id + ' ended by itself with code ' + exitCode)
        this.onExit({ id, exitCode })
      })
      this.terminals.set(id, live)
      note(
        'shell ' +
          id +
          ' started in ' +
          workingDir +
          (workingDir === cwd ? '' : ' (asked for ' + cwd + ', which is not a directory)')
      )
      return { ok: true, shell: shell.file }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: message }
    }
  }

  /**
   * Hand a shell that is already running back to a pane that is asking for one, and
   * with it everything it has printed so far.
   *
   * This is what makes a window disposable. The shells are here, not in the window, so
   * a reload - development saving a file, a renderer that died, a page in the web pane
   * that took the process with it - is a redraw rather than the end of whatever was
   * running. Null means there is nothing to take over and the pane should start a shell
   * of its own.
   *
   * A pane that asks about a different directory than the shell was started in is not
   * the pane that owns it: ids are handed out in order, so a stale session file can
   * point the same id at a different tab. That shell is nobody's and is ended here,
   * rather than adopted into a place it does not belong to.
   */
  attach(id: string, cwd: string): string | null {
    const live = this.terminals.get(id)
    if (!live) {
      note('shell ' + id + ' asked for in ' + cwd + ', none running - starting one')
      return null
    }
    if (!samePlace(live.asked, cwd)) {
      note('shell ' + id + ' belongs to ' + live.asked + ', not to ' + cwd + ' - ending it')
      this.kill(id)
      return null
    }
    const trail = live.trail.text()
    note('shell ' + id + ' taken over, ' + trail.length + ' characters replayed')
    return trail
  }

  /**
   * End every shell that is not in the list. The window says what it has once it knows,
   * and everything else running is by definition nobody's - which is how a shell whose
   * tab did not come back gets cleaned up, now that a reload no longer kills them all.
   */
  keepOnly(ids: string[]): void {
    const wanted = new Set(ids)
    note('the window has ' + (ids.join(', ') || 'no panes') + '; running: ' + ([...this.terminals.keys()].join(', ') || 'none'))
    for (const id of [...this.terminals.keys()]) {
      if (wanted.has(id)) continue
      note('shell ' + id + ' belongs to no pane - ending it')
      this.kill(id)
    }
  }

  write(id: string, data: string): void {
    this.terminals.get(id)?.pty.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const live = this.terminals.get(id)
    if (!live) return
    // A zero dimension happens while a pane is hidden and would upset ConPTY.
    if (cols < 1 || rows < 1) return
    try {
      live.pty.resize(cols, rows)
    } catch {
      // The process may have exited between the check and the call.
    }
  }

  kill(id: string): void {
    const live = this.terminals.get(id)
    if (!live) return
    this.terminals.delete(id)
    try {
      live.pty.kill()
    } catch {
      // Already gone.
    }
  }

  /** How many shells are alive. What closing the window would take with it. */
  count(): number {
    return this.terminals.size
  }

  disposeAll(): void {
    for (const id of [...this.terminals.keys()]) this.kill(id)
  }
}
