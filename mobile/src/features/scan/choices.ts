import type { Position, ResultKind } from "@shared/shooting/evaluation";
import type { DateKey } from "@shared/time";
import type { PickedStudent } from "./StudentPicker";

/**
 * What the last card was saved with, for the next one while the app stays open: the same student (their next
 * position's card usually follows), the same position, date, shots per bull and kind (an evaluation day's cards are all
 * evaluations). The review shows each choice before anything is saved.
 */
export const lastChoices: { student: PickedStudent | null; position: Position | null; dateKey: DateKey | null; shotsPerBull: number | null; kind: ResultKind | null } = {
  student: null,
  position: null,
  dateKey: null,
  shotsPerBull: null,
  kind: null,
};
