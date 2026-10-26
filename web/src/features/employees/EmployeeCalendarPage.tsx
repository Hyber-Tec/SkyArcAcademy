import { query, where } from 'firebase/firestore'
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { dayHours, effectiveRanges } from '@shared/availability'
import { COL } from '@shared/paths'
import { priceClassBlocks } from '@shared/pay/classes'
import { unionMinutes } from '@shared/schedule/lanes'
import type { AcademyClass, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { boxRange, timeRange } from '@/lib/calendar'
import { branchCol, useQuery } from '@/lib/firestore'
import { type DayCell, HoursCalendar } from './HoursCalendar'
import { addDays, formatInstantTime } from '@shared/time'
import { effectiveRates, priceShifts } from '@shared/pay/shifts'
import { useAvailabilityRange, useSessionsRange, useShifts } from '@/features/timeclock/api'
import { useCompensationMap } from '@/features/timeclock/hooks'
import { useAvailability, useDayConfigs, useStaffList as useStaffListForPay } from '@/features/data/hooks'
import { STAFF_STATUSES, STAFF_STATUS_LABELS } from '@shared/people'
import type { StaffStatus } from '@shared/types'
import { OptionPicker } from '@/components/app/OptionPicker'
import { PageHeader } from '@/components/app/PageHeader'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AvailabilityCalendar } from '@/features/availability/AvailabilityCalendar'
import { useStaffList } from '@/features/data/hooks'
import { plural } from '@/features/home/parts'

type CalendarMode = 'availability' | 'scheduled' | 'clock' | 'teaching' | 'admin'

const MODES: { value: CalendarMode; label: string; ready: boolean }[] = [
  { value: 'availability', label: 'Availability', ready: true },
  { value: 'scheduled', label: 'Scheduled hours', ready: true },
  { value: 'clock', label: 'Clock in/out', ready: true },
  { value: 'teaching', label: 'Teaching hours', ready: true },
  { value: 'admin', label: 'Admin hours', ready: true },
]

export function EmployeeCalendarPage() {
  const { data: staff } = useStaffList()
  const [params, setParams] = useSearchParams()
  const [role, setRole] = useState<'coach' | 'admin' | 'all'>('coach')
  const [status, setStatus] = useState<StaffStatus | 'all'>('active')
  const mode = (params.get('mode') as CalendarMode) || 'availability'
  const staffId = params.get('staff')
  const options = useMemo(
    () =>
      staff
        .filter((s) => (role === 'all' || s.role === role) && (status === 'all' || s.status === status))
        .map((s) => ({ value: s.id, label: s.name })),
    [staff, role, status],
  )
  const selected = staff.find((s) => s.id === staffId) ?? null
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }

  return (
    <div className="max-w-5xl">
      <PageHeader title="Employee Calendar" description="Each employee’s availability, scheduled hours and worked time by day." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
          <SelectTrigger className="sm:w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="coach">Coaches</SelectItem>
            <SelectItem value="admin">Admins</SelectItem>
            <SelectItem value="all">All roles</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="sm:w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STAFF_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STAFF_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <OptionPicker
          className="sm:w-64"
          value={staffId}
          onChange={(v) => set({ staff: v })}
          options={options}
          placeholder="Select employee…"
          searchPlaceholder="Search employees…"
        />
        <Select value={mode} onValueChange={(v) => set({ mode: v })}>
          <SelectTrigger className="sm:ml-auto sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODES.map((m) => (
              <SelectItem key={m.value} value={m.value} disabled={!m.ready}>
                {m.label}
                {m.ready ? '' : ' (soon)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selected && mode === 'scheduled' ? (
        <ScheduledHours key={selected.id} staffId={selected.id} teaches={selected.role === 'coach'} />
      ) : selected && (mode === 'clock' || mode === 'teaching' || mode === 'admin') ? (
        <WorkedHours key={`${selected.id}-${mode}`} staffId={selected.id} mode={mode} />
      ) : selected ? (
        <AvailabilityCalendar key={selected.id} staffId={selected.id} staffName={selected.name} staffRole={selected.role} mode="admin" />
      ) : (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>Select an employee</EmptyTitle>
            <EmptyDescription>Choose someone above to see and edit their calendar. Admins can change any day, including locked ones.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}

/**
 * Their hours each day (their availability: who's in, inside opening hours), with the classes in them: a coach teaches
 * every class in their hours, with the other coaches in.
 */
function ScheduledHours({ staffId, teaches }: { staffId: string; teaches: boolean }) {
  const { branchId, settings } = useBranch()
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const onRange = useCallback((from: string, to: string) => setRange({ from, to }), [])
  const from = range?.from ?? '0000-00-00'
  const to = range?.to ?? '0000-00-00'
  const { map: days } = useAvailability(range ? staffId : null, from, to, { keepPrevious: true })
  const { map: dayConfigs } = useDayConfigs(from, to, { keepPrevious: true, enabled: !!range })
  const q = useMemo(
    () => (range && teaches ? query(branchCol(branchId, COL.classes), where('dateKey', '>=', range.from), where('dateKey', '<=', range.to)) : null),
    [branchId, range, teaches],
  )
  const { data: classes } = useQuery<AcademyClass>(q, `emp-classes-${branchId}-${range?.from}-${range?.to}-${teaches}`, { keepPrevious: true })
  const cells = useMemo(() => {
    const byDay = new Map<string, WithId<AcademyClass>[]>()
    for (const c of classes) if (!c.isDeleted) byDay.set(c.dateKey, [...(byDay.get(c.dateKey) ?? []), c])
    const m = new Map<string, DayCell>()
    for (const [d, a] of days) {
      const ranges = a.unavailable ? [] : effectiveRanges(a.ranges ?? [], dayHours(d, settings, dayConfigs))
      if (!ranges.length) continue
      const list = byDay.get(d) ?? []
      m.set(d, {
        minutes: unionMinutes(ranges),
        lines: ranges.map((r) => {
          const n = list.filter((c) => c.startMin < r.endMin && c.endMin > r.startMin).length
          return { label: timeRange(r.startMin, r.endMin), detail: teaches ? (n ? plural(n, 'class') : 'No classes') : undefined, tone: 'scheduled' as const }
        }),
      })
    }
    return m
  }, [days, classes, settings, dayConfigs, teaches])
  return (
    <HoursCalendar
      cells={cells}
      tone="scheduled"
      onRange={onRange}
      footnote={
        teaches
          ? 'Their hours each day, from their availability (who’s in), with the classes in those hours: a coach teaches every class in their hours. Closed days don’t count.'
          : 'Their hours each day, from their availability (who’s in). Closed days don’t count.'
      }
    />
  )
}

function WorkedHours({ staffId, mode }: { staffId: string; mode: 'clock' | 'teaching' | 'admin' }) {
  const { settings, rules, timezone } = useBranch()
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const onRange = useCallback((from: string, to: string) => setRange({ from, to }), [])
  const from = range?.from ?? '0000-00-00'
  const to = range?.to ?? '0000-00-00'
  const { data: shifts } = useShifts(from, to, staffId, !!range, { keepPrevious: true })
  // Every class (they're taught together), and the days they were in: a class counts for every coach in at its time.
  const { data: sessions } = useSessionsRange(addDays(from, -1), addDays(to, 1), !!range && mode !== 'clock', { keepPrevious: true })
  const { data: availability } = useAvailabilityRange(from, to, staffId, !!range && mode === 'teaching', { keepPrevious: true })
  const { data: staff } = useStaffListForPay()
  const comps = useCompensationMap([staffId])
  const cells = useMemo(() => {
    const m = new Map<string, DayCell>()
    const ratesFor = () => effectiveRates(staff.find((s) => s.id === staffId), comps.get(staffId))
    const add = (d: string, startMs: number, endMs: number, tone: 'clock' | 'teaching' | 'admin') => {
      const cell = m.get(d) ?? { minutes: 0, lines: [] }
      cell.minutes += (endMs - startMs) / 60000
      cell.lines!.push({ label: boxRange(formatInstantTime(startMs, timezone), formatInstantTime(endMs, timezone)), tone })
      if (cell.minutes > 0) m.set(d, cell)
    }
    for (const p of priceShifts({ shifts: shifts.filter((s) => s.status === 'closed'), sessions, settings, rules, ratesFor })) {
      if (mode === 'clock') add(p.shift.dateKey, p.shift.clockInAt.toMillis(), p.shift.clockOutAt!.toMillis(), 'clock')
      // Unpaid time (Teaching only's gaps, and every clock-in under Classes taught) isn't paid time.
      else for (const seg of p.segments.filter((x) => x.type === mode && !x.unpaid)) add(p.shift.dateKey, seg.startMs, seg.endMs, mode)
    }
    if (mode === 'teaching') {
      for (const b of priceClassBlocks({ sessions, availability, settings, rules, ratesFor })) {
        if (b.staffId === staffId && b.dateKey >= from && b.dateKey <= to) add(b.dateKey, b.segment.startMs, b.segment.endMs, 'teaching')
      }
    }
    return m
  }, [shifts, sessions, availability, settings, rules, timezone, staff, comps, staffId, mode, from, to])
  const notes = {
    clock: 'Worked time from clock-ins and time entries.',
    teaching: 'Time paid as teaching under the academy’s pay model: classes taught under Classes taught, otherwise clocked time.',
    admin: 'Clocked time paid as admin time.',
  }
  return <HoursCalendar cells={cells} tone={mode} onRange={onRange} footnote={notes[mode]} />
}
