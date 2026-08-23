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
  | { type: 'prompt' }

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

/**
 * Ctrl and a digit: which tab to go to. Claimed even while the shell has focus, the
 * way Ctrl+` and the font keys are - what a terminal makes of these is a handful of
 * control characters nobody types on purpose (Ctrl+2 is NUL, Ctrl+3 is escape), while
 * being unable to leave the pane you are typing in is felt every time.
 *
 * Read from the physical key: on a Czech layout Ctrl+Shift+1 arrives as '!'.
 */
export function tabDigit(event: KeyLike): number | null {
  if (!event.ctrlKey || event.altKey || event.metaKey) return null
  if (!event.code.startsWith('Digit')) return null
  const digit = Number(event.code.slice(5))
  return digit >= 1 && digit <= 9 ? digit : null
}

/**
 * Keys the application takes even while the shell has focus, and which the shell must
 * therefore never see.
 *
 * Most of what the app claims needs no announcement here, because xterm has no meaning
 * for it: `Ctrl+``, `Ctrl+=` and the rest simply fall through to the window. These three
 * are different - Ctrl+T, Ctrl+G and Ctrl+P are control characters on the wire (0x14,
 * 0x07 and 0x10), so xterm swallows them, sends them to the shell and stops the event.
 * Refusing them in the terminal is what lets them reach the window at all.
 *
 * All three are bound in Claude Code, and taken anyway: another place, which place, and
 * which file are the three questions this application exists to answer, and having to
 * leave the shell to ask one of them defeats the point. What each costs is in the
 * decision log; Ctrl+P costs the least of them, since it recalls history there and the
 * up arrow does the same thing.
 */
export function claimedFromShell(event: KeyLike): boolean {
  if (!event.ctrlKey || event.altKey || event.metaKey) return false
  return event.code === 'KeyT' || event.code === 'KeyG' || event.code === 'KeyP'
}

/**
 * What a key means to the shell pane, if anything.
 *
 * Ctrl+C has to keep meaning interrupt, so copying sits on the shifted variant - the
 * bargain every terminal on Windows makes. Pasting has no such conflict: Ctrl+V
 * reaches a shell as a control character nothing does anything useful with, while
 * every program run in this pane - an agent above all - is one you paste into. So
 * Ctrl+V pastes, and Ctrl+Shift+V stays alongside it for fingers that learned the
 * other terminals. Everything else belongs to the shell.
 */
export function terminalAction(event: KeyLike): 'paste' | 'copy' | null {
  if (!event.ctrlKey || event.altKey || event.metaKey) return null
  const key = event.key.toLowerCase()
  if (key === 'v') return 'paste'
  return event.shiftKey && key === 'c' ? 'copy' : null
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
  // The prompt buffer is a pane of the shell, so it is an Alt key like the rest.
  if (letter === 'p') return { type: 'prompt' }

  return null
}
