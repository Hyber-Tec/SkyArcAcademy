import { type FamilyCancel, cancelRuleText } from "@shared/schedule/requests";
import type { BranchSettings } from "@shared/settings/defaults";

/**
 * The family's rules in their language (docs/DECISIONS.md §36): shared/src/schedule/requests.ts says them in English
 * for the website, the server and the office; a parent reading Korean gets the same in Korean.
 */

/** "Classes can be canceled up to 24 hours before they start." */
export function cancelRuleWords(settings: Pick<BranchSettings, "schedule">): string {
  return cancelRuleText(settings);
}

/** Why a family can't cancel a class, in their language. */
export function cancelCheckWords(check: FamilyCancel): string {
  if (check.ok) return "";
  return check.message;
}
