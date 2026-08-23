/**
 * The tail of a stream, kept in memory.
 *
 * A shell lives in the main process and outlives the window it is shown in - a reload
 * in development, a renderer that dies, a page that took the process down with it. What
 * does not outlive the window is the screen: xterm's scrollback goes with it. This is
 * the part that is kept so the pane can be put back the way it was, instead of coming
 * back empty and looking like the session was lost.
 *
 * Chunks are dropped whole rather than cut, and the oldest first, so the limit is a
 * ceiling rather than an exact size. Replay can therefore begin in the middle of an
 * escape sequence, which is unavoidable at any boundary and harmless in practice: a
 * full-screen program repaints, and a plain shell loses at worst some colour on the
 * first line.
 */
export class Trail {
  private chunks: string[] = []
  private size = 0
  private readonly limit: number

  // Written out rather than declared in the parameter list: these files are run
  // directly by `node --test`, which strips types and refuses a parameter property.
  constructor(limit: number) {
    this.limit = limit
  }

  add(text: string): void {
    if (text === '') return
    this.chunks.push(text)
    this.size += text.length
    // The newest chunk always stays, even on its own and even if it is over the limit:
    // the most recent output is the one thing the replay cannot do without.
    while (this.size > this.limit && this.chunks.length > 1) {
      this.size -= this.chunks[0].length
      this.chunks.shift()
    }
  }

  /**
   * Everything kept, joined. Not collapsed into one chunk while doing so: that made the
   * whole of it a single chunk, and the loop above never drops the only one it has - so
   * the next overflow threw away everything at once and the replay after it was nearly
   * empty.
   */
  text(): string {
    return this.chunks.join('')
  }

  /** How much is being kept. Bytes as far as anyone reading a log cares. */
  length(): number {
    return this.size
  }
}
