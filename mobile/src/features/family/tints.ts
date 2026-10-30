import { useCallback } from "react";
import { useIsDark } from "@/theme";
import { useFamily } from "./FamilyProvider";

/**
 * Each child's colour, in the order the children are listed (A to Z), as the website tints them
 * (web/src/features/family/data.ts, KID_TINTS: sky, violet, amber, emerald, rose), so a parent tells their classes
 * apart at a glance on the month. Brighter in dark mode, to stand out on the dark page.
 */
const LIGHT = ["#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#f43f5e"];
const DARK = ["#38bdf8", "#a78bfa", "#fbbf24", "#34d399", "#fb7185"];

/** A child's colour for a parent with several children (the same when one is chosen); null for one child or a student. */
export function useChildColor(): (studentId: string) => string | null {
  const { several, ids } = useFamily();
  const dark = useIsDark();
  return useCallback(
    (studentId: string) => {
      if (!several) return null;
      const palette = dark ? DARK : LIGHT;
      return palette[Math.max(0, ids.indexOf(studentId)) % palette.length];
    },
    [several, ids, dark],
  );
}

/** A class's mark on the months: its child's colour when a parent has several children, else the first colour (sky). */
export function useMarkColor(): (studentId: string) => string {
  const colorOf = useChildColor();
  const dark = useIsDark();
  return useCallback((studentId: string) => colorOf(studentId) ?? (dark ? DARK : LIGHT)[0], [colorOf, dark]);
}
