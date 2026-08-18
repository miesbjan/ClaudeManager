export type Tab = {
  path: string
  dir: string
  html: string
  error: string | null
  scrollTop: number
  updatedAt: number | null
  /** Last content seen on disk; kept so the next reload can be diffed against it. */
  source: string | null
  /** A reload produced changed blocks that have not been shown to the user yet. */
  pendingFlash: boolean
}

export type TabHandlers = {
  onSelect: (index: number) => void
  onClose: (index: number) => void
  onContextMenu: (index: number, x: number, y: number) => void
}

/**
 * Shortest label that still distinguishes each file: the base name, extended with
 * as many parent directories as needed when base names collide.
 */
export function computeLabels(paths: string[]): string[] {
  const segments = paths.map((p) => p.replace(/\\/g, '/').split('/').filter(Boolean))
  const names = segments.map((s) => s[s.length - 1] ?? '')
  const counts = new Map<string, number>()
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)

  return segments.map((parts, index) => {
    const name = names[index]
    if ((counts.get(name) ?? 0) < 2) return name
    for (let depth = 2; depth <= parts.length; depth++) {
      const candidate = parts.slice(-depth).join('/')
      const collides = segments.some(
        (other, j) => j !== index && other.slice(-depth).join('/') === candidate
      )
      if (!collides) return candidate
    }
    return parts.join('/')
  })
}

export function renderTabBar(
  container: HTMLElement,
  tabs: Tab[],
  activeIndex: number,
  handlers: TabHandlers
): void {
  container.textContent = ''
  const labels = computeLabels(tabs.map((t) => t.path))

  tabs.forEach((tab, index) => {
    const el = document.createElement('div')
    el.className = 'tab'
    if (index === activeIndex) el.classList.add('active')
    if (tab.error) el.classList.add('unavailable')
    el.title = tab.error ? `${tab.path}\n${tab.error}` : tab.path

    const label = document.createElement('span')
    label.className = 'tab-label'
    label.textContent = labels[index]
    el.append(label)

    const close = document.createElement('button')
    close.className = 'tab-close'
    close.type = 'button'
    close.textContent = '×'
    close.title = 'Close tab (Ctrl+W)'
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
      }
    })
    el.addEventListener('contextmenu', (event) => {
      event.preventDefault()
      handlers.onContextMenu(index, event.clientX, event.clientY)
    })

    container.append(el)
  })

  container.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
