/**
 * The App Store's review account once the academy's real data is in production (Goo's call, 2026-10-26): the office
 * login of scripts/review-logins.ts, kept with its email and password, as an admin of its own (no staff record). Its
 * member record is marked by `createdBy`, so the sample data's removal and the academy import leave it alone.
 */
export const REVIEW_ADMIN_AUTHOR = 'review-logins'

export function isReviewAdmin(member: Record<string, unknown>): boolean {
  return member.createdBy === REVIEW_ADMIN_AUTHOR && member.role === 'admin' && !member.staffId
}
