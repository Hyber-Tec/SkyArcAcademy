import { collection, getDocs, query, serverTimestamp, where, writeBatch } from "@react-native-firebase/firestore";
import { fitRangesToDay, type DayMark } from "@shared/availability";
import { type DayWrite, type UncoveredClass, availabilityRecord, availabilitySummary, classesLeftUncovered, noCoachWarning, shrinkingDays } from "@shared/availabilityWrites";
import { COL, ROOT, availabilityDocId } from "@shared/paths";
import type { BranchSettings, DayHours } from "@shared/settings/defaults";
import type { DateKey } from "@shared/time";
import type { AcademyClass, Availability, AvailabilityRange, Session } from "@shared/types";
import { confirmAsync } from "@/components/Confirm";
import { branchDoc } from "@/features/data/hooks";
import { errorMessage } from "@/lib/api";
import { addAudit } from "@/lib/audit";
import { db } from "@/lib/firebase";
import { toast } from "@/lib/toast";
import type { Actor } from "@/state/BranchProvider";

export type { DayWrite } from "@shared/availabilityWrites";

/**
 * A coach's availability writes, exactly as the website makes them (web/src/features/availability/api.ts, with the
 * shared `@shared/availabilityWrites`): one record per day (`availability/{staffId}_{dateKey}`) holding times or "not
 * available", removed when the day is cleared, with the coach's name and role so the other coaches see who's in with
 * them; several days in one batch with one audit entry; and a warning first when classes would be left with no coach
 * in. The rules refuse days inside the lock window.
 */

export interface SaveContext {
  branchId: string;
  actor: Actor;
  timezone: string;
  staffId: string;
  staffName: string;
  /** What counts today on a day (its saved times inside its hours; none when marked not available). */
  currentRanges: (dateKey: DateKey) => AvailabilityRange[];
  hoursOf: (dateKey: DateKey) => DayHours;
  today: DateKey;
  nowMin: number;
}

/**
 * Classes still ahead, with students, that a change would leave with no coach in for all or part of them (classes are
 * taught by everyone in, so only when no other coach is): the shared `classesLeftUncovered`, from the classes, their
 * students and everyone's hours on the days that lose time (days that only gain time can't leave anything uncovered).
 */
async function uncoveredBy(ctx: SaveContext, days: DayWrite[]): Promise<UncoveredClass[]> {
  const shrinking = shrinkingDays(days, ctx.currentRanges, ctx.hoursOf);
  const classes: (AcademyClass & { id: string })[] = [];
  const seats: Session[] = [];
  const records: Availability[] = [];
  const col = (name: string) => collection(db, ROOT.branches, ctx.branchId, name);
  for (let i = 0; i < shrinking.length; i += 30) {
    const chunk = shrinking.slice(i, i + 30);
    const [c, s, r] = await Promise.all([
      getDocs(query(col(COL.classes), where("dateKey", "in", chunk))),
      getDocs(query(col(COL.sessions), where("dateKey", "in", chunk))),
      getDocs(query(col(COL.availability), where("dateKey", "in", chunk))),
    ]);
    classes.push(...c.docs.map((d) => ({ ...(d.data() as AcademyClass), id: d.id })));
    seats.push(...s.docs.map((d) => d.data() as Session));
    records.push(...r.docs.map((d) => d.data() as Availability));
  }
  return classesLeftUncovered({ staffId: ctx.staffId, staffRole: "coach", days, classes, seats, records, hoursOf: ctx.hoursOf, today: ctx.today, nowMin: ctx.nowMin });
}

/**
 * Saves days of availability. It asks first when classes would be left with no coach in (they stay on the schedule, as
 * on the website), then returns as soon as the phone has the change: the server confirms it in the background, and a
 * refusal says so in a message (the calendar then shows the day as it was). False when the person backs out.
 */
export async function saveDays(ctx: SaveContext, days: DayWrite[], summary?: string): Promise<boolean> {
  if (days.length === 0) return true;
  const uncovered = await uncoveredBy(ctx, days);
  if (uncovered.length) {
    const warning = noCoachWarning(uncovered, "coach");
    if (!(await confirmAsync({ title: warning.title, message: warning.description, confirmLabel: "Save anyway" }))) return false;
    // The alert's fade finishes first: the phone presents one screen at a time, and a sheet closed while an alert is
    // still leaving stays on screen.
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  for (let i = 0; i < days.length; i += 300) {
    const batch = writeBatch(db);
    for (const d of days.slice(i, i + 300)) {
      const ref = branchDoc(ctx.branchId, COL.availability, availabilityDocId(ctx.staffId, d.dateKey));
      const record = availabilityRecord(ctx.staffId, d, ctx.timezone, "coach", ctx.staffName, "coach");
      if (!record) batch.delete(ref);
      else batch.set(ref, { ...record, updatedAt: serverTimestamp(), updatedBy: ctx.actor.email });
    }
    if (i === 0) {
      const first = days[0];
      addAudit(batch, ctx.branchId, ctx.actor, {
        action: "availability.update",
        category: "availability",
        entityType: "availability",
        entityId: availabilityDocId(ctx.staffId, first.dateKey),
        summary: summary ?? availabilitySummary(ctx.staffName, days),
        coachId: ctx.staffId,
        coachName: ctx.staffName,
        dateKey: first.dateKey,
      });
    }
    batch.commit().catch((e: unknown) => toast.error("Your availability wasn’t saved", { description: availabilityError(e, days.length > 1) }));
  }
  return true;
}

export const SKIP_REASON = { closed: "closed", outside: "outside opening hours", too_many: "too many ranges", locked: "locked" } as const;
export type SkipReason = keyof typeof SKIP_REASON;

/** A day as a plan writes it: its times, or not available (no times and not `unavailable` clears it). */
export type PlannedDay = { date: DateKey; ranges: AvailabilityRange[]; unavailable?: boolean };

/**
 * Turns a plan into writes as the website's bulk tools do: locked days are skipped; "not available" goes on open days
 * only; times are fitted to each day's opening hours (closed days and times outside them are skipped); unchanged days
 * aren't written.
 */
export function planDays(
  plan: PlannedDay[],
  opts: {
    locked: (d: DateKey) => boolean;
    hoursOf: (d: DateKey) => DayHours;
    rangesOf: (d: DateKey) => AvailabilityRange[];
    markOf: (d: DateKey) => DayMark;
    availability: BranchSettings["availability"];
  },
): { writes: DayWrite[]; skipped: Partial<Record<SkipReason, number>> } {
  const writes: DayWrite[] = [];
  const skipped: Partial<Record<SkipReason, number>> = {};
  const skip = (why: SkipReason) => (skipped[why] = (skipped[why] ?? 0) + 1);
  for (const { date, ranges, unavailable } of plan) {
    if (opts.locked(date)) {
      skip("locked");
      continue;
    }
    if (unavailable) {
      if (!opts.hoursOf(date).isOpen) skip("closed");
      else if (opts.markOf(date) !== "unavailable") writes.push({ dateKey: date, ranges: [], unavailable: true });
      continue;
    }
    const fit = fitRangesToDay(ranges, opts.hoursOf(date), opts.availability);
    if (!fit.ok) {
      skip(fit.reason);
      continue;
    }
    if (opts.markOf(date) === "unavailable" || JSON.stringify(opts.rangesOf(date)) !== JSON.stringify(fit.ranges)) writes.push({ dateKey: date, ranges: fit.ranges });
  }
  return { writes, skipped };
}

/** "Skipped: 2 locked, 1 closed." */
export function skippedText(skipped: Partial<Record<SkipReason, number>>): string | null {
  const notes = (Object.entries(skipped) as [SkipReason, number][]).map(([why, n]) => `${n} ${SKIP_REASON[why]}`);
  return notes.length ? `Skipped: ${notes.join(", ")}.` : null;
}

/** A refused or failed save in words (the rules refuse days inside the lock window). */
export function availabilityError(e: unknown, manyDays: boolean): string {
  const code = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
  const message = e instanceof Error ? e.message : "";
  if (/permission-denied/.test(code) || /permission/i.test(message)) return manyDays ? "Some of those days are locked. Please contact an admin." : "This day is locked. Please contact an admin.";
  return errorMessage(e, "Couldn’t save your availability. Try again.");
}
