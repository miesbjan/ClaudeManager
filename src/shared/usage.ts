/**
 * Reading how much a Claude Code session has used, from the transcript it keeps
 * anyway. Nothing is sent to the session and nothing is asked of it: the numbers are
 * the ones it already wrote to disk, so watching them cannot disturb the work.
 */
export type UsageTotals = {
  /** Everything the model had in front of it on the last turn. */
  context: number
  /** Added up over the session. */
  output: number
  model: string | null
}

export const EMPTY_TOTALS: UsageTotals = { context: 0, output: 0, model: null }

/** Claude Code names a project's folder after the directory it was started in. */
export function transcriptFolder(cwd: string): string {
  return cwd.replace(/[\\/:]/g, '-')
}

type Usage = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

/**
 * Folds transcript lines into the running totals. Output is summed because it
 * accumulates over a session; context is taken from the last turn alone, since it
 * describes what the model is carrying right now rather than what it has carried.
 */
export function foldUsage(lines: string[], totals: UsageTotals): UsageTotals {
  let next = totals

  for (const line of lines) {
    const text = line.trim()
    if (text === '') continue

    let entry: { message?: { usage?: Usage; model?: string } }
    try {
      entry = JSON.parse(text) as typeof entry
    } catch {
      continue // a line still being written, or something we do not understand
    }

    const usage = entry.message?.usage
    if (!usage) continue

    const context =
      (usage.input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0)

    next = {
      context,
      output: next.output + (usage.output_tokens ?? 0),
      model: entry.message?.model ?? next.model
    }
  }
  return next
}

/** Short enough for a status bar: 812, 41.2k, 1.3M. */
export function formatTokens(count: number): string {
  if (count < 1000) return String(count)
  if (count < 1_000_000) {
    const thousands = count / 1000
    return (thousands < 10 ? thousands.toFixed(1) : Math.round(thousands).toString()) + 'k'
  }
  return (count / 1_000_000).toFixed(1) + 'M'
}
