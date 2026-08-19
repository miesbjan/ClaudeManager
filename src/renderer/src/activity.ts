/**
 * What a tab is doing while you are not looking at it.
 *
 * The state comes from the program itself wherever possible. A CLI that knows it is
 * busy says so with the ConEmu progress sequence `OSC 9;4` - which is what makes a
 * Windows Terminal tab show a spinner - and one that wants attention rings the bell.
 * Only when a program says nothing does the silence heuristic take over, and then
 * the state means "nothing has happened for a while", not "finished".
 */
export type ProgressSignal = 'busy' | 'done' | 'error'

export type OutputSignals = {
  bell: boolean
  progress: ProgressSignal | null
  /** The agent is holding a dialog open and cannot continue without an answer. */
  permission: boolean
}

/**
 * Two pairs of states that look identical on screen but differ in who claims them:
 * `busy`/`done` are the program's own word, `working`/`waiting` are our guess from
 * the flow of output. Keeping them apart is what makes the dot trustworthy - the
 * guess must never overrule the claim, in either direction:
 *
 * - a program that reports it is busy but prints nothing must not go quiet-green
 * - a program that reports it has finished must not go back to busy while it is
 *   still printing the result
 */
export type ActivityState =
  | 'idle'
  | 'working'
  | 'busy'
  | 'waiting'
  | 'done'
  | 'permission'
  | 'alert'

export type ActivityEvent =
  | { type: 'output'; signals: OutputSignals }
  | { type: 'silence' }
  | { type: 'document' }
  | { type: 'exit' }
  | { type: 'seen' }

/** How long a quiet terminal counts as having settled. The one number to tune. */
export const SILENCE_MS = 2000

/*
 * Claude Code asks for permission with a dialog, and being asked is more urgent than
 * merely having finished. Only the button labels are matched, never the question:
 * "Do you want to" is a phrase that turns up in ordinary prose, while these two are
 * interface text and appear nowhere else.
 *
 * It is a fragile signal by nature - a change of wording breaks it silently - so it
 * only ever adds to the states derived from the stream itself.
 */
const PERMISSION_MARKERS = ['Yes, allow all', 'No, and tell Claude what to do differently']

/** Colour and cursor codes sit between the words on screen; drop them first. */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
}

/** A partial escape sequence is carried to the next chunk, but never grows forever. */
const MAX_PENDING = 256

// OSC: ESC ] ... terminated by BEL or ESC \
const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g
const PROGRESS = /\x1b\]9;4;(\d)(?:;\d+)?(?:\x07|\x1b\\)/g
const UNTERMINATED_OSC = /\x1b\][^\x07\x1b]*$/

function progressFrom(state: string): ProgressSignal | null {
  switch (state) {
    case '0':
      return 'done' // the program cleared its progress: it is finished
    case '1':
    case '3':
      return 'busy' // a percentage, or the indeterminate spinner
    case '2':
    case '4':
      return 'error' // failure or warning - both want a look
    default:
      return null
  }
}

/**
 * Reads signals out of raw terminal output. Stateful only because a sequence can be
 * split across two chunks; the trailing fragment is carried over to the next call.
 */
export function createSignalReader(): (chunk: string) => OutputSignals {
  let pending = ''
  // The dialog is drawn in pieces, so a marker can straddle two chunks.
  let text = ''

  return (chunk: string): OutputSignals => {
    const data = pending + chunk
    pending = ''

    text = (text + stripAnsi(chunk)).slice(-MAX_PENDING)
    const permission = PERMISSION_MARKERS.some((marker) => text.includes(marker))

    let progress: ProgressSignal | null = null
    for (const match of data.matchAll(PROGRESS)) {
      // The last statement in a chunk is the current one.
      progress = progressFrom(match[1]) ?? progress
    }

    // The bell that terminates a title sequence is not a bell, so strip OSC first.
    const stripped = data.replace(OSC, '')
    const bell = stripped.includes('\x07')

    const tail = UNTERMINATED_OSC.exec(stripped)
    if (tail && tail[0].length <= MAX_PENDING) pending = tail[0]

    return { bell, progress, permission }
  }
}

/**
 * `alert` outranks everything and stays until the tab is looked at: a bell or a
 * dead shell must not be erased by the next line of output.
 */
export function nextActivity(state: ActivityState, event: ActivityEvent): ActivityState {
  switch (event.type) {
    case 'seen':
      return 'idle'
    case 'exit':
      return 'alert'
    case 'document':
      return state === 'alert' || state === 'permission' ? state : 'waiting'

    case 'silence':
      // Only the inferred state settles; a reported one waits for the program.
      return state === 'working' ? 'waiting' : state
    case 'output': {
      if (event.signals.bell || event.signals.progress === 'error') return 'alert'
      if (state === 'alert') return 'alert'
      /*
       * Being asked outranks working and finishing, and stays until the tab is
       * looked at - except when the program reports it is busy again, which can
       * only mean the dialog is gone and it carried on.
       */
      if (event.signals.permission) return 'permission'
      if (state === 'permission') return event.signals.progress === 'busy' ? 'busy' : 'permission'
      if (event.signals.progress === 'done') return 'done'
      if (event.signals.progress === 'busy') return 'busy'
      // Plain output neither starts nor ends a run the program is reporting on.
      if (state === 'done' || state === 'busy') return state
      return 'working'
    }
  }
}
