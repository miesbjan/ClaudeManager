/**
 * The shortcut list shown by the `?` button. Kept as data in one place so the panel
 * and the README cannot drift apart unnoticed - if a binding changes, it changes
 * here and the panel follows.
 */
export type HelpRow = { keys: string; action: string }
export type HelpSection = { title: string; rows: HelpRow[] }

export const SHORTCUTS: HelpSection[] = [
  {
    title: 'Documents and tabs',
    rows: [
      { keys: 'Ctrl+P / Ctrl+O', action: 'go to a file: in the project / anywhere' },
      { keys: 'Ctrl+T', action: 'new tab, for another place' },
      { keys: 'Ctrl+W', action: 'close the file; the last one closes the tab' },
      { keys: 'Ctrl+PageUp / PageDown', action: 'the other files open in this tab' },
      { keys: 'Ctrl+Tab / Ctrl+Shift+Tab', action: 'next / previous tab' },
      { keys: 'Ctrl+1 … Ctrl+9', action: 'jump to tab by position' },
      { keys: 'Ctrl+F', action: 'find in the document' },
      { keys: 'Ctrl+R', action: 'reload the document' },
      { keys: 'Ctrl+E / Ctrl+S', action: 'rendered or as written / save' },
      { keys: 'Ctrl+D', action: 'theme: Auto / Light / Dark' },
      { keys: 'Ctrl+`', action: 'show or hide the shell' },
      { keys: 'Ctrl+= / Ctrl+-', action: 'terminal font, from anywhere' }
    ]
  },
  {
    title: 'Panes (Alt, as in tmux)',
    rows: [
      { keys: 'Alt+← / Alt+→', action: 'focus the pane in that direction' },
      { keys: 'Alt+1 / Alt+2 / Alt+3', action: 'focus the shell / document / dev server' },
      { keys: 'Alt+Shift+← / →', action: 'move the divider' },
      { keys: 'Alt+Z', action: 'zoom the focused pane, and back' },
      { keys: 'Alt+W', action: 'right side: document, dev server, both' }
    ]
  },
  {
    title: 'While the shell has focus',
    rows: [
      { keys: 'Ctrl+Shift+C / V', action: 'copy / paste' },
      { keys: 'Ctrl+Shift+O, P, W, R, D, 1…9', action: 'the app shortcuts above' },
      { keys: 'everything else', action: 'goes to the shell untouched' }
    ]
  },
  {
    title: 'Mouse',
    rows: [
      { keys: 'middle-click a tab', action: 'close it' },
      { keys: 'double-click a tab', action: 'name it something of your own' },
      { keys: 'right-click a tab', action: 'rename, reload, close, reveal' },
      { keys: 'drag a file in', action: 'open it in this tab' }
    ]
  }
]

/** Builds the panel contents once; the caller only shows and hides it afterwards. */
export function renderShortcuts(host: HTMLElement): void {
  host.textContent = ''

  const heading = document.createElement('h2')
  heading.textContent = 'Keyboard shortcuts'
  host.append(heading)

  const grid = document.createElement('div')
  grid.className = 'help-grid'

  for (const section of SHORTCUTS) {
    const title = document.createElement('h3')
    title.textContent = section.title
    grid.append(title)

    const list = document.createElement('dl')
    for (const row of section.rows) {
      const keys = document.createElement('dt')
      for (const [index, key] of row.keys.split(' ').entries()) {
        if (index > 0) keys.append(' ')
        // Separators stay plain text so only the keys themselves look like keys.
        if (key === '/' || key === '…' || key === '+') keys.append(key)
        else {
          const kbd = document.createElement('kbd')
          kbd.textContent = key
          keys.append(kbd)
        }
      }
      const action = document.createElement('dd')
      action.textContent = row.action
      list.append(keys, action)
    }
    grid.append(list)
  }

  host.append(grid)

  const hint = document.createElement('p')
  hint.className = 'help-hint'
  hint.textContent = 'Esc or the ? button closes this.'
  host.append(hint)
}
