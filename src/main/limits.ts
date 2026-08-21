import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import { asPlanUsage, parsePlanUsage, type PlanUsage } from '../shared/limits'

/**
 * Subscription usage, from the endpoint Claude Code itself calls for `/usage`.
 *
 * The endpoint is undocumented. It is not in anything Claude Code writes to disk -
 * transcripts carry per-session tokens and nothing about the plan - so this is the
 * only way to answer "how much have I got left" without typing into the session and
 * scraping what comes back, which would put a command in the user's conversation.
 *
 * Everything is fail-soft: no token, no network, a changed shape, an expired login -
 * all of it ends as null and the status bar simply shows nothing.
 *
 * The token is the user's own, read from the file the CLI logged in with. It is used
 * for this one request, stays in this process, and is never logged or handed to the
 * renderer - the renderer only ever sees two percentages.
 */
const ENDPOINT = 'https://api.anthropic.com/api/oauth/usage'

/**
 * Percentages do not move by the second, and the endpoint says so itself: asked once
 * a minute it starts answering 429. Five minutes is still current enough to steer by.
 */
const FRESH_MS = 10 * 60_000

/** After a plain failure - offline, a hiccup - it is worth another try soon. */
const RETRY_MS = 60_000

/** After being told to slow down, waiting a minute is what caused it. */
const COOLDOWN_MS = 15 * 60_000

/**
 * How long a reading is still worth showing after it stopped being current. The
 * numbers drift slowly and the reset times inside them stay right, so a stale gauge
 * is far better than a gauge that vanishes - which is what a rate limit used to do.
 */
const KEEP_MS = 60 * 60_000

type Reading = { at: number; usage: PlanUsage }

let lastGood: Reading | null = null
let nextTry = 0

/**
 * The last reading also lives on disk, because otherwise a restart begins blind - and
 * a restart while the endpoint is refusing means an empty status bar until it relents.
 * It is a cache and nothing else: unreadable, unparsable or ancient all mean the same
 * as absent.
 */
function cacheFile(): string {
  return join(app.getPath('userData'), 'limits.json')
}

function loadCache(): void {
  if (lastGood) return
  try {
    const parsed = JSON.parse(readFileSync(cacheFile(), 'utf8')) as Partial<Reading>
    const usage = asPlanUsage((parsed as { usage?: unknown }).usage)
    if (usage && typeof parsed.at === 'number') lastGood = { at: parsed.at, usage }
  } catch {
    // No cache yet, or one written by a version that shaped it differently.
  }
}

function saveCache(reading: Reading): void {
  try {
    writeFileSync(cacheFile(), JSON.stringify(reading))
  } catch {
    // A cache that cannot be written is not worth a word to anyone.
  }
}

function accessToken(): string | null {
  try {
    const path = join(homedir(), '.claude', '.credentials.json')
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      claudeAiOauth?: { accessToken?: unknown }
    }
    const token = parsed.claudeAiOauth?.accessToken
    return typeof token === 'string' && token !== '' ? token : null
  } catch {
    return null // not logged in this way, or the file is not ours to read
  }
}

/** The last reading, while it is recent enough to be worth anything. */
function lastKnown(now: number): PlanUsage | null {
  if (!lastGood || now - lastGood.at > KEEP_MS) return null
  return { ...lastGood.usage, readAt: lastGood.at }
}

export async function readPlanUsage(): Promise<PlanUsage | null> {
  const now = Date.now()
  loadCache()
  if (lastGood && now - lastGood.at < FRESH_MS) return { ...lastGood.usage, readAt: lastGood.at }
  if (now < nextTry) return lastKnown(now)

  const token = accessToken()
  if (!token) {
    nextTry = now + COOLDOWN_MS // not logged in this way; asking again soon is pointless
    return lastKnown(now)
  }

  try {
    const response = await fetch(ENDPOINT, {
      headers: {
        authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20'
      },
      signal: AbortSignal.timeout(15_000)
    })
    if (response.ok) {
      const usage = parsePlanUsage(await response.json())
      if (usage) {
        lastGood = { at: now, usage }
        saveCache(lastGood)
        nextTry = now + FRESH_MS
        return { ...usage, readAt: now }
      }
    }
    // 429 is the endpoint asking to be left alone, and it means it.
    nextTry = now + (response.status === 429 ? COOLDOWN_MS : RETRY_MS)
  } catch {
    // Offline, blocked, or the endpoint moved.
    nextTry = now + RETRY_MS
  }

  return lastKnown(now)
}
