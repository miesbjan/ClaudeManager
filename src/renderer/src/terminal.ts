import { Terminal, type IDisposable, type ILink } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { DEFAULT_FAMILY, DEFAULT_SIZE, type TerminalFont } from '../../shared/font'

/**
 * What kind of pty is on the other end, once the main process has said.
 *
 * Told to every terminal built afterwards. It changes what xterm does when the terminal
 * grows: ConPTY reprints the whole screen with its own view of it, so rows pulled back
 * out of the scrollback end up underneath the reprint - two versions of the same screen
 * at once. Set before any pane exists, so no terminal is built without it.
 */
let windowsPty: { backend: 'conpty'; buildNumber: number } | undefined

export function usePty(build: number | null): void {
  windowsPty = build === null ? undefined : { backend: 'conpty', buildNumber: build }
}
import { cellRange, findPaths, rowOf } from './paths'
import { claimedFromShell, paneCommand, tabDigit, terminalAction } from '../../shared/shortcuts'
import '@xterm/xterm/css/xterm.css'

/** Kept in step with the palette in styles.css. */
const LIGHT = {
  background: '#ffffff',
  foreground: '#1f2328',
  cursor: '#1f2328',
  selectionBackground: '#b6d7ff'
}

const DARK = {
  background: '#16181d',
  foreground: '#d9dde3',
  cursor: '#d9dde3',
  selectionBackground: '#2f4a73'
}

/**
 * One shell pane: an xterm instance in the renderer talking to a PTY that lives in
 * the main process. The pane owns its host element, so a tab switch can hide it
 * without tearing the terminal - and without killing the process running inside.
 */
export class TerminalPane {
  readonly host: HTMLElement
  private readonly term: Terminal
  private readonly fit = new FitAddon()
  private readonly observer: ResizeObserver
  private readonly offData: () => void
  private readonly offExit: () => void
  private readonly linkProvider: IDisposable
  private cols = 0
  private rows = 0
  private disposed = false
  private exited = false
  /**
   * The start of this pane, once it has been asked for.
   *
   * Registering a pane before its shell exists is what stops two of them being started
   * for one tab, but it also made every later caller believe the shell was ready: they
   * looked the pane up, found it, and wrote into a shell the main process did not have
   * yet. Waiting on this is the difference between "a pane exists" and "a shell does".
   */
  private starting: Promise<string | null> | null = null
  /** Whether the shell is up, which is what makes typing into it worth sending. */
  private started = false
  /** What was typed while it was not. */
  private waiting = ''
  /** What the shell printed while this pane was still working out what it holds. */
  private arrived = ''

  constructor(
    readonly id: string,
    private readonly cwd: string,
    dark: boolean,
    font: TerminalFont = { family: DEFAULT_FAMILY, size: DEFAULT_SIZE },
    private readonly onOpenPath: (path: string, line: number | null) => void = () => undefined,
    /**
     * A command was submitted into this shell. It is what tells a run somebody is
     * waiting for from a screen repainting itself, so the taskbar can be trusted.
     */
    private readonly onSubmit: () => void = () => undefined
  ) {
    this.host = document.createElement('div')
    this.host.className = 'term-host'

    this.term = new Terminal({
      fontFamily: font.family,
      fontSize: font.size,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      theme: dark ? DARK : LIGHT,
      ...(windowsPty ? { windowsPty } : {})
    })
    this.term.loadAddon(this.fit)

    this.term.onData((data) => {
      if (this.exited) return
      /*
       * Held while the shell is still starting rather than sent into a main process that
       * has nothing to send it to. A pane is on screen before its shell exists, so the
       * first characters typed into a fresh tab were being dropped on the floor.
       */
      if (!this.started) this.waiting += data
      else window.api.terminal.write(this.id, data)
      // A carriage return is Enter: whatever was on that line has been asked for.
      if (data.includes('\r')) this.onSubmit()
    })
    this.term.attachCustomKeyEventHandler((event) => this.handleKey(event))
    this.host.addEventListener('contextmenu', (event) => this.handleContextMenu(event))

    this.offData = window.api.terminal.onData(({ id, data }) => {
      if (id !== this.id) return
      /*
       * Held until the pane knows what it is showing. Taking a shell over asks the main
       * process for everything it has printed and writes that in one go, and anything
       * arriving in between is in both - so it appeared twice, with the older copy last.
       */
      if (!this.started) this.arrived += data
      else this.term.write(data)
    })
    this.offExit = window.api.terminal.onExit(({ id, exitCode }) => {
      if (id !== this.id) return
      this.exited = true
      this.term.write(`\r\n\x1b[90m[shell exited with code ${exitCode}]\x1b[0m\r\n`)
    })

    this.linkProvider = this.term.registerLinkProvider({
      provideLinks: (row, callback) => void this.provideLinks(row, callback)
    })

    // Only fires while the pane is visible; a hidden pane reports zero and is skipped.
    this.observer = new ResizeObserver(() => this.resize())
  }

  /**
   * Whether the shell behind this pane has ended. A pane that outlived its shell is
   * a picture of one, and every way of using it has to know the difference.
   */
  isDead(): boolean {
    return this.exited
  }

  /**
   * Attach to the DOM and take over the shell for this pane, starting one only if there
   * is nothing to take over. Safe to call once.
   *
   * The shell lives in the main process, so it survives this window: a reload in
   * development, or a renderer that died and was rebuilt. What does not survive is the
   * screen, so whatever it printed while nobody was watching is replayed into the fresh
   * terminal before it is shown - an agent mid-conversation comes back where it was
   * rather than as an empty pane.
   */
  start(container: HTMLElement): Promise<string | null> {
    // Asked twice, started once: the second caller gets the first one's answer.
    this.starting ??= this.begin(container)
    return this.starting
  }


  private async begin(container: HTMLElement): Promise<string | null> {
    container.append(this.host)
    this.term.open(this.host)
    this.observer.observe(this.host)
    /*
     * Said out loud because this is the half of the story the main process cannot see: a
     * terminal built here starts empty, so a pane that looks like a shell nobody has
     * used yet is either a new shell or a new screen in front of an old one - and from
     * the outside those are indistinguishable.
     */
    window.api.note('a terminal was built for ' + this.id)

    const trail = await window.api.terminal.attach(this.id, this.cwd)
    if (trail !== null) {
      // Sized before the replay, so what is redrawn is redrawn at the right width.
      this.resize()
      this.term.write(trail)
      this.term.focus()
      this.started = true
      this.flush()
      return null
    }

    const result = await window.api.terminal.create(this.id, this.cwd)
    /*
     * Whatever was measured while the shell was still starting was measured for a shell
     * that did not exist yet, so it counts for nothing and has to be said again. Without
     * dropping the record of it, the check inside resize() sees the same numbers, decides
     * there is nothing to report, and leaves the shell at the size it was born with.
     */
    this.cols = 0
    this.rows = 0
    if (!result.ok) {
      this.exited = true
      this.term.write(`\x1b[31mCould not start a shell: ${result.error}\x1b[0m\r\n`)
      return result.error
    }
    this.started = true
    this.resize()
    this.term.focus()
    this.flush()
    return null
  }

  /** Re-measure after the pane becomes visible or the split moves. */
  resize(): void {
    if (this.disposed || this.host.clientWidth === 0 || this.host.clientHeight === 0) return
    this.fit.fit()
    if (this.term.cols === this.cols && this.term.rows === this.rows) return
    this.cols = this.term.cols
    this.rows = this.term.rows
    window.api.terminal.resize(this.id, this.cols, this.rows)
  }

  setVisible(visible: boolean): void {
    this.host.hidden = !visible
    if (visible) this.resize()
  }

  setTheme(dark: boolean): void {
    this.term.options.theme = dark ? DARK : LIGHT
  }

  /**
   * A different character size means a different number of rows and columns, and the
   * shell has to be told - otherwise its idea of the window stays the old one and long
   * lines wrap in the wrong place. The cached dimensions are dropped so the new ones
   * are always sent, even when the fit happens to land on the same numbers.
   */
  setFont(font: TerminalFont): void {
    this.term.options.fontFamily = font.family
    this.term.options.fontSize = font.size
    this.cols = 0
    this.rows = 0
    this.resize()
  }

  focus(): void {
    this.term.focus()
  }

  /**
   * A composed prompt, handed to the shell as a paste rather than as typing: inside a
   * bracketed paste the newlines are text, which is the whole reason a multi-line prompt
   * cannot simply be typed in. The submitting newline follows once the paste has ended.
   */
  sendPrompt(text: string): boolean {
    // Answered rather than ignored: a prompt that went nowhere must not be cleared away
    // as though it had been sent, which is what the empty field used to say it was.
    if (this.exited) return false
    this.term.paste(text)
    window.api.terminal.write(this.id, String.fromCharCode(13))
    this.onSubmit()
    this.term.focus()
    return true
  }

  hasFocus(): boolean {
    return this.host.contains(document.activeElement)
  }


  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    window.api.note('the terminal for ' + this.id + ' was thrown away, and its shell with it')
    this.observer.disconnect()
    this.linkProvider.dispose()
    this.offData()
    this.offExit()
    window.api.terminal.kill(this.id)
    this.term.dispose()
    this.host.remove()
  }

  /**
   * The paths an agent writes into its output, turned into something you can click.
   *
   * xterm asks one row at a time, but a path can be split across two rows by wrapping,
   * so the whole logical line is put back together first and offsets are then divided
   * by the width to land back on the grid. Only the matches that begin on the row being
   * asked about are returned, otherwise a wrapped line would report each of them twice.
   */
  private async provideLinks(row: number, callback: (links: ILink[] | undefined) => void) {
    const buffer = this.term.buffer.active
    const cols = this.term.cols
    if (cols === 0) return callback(undefined)

    let first = row
    while (first > 1 && buffer.getLine(first - 1)?.isWrapped) first--

    let text = ''
    for (let y = first; ; y++) {
      const line = buffer.getLine(y - 1)
      if (!line || (y > first && !line.isWrapped)) break
      text += line.translateToString(false)
    }

    const found = findPaths(text.trimEnd()).filter(
      (match) => rowOf(match.start, first, cols) === row
    )
    if (found.length === 0) return callback(undefined)

    /*
     * Shape alone would underline half the output, so the disk decides. Resolving is
     * relative to where the shell was started, which is the project root - a path an
     * agent writes is relative to the same place.
     */
    const resolved = await window.api.resolveFiles(
      this.cwd,
      found.map((match) => match.path)
    )
    if (this.disposed) return

    const links: ILink[] = []
    found.forEach((match, index) => {
      const path = resolved[index]
      if (!path) return
      links.push({
        range: cellRange(match.start, match.end - match.start, first, cols),
        text: text.slice(match.start, match.end),
        activate: () => this.onOpenPath(path, match.line)
      })
    })
    callback(links.length > 0 ? links : undefined)
  }

  /**
   * Everything held while the pane was starting, in the order it happened: what the shell
   * printed goes on screen, what was typed goes to the shell.
   */
  private flush(): void {
    if (this.arrived !== '') {
      const printed = this.arrived
      this.arrived = ''
      this.term.write(printed)
    }
    if (this.waiting === '') return
    const held = this.waiting
    this.waiting = ''
    window.api.terminal.write(this.id, held)
  }

  /** Hands the clipboard to the shell as a paste, so newlines arrive as text. */
  private pasteClipboard(): void {
    void window.api.readClipboard().then((text) => {
      if (text && !this.exited) this.term.paste(text)
    })
  }

  private copySelection(): void {
    void navigator.clipboard.writeText(this.term.getSelection()).catch(() => undefined)
  }

  /** Which keys the pane keeps for itself; the rest belong to the shell untouched. */
  private handleKey(event: KeyboardEvent): boolean {
    if (event.type !== 'keydown') return true

    // Pane keys are the one thing taken from the shell, the way tmux takes a prefix.
    if (paneCommand(event)) return false
    /*
     * Not handled here: refusing it in xterm is enough, since the key then reaches
     * the window and the tab switch happens there.
     */
    if (tabDigit(event)) return false
    // The same, for the two keys xterm would otherwise turn into control characters.
    if (claimedFromShell(event)) return false

    const action = terminalAction(event)
    if (action === 'paste') {
      /*
       * Chromium pastes into the hidden textarea by itself, and xterm forwards that
       * to the shell - so without this the clipboard arrives twice, once from the
       * browser and once from here. Doing it here rather than leaving it to the
       * browser keeps one path for the keyboard and the right button both.
       */
      event.preventDefault()
      this.pasteClipboard()
      return false
    }
    if (action === 'copy' && this.term.hasSelection()) {
      this.copySelection()
      return false
    }
    return true
  }

  /**
   * The right button does what it does in a Windows console: copies when something is
   * selected, pastes when nothing is. There is no menu, because a menu of two items
   * is slower than the two things it offers.
   */
  private handleContextMenu(event: MouseEvent): void {
    event.preventDefault()
    if (this.term.hasSelection()) {
      this.copySelection()
      this.term.clearSelection()
      return
    }
    this.pasteClipboard()
  }
}
