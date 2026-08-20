/**
 * The prompt buffer: a place to compose a longer instruction before it goes into the
 * shell. Writing a multi-line prompt straight into a TUI is a fight, because the first
 * newline submits it.
 *
 * What goes over is decided here, away from the DOM: everything else about the buffer
 * is a textarea and a key.
 */

/**
 * What to send for the text as typed, or null when there is nothing to send.
 *
 * Trailing blank lines are dropped: they are what a buffer collects while it is being
 * written, and the newline that submits the prompt is sent separately - a stray one on
 * the end would submit the prompt before the rest of it arrived.
 */
export function sendable(text: string): string | null {
  const trimmed = text.replace(/[\s]+$/, '')
  return trimmed === '' ? null : trimmed
}

/** A one-line summary for the tab, so a buffer with something in it is not forgotten. */
export function promptSummary(text: string): string | null {
  const first = text.split('\n').find((line) => line.trim() !== '')
  if (first === undefined) return null
  const lines = text.split('\n').filter((line) => line.trim() !== '').length
  const head = first.trim().slice(0, 60)
  return lines > 1 ? head + ' (+' + (lines - 1) + ')' : head
}
