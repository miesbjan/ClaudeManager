import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createSignalReader,
  interruptsWork,
  nextActivity,
  shownActivity,
  type ActivityState,
  type OutputSignals
} from '../src/renderer/src/activity.ts'

const ESC = '\x1b'
const BEL = '\x07'
const progress = (state: string, value = '0') => `${ESC}]9;4;${state};${value}${BEL}`
const title = (text: string) => `${ESC}]0;${text}${BEL}`

/** Plain output, unless a test says otherwise. */
const out = (over: Partial<OutputSignals> = {}): OutputSignals => ({
  bell: false,
  progress: null,
  dialog: false,
  agent: false,
  ...over
})

describe('reading signals from terminal output', () => {
  it('sees the dialog Claude opens to ask for permission', () => {
    const read = createSignalReader()
    const dialog = [
      ESC + '[1mDo you want to run this command?' + ESC + '[0m',
      ESC + '[32m 1. Yes' + ESC + '[0m',
      ' 2. Yes, allow all',
      ' 3. No, and tell Claude what to do differently'
    ].join(String.fromCharCode(13, 10))
    assert.equal(read(dialog).dialog, true)
  })

  it('is not fooled by the agent writing about permissions', () => {
    const read = createSignalReader()
    assert.equal(read('Do you want to keep the old behaviour? I would suggest not.').dialog, false)
  })

  it('sees a marker split across two chunks', () => {
    const read = createSignalReader()
    assert.equal(read(' 2. Yes, allo').dialog, false)
    assert.equal(read('w all').dialog, true)
  })

  /*
   * A level, not an arrival: the way out of "being asked" is that the dialog is gone,
   * and only something that keeps saying "still here" can also say "no longer".
   * The cost is that the marker lingers in the window for a few hundred characters
   * after the answer, which the state machine handles by believing a reported `busy`.
   */
  it('keeps saying so while the marker is still in view', () => {
    const read = createSignalReader()
    assert.equal(read(' 2. Yes, allow all').dialog, true)
    assert.equal(read('thinking').dialog, true)
  })

  it('stops once the marker has scrolled out of the window', () => {
    const read = createSignalReader()
    assert.equal(read(' 2. Yes, allow all').dialog, true)
    assert.equal(read('x'.repeat(300)).dialog, false)
  })

  it('sees the spinner a program reports while it works', () => {
    const read = createSignalReader()
    assert.deepEqual(read(progress('3')), out({ progress: 'busy' }))
  })

  it('sees progress being cleared as finished', () => {
    const read = createSignalReader()
    assert.deepEqual(read(progress('0')), out({ progress: 'done' }))
  })

  it('treats failure and warning as something to look at', () => {
    const read = createSignalReader()
    assert.equal(read(progress('2')).progress, 'error')
    assert.equal(read(progress('4')).progress, 'error')
  })

  /*
   * The sequence that sets a window title ends with a bell, and PowerShell resets
   * the title constantly. Counting those would make every prompt ring.
   */
  it('does not mistake a title sequence for a bell', () => {
    const read = createSignalReader()
    const signals = read(`${title('C:\\Users\\me')}PS C:\\Users\\me> `)
    assert.equal(signals.bell, false)
  })

  it('still hears a real bell next to a title sequence', () => {
    const read = createSignalReader()
    assert.equal(read(`${title('build')}done${BEL}`).bell, true)
  })

  it('keeps the last statement when a chunk carries several', () => {
    const read = createSignalReader()
    assert.equal(read(progress('3') + 'working' + progress('0')).progress, 'done')
  })

  it('joins a sequence split across two chunks', () => {
    const read = createSignalReader()
    assert.equal(read(`out${ESC}]9;4;3`).progress, null)
    assert.equal(read(`;0${BEL}more`).progress, 'busy')
  })

  it('does not carry a fragment forever', () => {
    const read = createSignalReader()
    read(`${ESC}]${'x'.repeat(400)}`)
    // The oversized fragment is dropped, so a later bell is still heard.
    assert.equal(read(`plain${BEL}`).bell, true)
  })
})

describe('deciding what a tab shows', () => {
  const step = (state: ActivityState, ...events: Parameters<typeof nextActivity>[1][]) =>
    events.reduce(nextActivity, state)

  it('marks plain output as working and silence as settled', () => {
    const working = step('idle', { type: 'output', signals: out() })
    assert.equal(working, 'working')
    assert.equal(step(working, { type: 'silence' }), 'waiting')
  })

  it('believes a program that says it has finished, without waiting for silence', () => {
    assert.equal(step('working', { type: 'output', signals: out({ progress: 'done' }) }), 'done')
  })

  /*
   * A program that reports it has finished then prints its answer. Treating that
   * tail as fresh work would flip the tab back to busy the moment it went green.
   */
  it('keeps a reported finish while the result is still being printed', () => {
    const done = step('working', { type: 'output', signals: out({ progress: 'done' }) })
    assert.equal(step(done, { type: 'output', signals: out() }), 'done')
    assert.equal(step(done, { type: 'silence' }), 'done')
  })

  it('goes back to busy when the program says it is working again', () => {
    const done = step('working', { type: 'output', signals: out({ progress: 'done' }) })
    assert.equal(step(done, { type: 'output', signals: out({ progress: 'busy' }) }), 'busy')
  })

  /*
   * An agent that is thinking prints nothing for seconds at a time. Letting the
   * silence rule settle it would turn the dot green while the work is still running.
   */
  it('does not settle a program that reported it is busy', () => {
    const busy = step('idle', { type: 'output', signals: out({ progress: 'busy' }) })
    assert.equal(busy, 'busy')
    assert.equal(step(busy, { type: 'silence' }), 'busy')
    assert.equal(step(busy, { type: 'output', signals: out() }), 'busy')
    assert.equal(step(busy, { type: 'output', signals: out({ progress: 'done' }) }), 'done')
  })

  it('does not settle a tab that never worked', () => {
    assert.equal(step('idle', { type: 'silence' }), 'idle')
  })

  it('keeps an alert until the tab is actually looked at', () => {
    const alert = step('working', { type: 'output', signals: out({ bell: true }) })
    assert.equal(alert, 'alert')
    assert.equal(step(alert, { type: 'output', signals: out({ progress: 'busy' }) }), 'alert')
    assert.equal(step(alert, { type: 'silence' }), 'alert')
    assert.equal(step(alert, { type: 'seen' }), 'idle')
  })

  it('treats a shell that fell over as an alert', () => {
    assert.equal(step('idle', { type: 'exit', code: 1 }), 'alert')
  })

  // Typing `exit` is how a shell is meant to end; a red light for that is crying wolf.
  it('has nothing to report about a shell closed on purpose', () => {
    assert.equal(step('working', { type: 'exit', code: 0 }), 'idle')
    assert.equal(step('done', { type: 'exit', code: 0 }), 'idle')
  })

  /*
   * The dot is a status light: looking at a tab does not change what its shell is
   * doing, so only an alert - an event rather than a state - is settled by being seen.
   * This is what makes the dot work at all on the tab you have open, which is the
   * whole of the main workflow.
   */
  it('does not erase a status just because you looked at it', () => {
    for (const state of ['working', 'busy', 'waiting', 'done', 'permission'] as ActivityState[]) {
      assert.equal(step(state, { type: 'seen' }), state, `seen wrongly cleared ${state}`)
    }
  })

  it('holds the state while the agent is asking for permission', () => {
    const asking = step('working', { type: 'output', signals: out({ dialog: true }) })
    assert.equal(asking, 'permission')
    assert.equal(step(asking, { type: 'output', signals: out({ dialog: true }) }), 'permission')
    assert.equal(step(asking, { type: 'silence' }), 'permission')
  })

  /*
   * Two ways out, because the answer may leave no trace of its own. Either the program
   * says it is busy again, or the dialog simply stops being on screen.
   */
  it('lets the agent carry on once it reports it is working again', () => {
    const asking = step('idle', { type: 'output', signals: out({ dialog: true }) })
    assert.equal(step(asking, { type: 'output', signals: out({ progress: 'busy' }) }), 'busy')
  })

  it('believes a reported state over a dialog still sitting in the window', () => {
    const asking = step('idle', { type: 'output', signals: out({ dialog: true }) })
    assert.equal(
      step(asking, { type: 'output', signals: out({ dialog: true, progress: 'busy' }) }),
      'busy'
    )
    assert.equal(
      step(asking, { type: 'output', signals: out({ dialog: true, progress: 'done' }) }),
      'done'
    )
  })

  it('leaves the wait behind when the dialog is gone and output moves again', () => {
    const asking = step('idle', { type: 'output', signals: out({ dialog: true }) })
    assert.equal(step(asking, { type: 'output', signals: out() }), 'working')
  })

  it('keeps a dead shell above a question', () => {
    const asking = step('idle', { type: 'output', signals: out({ dialog: true }) })
    assert.equal(step(asking, { type: 'exit', code: 1 }), 'alert')
  })

  it('keeps a bell above a question', () => {
    const asking = step('idle', { type: 'output', signals: out({ dialog: true }) })
    assert.equal(step(asking, { type: 'output', signals: out({ bell: true, dialog: true }) }), 'alert')
  })
})

/* The reader and the state machine together, over what a session actually prints. */
describe('a run from start to finish', () => {
  it('works, asks, is answered, carries on and settles', () => {
    const read = createSignalReader()
    let state: ActivityState = 'idle'
    const feed = (chunk: string): ActivityState => {
      state = nextActivity(state, { type: 'output', signals: read(chunk) })
      return state
    }

    assert.equal(feed('reading the file'), 'working')
    assert.equal(feed(progress('3')), 'busy')
    assert.equal(feed(' 2. Yes, allow all'), 'permission')
    // Answered. The marker is still in the window, but the agent reports work again.
    assert.equal(feed(progress('3')), 'busy')
    assert.equal(feed(progress('0')), 'done')
  })

  it('leaves a question even when the agent reports nothing at all', () => {
    const read = createSignalReader()
    let state: ActivityState = 'idle'
    const feed = (chunk: string): ActivityState => {
      state = nextActivity(state, { type: 'output', signals: read(chunk) })
      return state
    }

    assert.equal(feed(' 2. Yes, allow all'), 'permission')
    // No progress reporting anywhere: the dialog scrolling away is the only signal.
    assert.equal(feed('y'.repeat(300)), 'working')
  })
})

describe('interruptsWork', () => {
  it('protects a tab with something running in it', () => {
    assert.equal(interruptsWork('working'), true)
    assert.equal(interruptsWork('busy'), true)
  })

  /* An agent stopped at a question holds everything it did before it. */
  it('protects a tab that is waiting to be answered', () => {
    assert.equal(interruptsWork('permission'), true)
  })

  /*
   * Asking about a tab with nothing left to lose is how a confirmation becomes a
   * reflex, and a reflex protects nothing.
   */
  it('asks nothing about a tab that has finished, gone quiet or fallen over', () => {
    assert.equal(interruptsWork('idle'), false)
    assert.equal(interruptsWork('done'), false)
    assert.equal(interruptsWork('waiting'), false)
    assert.equal(interruptsWork('alert'), false)
  })
})

describe('recognising an agent in the pane', () => {
  /*
   * The dot answers "what is the agent doing", so a pane has to be known to hold one.
   * Claude Code does not emit the OSC 9;4 progress sequence - verified against its
   * binary, where the dialog labels appear and that sequence does not - so its own
   * interface text is what gives it away.
   */
  it('sees the banner a session prints when it starts', () => {
    const read = createSignalReader()
    assert.equal(read('Welcome to Claude Code!\r\n').agent, true)
  })

  it('sees the hint under the input box', () => {
    const read = createSignalReader()
    assert.equal(read('  ? for shortcuts\r\n').agent, true)
  })

  it('counts the permission dialog as an agent as well', () => {
    const read = createSignalReader()
    const signals = read('  1. Yes, allow all\r\n')
    assert.equal(signals.dialog, true)
    assert.equal(signals.agent, true)
  })

  it('says nothing about a shell that is only printing', () => {
    const read = createSignalReader()
    assert.equal(read('PS C:\Users\me> npm run build\r\n').agent, false)
    assert.equal(read('added 42 packages in 3s\r\n').agent, false)
  })

  /* The marker is drawn in pieces, so it may straddle two chunks. */
  it('sees a marker split across two chunks', () => {
    const read = createSignalReader()
    assert.equal(read('Welcome to Cla').agent, false)
    assert.equal(read('ude Code!').agent, true)
  })
})

describe('shownActivity', () => {
  it('shows nothing for a shell nobody has claimed', () => {
    for (const state of ['working', 'waiting', 'done', 'busy', 'permission'] as const) {
      assert.equal(shownActivity(state, false), 'idle')
    }
  })

  it('shows the state once something has spoken for itself', () => {
    assert.equal(shownActivity('working', true), 'working')
    assert.equal(shownActivity('waiting', true), 'waiting')
    assert.equal(shownActivity('permission', true), 'permission')
  })

  /* A bell or a shell that fell over is the pane's own news, not a guess. */
  it('always shows an alert', () => {
    assert.equal(shownActivity('alert', false), 'alert')
    assert.equal(shownActivity('alert', true), 'alert')
  })
})

describe('recognising the interface a real session draws', () => {
  /*
   * Taken from a session watched in the app rather than imagined: started in a
   * directory it already trusted, it printed no banner at all and its input box
   * carried the mode line. The first version of this looked for the banner and the
   * shortcut hint alone, and the dot stayed dark through the whole session.
   */
  const FOOTER = '\u23f5\u23f5 auto mode on (shift+tab to cycle)'

  it('knows the mode line under the input box', () => {
    assert.equal(createSignalReader()(FOOTER).agent, true)
  })

  it('knows the other modes it cycles through', () => {
    for (const mode of ['accept edits on', 'plan mode on', 'auto mode on']) {
      const line = `\u23f5\u23f5 ${mode} (shift+tab to cycle)`
      assert.equal(createSignalReader()(line).agent, true, mode)
    }
  })

  it('is not fooled by an ordinary shell printing ordinary things', () => {
    const read = createSignalReader()
    for (const line of ['npm run build', 'PS C:\Users\me> git status', 'cycle through the list']) {
      assert.equal(read(line + '\r\n').agent, false, line)
    }
  })
})
