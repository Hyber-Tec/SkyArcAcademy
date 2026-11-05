import type { Lang } from "@shared/i18n";
import { type DateKey, addDays } from "@shared/time";
import type { SessionDoc } from "@/features/data/hooks";
import { shortDay } from "@/features/schedule/format";

/** How the family's screens word days and classes, in the academy's time zone (dates are its wall-clock `dateKey`s). */

/** The class is over (its end has passed in the academy's zone). */
export const hasEnded = (s: Pick<SessionDoc, "dateKey" | "endMin">, today: DateKey, nowMin: number) => s.dateKey < today || (s.dateKey === today && s.endMin <= nowMin);

/** The class is on now. */
export const isOnNow = (s: Pick<SessionDoc, "dateKey" | "startMin" | "endMin">, today: DateKey, nowMin: number) => s.dateKey === today && s.startMin <= nowMin && nowMin < s.endMin;

/** "Today", "Tomorrow", "Yesterday" (오늘, 내일, 어제), or null for other days. */
export function relativeDay(key: DateKey, today: DateKey, lang: Lang = "en"): string | null {
  if (key === today) return lang === "ko" ? "오늘" : "Today";
  if (key === addDays(today, 1)) return lang === "ko" ? "내일" : "Tomorrow";
  if (key === addDays(today, -1)) return lang === "ko" ? "어제" : "Yesterday";
  return null;
}

/** "Today · Sat, Oct 17", "Tomorrow · Sun, Oct 18", or "Tue, Oct 20" (오늘 · 10월 17일 (토)). */
export function dayHeading(key: DateKey, today: DateKey, lang: Lang = "en"): string {
  const near = relativeDay(key, today, lang);
  return near ? `${near} · ${shortDay(key, lang)}` : shortDay(key, lang);
}

/** "Jiwoo", "Jiwoo and Minjun", "Jiwoo, Minjun and Seoyeon" (Jiwoo, Minjun). */
export function namesList(names: readonly string[], lang: Lang = "en"): string {
  if (names.length <= 1) return names[0] ?? "";
  if (lang === "ko") return names.join(", ");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
