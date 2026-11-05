import type { Lang } from "@shared/i18n";
import { type FamilyCancel, cancelHours, cancelRuleText } from "@shared/schedule/requests";
import type { BranchSettings } from "@shared/settings/defaults";

/**
 * The family's rules in their language (docs/DECISIONS.md §36): shared/src/schedule/requests.ts says them in English
 * for the website, the server and the office; a parent reading Korean gets the same in Korean.
 */

/** "Classes can be canceled up to 24 hours before they start." (수업 시작 24시간 전까지 취소할 수 있어요.) */
export function cancelRuleWords(settings: Pick<BranchSettings, "schedule">, lang: Lang): string {
  if (lang === "en") return cancelRuleText(settings);
  const h = cancelHours(settings);
  const span = h % 24 === 0 && h >= 48 ? `${h / 24}일` : `${h}시간`;
  return `수업 시작 ${span} 전까지 취소할 수 있어요.`;
}

/** Why a family can't cancel a class, in their language. */
export function cancelCheckWords(check: FamilyCancel, settings: Pick<BranchSettings, "schedule">, lang: Lang): string {
  if (check.ok) return "";
  if (lang === "en") return check.message;
  if (check.reason === "gone") return "더 이상 일정에 없는 수업이에요.";
  if (check.reason === "not_upcoming") return "앞으로 있을 수업만 취소할 수 있어요.";
  return cancelRuleWords(settings, lang);
}
