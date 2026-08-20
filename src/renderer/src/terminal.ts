import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { DEFAULT_FAMILY, DEFAULT_SIZE, type TerminalFont } from '../../shared/font'
import { paneCommand } from '../../shared/shortcuts'
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
  private cols = 0
  private rows = 0
  private disposed = false
  private exited = false

  constructor(
    readonly id: string,
    private readonly cwd: string,
    dark: boolean,
    font: TerminalFont = { family: DEFAULT_FAMILY, size: DEFAULT_SIZE }
  ) {
    this.host = document.createElement('div')
    this.host.className = 'term-host'

    this.term = new Terminal({
      fontFamily: font.family,
      fontSize: font.size,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      theme: dark ? DARK : LIGHT
    })
    this.term.loadAddon(this.fit)

    this.term.onData((data) => {
      if (!this.exited) window.api.terminal.write(this.id, data)
    })
    this.term.attachCustomKeyEventHandler((event) => this.handleKey(event))

    this.offData = window.api.terminal.onData(({ id, data }) => {
      if (id === this.id) this.term.write(data)
    })
    this.offExit = window.api.terminal.onExit(({ id, exitCode }) => {
      if (id !== this.id) return
      this.exited = true
      this.term.write(`\r\n\x1b[90m[shell exited with code ${exitCode}]\x1b[0m\r\n`)
    })

    // Only fires while the pane is visible; a hidden pane reports zero and is skipped.
    this.observer = new ResizeObserver(() => this.resize())
  }

  /** Attach to the DOM and start the shell. Safe to call once. */
  async start(container: HTMLElement): Promise<string | null> {
    container.append(this.host)
    this.term.open(this.host)
    this.observer.observe(this.host)

    const result = await window.api.terminal.create(this.id, this.cwd)
    if (!result.ok) {
      this.exited = true
      this.term.write(`\x1b[31mCould not start a shell: ${result.error}\x1b[0m\r\n`)
      return result.error
    }
    this.resize()
    this.term.focus()
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

  hasFocus(): boolean {
    return this.host.contains(document.activeElement)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.observer.disconnect()
    this.offData()
    this.offExit()
    window.api.terminal.kill(this.id)
    this.term.dispose()
    this.host.remove()
  }

  /**
   * Ctrl+C has to keep meaning interrupt, so copy and paste sit on the shifted
   * variants - the same bargain every terminal on Windows makes. Everything else
   * belongs to the shell and is passed through untouched.
   */
  private handleKey(event: KeyboardEvent): boolean {
    if (event.type !== 'keydown') return true

    // Pane keys are the one thing taken from the shell, the way tmux takes a prefix.
    if (paneCommand(event)) return false

    if (!event.ctrlKey || !event.shiftKey) return true
    const key = event.key.toLowerCase()

    if (key === 'c' && this.term.hasSelection()) {
      void navigator.clipboard.writeText(this.term.getSelection()).catch(() => undefined)
      return false
    }
    if (key === 'v') {
      void window.api.readClipboard().then((text) => {
        if (text && !this.exited) this.term.paste(text)
      })
      return false
    }
    return true
  }
}
