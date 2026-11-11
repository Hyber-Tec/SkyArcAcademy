import { searchFindsStudent } from "@shared/names";
import type { Student } from "@shared/types";

type Named = Pick<Student, "name" | "otherNames"> & Partial<Pick<Student, "lastName" | "nameLower">>;

/**
 * Whether a search (`q`, trimmed and in lower case) finds a student: by their name or one of the other names they go by
 * (a nickname, another spelling, a given name with their family name: `searchFindsStudent`), as the website's searches
 * do. An empty search finds everyone.
 */
export function findsStudent(s: Named, q: string): boolean {
  return searchFindsStudent(s, q).found;
}

/** "Goes by Jay" when a search found a student by another name, so the person sees why; null otherwise. */
export function goesBy(s: Named, q: string): string | null {
  const { also } = searchFindsStudent(s, q);
  return also ? `Goes by ${also}` : null;
}
