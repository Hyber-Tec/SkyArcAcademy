import { type EvaluationSource, POSITION_LABELS, type Position, RESULT_KIND_LABELS, type ResultKind, SOURCE_LABELS } from "@shared/shooting/evaluation";
import { type ShotPoint, offsetWords } from "@shared/shooting/target";

/** A score's words: the positions, where a result came from, what kind it was, and where shots sit off the centre. */

export const positionLabel = (p: Position) => POSITION_LABELS[p];

/** "SIUS", "Paper", "Results sheet". */
export const sourceLabel = (s: EvaluationSource) => SOURCE_LABELS[s];
/** "Practice", "Competition", "Evaluation". */
export const kindLabel = (k: ResultKind) => RESULT_KIND_LABELS[k];

/** Where a group or a shot sits when it's clearly off the centre: "low left"; null near it. */
export const offsetText = (p: ShotPoint | null, withinMm?: number): string | null => offsetWords(p, withinMm);
