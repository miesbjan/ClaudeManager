/**
 * Asking the agent about a place, from outside any shell.
 *
 * It runs the same CLI the user runs, in print mode, in the place's own directory:
 * the application still has no model in it and starts nothing on its own - this
 * happens because somebody pressed a button. The command is given the tools needed to
 * read a history and no others, and a bounded number of turns, so the answer cannot
 * quietly become an afternoon's work.
 *
 * Everything that can go wrong ends as a sentence in the box: no CLI on the machine,
 * no repository, a refusal, a timeout. Nothing here throws at the window.
 */
import { execFile } from 'node:child_process'
import { MAX_TURNS, PERMISSION_MODE, tidySummary } from '../shared/summary'
import type { SummaryResult } from '../shared/types'
import { note } from './log'

/** Long enough for a real answer over a real history, short enough to give up on. */
const TIMEOUT_MS = 180_000

/** Answers are short; anything longer is a runaway rather than a summary. */
const MAX_OUTPUT = 64 * 1024

/** The last line of stderr that is not a warning, which is what actually went wrong. */
function lastComplaint(stderr: string): string {
  const lines = (stderr || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !/^warning\b/i.test(line))
  return lines[lines.length - 1] ?? ''
}

export function askSummary(cwd: string, prompt: string): Promise<SummaryResult> {
  return new Promise((resolve) => {
    const started = Date.now()
    note(`summary: asking about ${cwd}`)

    /*
     * `shell: true` because what is on PATH is `claude.cmd`, a shim, and Windows will
     * not run one without a shell. That shell is also why the question is written to
     * the command's input rather than passed as an argument: arguments are joined into
     * a command line without being quoted, so a sentence with spaces and quotation
     * marks in it arrives as a dozen arguments and a syntax error. Print mode reads its
     * question from the input when it is not given one, which is exactly what is wanted.
     */
    const child = execFile(
      'claude',
      ['--print', '--permission-mode', PERMISSION_MODE, '--max-turns', String(MAX_TURNS)],
      { cwd, shell: true, timeout: TIMEOUT_MS, maxBuffer: MAX_OUTPUT, windowsHide: true },
      (error, stdout, stderr) => {
        const seconds = Math.round((Date.now() - started) / 1000)
        if (error) {
          const reason =
            'killed' in error && error.killed
              ? 'timeout'
              : lastComplaint(stderr) || error.message
          note(`summary: failed after ${seconds}s - ${reason}`)
          resolve({ ok: false, error: reason })
          return
        }
        const text = tidySummary(stdout)
        note(`summary: answered in ${seconds}s, ${text.length} characters`)
        resolve(text ? { ok: true, text } : { ok: false, error: 'empty' })
      }
    )

    child.stdin?.end(prompt)

    child.on('error', (error) => {
      note(`summary: could not start - ${error.message}`)
      resolve({ ok: false, error: error.message })
    })
  })
}
