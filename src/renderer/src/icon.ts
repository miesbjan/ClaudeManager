/**
 * Draws the window icon, with or without its badge, and hands it to the main process.
 *
 * Windows has an API for exactly this shape of thing - `setOverlayIcon` - but it puts
 * the overlay in the bottom-right corner and nowhere else. The badge belongs in the
 * top-right, clear of the lines of the document underneath, so the whole icon is
 * redrawn instead and set as the window's own icon.
 *
 * The drawing is done here rather than in the main process because a renderer has a
 * canvas and the main process has none.
 */
import { iconDataUrl, type Badge } from '../../shared/icon'

/**
 * Windows scales the button icon down from this; drawing at the size it will be shown
 * would mean redrawing on every display change.
 */
const SIZE = 64

let lastDrawn: string | null = null

function key(badge: Badge | null): string {
  return badge ? `${badge.level}:${badge.count}` : 'plain'
}

function draw(badge: Badge | null): Promise<string> {
  return new Promise((resolve, reject) => {
    const art = new Image()
    art.addEventListener('load', () => {
      const canvas = document.createElement('canvas')
      canvas.width = SIZE
      canvas.height = SIZE
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('no 2d context'))
        return
      }
      context.drawImage(art, 0, 0, SIZE, SIZE)
      resolve(canvas.toDataURL('image/png'))
    })
    art.addEventListener('error', () => reject(new Error('the icon would not load')))
    art.src = iconDataUrl(badge)
  })
}

/**
 * Redraws the taskbar icon when what it should say has changed. Failing to draw an
 * icon is not worth interrupting anyone over: the previous one simply stays.
 */
export async function paintTaskbarIcon(badge: Badge | null): Promise<void> {
  const wanted = key(badge)
  if (wanted === lastDrawn) return
  lastDrawn = wanted
  try {
    window.api.setTaskbarIcon(await draw(badge))
  } catch {
    lastDrawn = null
  }
}
