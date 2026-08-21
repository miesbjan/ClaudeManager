/**
 * Renders the drawing in `src/shared/icon.ts` into `build/icon.ico`, which is what
 * electron-builder stamps onto the executable.
 *
 *   npm run icon
 *
 * Electron does the rendering, so there is no image library to install: the same
 * Chromium that draws the window draws the icon. The `.ico` is committed, because a
 * build must not depend on this having been run - but it is generated, and the
 * drawing in `icon.ts` stays the thing anyone edits.
 *
 * The work is split in two because no single runtime can do both halves: this one is
 * Node, which reads the TypeScript source, and `icon-draw.cjs` is Electron, which can
 * draw but ships an older Node that cannot import a `.ts` file at all. They hand over
 * through a plain SVG on disk.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { iconSvg } from '../src/shared/icon.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const BUILD = join(root, 'build')

mkdirSync(BUILD, { recursive: true })
writeFileSync(join(BUILD, 'icon.svg'), iconSvg() + '\n')

// Electron on Windows has no console to complain to, so it leaves a note instead.
const complaint = join(BUILD, 'icon-error.txt')
rmSync(complaint, { force: true })

const electron = join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const drawn = spawnSync(electron, [join(root, 'scripts', 'icon-draw.cjs')], { stdio: 'inherit' })

if (drawn.status !== 0 || !existsSync(join(BUILD, 'icon.ico'))) {
  console.error('[icon] Electron could not draw the icon')
  if (existsSync(complaint)) console.error(readFileSync(complaint, 'utf8'))
  process.exit(1)
}

console.log('[icon] build/icon.ico and build/icon.png, drawn from build/icon.svg')
