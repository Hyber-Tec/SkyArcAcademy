import { type Lang, josa, pick } from "@shared/i18n";
import { type EvaluationSource, POSITION_LABELS, POSITION_LABELS_KO, type Position, RESULT_KIND_LABELS, type ResultKind, SOURCE_LABELS } from "@shared/shooting/evaluation";
import { type ShotPoint, offsetWords } from "@shared/shooting/target";

/**
 * A score's words in the reader's language (docs/DECISIONS.md §36): the positions as Korean shooting says them
 * (입사 / 슬사 / 복사), where a result came from, what kind it was, and where shots sit off the centre.
 */

export const positionLabel = (p: Position, lang: Lang) => pick(lang, POSITION_LABELS[p], POSITION_LABELS_KO[p]);

const SOURCE_KO: Record<EvaluationSource, string> = { sius: "SIUS", paper: "종이 표적지", sheet: "결과지" };

/** "SIUS", "Paper", "Results sheet"; "SIUS", "종이 표적지", "결과지". */
export const sourceLabel = (s: EvaluationSource, lang: Lang) => pick(lang, SOURCE_LABELS[s], SOURCE_KO[s]);

const KIND_KO: Record<ResultKind, string> = { practice: "연습", competition: "대회", evaluation: "평가" };

/** "Practice", "Competition", "Evaluation"; "연습", "대회", "평가". */
export const kindLabel = (k: ResultKind, lang: Lang) => pick(lang, RESULT_KIND_LABELS[k], KIND_KO[k]);

/** Where a group or a shot sits when it's clearly off the centre: "low left", "왼쪽 아래"; null near it. */
export function offsetText(p: ShotPoint | null, lang: Lang, withinMm?: number): string | null {
  const en = offsetWords(p, withinMm);
  if (lang === "en" || !en) return en;
  const v = /high/.test(en) ? "위" : /low/.test(en) ? "아래" : "";
  const h = /right/.test(en) ? "오른쪽" : /left/.test(en) ? "왼쪽" : "";
  return h && v ? `${h} ${v}` : h || `${v}쪽`;
}

/** "오른쪽 아래로 치우침": where a result's group sits, as one of its facts. */
export const leaningKo = (where: string) => `${josa(where, "으로/로")} 치우침`;
