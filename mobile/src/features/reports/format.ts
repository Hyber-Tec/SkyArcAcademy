import type { ProgressReportDoc } from "@shared/reports/types";
import { formatInstant } from "@shared/time";

/** How a progress report's figures read in the app, as on the website (web/src/features/reports/model.ts). */

/** 91 → "91", 91.43 → "91.4". */
export const one = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** "+2.5", "−1" (a real minus sign), "0". */
export function signed(n: number): string {
  if (n === 0) return "0";
  return `${n > 0 ? "+" : "−"}${one(Math.abs(n))}`;
}

const millis = (t: unknown) => (t as { toMillis?: () => number } | null)?.toMillis?.() ?? null;

/** When the academy shared it ("Oct 17"), or null. */
export function sharedOn(r: Pick<ProgressReportDoc, "sharedAt">, timezone: string, style: "short" | "long" = "short"): string | null {
  const ms = millis(r.sharedAt);
  if (ms === null) return null;
  return formatInstant(ms, timezone, style === "long" ? { month: "long", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" });
}

/** When it was prepared, for the report's footer: shared, or else made ("October 17, 2026"). */
export function preparedOn(r: Pick<ProgressReportDoc, "sharedAt" | "generatedAt">, timezone: string): string | null {
  const ms = millis(r.sharedAt) ?? millis(r.generatedAt);
  return ms === null ? null : formatInstant(ms, timezone, { month: "long", day: "numeric", year: "numeric" });
}

/** "6 scored evaluations". */
export const evaluationsText = (n: number) => `${n} scored ${n === 1 ? "evaluation" : "evaluations"}`;
