import { formatUsd } from './cost'

/**
 * The guards in front of every AI request (Cloud Functions check them before calling a provider): the month's
 * spending limit, over everyone, and each person's requests in the last hour. Their messages never name a provider:
 * academy admins read them.
 */

export const HOUR_MS = 3_600_000

/** Why a new request can't go out this month, or null when it can. */
export function monthlyLimitMessage(spentUsd: number, limitUsd: number | null): string | null {
  if (limitUsd === null || spentUsd < limitUsd) return null
  return `AI has reached this month’s spending limit (${formatUsd(limitUsd)}). It starts again next month, or a super admin can raise the limit.`
}

/**
 * A person's requests in the last hour (`times`, in ms) against the hourly limit: whether one more may go, the times
 * to keep (the last hour's, with this one when it goes), and when the oldest leaves the hour.
 */
export function hourlyCheck(times: readonly number[], now: number, limit: number): { ok: boolean; keep: number[]; message: string | null } {
  const recent = times.filter((t) => typeof t === 'number' && t > now - HOUR_MS && t <= now).sort((a, b) => a - b)
  if (recent.length < limit) return { ok: true, keep: [...recent, now], message: null }
  const minutes = Math.max(1, Math.ceil((recent[0] + HOUR_MS - now) / 60_000))
  return { ok: false, keep: recent, message: `You’ve asked AI ${limit} times in the last hour, the most allowed. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` }
}
