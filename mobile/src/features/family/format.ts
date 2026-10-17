import { type DateKey, addDays } from "@shared/time";
import type { SessionDoc } from "@/features/data/hooks";
import { shortDay } from "@/features/schedule/format";

/** How the family's screens word days and classes, in the academy's time zone (dates are its wall-clock `dateKey`s). */

/** The class is over (its end has passed in the academy's zone). */
export const hasEnded = (s: Pick<SessionDoc, "dateKey" | "endMin">, today: DateKey, nowMin: number) => s.dateKey < today || (s.dateKey === today && s.endMin <= nowMin);

/** The class is on now. */
export const isOnNow = (s: Pick<SessionDoc, "dateKey" | "startMin" | "endMin">, today: DateKey, nowMin: number) => s.dateKey === today && s.startMin <= nowMin && nowMin < s.endMin;

/** "Today", "Tomorrow", "Yesterday", or null for other days. */
export function relativeDay(key: DateKey, today: DateKey): string | null {
  if (key === today) return "Today";
  if (key === addDays(today, 1)) return "Tomorrow";
  if (key === addDays(today, -1)) return "Yesterday";
  return null;
}

/** "Today · Sat, Oct 17", "Tomorrow · Sun, Oct 18", or "Tue, Oct 20". */
export function dayHeading(key: DateKey, today: DateKey): string {
  const near = relativeDay(key, today);
  return near ? `${near} · ${shortDay(key)}` : shortDay(key);
}

/** "Jiwoo", "Jiwoo and Minjun", "Jiwoo, Minjun and Seoyeon". */
export function namesList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
