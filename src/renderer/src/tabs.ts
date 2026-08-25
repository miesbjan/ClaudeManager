import { translate, type Lang } from '../../shared/i18n'
import { computeLabels, slotAt } from '../../shared/tabs'
import { shownActivity, type ActivityState } from './activity'
import type { Doc } from './docs'
import type { ProjectInfo } from '../../shared/types'
import type { RightMode } from '../../shared/web'

/** The last part of a path, which is what a directory is called. */
const baseName = (path: string): string => {
  const trimmed = path.replace(/[\\/]+$/, '')
  return trimmed.split(/[\\/]/).pop() ?? path
}

/** What the dot on a tab says, and what it means when you hover it. */
const ACTIVITY_TITLE = {
  working: 'activity.working',
  busy: 'activity.busy',
  done: 'activity.done',
  waiting: 'activity.waiting',
  permission: 'activity.permission',
  alert: 'activity.alert'
} as const satisfies Record<Exclude<ActivityState, 'idle'>, string>

export type Tab = {
  /**
   * Identity of the tab itself, not of what it happens to be showing. Everything
   * belonging to the tab as a place - above all its shell - is keyed by this, so the
   * document can be replaced without the shell losing its owner. What belongs to the
   * file rather than the tab stays keyed by `path`: watching it, reloading it, and the
   * remembered layout, which is per document on purpose.
   */
  id: string
  /**
   * The files open in this place, one of them on screen. A tab is not a document: the
   * shell, the project and the layout below belong to the tab and do not move when the
   * shown file changes.
   */
  docs: Doc[]
  /** Which of them is on screen. */
  docIndex: number
  /**
   * A name given by hand. A place is often better described by what you are doing there
   * than by whichever file happens to be on screen, so this beats the file's name.
   */
  name: string | null
  /** Whether this tab shows a shell next to the document. */
  terminalOpen: boolean
  /**
   * The directory this tab is a place over, when it was chosen rather than derived from
   * a file. It is what the shell starts in, what the palette searches, and what the tab
   * is called while nothing is open in it.
   */
  root: string | null
  /** The prompt being composed for this shell, and whether its drawer is open. */
  prompt: string
  promptOpen: boolean
  /** Width of the shell pane as a fraction of the tab. */
  ratio: number
  /** A pane blown up to the whole tab, as tmux does with `prefix + z`. */
  zoom: 'terminal' | 'document' | 'web' | null
  /** What happened here while you were looking elsewhere. */
  activity: ActivityState
  /**
   * Whether anything in this pane has spoken for itself - an agent's interface, or a
   * program reporting its own progress. A shell sitting over a directory has not, and
   * a light about it would answer a question nobody asked.
   */
  reporting: boolean
  /**
   * When output started flowing in this run. How long ago that was is what tells a
   * finished run from a screen being repainted.
   */
  runFrom: number | null
  /**
   * When a command was last submitted into this shell. It is the difference between a
   * run somebody asked for and a screen repainting itself, and it is a time rather than
   * a flag because a shell never says when it is done: the runs that follow a command
   * all belong to it until one of them is worth reporting.
   */
  commandAt: number | null
  /** Finished since you last had the window in front of you; drives the taskbar. */
  finished: boolean
  /** The project this document belongs to, if one was recognised. */
  project: ProjectInfo | null
  /** Which of the project's run commands was chosen here. */
  runCommand: string | null
  /** Address of the dev server belonging to this document, once one is known. */
  webUrl: string | null
  /** Whether the right side shows the document, the dev server, or both. */
  rightMode: RightMode
  /** The address was typed by hand, so output must not overwrite it. */
  webManual: boolean
  /** A run was just started here, so the address it prints should open the pane. */
  awaitingServer: boolean
  /**
   * The page at this address died in its own process, so it is not put back on screen
   * until somebody asks for it - by reloading, or by giving another address.
   *
   * Without this the pane would load it again on the very next repaint, and a page that
   * dies on load would be reloaded for as long as the tab existed.
   */
  webBroken: boolean
}

export type TabHandlers = {
  onSelect: (index: number) => void
  onClose: (index: number) => void
  onContextMenu: (index: number, x: number, y: number) => void
  /** Start naming this tab by hand; the bar renders a field for it. */
  onRenameStart: (index: number) => void
  /** Every keystroke, so the value is held outside and a repaint cannot lose it. */
  onRenameEdit: (value: string) => void
  /** Empty means going back to being named after the file. */
  onRename: (index: number, name: string) => void
  onRenameCancel: () => void
  /** Dragging a tab sideways: move the one at `from` into the slot at `to`. */
  onReorder: (from: number, to: number) => void
}

/** How far a tab must be dragged before it counts as dragging and not a click. */
const DRAG_THRESHOLD = 5

/**
 * Reordering by hand, on the mouse rather than on the HTML drag API. The drag API
 * would hand the tab to the operating system, which is how a tab ends up dropped on
 * the desktop or torn into a window of its own - and a tab here is a place with a
 * shell running in it, not something to tear off. Following the pointer directly
 * keeps the whole gesture inside the bar.
 *
 * The listeners live on the document because the bar is rebuilt on every move: the
 * element the drag started on is gone by the second frame.
 */
function beginDrag(
  container: HTMLElement,
  index: number,
  start: MouseEvent,
  onReorder: (from: number, to: number) => void
): void {
  let from = index
  let dragging = false

  const move = (event: MouseEvent): void => {
    if (!dragging) {
      if (Math.abs(event.clientX - start.clientX) < DRAG_THRESHOLD) return
      dragging = true
      container.classList.add('reordering')
    }
    const bounds = [...container.querySelectorAll('.tab')].map((child) =>
      child.getBoundingClientRect()
    )
    const to = slotAt(bounds, event.clientX, from)
    if (to === from) return
    onReorder(from, to)
    from = to
  }

  const stop = (): void => {
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mouseup', stop)
    container.classList.remove('reordering')
  }

  document.addEventListener('mousemove', move)
  document.addEventListener('mouseup', stop)
}

export function renderTabBar(
  container: HTMLElement,
  tabs: Tab[],
  activeIndex: number,
  handlers: TabHandlers,
  /** The tab being named and what is typed so far, held outside this function. */
  renaming: { id: string; value: string } | null = null,
  lang: Lang = 'en'
): void {
  container.textContent = ''
  // A tab is named after the file it is showing, disambiguated against the others.
  const shown = tabs.map((tab) => tab.docs[tab.docIndex])
  const labels = computeLabels(shown.map((doc) => doc?.path ?? ''))

  tabs.forEach((tab, index) => {
    const doc = shown[index]
    const el = document.createElement('div')
    el.className = 'tab'
    if (index === activeIndex) el.classList.add('active')
    if (doc?.error) el.classList.add('unavailable')

    /*
     * Everything the place holds, in the tooltip. There is deliberately no strip of
     * open files anywhere - a tooltip costs no pixels and is the one place the whole
     * list can be seen without adding a row of chrome for it.
     */
    const listed = [
      tab.root,
      ...tab.docs.map((entry, i) => (i === tab.docIndex ? '> ' : '  ') + entry.path)
    ]
      .filter((line): line is string => typeof line === 'string' && line !== '')
      .join('\n')
    el.title = doc?.error ? `${listed}\n\n${doc.error}` : listed

    const activity = shownActivity(tab.activity, tab.reporting)
    if (activity !== 'idle') {
      const dot = document.createElement('span')
      dot.className = 'tab-dot tab-dot--' + activity
      dot.title = translate(lang, ACTIVITY_TITLE[activity])
      el.append(dot)
    }

    if (tab.id === renaming?.id) {
      const field = document.createElement('input')
      field.className = 'tab-rename'
      field.value = renaming.value
      field.spellcheck = false
      field.placeholder = labels[index]
      field.addEventListener('input', () => handlers.onRenameEdit(field.value))
      field.addEventListener('keydown', (event) => {
        event.stopPropagation()
        if (event.key === 'Enter') handlers.onRename(index, field.value)
        else if (event.key === 'Escape') handlers.onRenameCancel()
      })
      // Clicking elsewhere keeps what was typed; losing a name to a stray click is
      // more annoying than having to clear one.
      field.addEventListener('blur', () => handlers.onRename(index, field.value))
      field.addEventListener('mousedown', (event) => event.stopPropagation())
      el.append(field)
      container.append(el)
      // Focus only works once the element is in the document.
      field.focus()
      field.select()
      return
    }

    const label = document.createElement('span')
    label.className = 'tab-label'
    /*
     * With nothing open, a tab opened over a directory is called after the directory -
     * that is what the place is. Only a tab that is neither falls back to a word.
     */
    const place = tab.root === null ? '' : baseName(tab.root)
    const empty = !tab.name && !labels[index] && place === ''
    // A name given by hand reads as a plain name: it is what the place is called now,
    // not a note about the file it came from.
    label.textContent =
      tab.name ?? (labels[index] || place || translate(lang, 'tab.empty'))
    if (empty) label.classList.add('unnamed')
    label.addEventListener('dblclick', (event) => {
      event.stopPropagation()
      handlers.onRenameStart(index)
    })
    el.append(label)

    const close = document.createElement('button')
    close.className = 'tab-close'
    close.type = 'button'
    close.textContent = '×'
    close.title = translate(lang, 'tab.close.title')
    /*
     * The tab selects itself on mousedown, which happens before the button's click.
     * Without stopping it there, closing a tab you are not looking at would switch
     * to it first and only then close it.
     */
    close.addEventListener('mousedown', (event) => {
      event.stopPropagation()
      event.preventDefault()
    })
    close.addEventListener('click', (event) => {
      event.stopPropagation()
      handlers.onClose(index)
    })
    el.append(close)

    el.addEventListener('mousedown', (event) => {
      if (event.button === 1) {
        event.preventDefault()
        handlers.onClose(index)
      } else if (event.button === 0) {
        handlers.onSelect(index)
        beginDrag(container, index, event, handlers.onReorder)
      }
    })
    // Nothing here is handed to the operating system; the bar is where a tab stays.
    el.draggable = false
    el.addEventListener('dragstart', (event) => event.preventDefault())
    el.addEventListener('contextmenu', (event) => {
      event.preventDefault()
      handlers.onContextMenu(index, event.clientX, event.clientY)
    })

    container.append(el)
  })

  container.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
