import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { effectiveRanges } from '@shared/availability'
import type { DayHours } from '@shared/settings/defaults'
import { type DateKey, formatMinutes } from '@shared/time'
import type { Availability, WithId } from '@shared/types'
import type { ClockShift } from '@/features/timeclock/api'
import { cn } from '@/lib/utils'
import { dayLabel } from './NeedsYouCard'
import { PersonDot } from './parts'

/**
 * Who is clocked in now, and who else is in today (their hours, as on the schedule's Who's in): late when their hours
 * have started without a clock-in, or later today.
 */
export function InBuildingCard({
  shifts,
  people,
  hours,
  today,
  nowMin,
  nameOf,
  colorOf,
}: {
  shifts: WithId<ClockShift>[]
  /** Everyone's hours today (their availability). */
  people: readonly WithId<Availability>[]
  /** Today's opening hours. */
  hours: DayHours
  today: DateKey
  nowMin: number
  nameOf: (staffId: string, fallback?: string) => string
  colorOf: (staffId: string) => string | null
}) {
  const navigate = useNavigate()
  const model = useMemo(() => {
    const open = shifts.filter((s) => s.status === 'open').sort((a, b) => a.clockInAt.toMillis() - b.clockInAt.toMillis())
    const inIds = new Set(open.map((s) => s.staffId))
    const inToday = people
      .filter((a) => a.dateKey === today && !a.unavailable)
      .map((a) => ({ id: a.staffId, name: nameOf(a.staffId, a.staffName), spans: effectiveRanges(a.ranges ?? [], hours) }))
      .filter((t) => t.spans.length)
    // Not clocked in: their hours have started (late), or start later today.
    const expected = inToday
      .filter((t) => !inIds.has(t.id))
      .map((t) => {
        const current = t.spans.find((r) => r.startMin <= nowMin && r.endMin > nowMin)
        const next = t.spans.find((r) => r.startMin > nowMin)
        return { id: t.id, name: t.name, late: !!current, at: current ? current.startMin : (next?.startMin ?? -1), earlier: t.spans.some((r) => r.endMin <= nowMin) }
      })
      .filter((t) => t.at >= 0)
      .sort((a, b) => Number(b.late) - Number(a.late) || a.at - b.at || a.name.localeCompare(b.name))
    const clockedIn = inToday.filter((t) => inIds.has(t.id)).length
    return { open, expected, clockedIn, scheduled: inToday.length }
  }, [shifts, people, hours, today, nowMin, nameOf])

  const employee = (id: string) => navigate(`/admin/employees/directory/${id}`)

  return (
    <section className="rounded-xl border bg-card p-4" data-testid="home-in-building">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">In the building</h2>
        <span className="text-xs text-muted-foreground">
          {model.scheduled ? `${model.clockedIn} of ${model.scheduled} clocked in` : `${model.open.length} clocked in`}
        </span>
      </div>
      {model.open.length ? (
        <ul className="mt-3 space-y-1">
          {model.open.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => employee(s.staffId)} className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2.5 rounded-md px-1.5 py-1 text-left hover:bg-muted/60">
                <PersonDot name={s.staffName} color={colorOf(s.staffId)} />
                <span className="flex-1 truncate text-sm">{s.staffName}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  since {s.dateKey !== today ? `${dayLabel(s.dateKey, today).toLowerCase()} ` : ''}
                  {formatMinutes(s.inMin)}
                </span>
                <span className="size-2 rounded-full bg-emerald-500" aria-label="Clocked in" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No one is clocked in.</p>
      )}
      {model.expected.length ? (
        <>
          <div className="mt-4 border-t pt-3 text-xs font-medium text-muted-foreground">Later today</div>
          <ul className="mt-2 space-y-1">
            {model.expected.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => employee(t.id)}
                  className={cn('-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2.5 rounded-md px-1.5 py-1 text-left hover:bg-muted/60', !t.late && 'opacity-70')}
                >
                  <PersonDot name={t.name} color={colorOf(t.id)} />
                  {t.late ? (
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-sm">{t.name}</span>
                      <span className="block text-xs font-medium text-amber-700 tabular-nums dark:text-amber-400">Not clocked in · in from {formatMinutes(t.at)}</span>
                    </span>
                  ) : (
                    <>
                      <span className="flex-1 truncate text-sm">{t.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {t.earlier ? 'back' : 'in'} at {formatMinutes(t.at)}
                      </span>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}
