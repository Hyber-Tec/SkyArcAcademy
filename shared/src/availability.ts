import type { BranchSettings, DayHours } from './settings/defaults'
import { type DateKey, addDays, toInstant, weekdayOf } from './time'
import type { AvailabilityRange, DayConfig } from './types'

/** Opening hours of a date: an explicit day config wins over the branch's default week. */
export function dayHours(
  dateKey: DateKey,
  settings: Pick<BranchSettings, 'schedule'>,
  dayConfigs?: Map<DateKey, Pick<DayConfig, 'isOpen' | 'openMin' | 'closeMin'>> | null,
): DayHours {
  const cfg = dayConfigs?.get(dateKey)
  if (cfg) return { isOpen: cfg.isOpen, openMin: cfg.openMin, closeMin: cfg.closeMin }
  const d = settings.schedule.defaultWeek[weekdayOf(dateKey)]
  return { isOpen: d.isOpen, openMin: d.openMin, closeMin: d.closeMin }
}

/** Sorts ranges and merges overlapping or touching ones; drops empty ranges. */
export function normalizeRanges(ranges: readonly AvailabilityRange[]): AvailabilityRange[] {
  const sorted = ranges
    .filter((r) => Number.isFinite(r.startMin) && Number.isFinite(r.endMin) && r.endMin > r.startMin)
    .map((r) => ({ startMin: r.startMin, endMin: r.endMin }))
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
  const out: AvailabilityRange[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r.startMin <= last.endMin) last.endMin = Math.max(last.endMin, r.endMin)
    else out.push(r)
  }
  return out
}

/** Clips ranges to opening hours; returns the clipped ranges and whether anything changed. */
export function clipToHours(ranges: readonly AvailabilityRange[], hours: DayHours): { ranges: AvailabilityRange[]; clipped: boolean } {
  const out = normalizeRanges(
    ranges.map((r) => ({ startMin: Math.max(r.startMin, hours.openMin), endMin: Math.min(r.endMin, hours.closeMin) })),
  )
  const clipped = JSON.stringify(out) !== JSON.stringify(normalizeRanges(ranges))
  return { ranges: out, clipped }
}

/**
 * The part of saved availability that counts on a date: clipped to that date's
 * opening hours, none when the center is closed. Saved ranges stay as they are,
 * so reopening a day or widening its hours brings them back.
 */
export function effectiveRanges(ranges: readonly AvailabilityRange[], hours: DayHours): AvailabilityRange[] {
  return hours.isOpen ? clipToHours(ranges, hours).ranges : []
}

/** A date's saved availability: its times (as stored), or marked not available. */
export interface SavedDay {
  ranges: readonly AvailabilityRange[]
  /** Marked not available that day (by the coach or an admin): an answer, unlike a day left unset. */
  unavailable?: boolean
}

/**
 * Where a date stands for one coach: the academy is closed; they gave times (inside that date's hours); they marked it
 * not available; or nothing is set. A day marked not available is answered, so it is never one still to set.
 */
export type DayMark = 'closed' | 'available' | 'unavailable' | 'unset'

export function dayMark(saved: SavedDay | null | undefined, hours: DayHours): DayMark {
  if (!hours.isOpen) return 'closed'
  if (saved?.unavailable) return 'unavailable'
  return saved && effectiveRanges(saved.ranges, hours).length ? 'available' : 'unset'
}

/** The last open date a coach has answered (times, or not available): "Set through". */
export function lastAnswered(days: Iterable<readonly [DateKey, SavedDay]>, hoursOf: (dateKey: DateKey) => DayHours): DateKey | null {
  let last: DateKey | null = null
  for (const [d, saved] of days) {
    const mark = dayMark(saved, hoursOf(d))
    if ((mark === 'available' || mark === 'unavailable') && (!last || d > last)) last = d
  }
  return last
}

export type FitResult =
  | { ok: true; ranges: AvailabilityRange[]; trimmed: boolean }
  | { ok: false; reason: 'closed' | 'outside' | 'too_many' }

/**
 * Availability must sit inside that date's opening hours (per-date hours
 * included) and closed days take none (owner rule, round 2). Ranges are merged,
 * trimmed to the hours, and slivers shorter than the minimum dropped.
 */
export function fitRangesToDay(
  ranges: readonly AvailabilityRange[],
  hours: DayHours,
  opts: { minBlockMinutes: number; maxRangesPerDay: number },
): FitResult {
  const merged = normalizeRanges(ranges)
  if (merged.length === 0) return { ok: true, ranges: [], trimmed: false }
  if (!hours.isOpen) return { ok: false, reason: 'closed' }
  const { ranges: clipped, clipped: wasClipped } = clipToHours(merged, hours)
  const kept = clipped.filter((r) => r.endMin - r.startMin >= opts.minBlockMinutes)
  if (kept.length === 0) return { ok: false, reason: 'outside' }
  if (kept.length > opts.maxRangesPerDay) return { ok: false, reason: 'too_many' }
  return { ok: true, ranges: kept, trimmed: wasClipped || kept.length !== clipped.length }
}

/** True when [startMin, endMin] lies fully inside one of the ranges. */
export function rangesContain(ranges: readonly AvailabilityRange[], startMin: number, endMin: number): boolean {
  return ranges.some((r) => r.startMin <= startMin && r.endMin >= endMin)
}

/** Midnight at the start of `dateKey` in the branch zone. */
export function dayStartInstant(dateKey: DateKey, timeZone: string): Date {
  return toInstant(dateKey, 0, timeZone)
}

/**
 * A day that starts within `lockDays` of now is locked for its coach (owner decision Q10; the security rules check it
 * too): they can add time to it but not remove or shorten it (`onlyAddsTime`, docs/DECISIONS.md §23, C2), and a day
 * that's over can't change at all.
 */
export function isLockedForCoach(dateKey: DateKey, timeZone: string, lockDays: number, now: Date = new Date()): boolean {
  if (lockDays <= 0) return dayStartInstant(dateKey, timeZone).getTime() <= now.getTime()
  return dayStartInstant(dateKey, timeZone).getTime() <= now.getTime() + lockDays * 86_400_000
}

/** Effective coach lock window, including a blocking lead time. */
export function effectiveLockDays(settings: Pick<BranchSettings, 'availability'>): number {
  const a = settings.availability
  return a.leadTimeEnforcement === 'block' ? Math.max(a.lockWindowDays, a.leadTimeDays) : a.lockWindowDays
}

/** Inside the lead window but not locked: the coach should have set availability already. */
export function isInsideLeadTime(dateKey: DateKey, timeZone: string, leadDays: number, now: Date = new Date()): boolean {
  return dayStartInstant(dateKey, timeZone).getTime() < now.getTime() + leadDays * 86_400_000
}

/**
 * Open days a coach still has to answer: inside the lead window, not locked
 * yet, with neither times inside that date's hours nor a "not available" mark.
 * They are the amber days of the coach's calendar and the "availability still
 * to set" of Home (web and phone), so both always count the same days. A
 * branch that doesn't ask for notice (lead time "Do nothing") has none.
 */
export function availabilityGaps(input: {
  today: DateKey
  timeZone: string
  settings: Pick<BranchSettings, 'availability' | 'schedule'>
  dayConfigs?: Map<DateKey, Pick<DayConfig, 'isOpen' | 'openMin' | 'closeMin'>> | null
  /** A date's hours, when the caller already has them (instead of `dayConfigs`). */
  hoursOf?: (dateKey: DateKey) => DayHours
  /** A date's saved availability (its ranges as stored; clipped to the date's hours here). */
  dayOn: (dateKey: DateKey) => SavedDay | null | undefined
  now?: Date
}): DateKey[] {
  const { today, timeZone, settings } = input
  if (settings.availability.leadTimeEnforcement === 'off') return []
  const now = input.now ?? new Date()
  const lead = settings.availability.leadTimeDays
  const lockDays = effectiveLockDays(settings)
  const out: DateKey[] = []
  for (let i = 0; i <= lead; i++) {
    const d = addDays(today, i)
    if (!isInsideLeadTime(d, timeZone, lead, now)) break
    const hours = input.hoursOf ? input.hoursOf(d) : dayHours(d, settings, input.dayConfigs)
    if (!hours.isOpen || isLockedForCoach(d, timeZone, lockDays, now)) continue
    if (dayMark(input.dayOn(d), hours) === 'unset') out.push(d)
  }
  return out
}

/**
 * The same weekday in the `weeks` weeks after `dateKey` (Repeat weekly), or every other one with `every` 2 (a rotation,
 * such as Sundays that alternate between coaches).
 */
export function weeklyRepeats(dateKey: DateKey, weeks: number, every: 1 | 2 = 1): DateKey[] {
  return Array.from({ length: Math.floor(weeks / every) }, (_, i) => addDays(dateKey, 7 * every * (i + 1)))
}

export function rangesEqual(a: readonly AvailabilityRange[], b: readonly AvailabilityRange[]): boolean {
  const na = normalizeRanges(a)
  const nb = normalizeRanges(b)
  return na.length === nb.length && na.every((r, i) => r.startMin === nb[i].startMin && r.endMin === nb[i].endMin)
}

export function totalMinutes(ranges: readonly AvailabilityRange[]): number {
  return normalizeRanges(ranges).reduce((sum, r) => sum + (r.endMin - r.startMin), 0)
}
