/**
 * What is worth offering when you go looking for a file in a project, and what is
 * noise. Kept apart from the walking itself so the judgement can be tested without a
 * filesystem.
 */

/**
 * Directories nobody opens a file from. Mostly what a build or a package manager put
 * there, and dot-directories in general - a project with ten thousand files has nine
 * thousand of them in here, and walking them is the difference between instant and not.
 */
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'out',
  'release',
  'build',
  'bin',
  'obj',
  'packages',
  'coverage',
  'target',
  'vendor',
  '__pycache__'
])

export function skipDirectory(name: string): boolean {
  return name.startsWith('.') || SKIP_DIRS.has(name.toLowerCase())
}

/**
 * Excluded by extension rather than allowed by one, on purpose: an allow-list would
 * hide `Dockerfile`, `Makefile` and `.env.local`, which are exactly the files without a
 * useful extension that you go looking for. These are the ones the pane would refuse to
 * show anyway, so offering them would only waste a row.
 */
const BINARY = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'ico',
  'icns',
  'svgz',
  'pdf',
  'zip',
  'gz',
  'tar',
  '7z',
  'rar',
  'exe',
  'dll',
  'node',
  'pdb',
  'lib',
  'so',
  'dylib',
  'ttf',
  'otf',
  'woff',
  'woff2',
  'eot',
  'mp3',
  'mp4',
  'wav',
  'avi',
  'mov',
  'class',
  'jar',
  'pyc',
  'wasm'
])

export function skipFile(name: string): boolean {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return false
  return BINARY.has(name.slice(dot + 1).toLowerCase())
}

/**
 * Past this the list stops being a list. Reaching it is reported rather than silently
 * cutting the answer short, because a file missing from the palette would otherwise
 * look like a file missing from the project.
 */
export const MAX_LISTED_FILES = 2000
