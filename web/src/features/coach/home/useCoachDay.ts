import { query, where } from 'firebase/firestore'
import { useCallback, useMemo } from 'react'
import type { Announcement } from '@shared/comms'
import { availabilityGaps, dayHours } from '@shared/availability'
import { COL } from '@shared/paths'
import { extraMinutes } from '@shared/pay/lines'
import { payRule, shiftPaidTime } from '@shared/pay/paidTime'
import { unionMinutes } from '@shared/schedule/lanes'
import { type DateKey, addDays, dateRange, nowMinutes, startOfWeek, todayKey } from '@shared/time'
import type { Availability, Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useMyAnnouncements, useMyReadIds } from '@/features/announcements/api'
import { useDayConfigs, useStudentList } from '@/features/data/hooks'
import { type ClassView, useClassData } from '@/features/schedule/useClassData'
import { type ClockShift, useShifts } from '@/features/timeclock/api'
import { branchCol, useQuery } from '@/lib/firestore'
import { useNow } from '@/lib/useNow'
import { useMyStaff } from '../hooks'

/** How far ahead Home looks for the coach's next class (two weeks). */
const AHEAD_DAYS = 14

export type NextUp =
  | { kind: 'now'; classes: ClassView[]; then: ClassView | null }
  | { kind: 'later'; startMin: number; classes: ClassView[] }
  | { kind: 'day'; dateKey: DateKey; classes: ClassView[] }
  | { kind: 'none' }

export interface WeekDay {
  dateKey: DateKey
  classes: number
  done: number
  minutes: number
  isOpen: boolean
}

export interface ClockState {
  open: WithId<ClockShift> | null
  /** Today's finished shifts. */
  closed: WithId<ClockShift>[]
  /**
   * Minutes paid today (the open shift counts up to now): from shortly before their first class to the end of their last,
   * with any extra time (docs/DECISIONS.md §23).
   */
  todayMinutes: number
  weekMinutes: number
}

const ms = (t: unknown) => (t as { toMillis?: () => number } | null)?.toMillis?.() ?? 0
// Coaches can't read the staff list: who teaches comes from each day's records (the manager's says so).
const anyone = () => true

/** The coach's time in a class: their hours that overlap it. */
function minutesIn(v: ClassView, staffId: string) {
  const mine = v.coaches.find((k) => k.staffId === staffId)
  return (mine?.ranges ?? []).map((r) => ({ startMin: Math.max(r.startMin, v.c.startMin), endMin: Math.min(r.endMin, v.c.endMin) }))
}

/**
 * Everything the coach's Home shows: their classes (every class in their hours, taught with the other coaches in), what
 * they still have to do (days to set availability, posts not read), their clock shifts and how the week looks. All
 * dates and times are the academy's.
 */
export function useCoachDay() {
  const { branchId, staffId, settings, timezone } = useBranch()
  const now = useNow(20_000)
  const today = todayKey(timezone, now)
  const nowMin = nowMinutes(timezone, new Date(now))
  const weekStart = startOfWeek(today, settings.general.weekStartsOn)
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const to = addDays(today, AHEAD_DAYS)
  const gapsTo = addDays(today, Math.max(AHEAD_DAYS, settings.availability.leadTimeDays + 1))

  const me = useMyStaff()
  const data = useClassData(weekStart, to, { isCoach: anyone })
  // Their own days, as far as the availability notice reaches (for the days still to set).
  const availQ = useMemo(
    () => (staffId ? query(branchCol(branchId, COL.availability), where('staffId', '==', staffId), where('dateKey', '>=', today), where('dateKey', '<=', gapsTo)) : null),
    [branchId, staffId, today, gapsTo],
  )
  const avail = useQuery<Availability>(availQ, `coach-today-avail-${staffId}-${today}-${gapsTo}`)
  const { map: dayConfigs } = useDayConfigs(today, gapsTo)
  const students = useStudentList(!!staffId)
  // From the day before the week (or yesterday): a shift still open from last night counts.
  const shiftFrom = addDays(weekStart < today ? weekStart : today, -1)
  const shifts = useShifts(shiftFrom, today, staffId, !!staffId)
  const feed = useMyAnnouncements(!!staffId)
  const reads = useMyReadIds(!!staffId)

  const studentsById = useMemo(() => new Map(students.data.map((s) => [s.id, s])), [students.data])
  const hoursOf = useCallback((d: DateKey) => dayHours(d, settings, dayConfigs), [settings, dayConfigs])

  /** The coach's classes by date: every class they're in for (all or part of it). */
  const mine = useMemo(() => {
    const m = new Map<DateKey, ClassView[]>()
    if (!staffId) return m
    for (const [d, list] of data.byDate) {
      const theirs = list.filter((v) => v.coaches.some((k) => k.staffId === staffId))
      if (theirs.length) m.set(d, theirs)
    }
    return m
  }, [data.byDate, staffId])

  const day = useMemo(() => {
    const todays = mine.get(today) ?? []
    const current = todays.filter((v) => v.c.startMin <= nowMin && v.c.endMin > nowMin)
    const later = todays.filter((v) => v.c.startMin > nowMin)
    const earlier = todays.filter((v) => v.c.endMin <= nowMin)

    let next: NextUp = { kind: 'none' }
    if (current.length) next = { kind: 'now', classes: current, then: later[0] ?? null }
    else if (later.length) next = { kind: 'later', startMin: later[0].c.startMin, classes: later.filter((v) => v.c.startMin === later[0].c.startMin) }
    else {
      const d = dateRange(addDays(today, 1), to).find((x) => mine.has(x))
      if (d) next = { kind: 'day', dateKey: d, classes: mine.get(d) ?? [] }
    }
    return { classes: todays, current, later, earlier, next }
  }, [mine, today, nowMin, to])

  const todo = useMemo(() => {
    const saved = new Map(avail.data.map((a) => [a.dateKey, a]))
    const gaps = availabilityGaps({ today, timeZone: timezone, settings, dayConfigs, dayOn: (d) => saved.get(d), now: new Date(now) })
    // Until both lists are in, nothing counts as unread (as the News badge).
    const unread: WithId<Announcement>[] =
      feed.loading || reads.loading
        ? []
        : feed.data.filter((a) => !reads.ids.has(a.id)).sort((a, b) => Number(b.pinned) - Number(a.pinned) || ms(b.createdAt) - ms(a.createdAt))
    return { gaps, unread, total: gaps.length + unread.length }
  }, [today, avail.data, timezone, settings, dayConfigs, now, reads.ids, reads.loading, feed.data, feed.loading])

  const classHours = data.hoursOf
  const week = useMemo(() => {
    const days: WeekDay[] = weekDays.map((d) => {
      const list = mine.get(d) ?? []
      return {
        dateKey: d,
        classes: list.length,
        done: list.filter((v) => d < today || (d === today && v.c.endMin <= nowMin)).length,
        // Their time in classes: classes side by side count once.
        minutes: staffId ? unionMinutes(list.flatMap((v) => minutesIn(v, staffId))) : 0,
        isOpen: classHours(d).isOpen,
      }
    })
    return {
      days,
      classes: days.reduce((n, d) => n + d.classes, 0),
      done: days.reduce((n, d) => n + d.done, 0),
      minutes: days.reduce((m, d) => m + d.minutes, 0),
    }
  }, [weekDays, mine, today, nowMin, classHours, staffId])

  const role = me.data?.role
  const clock = useMemo<ClockState>(() => {
    const rule = payRule(settings)
    // The classes loaded for the page (this week on): a coach's paid time starts before their first class and ends with
    // their last.
    const classes = [...data.byDate.values()].flat().map((v) => v.c)
    const paidOf = (s: WithId<ClockShift>) => shiftPaidTime(s, { role, classes, availability: data.availability, rule, nowMs: now })
    const minutesOf = (s: WithId<ClockShift>) => {
      const p = paidOf(s)
      return Math.max(0, (p.endMs - p.startMs) / 60_000) + (s.status === 'open' ? 0 : extraMinutes(s))
    }
    const open = shifts.data.find((s) => s.status === 'open') ?? null
    const closed = shifts.data.filter((s) => s.status !== 'open' && s.dateKey === today).sort((a, b) => ms(a.clockInAt) - ms(b.clockInAt))
    const todayMinutes = [...closed, ...(open ? [open] : [])].reduce((m, s) => m + minutesOf(s), 0)
    const weekMinutes = shifts.data.filter((s) => s.dateKey >= weekStart).reduce((m, s) => m + minutesOf(s), 0)
    return { open, closed, todayMinutes, weekMinutes }
  }, [shifts.data, today, now, weekStart, settings, role, data.byDate, data.availability])

  return {
    me: me.data,
    staffId,
    now,
    today,
    nowMin,
    weekStart,
    day,
    todo,
    week,
    clock,
    /** Opening hours of a date (per-date hours included). */
    hoursOf,
    student: (id: string): WithId<Student> | undefined => studentsById.get(id),
    /** The students in classes loaded for the page (this week to two weeks ahead), for first-class checks. */
    seats: data.seats,
    loading: me.loading || data.loading,
    todoLoading: avail.loading || feed.loading || reads.loading,
  }
}

export type CoachDay = ReturnType<typeof useCoachDay>
