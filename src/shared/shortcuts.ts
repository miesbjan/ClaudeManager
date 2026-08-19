/**
 * Pane keys follow what a multiplexer user already has in their fingers: tmux binds
 * pane movement to the arrows and zoom to `z`, Windows Terminal moves between panes
 * with Alt and the arrows. The split here is deliberate and easy to remember -
 * **Ctrl acts on tabs, Alt acts on panes** - and it keeps the shell whole: Alt with
 * arrows, digits or `z` is unused by PowerShell and by the TUIs that run in it, so
 * everything else still reaches the process untouched.
 */
export type PaneCommand =
  | { type: 'focus'; direction: 'left' | 'right' }
  | { type: 'focusIndex'; index: 1 | 2 | 3 }
  | { type: 'zoom' }
  | { type: 'resize'; delta: number }
  | { type: 'web' }

/** One keyboard step of the divider. */
export const RESIZE_STEP = 0.05

/** Only the fields that matter, so this stays testable without a DOM. */
export type KeyLike = {
  key: string
  code: string
  altKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  metaKey?: boolean
}

export function paneCommand(event: KeyLike): PaneCommand | null {
  if (!event.altKey || event.ctrlKey || event.metaKey) return null

  if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
    const towardsLeft = event.code === 'ArrowLeft'
    // Shift resizes instead of moving, as `prefix + Alt + arrow` does in tmux.
    if (event.shiftKey) return { type: 'resize', delta: towardsLeft ? -RESIZE_STEP : RESIZE_STEP }
    return { type: 'focus', direction: towardsLeft ? 'left' : 'right' }
  }

  if (event.shiftKey) return null

  // Digits come from the physical key: on a Czech layout the top row types 'ěščř'.
  if (event.code === 'Digit1') return { type: 'focusIndex', index: 1 }
  if (event.code === 'Digit2') return { type: 'focusIndex', index: 2 }
  if (event.code === 'Digit3') return { type: 'focusIndex', index: 3 }

  // Letters come from the label instead, so Alt+Z is the key marked Z on a QWERTZ.
  const letter = event.key.toLowerCase()
  if (letter === 'z') return { type: 'zoom' }
  // Alt, not Ctrl+Shift+W: that already means "close the tab" from inside the shell.
  if (letter === 'w') return { type: 'web' }

  return null
}
