/**
 * What the cross on the window means, which is not always the same thing.
 *
 * Closing used to end the application, and then began hiding it instead whenever an
 * agent was recognised in one of the tabs - because a job halfway through should not
 * be killed by the click that tidies the desktop. Recognising an agent is done by the
 * strings its interface prints, which is fragile by nature: a change of wording makes
 * it look like there is nothing to protect.
 *
 * For the dot on a tab that is a safe way to fail - the light goes out rather than
 * lying. For the window it is not: silently ending a session because a banner was
 * reworded is the exact loss the hiding was built to prevent. So the shells decide,
 * and they are counted rather than recognised - the main process owns them.
 */
export type CloseAction =
  /** End the application. */
  | 'quit'
  /** Keep it running behind the tray icon. */
  | 'hide'
  /** Something is running that was not recognised; the person decides. */
  | 'ask'

export type CloseState = {
  /** A quit is already under way, so the window is closing for good. */
  quitting: boolean
  /** There is a tray icon, so a hidden window can be found again. */
  tray: boolean
  /** An agent was recognised in some tab. */
  guarded: boolean
  /** How many shells are alive, agent or not. */
  shells: number
}

export function closeAction(state: CloseState): CloseAction {
  if (state.quitting) return 'quit'
  /*
   * Without a way back to a hidden window, hiding it would be losing it - so the window
   * goes. But going takes every shell with it, and that is worth a question first: this
   * used to be the one path where a click meant to tidy the desktop ended an agent
   * mid-job without asking. There is nothing to ask about when nothing is running.
   */
  if (!state.tray) return state.guarded || state.shells > 0 ? 'ask' : 'quit'
  if (state.guarded) return 'hide'
  /*
   * A shell nobody recognised is the case this exists for. It may be an agent whose
   * interface changed, or an idle prompt worth nothing - and the difference cannot be
   * told from here, so it is not guessed.
   */
  if (state.shells > 0) return 'ask'
  // Nothing running anywhere: tabs and layout are in the session file, so nothing is lost.
  return 'quit'
}
