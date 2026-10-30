import { query, where } from 'firebase/firestore'
import { useCallback, useMemo } from 'react'
import { dayHours } from '@shared/availability'
import { COL } from '@shared/paths'
import { classViews } from '@shared/schedule/classes'
import type { DayHours } from '@shared/settings/defaults'
import type { DateKey } from '@shared/time'
import type { AcademyClass, Availability, Session } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useDayConfigs } from '@/features/data/hooks'
import { branchCol, useQuery } from '@/lib/firestore'

/** A class as the schedule shows it: its seats (canceled ones too, in the order booked), and who teaches it. */
export type { ClassView } from '@shared/schedule/classes'

/**
 * The schedule's data for a range of dates, live: the classes and their students, who's in each day (the coaches'
 * availability) and opening hours. `isCoach` says who teaches (the manager can be in without teaching). The website
 * shows no events since 2026-10-29 (the owner never used them).
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

  const hoursOf = useCallback((d: DateKey): DayHours => dayHours(d, settings, dayConfigs.map), [settings, dayConfigs.map])

  const { isCoach } = opts
  const byDate = useMemo(() => classViews(classes.data, seats.data, availability.data, hoursOf, isCoach), [classes.data, seats.data, availability.data, hoursOf, isCoach])

  /** Everyone with hours that day (coaches and the manager), earliest first. */
  const inOn = useCallback(
    (d: DateKey) =>
      availability.data
        .filter((a) => a.dateKey === d && !a.unavailable && (a.ranges ?? []).length > 0)
        .sort((a, b) => a.ranges[0].startMin - b.ranges[0].startMin || (a.staffName ?? '').localeCompare(b.staffName ?? '')),
    [availability.data],
  )

  const liveSeats = useMemo(() => seats.data.filter((s) => !s.isDeleted), [seats.data])

  return {
    byDate,
    seats: liveSeats,
    availability: availability.data,
    inOn,
    hoursOf,
    dayConfigs: dayConfigs.map,
    loading: classes.loading || seats.loading || availability.loading,
    error: classes.error ?? seats.error ?? availability.error,
  }
}
