import type { Lang } from "@shared/i18n";
import { gradeLabel } from "@shared/people";
import type { StudentDoc } from "@/features/data/hooks";

/** A grade in Korean (docs/DECISIONS.md §36): "8학년"; "Adult" and "College" in words; anything else as typed. */
function gradeLabelKo(grade: string): string {
  const g = grade.trim();
  if (/^\d+$/.test(g)) return `${g}학년`;
  return ({ adult: "성인", college: "대학생", k: "유치원" } as Record<string, string>)[g.toLowerCase()] ?? g;
}

/** What a student's row says under the name: grade ("Grade 10", "Adult"), level and program, as known. */
export function studentLine(s: Pick<StudentDoc, "grade" | "level" | "program">, lang: Lang = "en"): string {
  return [s.grade ? (lang === "ko" ? gradeLabelKo(s.grade) : gradeLabel(s.grade)) : null, s.level, s.program].filter(Boolean).join(" · ");
}
