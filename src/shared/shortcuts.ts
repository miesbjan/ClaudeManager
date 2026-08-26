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
  | { type: 'focusIndex'; index: number }
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
 * for it: `Ctrl+``, `Ctrl+=` and the rest simply fall through to the window. These are
 * different - Ctrl+T, Ctrl+G and Ctrl+P are control characters on the wire (0x14, 0x07
 * and 0x10), and Ctrl+Tab and Ctrl+PageUp/PageDown are a tab and two escape sequences,
 * so xterm swallows them, sends them to the shell and stops the event. Refusing them in
 * the terminal is what lets them reach the window at all.
 *
 * The first four are bound in Claude Code, and taken anyway: another place, which place,
 * which file and open a file are what this application exists to do, and having to leave
 * the shell to ask for one of them defeats the point. What each costs is in the decision
 * log; Ctrl+P costs the least of them, since it recalls history there and the up arrow
 * does the same thing, and Ctrl+O costs a transcript toggle.
 *
 * Ctrl+O was left alone once, on the argument that Ctrl+P already answers "which file" -
 * and then it was the first thing missed in a day of real use, because the fingers that
 * press it are not asking the same question: Ctrl+P knows the name, Ctrl+O is for
 * looking. Consistency wherever the cursor happens to be beats the one binding it costs.
 *
 * The other two are moving between tabs and between the files in one. They were listed as
 * working from inside the shell and did not: xterm turned Ctrl+Tab into a tab character -
 * which starts completion in an agent - and Ctrl+PageDown into an escape sequence, and
 * stopped the event either way. A shell you cannot leave by keyboard is the thing this
 * list exists to prevent.
 */
export function claimedFromShell(event: KeyLike): boolean {
  if (!event.ctrlKey || event.altKey || event.metaKey) return false
  if (event.code === 'Tab' || event.code === 'PageUp' || event.code === 'PageDown') return true
  return (
    event.code === 'KeyT' ||
    event.code === 'KeyG' ||
    event.code === 'KeyP' ||
    event.code === 'KeyO'
  )
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
/**
 * What a copy or paste key means in a terminal.
 *
 * `copy` is unconditional - Ctrl+Shift+C is nothing else anywhere. `copyOrInterrupt` is
 * plain Ctrl+C, which is two things depending on whether anything is selected, and only
 * the pane can see that: with a selection it copies, without one it is the interrupt the
 * shell has always had. Windows Terminal and the terminal in VS Code both work this way,
 * so it is what fingers expect - and the alternative was a copy key nobody reaches for,
 * with the right mouse button as the only way out.
 */
export function terminalAction(
  event: KeyLike
): 'paste' | 'copy' | 'copyOrInterrupt' | null {
  if (!event.ctrlKey || event.altKey || event.metaKey) return null
  const key = event.key.toLowerCase()
  if (key === 'v') return 'paste'
  if (key !== 'c') return null
  return event.shiftKey ? 'copy' : 'copyOrInterrupt'
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
  /*
   * A number is a thing to go to, not a column: 1 is the shell, 2 is the dev server, and
   * from 3 up they are the files open in this tab in the order they were opened. The
   * right side shows one thing at a time, so a column number would address two different
   * things - and what a person means by "go to the second file" is the file, not a slot.
   *
   * The cost, said plainly here because it is felt rather than seen: closing a file
   * renumbers the ones after it. Ctrl+P answers the same question by name, which nothing
   * renumbers.
   */
  if (event.code.startsWith('Digit')) {
    const digit = Number(event.code.slice(5))
    if (digit >= 1 && digit <= 9) return { type: 'focusIndex', index: digit }
  }

  // Letters come from the label instead, so Alt+Z is the key marked Z on a QWERTZ.
  const letter = event.key.toLowerCase()
  if (letter === 'z') return { type: 'zoom' }
  // Alt, not Ctrl+Shift+W: that already means "close the tab" from inside the shell.
  if (letter === 'w') return { type: 'web' }
  // The prompt buffer is a pane of the shell, so it is an Alt key like the rest.
  if (letter === 'p') return { type: 'prompt' }

  return null
}
