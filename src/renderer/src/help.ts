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
      { keys: 'Ctrl+O', action: 'open Markdown file' },
      { keys: 'Ctrl+W', action: 'close current tab' },
      { keys: 'Ctrl+Tab / Ctrl+Shift+Tab', action: 'next / previous tab' },
      { keys: 'Ctrl+1 … Ctrl+9', action: 'jump to tab by position' },
      { keys: 'Ctrl+R', action: 'reload the document' },
      { keys: 'Ctrl+D', action: 'theme: Auto / Light / Dark' },
      { keys: 'Ctrl+`', action: 'show or hide the shell' }
    ]
  },
  {
    title: 'Panes (Alt, as in tmux)',
    rows: [
      { keys: 'Alt+← / Alt+→', action: 'focus the pane in that direction' },
      { keys: 'Alt+1 / Alt+2', action: 'focus the shell / the document' },
      { keys: 'Alt+Shift+← / →', action: 'move the divider' },
      { keys: 'Alt+Z', action: 'zoom the focused pane, and back' }
    ]
  },
  {
    title: 'While the shell has focus',
    rows: [
      { keys: 'Ctrl+Shift+C / V', action: 'copy / paste' },
      { keys: 'Ctrl+Shift+O, W, R, D, 1…9', action: 'the app shortcuts above' },
      { keys: 'everything else', action: 'goes to the shell untouched' }
    ]
  },
  {
    title: 'Mouse',
    rows: [
      { keys: 'middle-click a tab', action: 'close it' },
      { keys: 'right-click a tab', action: 'reload, close, copy path, reveal' },
      { keys: 'drag a .md file in', action: 'open it in a new tab' },
      { keys: 'drag the divider', action: 'resize the panes' }
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
