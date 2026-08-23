/**
 * One signal for the whole window, for the moments when the window is not what you
 * are looking at. The dot on a tab is a status light: it says what that agent is doing
 * right now. This is a notification: it says somebody wants you, and it is meant to be
 * read off the taskbar from across the desk.
 *
 * That difference is why "finished" is not simply taken from the tab's state. A shell
 * sitting at its prompt rests in a finished state forever, and a taskbar that were
 * green the whole time would say nothing. Green has to mean *just* finished.
 */
import type { TaskbarState } from '../../shared/types'
import type { ActivityState } from './activity'

/** What one tab contributes: its current state, and whether it finished since you looked. */
export type TabSignal = {
  state: ActivityState
  finished: boolean
}

/**
 * The most urgent thing wins. Finished outranks working deliberately: something that
 * is waiting for a look is more use to you than something still on its way.
 */
export function aggregateActivity(tabs: readonly TabSignal[]): TaskbarState {
  if (tabs.some((tab) => tab.state === 'alert')) return 'alert'
  if (tabs.some((tab) => tab.state === 'permission')) return 'permission'
  if (tabs.some((tab) => tab.finished)) return 'done'
  if (tabs.some((tab) => tab.state === 'working' || tab.state === 'busy')) return 'working'
  return 'none'
}

/**
 * How many tabs are waiting for you, and what the worst of it is - the number on the
 * taskbar badge and its colour.
 *
 * A tab counts once, however many reasons it has, because the number answers "how
 * many places do I have to go", not "how many things happened". Working tabs are not
 * counted: they want time, not you. The colour is the most urgent reason among them,
 * so three finished runs and one dialog waiting for an answer reads as amber four -
 * the count says how much is left, the colour says where to start.
 */
export type Attention = { count: number; level: 'done' | 'permission' | 'alert' }

export function attention(tabs: readonly TabSignal[]): Attention | null {
  const waiting = tabs.filter(
    (tab) => tab.finished || tab.state === 'permission' || tab.state === 'alert'
  )
  if (waiting.length === 0) return null

  const level = waiting.some((tab) => tab.state === 'alert')
    ? 'alert'
    : waiting.some((tab) => tab.state === 'permission')
      ? 'permission'
      : 'done'
  return { count: waiting.length, level }
}

/**
 * How long output has to have been flowing before quiet is believed to mean a run
 * ended. A TUI repaints its own input box, a prompt redraws itself after a resize, and
 * oh-my-posh prints on every return - each of them a burst of a few milliseconds
 * followed by silence, which is indistinguishable from a finished run by shape alone.
 *
 * The consequence of getting this wrong was the badge coming back seconds after being
 * acknowledged, over and over, until the number meant nothing. This is the one number
 * to tune, the way `SILENCE_MS` is for the dot.
 *
 * It is only the fallback, though. A run that follows a command somebody submitted is
 * believed whatever the clock says, because pressing Enter in a shell is a statement of
 * intent that no repaint can imitate - and quiet in the middle of a run breaks the
 * timing anyway: a command that sleeps for six seconds and prints one line looks like
 * two short bursts to anything watching output alone.
 */
export const MIN_RUN_MS = 5000

/**
 * How long a submitted command keeps vouching for the runs that follow it.
 *
 * A shell never says when it is done, so there is no moment at which the command is
 * known to be answered: one command is two runs whenever it is quiet in the middle -
 * the line being echoed, then the prompt coming back a minute later - and both belong
 * to it. A window of a few minutes covers any run worth being told about while making
 * sure a repaint an hour later is not credited to a command from breakfast.
 */
export const COMMAND_WINDOW_MS = 5 * 60_000

/**
 * Whether a step from one state to another is the moment a run ended, and whether that
 * is worth telling somebody who is not looking.
 *
 * Three kinds of evidence, in order of how much they are worth. A program that reports
 * its own progress is believed whatever the timing: `done` is its word, not our guess.
 * A run that followed a submitted command is believed too - somebody pressed Enter in
 * that shell and is owed an answer. Everything else is only the silence heuristic, and
 * that needs the run to have lasted longer than a redraw does.
 */
export function countsAsFinished(
  before: ActivityState,
  after: ActivityState,
  /** How long the run lasted: from its first chunk of output until it settled. */
  ranForMs: number,
  /** How long ago a command was submitted into this shell, or null if none was. */
  sinceCommandMs: number | null
): boolean {
  const wasRunning = before === 'working' || before === 'busy'
  if (!wasRunning) return false
  if (after === 'done') return true
  if (after !== 'waiting') return false
  const asked = sinceCommandMs !== null && sinceCommandMs <= COMMAND_WINDOW_MS
  return asked || ranForMs >= MIN_RUN_MS
}
