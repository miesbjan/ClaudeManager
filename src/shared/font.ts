/**
 * The terminal font, which is the two things worth changing about it: how big and
 * which one. The output of an agent is read all day in that pane, so the default
 * size fitting nobody in particular is reason enough for this to exist.
 *
 * Size is changed by a shortcut and remembered, the way the theme is. The family is
 * something set once and then forgotten, so it is read from a file rather than given
 * a dialog - "no UI for settings" stays a non-goal.
 */
export type TerminalFont = {
  family: string
  size: number
}

/** Matches `--font-mono` in the stylesheet, so the panes look related. */
export const DEFAULT_FAMILY = '"Cascadia Mono", "Consolas", ui-monospace, monospace'
export const DEFAULT_SIZE = 13

/** Below the first it is unreadable; above the second a pane holds nothing useful. */
const MIN_SIZE = 8
const MAX_SIZE = 28

export function clampSize(size: unknown): number {
  if (typeof size !== 'number' || !Number.isFinite(size)) return DEFAULT_SIZE
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(size)))
}

/** One press of the shortcut. Stops at the ends rather than wrapping round. */
export function stepSize(size: number, by: number): number {
  return clampSize(clampSize(size) + by)
}

/**
 * A family is whatever the file says, as long as it says something: the value goes
 * into a CSS font stack, and an empty one would leave the terminal with no font at
 * all. Anything else about it is the font stack's problem, not ours.
 */
export function sanitiseFamily(value: unknown): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : DEFAULT_FAMILY
}

export function sanitiseFont(value: { family?: unknown; size?: unknown } | null): TerminalFont {
  return {
    family: sanitiseFamily(value?.family),
    size: clampSize(value?.size)
  }
}
