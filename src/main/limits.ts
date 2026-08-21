import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parsePlanUsage, type PlanUsage } from '../shared/limits'

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

/** Percentages do not move by the second, and this is a network call. */
const CACHE_MS = 60_000

let cached: { at: number; usage: PlanUsage | null } | null = null

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

export async function readPlanUsage(): Promise<PlanUsage | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.usage

  const token = accessToken()
  if (!token) {
    cached = { at: Date.now(), usage: null }
    return null
  }

  let usage: PlanUsage | null = null
  try {
    const response = await fetch(ENDPOINT, {
      headers: {
        authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20'
      },
      signal: AbortSignal.timeout(15_000)
    })
    if (response.ok) usage = parsePlanUsage(await response.json())
  } catch {
    // Offline, blocked, or the endpoint moved. Nothing to report is a fine answer.
  }

  cached = { at: Date.now(), usage }
  return usage
}
