/**
 * The application icon, as a drawing rather than a file.
 *
 * It is written once here and used twice: the build script renders it into the
 * `.ico` that ships with the app, and the running window redraws it with a badge on
 * top whenever tabs are waiting for you. Two copies of the same artwork would drift
 * apart the first time one of them changed, and a `.ico` cannot be diffed.
 *
 * The picture is a page with a prompt speaking into it - the document and the shell,
 * which is what the application is.
 */

/** Everything is drawn in this square and scaled at the end. */
const CANVAS = 256

/**
 * The artwork is kept away from the edges. A Windows taskbar puts icons shoulder to
 * shoulder, and a drawing that reaches its own border looks bigger and cruder than
 * its neighbours.
 */
const PADDING = 0.82

const PAPER = '#f2f4f7'
const INK = '#1b1e24'
const LINE = '#9aa2b1'
const ACCENT = '#2563eb'

/** Where the badge sits: the top-right corner, clear of the lines below it. */
const BADGE = { x: 194, y: 62, radius: 54, ring: 61 }

export type BadgeLevel = 'done' | 'permission' | 'alert'

/** Green finished, amber asking, red broken - the same reading as the dot on a tab. */
const BADGE_COLOURS: Record<BadgeLevel, string> = {
  done: '#22c55e',
  permission: '#f59e0b',
  alert: '#ef4444'
}

export type Badge = { count: number; level: BadgeLevel }

/** Past nine the exact number stops being worth the room it takes. */
export function badgeText(count: number): string {
  return count > 9 ? '9+' : String(count)
}

function badgeMarkup(badge: Badge): string {
  const text = badgeText(badge.count)
  // A white ring is what separates the circle from a dark taskbar; on the page
  // itself it is nearly invisible, which is the point.
  return `
    <circle cx="${BADGE.x}" cy="${BADGE.y}" r="${BADGE.ring}" fill="#ffffff"/>
    <circle cx="${BADGE.x}" cy="${BADGE.y}" r="${BADGE.radius}" fill="${BADGE_COLOURS[badge.level]}"/>
    <text x="${BADGE.x}" y="${BADGE.y + 2}" text-anchor="middle" dominant-baseline="central"
          font-family="Segoe UI, sans-serif" font-weight="700"
          font-size="${text.length > 1 ? 60 : 72}" fill="#ffffff">${text}</text>`
}

/**
 * The icon as SVG. With a badge it is the same picture with a numbered circle in the
 * corner, so the window can hand the whole thing to Windows as one image.
 */
export function iconSvg(badge: Badge | null = null): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <rect width="${CANVAS}" height="${CANVAS}" rx="58" fill="${PAPER}"/>
  <g transform="translate(128 128) scale(${PADDING}) translate(-128 -128)">
    <rect x="112" y="60" width="96" height="17" rx="8" fill="${INK}"/>
    <rect x="112" y="98" width="80" height="14" rx="7" fill="${LINE}"/>
    <rect x="112" y="133" width="96" height="14" rx="7" fill="${LINE}"/>
    <rect x="112" y="168" width="68" height="14" rx="7" fill="${LINE}"/>
    <path d="M46 96l38 34-38 34" fill="none" stroke="${ACCENT}" stroke-width="20"
          stroke-linecap="round" stroke-linejoin="round"/>
  </g>${badge ? badgeMarkup(badge) : ''}
</svg>`
}

/** The same drawing as something an `<img>` can load, which is how it reaches a canvas. */
export function iconDataUrl(badge: Badge | null = null): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(iconSvg(badge))
}
