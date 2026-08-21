/**
 * How much of the subscription is used - the numbers `/usage` shows in Claude Code.
 * They describe the account, not any one session, so they are the same whichever tab
 * you are looking at.
 */
export type PlanUsage = {
  /** Percent of the five-hour window used, and when it resets. */
  windowPercent: number | null
  windowResetsAt: string | null
  /** The same for the seven-day limit. */
  weekPercent: number | null
  weekResetsAt: string | null
}

type Bucket = { utilization?: unknown; resets_at?: unknown }

function percentOf(bucket: Bucket | undefined): number | null {
  const value = bucket?.utilization
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function resetOf(bucket: Bucket | undefined): string | null {
  const value = bucket?.resets_at
  return typeof value === 'string' && value !== '' ? value : null
}

/** Reads the answer without trusting its shape; anything unexpected becomes null. */
export function parsePlanUsage(body: unknown): PlanUsage | null {
  if (!body || typeof body !== 'object') return null
  const record = body as { five_hour?: Bucket; seven_day?: Bucket }

  const usage: PlanUsage = {
    windowPercent: percentOf(record.five_hour),
    windowResetsAt: resetOf(record.five_hour),
    weekPercent: percentOf(record.seven_day),
    weekResetsAt: resetOf(record.seven_day)
  }
  // An answer with no number in it says nothing worth showing.
  return usage.windowPercent === null && usage.weekPercent === null ? null : usage
}

/** How long until a window resets, said the way a person would: "2 h 14 min". */
export function timeUntil(iso: string | null, now: number): string | null {
  if (!iso) return null
  const at = Date.parse(iso)
  if (Number.isNaN(at) || at <= now) return null

  const minutes = Math.round((at - now) / 60000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return hours >= 24 ? `${Math.floor(hours / 24)} d ${hours % 24} h` : `${hours} h ${minutes % 60} min`
}

/** Their own thresholds: below three quarters it is just a number. */
export function limitLevel(percent: number | null): 'quiet' | 'warn' | 'critical' {
  if (percent === null) return 'quiet'
  if (percent >= 90) return 'critical'
  return percent >= 75 ? 'warn' : 'quiet'
}
