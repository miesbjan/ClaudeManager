import { spawn, type IPty } from 'node-pty'
import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { note } from './log'
import { Trail } from '../shared/trail'
import type { TerminalData, TerminalExit, TerminalStart } from '../shared/types'

/**
 * The size a shell starts at when nobody has said how big its pane is yet. Only a
 * fallback: a pane measures itself and says so, and that answer usually arrives before
 * the shell does - see `pending`.
 */
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
  /**
   * Sizes that arrived before the shell they describe.
   *
   * A pane measures itself as soon as it is on screen, which is before the shell it
   * asked for has finished starting - the measuring is synchronous and starting one is
   * not. That size used to be dropped for want of anywhere to put it, and the pane never
   * sent it again, since as far as it was concerned it already had: so the shell kept the
   * fallback 80x24 for the rest of its life while the terminal drawing it was a different
   * shape entirely. Anything that draws a screen - which is every agent - then drew it to
   * the wrong width, and the first later resize made it repaint and appear to lose
   * everything above.
   */
  private pending = new Map<string, { cols: number; rows: number }>()

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
      const size = this.pending.get(id)
      this.pending.delete(id)
      const term = spawn(shell.file, shell.args, {
        name: 'xterm-256color',
        cols: size?.cols ?? DEFAULT_COLS,
        rows: size?.rows ?? DEFAULT_ROWS,
        cwd: workingDir,
        env: shellEnv()
      })
      const live: Live = { pty: term, asked: cwd, cwd: workingDir, trail: new Trail(TRAIL_LIMIT) }
      term.onData((data) => {
        live.trail.add(data)
        this.onData({ id, data })
      })
      term.onExit(({ exitCode }) => {
        /*
         * Only if this is still the shell under that name. Ending one and starting
         * another under the same name is an ordinary thing here - a pane whose place no
         * longer matches does exactly that - and killing a pty is not instant, so this
         * used to arrive late and delete the replacement, leaving a tab reporting a shell
         * that had just started and a process nobody had a handle on any more.
         */
        if (this.terminals.get(id) !== live) return
        this.terminals.delete(id)
        note('shell ' + id + ' ended by itself with code ' + exitCode)
        this.onExit({ id, exitCode })
      })
      this.terminals.set(id, live)
      note(
        'shell ' +
          id +
          ' started at ' +
          (size ? size.cols + 'x' + size.rows : DEFAULT_COLS + 'x' + DEFAULT_ROWS + ' by default') +
          ' in ' +
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
    const live = this.terminals.get(id)
    if (!live) {
      /*
       * Nowhere to put it. The window holds what is typed until its shell answers, so
       * this should not happen - and if it does, whatever was typed is gone, which is
       * exactly the kind of loss that is impossible to explain afterwards without a line
       * like this one. The text itself is not written down; it is the person's, and some
       * of what goes into a shell is a password.
       */
      note('shell ' + id + ' was written to (' + data.length + ' characters) but is not running')
      return
    }
    live.pty.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    // A zero dimension happens while a pane is hidden and would upset ConPTY.
    if (cols < 1 || rows < 1) return
    const live = this.terminals.get(id)
    if (!live) {
      // The pane is ready before its shell is. Kept, so the shell can start this size.
      this.pending.set(id, { cols, rows })
      return
    }
    try {
      live.pty.resize(cols, rows)
    } catch (error) {
      /*
       * Kept rather than forgotten. The window records a size as delivered the moment it
       * sends it and only sends one that differs from the last, so a refusal here used to
       * mean the shell stayed the wrong shape for the rest of its life - with an agent
       * inside drawing to a width that was not there. Putting it back means the next
       * resize, or the next shell under this name, gets it.
       */
      this.pending.set(id, { cols, rows })
      note('shell ' + id + ' refused ' + cols + 'x' + rows + ': ' + String(error))
    }
  }

  kill(id: string): void {
    this.pending.delete(id)
    const live = this.terminals.get(id)
    if (!live) return
    this.terminals.delete(id)
    try {
      live.pty.kill()
    } catch {
      // Already gone.
    }
  }

  /**
   * Everything running, and the last of what each has printed.
   *
   * The screen a person is looking at can lie - a program that clears it on the way out
   * takes its own last words with it - while this cannot: it is what came off the wire.
   */
  dump(): Array<{ id: string; asked: string; cwd: string; text: string }> {
    return [...this.terminals.entries()].map(([id, live]) => ({
      id,
      asked: live.asked,
      cwd: live.cwd,
      text: live.trail.text()
    }))
  }

  /** How many shells are alive. What closing the window would take with it. */
  count(): number {
    return this.terminals.size
  }

  disposeAll(): void {
    for (const id of [...this.terminals.keys()]) this.kill(id)
  }
}
