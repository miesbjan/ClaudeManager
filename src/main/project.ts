import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import type { ProjectInfo } from '../shared/types'

/**
 * Finds the project a document belongs to and the one command that runs it.
 *
 * There is deliberately no build or test button. What gets used is "start the thing
 * and click through it"; building is what running does first anyway, and everything
 * else is a command you type.
 *
 * Documents live inside projects, not next to them - a roadmap under
 * `TemplateDesigner/.claude/docs/` belongs to `TemplateDesigner` - so the search
 * walks up from the document, the way npm and git do.
 */
const MAX_DEPTH_UP = 8

/** Scripts that mean "run the app", best first. */
const RUN_SCRIPTS = ['dev', 'start', 'serve', 'preview', 'watch']

/**
 * A single-app project has one of these and that is the whole answer. A monorepo
 * has none of them and a row of `dev:something` instead - one per app - and which
 * one to run is a question only the user can answer, so all of them are offered.
 *
 * Deeper variants (`dev:app:backend`) are left out: they are pieces of a run, not
 * a run, and listing them would bury the eight that matter under thirty that do not.
 */
export function runScripts(scripts: Record<string, unknown>): string[] {
  const names = Object.keys(scripts).filter((name) => typeof scripts[name] === 'string')
  const exact = RUN_SCRIPTS.filter((name) => names.includes(name))
  if (exact.length > 0) return exact

  const prefixed = names.filter((name) =>
    RUN_SCRIPTS.some((run) => new RegExp('^' + run + ':[^:]+$').test(name))
  )
  return prefixed.sort()
}

/**
 * Of several .NET projects, the runnable one: a Windows or console executable
 * rather than a library. Ties are broken by the shortest path, which favours the
 * app at the top over something nested in tests.
 */
export function pickDotnetProject(
  candidates: Array<{ path: string; content: string }>
): string | null {
  const executables = candidates.filter((c) => /<OutputType>\s*(WinExe|Exe)\s*</i.test(c.content))
  const pool = executables.length > 0 ? executables : candidates
  if (pool.length === 0) return null
  return [...pool].sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path))[0]
    .path
}

function safeList(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function readIfSmall(path: string): string | null {
  try {
    if (statSync(path).size > 512 * 1024) return null
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

const SKIP_DIRS = new Set(['node_modules', 'bin', 'obj', 'packages', 'dist', 'out'])

function subdirectories(dir: string): string[] {
  const out: string[] = []
  for (const entry of safeList(dir)) {
    if (entry.startsWith('.') || SKIP_DIRS.has(entry.toLowerCase())) continue
    const child = join(dir, entry)
    try {
      if (statSync(child).isDirectory()) out.push(child)
    } catch {
      // unreadable, skip
    }
  }
  return out
}

function csprojIn(dir: string): string[] {
  return safeList(dir)
    .filter((entry) => entry.toLowerCase().endsWith('.csproj'))
    .map((entry) => join(dir, entry))
}

/**
 * .csproj files down to two levels: solutions put them in `src/App/App.csproj`,
 * and a single app often keeps one in `dotnet/App.csproj`.
 */
function findProjectFiles(root: string): Array<{ path: string; content: string }> {
  const paths = [...csprojIn(root)]
  for (const child of subdirectories(root)) {
    paths.push(...csprojIn(child))
    for (const grandchild of subdirectories(child)) paths.push(...csprojIn(grandchild))
  }

  const found: Array<{ path: string; content: string }> = []
  for (const path of paths) {
    const content = readIfSmall(path)
    if (content !== null) found.push({ path, content })
  }
  return found
}

function nodeProject(root: string): ProjectInfo | null {
  const content = readIfSmall(join(root, 'package.json'))
  if (content === null) return null
  try {
    const parsed = JSON.parse(content) as { name?: string; scripts?: Record<string, unknown> }
    const scripts = runScripts(parsed.scripts ?? {})
    if (scripts.length === 0) return null
    return {
      kind: 'node',
      root,
      name: typeof parsed.name === 'string' ? parsed.name : null,
      commands: scripts.map((script) => `npm run ${script}`)
    }
  } catch {
    return null
  }
}

function dotnetProject(root: string): ProjectInfo | null {
  const files = findProjectFiles(root)
  const chosen = pickDotnetProject(files)
  if (!chosen) return null
  const rel = relative(root, chosen).replace(/\\/g, '/')
  const name = chosen.replace(/^.*[\\/]/, '').replace(/\.csproj$/i, '')
  return {
    kind: 'dotnet',
    root,
    name,
    commands: [rel.includes('/') ? `dotnet run --project "${rel}"` : 'dotnet run']
  }
}

/**
 * Whether this directory looks like the top of a .NET project. A solution or a
 * project file right here is the obvious case; a project one level down covers the
 * common `dotnet/App.csproj` layout, which would otherwise send the search up into
 * the parent repository and find something unrelated.
 */
function looksDotnet(dir: string): boolean {
  const entries = safeList(dir)
  if (entries.some((e) => /\.(sln|slnx|csproj)$/i.test(e))) return true
  return subdirectories(dir).some((child) => csprojIn(child).length > 0)
}

/** Walks up from a document's directory until a project is recognised. */
export function detectProject(fromDir: string): ProjectInfo | null {
  let dir = fromDir
  for (let step = 0; step < MAX_DEPTH_UP; step++) {
    const entries = safeList(dir)

    if (entries.includes('package.json')) {
      const found = nodeProject(dir)
      if (found) return found
    }
    if (looksDotnet(dir)) {
      const found = dotnetProject(dir)
      if (found) return found
    }

    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}
