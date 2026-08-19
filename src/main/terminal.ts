import { spawn, type IPty } from 'node-pty'
import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { TerminalData, TerminalExit, TerminalStart } from '../shared/types'

const DEFAULT_COLS = 80
const DEFAULT_ROWS = 24

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

export class TerminalManager {
  private terminals = new Map<string, IPty>()

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
        env: process.env as Record<string, string>
      })
      term.onData((data) => this.onData({ id, data }))
      term.onExit(({ exitCode }) => {
        this.terminals.delete(id)
        this.onExit({ id, exitCode })
      })
      this.terminals.set(id, term)
      return { ok: true, shell: shell.file }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, error: message }
    }
  }

  write(id: string, data: string): void {
    this.terminals.get(id)?.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const term = this.terminals.get(id)
    if (!term) return
    // A zero dimension happens while a pane is hidden and would upset ConPTY.
    if (cols < 1 || rows < 1) return
    try {
      term.resize(cols, rows)
    } catch {
      // The process may have exited between the check and the call.
    }
  }

  kill(id: string): void {
    const term = this.terminals.get(id)
    if (!term) return
    this.terminals.delete(id)
    try {
      term.kill()
    } catch {
      // Already gone.
    }
  }

  disposeAll(): void {
    for (const id of [...this.terminals.keys()]) this.kill(id)
  }
}
