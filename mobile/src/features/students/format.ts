import { gradeLabel } from "@shared/people";
import type { StudentDoc } from "@/features/data/hooks";

/** What a student's row says under the name: grade ("Grade 10", "Adult"), level and program, as known. */
export function studentLine(s: Pick<StudentDoc, "grade" | "level" | "program">): string {
  return [s.grade ? gradeLabel(s.grade) : null, s.level, s.program].filter(Boolean).join(" · ");
}
