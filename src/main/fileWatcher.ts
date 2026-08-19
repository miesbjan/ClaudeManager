import chokidar, { type FSWatcher } from 'chokidar'
import { statSync } from 'node:fs'
import type { FileEvent } from '../shared/types'

/** Safety net for watchers that miss events (network shares, odd rewrite patterns). */
const POLL_INTERVAL_MS = 1500

/**
 * Watches individual files scattered across arbitrary directories.
 *
 * Files rewritten by external tools (editors, generators, AI agents) show up in
 * many shapes: in-place writes, truncate+write, or write-temp+rename. chokidar's
 * `awaitWriteFinish` covers partial writes, `atomic` covers rename-based saves,
 * and an mtime/size poll covers anything the OS watcher silently drops.
 */
export class FileWatcher {
  private watchers = new Map<string, FSWatcher>()
  private stamps = new Map<string, string>()
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly onEvent: (event: FileEvent) => void) {}

  add(path: string): void {
    if (this.watchers.has(path)) return

    const watcher = chokidar.watch(path, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 30 },
      atomic: 250
    })

    // `add` matters too: a file may be deleted and recreated by the writer.
    watcher.on('add', () => this.emitChange(path))
    watcher.on('change', () => this.emitChange(path))
    watcher.on('unlink', () => {
      this.stamps.delete(path)
      this.onEvent({ path, type: 'unlink' })
    })
    watcher.on('error', () => {
      // Keep the poll fallback as the only source of truth for this file.
    })

    this.watchers.set(path, watcher)
    this.stamps.set(path, this.stamp(path))
    this.startPolling()
  }

  remove(path: string): void {
    const watcher = this.watchers.get(path)
    if (!watcher) return
    this.watchers.delete(path)
    this.stamps.delete(path)
    void watcher.close()
    if (this.watchers.size === 0) this.stopPolling()
  }

  async dispose(): Promise<void> {
    this.stopPolling()
    const all = [...this.watchers.values()]
    this.watchers.clear()
    this.stamps.clear()
    await Promise.all(all.map((w) => w.close()))
  }

  private emitChange(path: string): void {
    this.stamps.set(path, this.stamp(path))
    this.onEvent({ path, type: 'change' })
  }

  /**
   * Only ENOENT means the file is gone. A stat can also fail because something else
   * holds the file for a moment - a scanner, a sync client, an editor mid-save - and
   * reporting that as a deletion would strike the tab through over nothing.
   */
  private stamp(path: string): string {
    try {
      const s = statSync(path)
      return `${s.mtimeMs}:${s.size}`
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      return code === 'ENOENT' ? 'missing' : 'unreadable'
    }
  }

  private startPolling(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS)
    this.timer.unref?.()
  }

  private stopPolling(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  private poll(): void {
    for (const path of this.watchers.keys()) {
      const current = this.stamp(path)
      // A file we could not stat tells us nothing; leave the last known state alone.
      if (current === 'unreadable') continue
      const previous = this.stamps.get(path)
      if (current === previous) continue
      this.stamps.set(path, current)
      if (current === 'missing') this.onEvent({ path, type: 'unlink' })
      else this.onEvent({ path, type: 'change' })
    }
  }
}
