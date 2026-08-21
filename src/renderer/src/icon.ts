/**
 * Draws the badge for the taskbar button and hands it to the main process.
 *
 * It is an overlay rather than a redrawn icon, which decides where it sits: Windows
 * puts an overlay in the bottom-right corner and nowhere else. Painting the badge
 * into the icon itself and setting that as the window icon does allow any corner -
 * and worked once - but the taskbar keeps the icon it first associated with the
 * executable and ignores later ones, so the number would freeze at whatever it was.
 * A corner chosen by the system beats a number that stops being true.
 *
 * The drawing is done here rather than in the main process because a renderer has a
 * canvas and the main process has none.
 */
import { badgeDataUrl, type Badge } from '../../shared/icon'

/** Windows scales this into a 16x16 overlay; drawing larger keeps the digit clean. */
const SIZE = 64

let lastDrawn: string | null = null

function key(badge: Badge | null): string {
  return badge ? `${badge.level}:${badge.count}` : 'none'
}

function draw(badge: Badge): Promise<string> {
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
      context.clearRect(0, 0, SIZE, SIZE)
      context.drawImage(art, 0, 0, SIZE, SIZE)
      resolve(canvas.toDataURL('image/png'))
    })
    art.addEventListener('error', () => reject(new Error('the badge would not load')))
    art.src = badgeDataUrl(badge)
  })
}

/**
 * Redraws the badge when what it should say has changed. Failing to draw one is not
 * worth interrupting anyone over: the previous badge simply stays.
 */
export async function paintTaskbarIcon(badge: Badge | null): Promise<void> {
  const wanted = key(badge)
  if (wanted === lastDrawn) return
  lastDrawn = wanted
  try {
    window.api.setTaskbarBadge(badge ? await draw(badge) : null, badge?.count ?? 0)
  } catch {
    lastDrawn = null
  }
}
