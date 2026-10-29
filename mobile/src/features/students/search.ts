import type { Student } from "@shared/types";

type Named = Pick<Student, "name" | "nameLower" | "otherNames">;

const ownName = (s: Named, q: string) => (s.nameLower ?? s.name.toLowerCase()).includes(q) || s.name.toLowerCase().includes(q);

/**
 * Whether a search (`q`, trimmed and in lower case) finds a student: by their name or one of the other names they go by
 * (a nickname, another spelling), as the website's searches do. An empty search finds everyone.
 */
export function findsStudent(s: Named, q: string): boolean {
  return !q || ownName(s, q) || (s.otherNames ?? []).some((n) => n.toLowerCase().includes(q));
}

/** "Goes by Jay" when a search found a student by another name, so the person sees why; null otherwise. */
export function goesBy(s: Named, q: string): string | null {
  if (!q || ownName(s, q)) return null;
  const other = (s.otherNames ?? []).find((n) => n.toLowerCase().includes(q));
  return other ? `Goes by ${other}` : null;
}
