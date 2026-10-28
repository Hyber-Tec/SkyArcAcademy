import { query, where } from 'firebase/firestore'
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { dayHours, effectiveRanges } from '@shared/availability'
import { COL } from '@shared/paths'
import { payLines } from '@shared/pay/lines'
import { unionMinutes } from '@shared/schedule/lanes'
import type { AcademyClass, Staff, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { boxRange, timeRange } from '@/lib/calendar'
import { branchCol, useQuery } from '@/lib/firestore'
import { type DayCell, HoursCalendar, fmtHours } from './HoursCalendar'
import { formatInstantTime } from '@shared/time'
import { effectiveRates } from '@shared/pay/shifts'
import { usePayDays, useShifts } from '@/features/timeclock/api'
import { useAvailability, useDayConfigs } from '@/features/data/hooks'
import { STAFF_STATUSES, STAFF_STATUS_LABELS } from '@shared/people'
import type { StaffStatus } from '@shared/types'
import { OptionPicker } from '@/components/app/OptionPicker'
import { PageHeader } from '@/components/app/PageHeader'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AvailabilityCalendar } from '@/features/availability/AvailabilityCalendar'
import { useStaffList } from '@/features/data/hooks'
import { plural } from '@/features/home/parts'

type CalendarMode = 'availability' | 'scheduled' | 'clock' | 'paid'

const MODES: { value: CalendarMode; label: string }[] = [
  { value: 'availability', label: 'Availability' },
  { value: 'scheduled', label: 'Scheduled hours' },
  { value: 'clock', label: 'Clock in/out' },
  { value: 'paid', label: 'Paid hours' },
]

export function EmployeeCalendarPage() {
  const { data: staff } = useStaffList()
  const [params, setParams] = useSearchParams()
  const [role, setRole] = useState<'coach' | 'admin' | 'all'>('coach')
  const [status, setStatus] = useState<StaffStatus | 'all'>('active')
  // Older links asked for teaching hours, now paid hours (one rate: docs/DECISIONS.md §23).
  const asked = params.get('mode') === 'teaching' ? 'paid' : params.get('mode')
  const mode: CalendarMode = MODES.some((m) => m.value === asked) ? (asked as CalendarMode) : 'availability'
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
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selected && mode === 'scheduled' ? (
        <ScheduledHours key={selected.id} staffId={selected.id} teaches={selected.role === 'coach'} />
      ) : selected && (mode === 'clock' || mode === 'paid') ? (
        <WorkedHours key={`${selected.id}-${mode}`} staff={selected} mode={mode} />
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

/**
 * Their clocked time each day (Clock in/out), or the time it pays (Paid hours: from shortly before their first class to
 * the end of their last, with any extra time), from the shared pay lines as Payroll lists them.
 */
function WorkedHours({ staff, mode }: { staff: WithId<Staff>; mode: 'clock' | 'paid' }) {
  const { settings, timezone } = useBranch()
  const [range, setRange] = useState<{ from: string; to: string } | null>(null)
  const onRange = useCallback((from: string, to: string) => setRange({ from, to }), [])
  const from = range?.from ?? '0000-00-00'
  const to = range?.to ?? '0000-00-00'
  const { data: shifts } = useShifts(from, to, staff.id, !!range, { keepPrevious: true })
  // The classes and their days in: their paid time starts before their first class and ends with their last.
  const days = usePayDays(from, to, staff.id, !!range && mode === 'paid', { keepPrevious: true })
  const cells = useMemo(() => {
    const m = new Map<string, DayCell>()
    const add = (d: string, minutes: number, label: string, tone: 'clock' | 'paid') => {
      const cell = m.get(d) ?? { minutes: 0, lines: [] }
      cell.minutes += minutes
      cell.lines!.push({ label, tone })
      if (cell.minutes > 0) m.set(d, cell)
    }
    const time = (ms: number) => formatInstantTime(ms, timezone)
    if (mode === 'clock') {
      for (const s of shifts) if (s.status === 'closed' && s.clockOutAt) add(s.dateKey, (s.clockOutAt.toMillis() - s.clockInAt.toMillis()) / 60000, boxRange(time(s.clockInAt.toMillis()), time(s.clockOutAt.toMillis())), 'clock')
      return m
    }
    const ratesFor = () => effectiveRates(staff, null)
    for (const l of payLines({ shifts, classes: days.classes, availability: days.availability, settings, ratesFor, from, to })) {
      if (l.open) continue
      if (l.type === 'extra') add(l.dateKey, l.segment.hours * 60, `Extra ${fmtHours(l.segment.hours * 60)}`, 'paid')
      else add(l.dateKey, (l.segment.endMs - l.segment.startMs) / 60000, boxRange(time(l.segment.startMs), time(l.segment.endMs)), 'paid')
    }
    return m
  }, [shifts, days.classes, days.availability, settings, timezone, staff, mode, from, to])
  const notes = {
    clock: 'Their time clocked in at the kiosk, and time entries added by admins.',
    paid: 'The time their clock-ins pay: a coach from shortly before their first class to the end of their last, with any extra time added.',
  }
  return <HoursCalendar cells={cells} tone={mode} onRange={onRange} footnote={notes[mode]} />
}
