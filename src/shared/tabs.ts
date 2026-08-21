/**
 * Where a dragged tab lands, as arithmetic rather than as DOM.
 *
 * The bar itself cannot be tested - it is elements and listeners - but the two
 * decisions inside a drag can be: which slot the pointer is over, and which tab is
 * the active one once something has moved past it.
 */

/**
 * Which slot the tab being dragged from `from` belongs in, with the pointer at `x`
 * and the tabs currently sitting at `bounds`.
 *
 * It counts the neighbours the pointer has passed the middle of, which is the same
 * as asking how many tabs end up in front of this one. Asking instead which tab the
 * pointer is merely over overshoots by a slot when dragging rightwards, because the
 * dragged tab's own width trails behind the pointer.
 */
export function slotAt(
  bounds: Array<{ left: number; right: number }>,
  x: number,
  from: number
): number {
  let slot = 0
  for (const [index, box] of bounds.entries()) {
    if (index === from) continue
    if (x > (box.left + box.right) / 2) slot += 1
  }
  return slot
}

/**
 * Where the active tab ends up after the tab at `from` is moved to `to`. Reordering
 * changes the order and nothing else: whatever you were looking at, you still are.
 */
export function activeAfterMove(active: number, from: number, to: number): number {
  if (active === from) return to
  if (from < active && to >= active) return active - 1
  if (from > active && to <= active) return active + 1
  return active
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
    /*
     * Two tabs showing the same file. No amount of path tells them apart, and the
     * full path in every tab tells you nothing while costing the whole bar - so they
     * both keep the plain name and the way to distinguish them is to name one.
     */
    return name
  })
}
