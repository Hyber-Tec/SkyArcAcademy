/**
 * Sky Arc is one academy. HyberCRM keeps each center's data under `branches/{branchId}`, and its security rules and
 * Cloud Functions are built on that path; Sky Arc keeps the structure with this one fixed ID and shows no branches
 * anywhere (docs/HYBERCRM_REVIEW.md §3).
 */
export const ACADEMY_ID = 'skyarc'

/**
 * The demo academy (docs/DECISIONS.md §22): the sample data (scripts/seed-sample.ts) beside the real academy, for
 * showing the app without the academy's real people. Its members switch to it on the website (the account menu). It
 * uses the same rules and functions, but sends no email and no phone notification.
 */
export const DEMO_ACADEMY_ID = 'demo'

export function isDemoAcademy(academyId: string | null | undefined): boolean {
  return academyId === DEMO_ACADEMY_ID
}
