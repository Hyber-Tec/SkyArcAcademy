/**
 * Sky Arc is one academy. HyberCRM keeps each center's data under `branches/{branchId}`, and its security rules and
 * Cloud Functions are built on that path; Sky Arc keeps the structure with this one fixed ID and shows no branches
 * anywhere (docs/HYBERCRM_REVIEW.md §3).
 */
export const ACADEMY_ID = 'skyarc'
