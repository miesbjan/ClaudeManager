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
  /**
   * A permission dialog is on screen right now, as far as the last few hundred
   * characters of output can tell. Deliberately a level and not an arrival: the way
   * out of "being asked" is that the dialog is gone, and only a level can say so.
   * A program reporting that it is busy is believed over it, because a program that
   * is working is not holding a dialog open.
   */
  dialog: boolean
  /**
   * An agent's own interface is on screen in this pane, so what happens here is
   * worth reporting at all. Without it the dot lit up for any shell that printed
   * anything, which said nothing about the thing it was being watched for.
   */
  agent: boolean
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

/**
 * Whether closing this tab would cut something off mid-way.
 *
 * Work in flight is the obvious case; being asked for permission counts too, because
 * an agent stopped at a question has done everything up to it and is holding the
 * result. Everything else - finished, quiet, fallen over - has nothing left to lose,
 * and asking there would train the answer out of anyone.
 */
export function interruptsWork(state: ActivityState): boolean {
  return state === 'working' || state === 'busy' || state === 'permission'
}

/**
 * What the tab shows, which is not always what the shell is doing.
 *
 * A light that says "finished" over a shell sitting at its prompt is telling you
 * nothing you asked about: the question behind this dot is what the agent is doing,
 * and a directory with a shell open in it has no agent. So a pane shows a state only
 * once something in it has spoken for itself - an agent's interface, or a program
 * reporting its own progress. A bell or a shell that fell over is shown regardless,
 * because that is the pane's own news and not a guess about anyone.
 */
export function shownActivity(state: ActivityState, reporting: boolean): ActivityState {
  if (state === 'alert') return 'alert'
  return reporting ? state : 'idle'
}

export type ActivityEvent =
  | { type: 'output'; signals: OutputSignals }
  | { type: 'silence' }
  /** The shell is gone. Its exit code is what tells being closed from falling over. */
  | { type: 'exit'; code: number }
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

/*
 * How a pane is known to be running Claude Code rather than an ordinary shell: its
 * own interface says so. The banner is printed once when a session starts; the rest
 * live in the frame around the input box, which is redrawn constantly, so one of them
 * shows up within moments however the session was started.
 *
 * More than one, because the first pair proved not to be enough: a session started in
 * a directory it already trusts goes straight to the input box without a banner, and
 * the hint under it gives way to the mode line as soon as anything is typed. Watched
 * live, a real session showed only „auto mode on (shift+tab to cycle)“ - so the mode
 * line is here too, by its wording and by the glyph it opens with.
 *
 * The obvious signal would have been the `OSC 9;4` progress sequence, which is what
 * makes a Windows Terminal tab spin - but Claude Code does not emit it. The string
 * does not occur anywhere in its binary, while the dialog labels above do, so this
 * was checked rather than assumed. It is fragile in the same way they are: a change
 * of wording turns the light off rather than making it lie.
 */
const AGENT_MARKERS = [
  'Welcome to Claude Code', // printed once, when a session starts
  '? for shortcuts', // under the input box
  'shift+tab to cycle', // the mode line, whichever mode it is in
  '⏵⏵' // the glyph that mode line starts with
]

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
    const dialog = PERMISSION_MARKERS.some((needle) => text.includes(needle))
    // Being asked for permission is an agent too; nothing else draws that dialog.
    const agent = dialog || AGENT_MARKERS.some((needle) => text.includes(needle))

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

    return { bell, progress, dialog, agent }
  }
}

/**
 * This is a status light, not an unread badge: it says what the shell is doing, and
 * looking at the tab does not change that. Only `alert` is an event rather than a
 * state, so only `alert` is cleared by being seen.
 *
 * `alert` also outranks everything while it lasts - a bell or a shell that fell over
 * must not be erased by the next line of output.
 */
export function nextActivity(state: ActivityState, event: ActivityEvent): ActivityState {
  switch (event.type) {
    case 'seen':
      return state === 'alert' ? 'idle' : state
    /*
     * Typing `exit` is how a shell is meant to end, so a clean one leaves nothing to
     * report - a red light there would be crying wolf on the one tab in ten where the
     * shell was closed on purpose. Any other code is a shell that fell over.
     */
    case 'exit':
      return event.code === 0 ? 'idle' : 'alert'

    case 'silence':
      // Only the inferred state settles; a reported one waits for the program.
      return state === 'working' ? 'waiting' : state
    case 'output': {
      if (event.signals.bell || event.signals.progress === 'error') return 'alert'
      if (state === 'alert') return 'alert'
      /*
       * Order matters, and the program's own word comes first. Any progress statement
       * beats the dialog, which is text scraped off the screen and lingers in the
       * reader's window for a few hundred characters after the answer was given.
       * A program that reports anything about its run is not holding a dialog open,
       * so this is also the way out of "being asked" when the answer left no trace.
       */
      if (event.signals.progress === 'busy') return 'busy'
      if (event.signals.progress === 'done') return 'done'
      if (event.signals.dialog) return 'permission'
      // The dialog is gone and output is moving again, so the wait is over.
      if (state === 'permission') return 'working'
      // Plain output neither starts nor ends a run the program is reporting on.
      if (state === 'done' || state === 'busy') return state
      return 'working'
    }
  }
}
