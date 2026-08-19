/** Neither pane may be squeezed to nothing. */
export const MIN_RATIO = 0.15
export const MAX_RATIO = 0.85
export const DEFAULT_RATIO = 0.5

export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return DEFAULT_RATIO
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio))
}

/** Fraction of `width` taken by the left pane when the divider sits at `x`. */
export function ratioFromPointer(x: number, left: number, width: number): number {
  if (width <= 0) return DEFAULT_RATIO
  return clampRatio((x - left) / width)
}

type DragHandlers = {
  /** Called continuously while dragging, so the terminal can re-fit. */
  onChange: (ratio: number) => void
  /** Called once the divider is released, so the layout can be persisted. */
  onCommit: (ratio: number) => void
}

/**
 * Turns an element into the divider between the two panes. Pointer capture keeps
 * the drag alive over the terminal, which would otherwise swallow the events.
 */
export function makeSplitter(
  splitter: HTMLElement,
  container: HTMLElement,
  handlers: DragHandlers
): void {
  let dragging = false

  splitter.addEventListener('pointerdown', (event) => {
    dragging = true
    splitter.setPointerCapture(event.pointerId)
    document.body.classList.add('resizing')
    event.preventDefault()
  })

  splitter.addEventListener('pointermove', (event) => {
    if (!dragging) return
    const box = container.getBoundingClientRect()
    handlers.onChange(ratioFromPointer(event.clientX, box.left, box.width))
  })

  const stop = (event: PointerEvent): void => {
    if (!dragging) return
    dragging = false
    splitter.releasePointerCapture(event.pointerId)
    document.body.classList.remove('resizing')
    const box = container.getBoundingClientRect()
    handlers.onCommit(ratioFromPointer(event.clientX, box.left, box.width))
  }

  splitter.addEventListener('pointerup', stop)
  splitter.addEventListener('pointercancel', stop)
}
