import { type Lang, dateText, durationText, timeRangeText, timeText } from "@shared/i18n";
import { type DateKey, formatMinutes, parseDateKey, weekdayIndex } from "@shared/time";

/**
 * How the app writes dates and times. Dates are the academy's wall-clock `dateKey`s, formatted as calendar dates (never
 * through the phone's zone); times are minutes after the academy's midnight. Each takes the screen's language: a parent
 * reading Korean gets them the way Korean apps write them (shared/src/i18n.ts); the staff's screens stay English.
 */

const KO_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

const formatters = new Map<string, Intl.DateTimeFormat>();

function format(key: DateKey, options: Intl.DateTimeFormatOptions): string {
  const id = JSON.stringify(options);
  let f = formatters.get(id);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" });
    formatters.set(id, f);
  }
  const { year, month, day } = parseDateKey(key);
  return f.format(new Date(Date.UTC(year, month - 1, day)));
}

/** "Sunday, October 4" (10월 4일 일요일). */
export const longDay = (key: DateKey, lang: Lang = "en") => {
  if (lang === "en") return format(key, { weekday: "long", month: "long", day: "numeric" });
  const { month, day } = parseDateKey(key);
  return `${month}월 ${day}일 ${KO_WEEKDAYS[weekdayIndex(key)]}요일`;
};
/** "Mon, Oct 5" (10월 5일 (월)). */
export const shortDay = (key: DateKey, lang: Lang = "en") => (lang === "en" ? format(key, { weekday: "short", month: "short", day: "numeric" }) : dateText(key, "weekdayMedium", "ko"));
/** "Oct 5" (10월 5일). */
export const monthDay = (key: DateKey, lang: Lang = "en") => (lang === "en" ? format(key, { month: "short", day: "numeric" }) : dateText(key, "monthDay", "ko"));
/** "October 2026" (the month a date is in; 2026년 10월). */
export const monthYear = (key: DateKey, lang: Lang = "en") => (lang === "en" ? format(key, { month: "long", year: "numeric" }) : dateText(key, "monthYear", "ko"));
/** "Monday" (월요일). */
export const weekdayName = (key: DateKey, lang: Lang = "en") => (lang === "en" ? format(key, { weekday: "long" }) : dateText(key, "weekday", "ko"));
/** "M" (월). */
export const weekdayInitial = (key: DateKey, lang: Lang = "en") => (lang === "en" ? format(key, { weekday: "narrow" }) : KO_WEEKDAYS[weekdayIndex(key)]);

/** "Oct 4 – 10, 2026", "Sep 27 – Oct 3, 2026", "Dec 28, 2025 – Jan 3, 2026". */
export function weekRange(first: DateKey, last: DateKey): string {
  const a = parseDateKey(first);
  const b = parseDateKey(last);
  if (a.year !== b.year) return `${format(first, { month: "short", day: "numeric", year: "numeric" })} – ${format(last, { month: "short", day: "numeric", year: "numeric" })}`;
  if (a.month !== b.month) return `${monthDay(first)} – ${monthDay(last)}, ${b.year}`;
  return `${monthDay(first)} – ${b.day}, ${b.year}`;
}

/** A time of day in the academy's format: "4:00 PM" or "16:00" (오후 4:00). */
export function clock(minutes: number, hour12 = true, lang: Lang = "en"): string {
  if (lang === "ko" && hour12) return timeText(minutes, "ko");
  return formatMinutes(minutes, hour12);
}

/** "4:00 – 5:50 PM" (one AM/PM when both share it), "11:30 AM – 1:20 PM", or "16:00 – 17:50" (오후 4:00~5:50). */
export function timeRange(startMin: number, endMin: number, hour12 = true, lang: Lang = "en"): string {
  if (lang === "ko" && hour12) return timeRangeText(startMin, endMin, "ko");
  if (!hour12) return `${formatMinutes(startMin, false)} – ${formatMinutes(endMin, false)}`;
  const a = formatMinutes(startMin);
  const b = formatMinutes(endMin);
  const samePeriod = a.slice(-2) === b.slice(-2) && endMin < 1440;
  return samePeriod ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`;
}

/** "4:30–6 PM", "11:30 AM–1 PM" or "16:30–18:00": a class's time as the sheets write it, where room is short. */
export function shortRange(startMin: number, endMin: number, hour12 = true, lang: Lang = "en"): string {
  if (lang === "ko" && hour12) return timeRangeText(startMin, endMin, "ko");
  if (!hour12) return `${formatMinutes(startMin, false)}–${formatMinutes(endMin, false)}`;
  const part = (m: number) => {
    const h = Math.floor(m / 60) % 24;
    return `${((h + 11) % 12) + 1}${m % 60 ? `:${String(m % 60).padStart(2, "0")}` : ""}`;
  };
  const pa = Math.floor(startMin / 60) % 24 >= 12 ? "PM" : "AM";
  const pb = Math.floor(endMin / 60) % 24 >= 12 ? "PM" : "AM";
  return pa === pb ? `${part(startMin)}–${part(endMin)} ${pb}` : `${part(startMin)} ${pa}–${part(endMin)} ${pb}`;
}

/** 110 → "1h 50m", 45 → "45 min", 120 → "2h" (1시간 50분, 45분, 2시간). */
export function duration(minutes: number, lang: Lang = "en"): string {
  if (lang === "ko") return durationText(minutes, "ko");
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

/** Hours with at most one decimal: 110 min → "1.8 h", 120 → "2 h". */
export function hours(minutes: number): string {
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

/** Time until something starts: "in 25 min", "in 1 h 5 min", "in 3 h", "now" (25분 후, 1시간 5분 후, 지금). */
export function startsIn(minutes: number, lang: Lang = "en"): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 1) return lang === "ko" ? "지금" : "now";
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (lang === "ko") return `${durationText(m, "ko")} 후`;
  if (h === 0) return `in ${r} min`;
  return r === 0 ? `in ${h} h` : `in ${h} h ${r} min`;
}

/** Time left: "40 min left", "1 h 5 min left", "less than a minute left" (40분 남음, 1분도 안 남음). */
export function timeLeft(minutes: number, lang: Lang = "en"): string {
  const m = Math.round(minutes);
  if (m < 1) return lang === "ko" ? "1분도 안 남음" : "less than a minute left";
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (lang === "ko") return `${durationText(m, "ko")} 남음`;
  if (h === 0) return `${r} min left`;
  return r === 0 ? `${h} h left` : `${h} h ${r} min left`;
}

/** "3 classes", "1 class" (with `many` for words that don't just take an "s"). */
export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}

/** "Jiwoo, Minjun and Seoyeon"; "Jiwoo and Minjun" (Jiwoo, Minjun). */
export function listWords(words: readonly string[], lang: Lang = "en"): string {
  if (words.length <= 1) return words[0] ?? "";
  if (lang === "ko") return words.join(", ");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** "A", "A and B", "A, B and C", "A, B, C and 3 more": at most `max` names (A, B, C 외 3명). */
export function nameList(names: readonly string[], max = 3, lang: Lang = "en"): string {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  if (lang === "ko") return rest > 0 ? `${shown.join(", ")} 외 ${rest}명` : shown.join(", ");
  return rest > 0 ? `${shown.join(", ")} and ${rest} more` : listWords(shown);
}

/** "Mia C.": a first name and the last initial, where room is short. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : name;
}
