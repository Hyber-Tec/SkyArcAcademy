import { type Evaluation, POSITION_LABELS, SOURCE_LABELS, per10 } from "@shared/shooting/evaluation";
import { formatDateKey } from "@shared/time";

/** How a score reads in the app, the same on the student's page and the score's own screen. */

/** "Standing · Paper". */
export const scoreTitle = (e: Pick<Evaluation, "position" | "source">) => `${POSITION_LABELS[e.position]} · ${SOURCE_LABELS[e.source]}`;

/** The total as the source gives it: SIUS with its decimal, a paper card whole. */
export const scoreTotal = (e: Pick<Evaluation, "source" | "total">) => (e.source === "sius" ? e.total.toFixed(1) : String(e.total));

/** The average of every 10 shots, so results of different lengths compare. */
export const scorePer10 = (e: Pick<Evaluation, "source" | "total" | "wholeTotal" | "shots">) => per10(e.source === "sius" ? e.total : e.wholeTotal, e.shots);

/** What deleting a score does, for the question before it. */
export function deleteScoreMessage(e: Pick<Evaluation, "studentName" | "position" | "source" | "dateKey" | "total" | "fileId">): string {
  const what = `${e.studentName}’s ${POSITION_LABELS[e.position].toLowerCase()} ${e.source === "sius" ? "SIUS" : "paper"} score of ${formatDateKey(e.dateKey, "medium")} (${scoreTotal(e)})`;
  return `${what} leaves their scores and reports.${e.fileId ? ` Its ${e.source === "sius" ? "PDF" : "photo"} stays in their Drive.` : ""}`;
}

/** How far from a student's usual a result is (per 10 shots) before its number shows green or amber. */
const TONE_STEP = 0.5;

/**
 * Each result against its student's own average in its position (the owner, 2026-10-29: "show the score in a colour, so
 * we can see which is the best and which isn't good"): `high` half a point or more per 10 shots over it, `low` as much
 * under; none when the position has fewer than three results to compare.
 */
export function scoreTones<E extends Pick<Evaluation, "studentId" | "position" | "source" | "total" | "wholeTotal" | "shots"> & { id: string }>(list: E[]): Map<string, "high" | "low"> {
  const key = (e: E) => `${e.studentId}/${e.position}`;
  const byPosition = new Map<string, number[]>();
  for (const e of list) {
    const v = scorePer10(e);
    if (v !== null) byPosition.set(key(e), [...(byPosition.get(key(e)) ?? []), v]);
  }
  const tones = new Map<string, "high" | "low">();
  for (const e of list) {
    const all = byPosition.get(key(e)) ?? [];
    const v = scorePer10(e);
    if (v === null || all.length < 3) continue;
    const average = all.reduce((n, x) => n + x, 0) / all.length;
    if (v >= average + TONE_STEP) tones.set(e.id, "high");
    else if (v <= average - TONE_STEP) tones.set(e.id, "low");
  }
  return tones;
}
