/**
 * Keeps the copy of the app on the desktop current, and does nothing when it already
 * is. Meant to be run after every change - see the Stop hook in
 * `.claude/settings.local.json` - so the expensive part has to be conditional.
 *
 * A full package takes over a minute, which is far too long to pay for a session
 * where nothing was built. So the newest source file is compared against the exe on
 * the desktop, and the build only runs when something is actually newer.
 *
 * Run it by hand with `npm run desktop:sync`. `--force` builds regardless.
 */
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const EXE_NAME = 'Claude Manager.exe'
const LOCK = join(ROOT, 'release', '.desktop-sync.lock')

/** How long a lock is believed before it is treated as a crashed run. */
const LOCK_STALE_MS = 30 * 60 * 1000

/**
 * What the packaged app is actually built from. Tests are left out on purpose: they
 * do not end up in the exe, so changing one is not a reason to spend a minute.
 */
const WATCHED = [
  'src',
  'scripts/deploy-desktop.mjs',
  'package.json',
  'electron-builder.yml',
  'electron.vite.config.ts',
  'tsconfig.json'
]

const force = process.argv.includes('--force')

function powershell(script) {
  return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8'
  }).trim()
}

/** The desktop is a shell folder: it can be localised and redirected. */
function desktopExe() {
  return join(powershell("[Environment]::GetFolderPath('Desktop')"), EXE_NAME)
}

/** Newest modification time under a file or directory, 0 when it does not exist. */
function newestMtime(path) {
  let info
  try {
    info = statSync(path)
  } catch {
    return 0
  }
  if (!info.isDirectory()) return info.mtimeMs

  let newest = info.mtimeMs
  for (const entry of readdirSync(path)) {
    newest = Math.max(newest, newestMtime(join(path, entry)))
  }
  return newest
}

/**
 * Windows holds the files of a running executable, so packaging fails with "Access is
 * denied" while the built app is open. Worth finding out in a second rather than after
 * a minute of building.
 */
function builtAppRunning() {
  try {
    const paths = powershell(
      "(Get-CimInstance Win32_Process -Filter \"Name = 'Claude Manager.exe'\" |" +
        ' Select-Object -ExpandProperty ExecutablePath) -join [char]59'
    )
    const root = ROOT.toLowerCase()
    return paths
      .split(';')
      .filter(Boolean)
      .some((path) => path.toLowerCase().startsWith(root))
  } catch {
    // Cannot tell; let the build try and report for itself.
    return false
  }
}

function held() {
  if (!existsSync(LOCK)) return false
  try {
    const age = Date.now() - statSync(LOCK).mtimeMs
    if (age < LOCK_STALE_MS) return true
    console.log(`[desktop-sync] ignoring a lock left behind ${Math.round(age / 60000)} min ago`)
  } catch {
    // unreadable; treat as free
  }
  return false
}

function run() {
  const target = desktopExe()
  const built = newestMtime(target)
  const sources = Math.max(...WATCHED.map((entry) => newestMtime(join(ROOT, entry))))

  if (!force && built > 0 && built >= sources) {
    console.log('[desktop-sync] the desktop copy is current, nothing to build')
    return
  }

  // Two packagers writing ./release at once would corrupt both runs.
  if (held()) {
    console.log('[desktop-sync] another build is already running, skipping')
    return
  }

  if (builtAppRunning()) {
    console.log('[desktop-sync] the built app is open, so packaging would fail; skipping')
    console.log('[desktop-sync] close it and run: npm run desktop:sync')
    return
  }

  const reason = built === 0 ? 'no copy on the desktop yet' : 'sources are newer'
  console.log(`[desktop-sync] building: ${reason}`)

  mkdirSync(dirname(LOCK), { recursive: true })
  writeFileSync(LOCK, String(process.pid), 'utf8')
  try {
    execFileSync('npm', ['run', 'build:exe'], { cwd: ROOT, stdio: 'inherit', shell: true })
    console.log(`[desktop-sync] ${target} refreshed`)
  } finally {
    try {
      if (readFileSync(LOCK, 'utf8') === String(process.pid)) unlinkSync(LOCK)
    } catch {
      // already gone
    }
  }
}

try {
  run()
  process.exit(0)
} catch (error) {
  // A failed build must never fail the session it was started from.
  console.warn(`[desktop-sync] skipped: ${error.message}`)
  process.exit(0)
}
