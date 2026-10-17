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
