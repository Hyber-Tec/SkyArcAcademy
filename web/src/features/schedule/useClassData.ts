import { query, where } from 'firebase/firestore'
import { useCallback, useMemo } from 'react'
import { dayHours } from '@shared/availability'
import { COL } from '@shared/paths'
import { type ClassCoach, coachesIn, takesSeat } from '@shared/schedule/classes'
import { type ScheduleEvent, occursOn } from '@shared/schedule/events'
import type { DayHours } from '@shared/settings/defaults'
import { type DateKey, dateRange } from '@shared/time'
import type { AcademyClass, Availability, Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useDayConfigs } from '@/features/data/hooks'
import { branchCol, useQuery } from '@/lib/firestore'

export type EventDoc = ScheduleEvent & { isRecurring: boolean; createdBy?: string; updatedAt?: unknown }

/** A class as the schedule shows it: its seats (canceled ones too, in the order booked), and who teaches it. */
export interface ClassView {
  c: WithId<AcademyClass>
  seats: WithId<Session>[]
  /** Seats in use (a canceled student frees theirs). */
  taken: number
  coaches: ClassCoach[]
}

/**
 * The schedule's data for a range of dates, live: the classes and their students, who's in each day (the coaches'
 * availability), opening hours and events. `isCoach` says who teaches (the manager can be in without teaching).
 */
export function useClassData(from: DateKey, to: DateKey, opts: { isCoach: (staffId: string) => boolean; keepPrevious?: boolean }) {
  const { branchId, settings } = useBranch()
  const keep = { keepPrevious: !!opts.keepPrevious }
  const classesQ = useMemo(() => query(branchCol(branchId, COL.classes), where('dateKey', '>=', from), where('dateKey', '<=', to)), [branchId, from, to])
  const seatsQ = useMemo(() => query(branchCol(branchId, COL.sessions), where('dateKey', '>=', from), where('dateKey', '<=', to)), [branchId, from, to])
  const availQ = useMemo(() => query(branchCol(branchId, COL.availability), where('dateKey', '>=', from), where('dateKey', '<=', to)), [branchId, from, to])
  const classes = useQuery<AcademyClass>(classesQ, `cls-classes-${branchId}-${from}-${to}`, keep)
  const seats = useQuery<Session>(seatsQ, `cls-seats-${branchId}-${from}-${to}`, keep)
  const availability = useQuery<Availability>(availQ, `cls-avail-${branchId}-${from}-${to}`, keep)
  const dayConfigs = useDayConfigs(from, to, keep)

  const oneOffQ = useMemo(
    () => query(branchCol(branchId, COL.events), where('isRecurring', '==', false), where('dateKey', '>=', from), where('dateKey', '<=', to)),
    [branchId, from, to],
  )
  const recurringQ = useMemo(() => query(branchCol(branchId, COL.events), where('isRecurring', '==', true)), [branchId])
  const oneOff = useQuery<EventDoc>(oneOffQ, `cls-events-${branchId}-${from}-${to}`, keep)
  const recurring = useQuery<EventDoc>(recurringQ, `cls-revents-${branchId}`)

  const hoursOf = useCallback((d: DateKey): DayHours => dayHours(d, settings, dayConfigs.map), [settings, dayConfigs.map])

  const { isCoach } = opts
  const byDate = useMemo(() => {
    const seatsOf = new Map<string, WithId<Session>[]>()
    for (const s of seats.data) {
      if (s.isDeleted || !s.classId) continue
      seatsOf.set(s.classId, [...(seatsOf.get(s.classId) ?? []), s])
    }
    const dayOf = new Map<DateKey, WithId<Availability>[]>()
    for (const a of availability.data) dayOf.set(a.dateKey, [...(dayOf.get(a.dateKey) ?? []), a])
    const out = new Map<DateKey, ClassView[]>()
    for (const c of classes.data) {
      if (c.isDeleted) continue
      const list = (seatsOf.get(c.id) ?? []).sort((a, b) => (a.visualOrder ?? 0) - (b.visualOrder ?? 0) || stamp(a.createdAt) - stamp(b.createdAt))
      const view: ClassView = { c, seats: list, taken: list.filter(takesSeat).length, coaches: coachesIn(c, dayOf.get(c.dateKey) ?? [], hoursOf(c.dateKey), isCoach) }
      out.set(c.dateKey, [...(out.get(c.dateKey) ?? []), view])
    }
    for (const list of out.values()) list.sort((a, b) => a.c.startMin - b.c.startMin || a.c.endMin - b.c.endMin)
    return out
  }, [classes.data, seats.data, availability.data, hoursOf, isCoach])

  /** Everyone with hours that day (coaches and the manager), earliest first. */
  const inOn = useCallback(
    (d: DateKey) =>
      availability.data
        .filter((a) => a.dateKey === d && !a.unavailable && (a.ranges ?? []).length > 0)
        .sort((a, b) => a.ranges[0].startMin - b.ranges[0].startMin || (a.staffName ?? '').localeCompare(b.staffName ?? '')),
    [availability.data],
  )

  const eventsByDate = useMemo(() => {
    const m = new Map<DateKey, WithId<EventDoc>[]>()
    const all = [...oneOff.data, ...recurring.data]
    for (const d of dateRange(from, to)) {
      const list = all.filter((e) => occursOn(e, d)).sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
      if (list.length) m.set(d, list)
    }
    return m
  }, [oneOff.data, recurring.data, from, to])

  const liveSeats = useMemo(() => seats.data.filter((s) => !s.isDeleted), [seats.data])

  return {
    byDate,
    seats: liveSeats,
    availability: availability.data,
    inOn,
    hoursOf,
    dayConfigs: dayConfigs.map,
    eventsByDate,
    loading: classes.loading || seats.loading || availability.loading,
    error: classes.error ?? seats.error ?? availability.error ?? oneOff.error ?? recurring.error,
  }
}

const stamp = (t: unknown) => (t && typeof t === 'object' && 'toMillis' in t ? (t as { toMillis: () => number }).toMillis() : 0)
