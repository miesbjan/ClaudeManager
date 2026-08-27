/**
 * Puts the freshly built app on the desktop so a new version can be tried without
 * digging through ./release.
 *
 * By default it writes a shortcut to the unpacked build: it starts instantly, always
 * points at the newest build, and stays a few kilobytes - which matters because this
 * desktop is redirected into OneDrive, where an 80 MB copy per build would be
 * uploaded every time. Pass --exe to place the portable binary itself instead, for
 * carrying to another machine.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const RELEASE = join(ROOT, 'release')
const UNPACKED = join(RELEASE, 'win-unpacked', 'Claude Manager.exe')
const SHORTCUT_NAME = 'Claude Manager.lnk'
const EXE_NAME = 'Claude Manager.exe'

const wantExe = process.argv.includes('--exe')

function powershell(script) {
  return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8'
  }).trim()
}

/** The desktop is a shell folder: it can be localised and redirected. */
function desktopDir() {
  return powershell("[Environment]::GetFolderPath('Desktop')")
}

function newestPortable() {
  if (!existsSync(RELEASE)) return null
  const candidates = readdirSync(RELEASE)
    .filter((name) => /portable.*\.exe$/i.test(name))
    .map((name) => join(RELEASE, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return candidates[0] ?? null
}

function quote(value) {
  return "'" + value.replace(/'/g, "''") + "'"
}

function makeShortcut(desktop) {
  if (!existsSync(UNPACKED)) {
    console.warn(`[desktop] no build at ${UNPACKED} - run npm run build first`)
    return false
  }
  const link = join(desktop, SHORTCUT_NAME)
  powershell(
    [
      '$s = (New-Object -ComObject WScript.Shell).CreateShortcut(' + quote(link) + ')',
      '$s.TargetPath = ' + quote(UNPACKED),
      '$s.WorkingDirectory = ' + quote(join(RELEASE, 'win-unpacked')),
      "$s.Description = 'Claude Manager (latest local build)'",
      '$s.Save()'
    ].join('; ')
  )
  console.log(`[desktop] shortcut -> ${link}`)
  return true
}

/**
 * Which copies of the application are running, so a build that cannot hand over its
 * result says what is holding it rather than only that something is.
 *
 * The usual answer is an instance hidden in the tray, which is the one place nobody
 * looks - and that answer has cost several minutes more than once. Best effort: if the
 * query itself fails, the message above still stands on its own.
 */
function runningApps() {
  try {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Claude Manager.exe' -and $_.CommandLine -notmatch '--type=' } | ForEach-Object { $_.ProcessId.ToString() + '  ' + $_.ExecutablePath }"
      ],
      { encoding: 'utf8' }
    )
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function copyPortable(desktop) {
  const source = newestPortable()
  if (!source) {
    console.warn('[desktop] no portable build in ./release - run npm run build first')
    return false
  }
  const target = join(desktop, EXE_NAME)
  try {
    copyFileSync(source, target)
    console.log(`[desktop] ${basename(source)} -> ${target}`)
    return true
  } catch (error) {
    // Most often the copy on the desktop is the running app and cannot be replaced.
    console.warn(`[desktop] could not replace ${target}: ${error.message}`)
    for (const line of runningApps()) console.warn(`[desktop] running: ${line}`)
    console.warn('[desktop] close the running app and repeat with: npm run desktop -- --exe')
    return false
  }
}

try {
  const desktop = desktopDir()
  // A failed hand-off must never fail a build that otherwise succeeded, so the
  // outcome is only reported in the log above; this always exits 0.
  if (wantExe) copyPortable(desktop)
  else makeShortcut(desktop)
  process.exit(0)
} catch (error) {
  console.warn(`[desktop] skipped: ${error.message}`)
  process.exit(0)
}
