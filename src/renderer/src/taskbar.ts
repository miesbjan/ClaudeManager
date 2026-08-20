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
 * Whether a step from one state to another is the moment a run ended. `waiting` counts
 * as well as `done`: not every program reports its own progress, and for those the
 * silence heuristic is the only end there is.
 */
export function justFinished(before: ActivityState, after: ActivityState): boolean {
  const wasRunning = before === 'working' || before === 'busy'
  const hasSettled = after === 'done' || after === 'waiting'
  return wasRunning && hasSettled
}
