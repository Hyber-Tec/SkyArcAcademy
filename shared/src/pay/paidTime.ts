import { type DayRecord, coachesIn } from '../schedule/classes'
import type { BranchSettings, DayHours } from '../settings/defaults'
import { type DateKey, addDays, parseHHMM, toInstant } from '../time'
import type { AcademyClass, StaffRole } from '../types'

/**
 * When a coach is paid (docs/DECISIONS.md §23, the manager's K2 to K5): only for time the kiosk records (no clock-in, no
 * pay), from `timeClock.arrivalMinutes` before their first class of the day (an earlier clock-in doesn't count; a later
 * one counts from the clock-in), until the end of their last class at the latest (`timeClock.payEndsAtLastClass`): a
 * later clock-out is kept as clocked, and doesn't count. The automatic clock-out (the scheduled function) closes a shift
 * someone forgot, at the set time (or at the end of their last class, if the academy turns that on). Owners and admins,
 * and days without classes, are paid from clock-in to clock-out.
 */

/** A class as the pay reads it: its day, its time (for who's in) and its instants. */
export type PayClass = Pick<AcademyClass, 'dateKey' | 'startMin' | 'endMin' | 'startAt' | 'endAt' | 'isDeleted'>

/** The pay rule's settings (Settings → Payroll & time clock). */
export interface PayRule {
  /** Minutes before the first class that are paid. */
  arrivalMinutes: number
  /** Pay ends at the end of the last class, whenever they clock out. */
  endsAtLastClass: boolean
}

export function payRule(settings: Pick<BranchSettings, 'timeClock'>): PayRule {
  const t = settings.timeClock
  const arrival = Number(t.arrivalMinutes)
  return {
    arrivalMinutes: Number.isFinite(arrival) ? Math.max(0, arrival) : 0,
    endsAtLastClass: t.payEndsAtLastClass !== false,
  }
}

/** How everyone is paid, in plain words, as the academy has it set (Settings → Academy rules, Payroll). */
export function describePay(settings: Pick<BranchSettings, 'timeClock'>): string {
  const rule = payRule(settings)
  const start = rule.arrivalMinutes > 0 ? `${rule.arrivalMinutes} minutes before their first class of the day` : 'at their first class of the day'
  const end = rule.endsAtLastClass ? 'ends at the end of their last class, even if they clock out later' : 'ends when they clock out'
  return `Everyone is paid their hourly rate for the time they’re clocked in at the kiosk: no clock-in, no pay. A coach’s paid time starts ${start} (an earlier clock-in doesn’t count) and ${end}. Extra time an admin adds to a time entry is paid at the same rate.`
}

/** Who's in for pay: someone whose hours that day overlap a class's time (classes sit inside opening hours). */
const WHOLE_DAY: DayHours = { isOpen: true, openMin: 0, closeMin: 24 * 60 }

/** The classes that bound someone's paid time on a day. */
export interface DayBounds {
  /**
   * When their first class starts: the earliest one they're in for, else the first not over yet at their clock-in (the
   * class they came for). Null when every class that day was over by then.
   */
  firstStartMs: number | null
  /** When their last class ends: the latest one they're in for, else the day's last. */
  lastEndMs: number
}

/**
 * Someone's first and last class on a day, as their pay and the automatic clock-out read them: the classes they're in
 * for (their availability that day, as who's in decides who teaches a class), else, when they're in for none, the class
 * they came for and the day's last. Null on a day without classes (classes in the Trash don't count).
 */
export function dayBounds(opts: {
  staffId: string
  dateKey: DateKey
  /** Their clock-in. */
  clockInMs: number
  /** Classes on that day (others are left out). */
  classes: readonly PayClass[]
  /** Who's in that day: everyone's availability (others are left out). */
  availability: readonly DayRecord[]
}): DayBounds | null {
  const day = opts.classes.filter((c) => c.dateKey === opts.dateKey && !c.isDeleted)
  if (!day.length) return null
  const records = opts.availability.filter((a) => a.dateKey === opts.dateKey && a.staffId === opts.staffId)
  const mine = day.filter((c) => coachesIn(c, records, WHOLE_DAY).length > 0)
  const start = (c: PayClass) => c.startAt.toMillis()
  const end = (c: PayClass) => c.endAt.toMillis()
  if (mine.length) return { firstStartMs: Math.min(...mine.map(start)), lastEndMs: Math.max(...mine.map(end)) }
  const ahead = day.filter((c) => end(c) > opts.clockInMs)
  return { firstStartMs: ahead.length ? Math.min(...ahead.map(start)) : null, lastEndMs: Math.max(...day.map(end)) }
}

/** Owners and admins are paid as clocked: the class rule is the coaches'. */
export function paidByClasses(role: StaffRole | null | undefined): boolean {
  return role !== 'owner' && role !== 'admin'
}

/**
 * The paid part of a shift (K2, K3): from `arrivalMinutes` before the first class, never before the clock-in, to the
 * clock-out, and with pay ending at the last class, never after the end of the last class. With no classes that day
 * (`bounds` null), from clock-in to clock-out. Never negative: a shift wholly outside that time is paid nothing.
 * `outMs` is the clock-out, or now for a shift still open (its time so far).
 */
export function paidWindow(opts: { inMs: number; outMs: number; bounds: DayBounds | null; rule: PayRule }): { startMs: number; endMs: number } {
  const { inMs, outMs, bounds, rule } = opts
  if (!bounds) return { startMs: inMs, endMs: Math.max(inMs, outMs) }
  const startMs = bounds.firstStartMs === null ? inMs : Math.max(inMs, bounds.firstStartMs - rule.arrivalMinutes * 60_000)
  const endMs = rule.endsAtLastClass ? Math.min(outMs, bounds.lastEndMs) : outMs
  return { startMs, endMs: Math.max(startMs, endMs) }
}

/** A shift as the pay reads it. */
export interface PayShift {
  staffId: string
  dateKey: DateKey
  clockInAt: { toMillis(): number }
  clockOutAt: { toMillis(): number } | null
}

/**
 * The paid part of someone's shift, from the day's classes and who's in (a shift still open: its time so far, up to
 * `nowMs`). Owners and admins, and anyone when the classes aren't given, are paid as clocked.
 */
export function shiftPaidTime(
  shift: PayShift,
  opts: {
    role: StaffRole | null | undefined
    classes?: readonly PayClass[]
    availability?: readonly DayRecord[]
    rule: PayRule
    nowMs?: number
  },
): { startMs: number; endMs: number } {
  const inMs = shift.clockInAt.toMillis()
  const outMs = shift.clockOutAt ? shift.clockOutAt.toMillis() : (opts.nowMs ?? Date.now())
  const bounds =
    opts.classes && paidByClasses(opts.role)
      ? dayBounds({ staffId: shift.staffId, dateKey: shift.dateKey, clockInMs: inMs, classes: opts.classes, availability: opts.availability ?? [] })
      : null
  return paidWindow({ inMs, outMs, bounds, rule: opts.rule })
}

/**
 * When the automatic clock-out closes a shift still open (K3): at the end of the person's last class that day, when the
 * academy clocks out at the last class and that end is after the clock-in; otherwise at the set time (the first one after
 * the clock-in: the next day's for a shift started after it). Null when the academy doesn't clock out automatically, or
 * when it would fall back to a set time it can't read.
 */
export function autoClockOutAt(opts: {
  shift: { staffId: string; dateKey: DateKey; inMin: number; clockInMs: number }
  classes: readonly PayClass[]
  availability: readonly DayRecord[]
  settings: Pick<BranchSettings, 'timeClock'>
  timeZone: string
}): { atMs: number; by: 'last_class' | 'set_time' } | null {
  const { shift, settings } = opts
  const auto = settings.timeClock.autoClockOut
  if (!auto.enabled) return null
  if (auto.atLastClass !== false) {
    const bounds = dayBounds({ staffId: shift.staffId, dateKey: shift.dateKey, clockInMs: shift.clockInMs, classes: opts.classes, availability: opts.availability })
    if (bounds && bounds.lastEndMs > shift.clockInMs) return { atMs: bounds.lastEndMs, by: 'last_class' }
  }
  const cutoffMin = parseHHMM(auto.localTime)
  if (Number.isNaN(cutoffMin)) return null
  const day = cutoffMin > shift.inMin ? shift.dateKey : addDays(shift.dateKey, 1)
  return { atMs: toInstant(day, cutoffMin, opts.timeZone).getTime(), by: 'set_time' }
}
