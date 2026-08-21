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
 * Whether a step from one state to another is the moment a run ended. `waiting` counts
 * as well as `done`: not every program reports its own progress, and for those the
 * silence heuristic is the only end there is.
 */
export function justFinished(before: ActivityState, after: ActivityState): boolean {
  const wasRunning = before === 'working' || before === 'busy'
  const hasSettled = after === 'done' || after === 'waiting'
  return wasRunning && hasSettled
}
