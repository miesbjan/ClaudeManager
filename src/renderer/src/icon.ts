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
import { badgeDataUrl, iconDataUrl, type Badge } from '../../shared/icon'

/** Windows scales this into a 16x16 overlay; drawing larger keeps the digit clean. */
const SIZE = 64

let lastDrawn: string | null = null

function key(badge: Badge | null): string {
  return badge ? `${badge.level}:${badge.count}` : 'none'
}

function draw(source: string, size = SIZE): Promise<string> {
  return new Promise((resolve, reject) => {
    const art = new Image()
    art.addEventListener('load', () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('no 2d context'))
        return
      }
      context.clearRect(0, 0, size, size)
      context.drawImage(art, 0, 0, size, size)
      resolve(canvas.toDataURL('image/png'))
    })
    art.addEventListener('error', () => reject(new Error('the drawing would not load')))
    art.src = source
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
    window.api.setTaskbarBadge(badge ? await draw(badgeDataUrl(badge)) : null, badge?.count ?? 0)
  } catch {
    lastDrawn = null
  }
}

/**
 * The tray: the same drawing with the badge on it, since a hidden window has no
 * taskbar button to carry one - and the words for its menu, which only this side
 * knows the language of.
 */
export async function paintTray(
  badge: Badge | null,
  text: Record<string, string>,
  tooltip: string,
  holds: boolean
): Promise<void> {
  try {
    window.api.setTray(await draw(iconDataUrl(badge), 32), text, tooltip, holds)
  } catch {
    window.api.setTray(null, text, tooltip, holds)
  }
}
