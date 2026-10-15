import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { type DateKey, formatMinutes } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import type { ClockShift } from '@/features/timeclock/api'
import { cn } from '@/lib/utils'
import { dayLabel } from './NeedsYouCard'
import { PersonDot } from './parts'

/**
 * Who is clocked in now, and the coaches still expected today (first session
 * later, or a session already started without clocking in).
 */
export function InBuildingCard({
  shifts,
  sessions,
  today,
  nowMin,
  colorOf,
}: {
  shifts: WithId<ClockShift>[]
  sessions: WithId<Session>[]
  today: DateKey
  nowMin: number
  colorOf: (staffId: string) => string | null
}) {
  const navigate = useNavigate()
  const model = useMemo(() => {
    const open = shifts.filter((s) => s.status === 'open').sort((a, b) => a.clockInAt.toMillis() - b.clockInAt.toMillis())
    const inIds = new Set(open.map((s) => s.staffId))
    const coaches = new Map<string, { id: string; name: string; spans: [number, number][] }>()
    for (const s of sessions) {
      if (s.isDeleted || s.status === 'canceled') continue
      const t = coaches.get(s.coachId) ?? { id: s.coachId, name: s.coachName, spans: [] }
      t.spans.push([s.startMin, s.endMin])
      coaches.set(s.coachId, t)
    }
    // Not clocked in: a session running now (late), or the next one later today.
    const expected = [...coaches.values()]
      .filter((t) => !inIds.has(t.id))
      .map((t) => {
        const spans = t.spans.sort((a, b) => a[0] - b[0])
        const current = spans.find(([a, b]) => a <= nowMin && b > nowMin)
        const next = spans.find(([a]) => a > nowMin)
        return { id: t.id, name: t.name, late: !!current, at: current ? current[0] : (next?.[0] ?? -1), earlier: spans.some(([, b]) => b <= nowMin) }
      })
      .filter((t) => t.at >= 0)
      .sort((a, b) => Number(b.late) - Number(a.late) || a.at - b.at || a.name.localeCompare(b.name))
    const coachesIn = [...coaches.keys()].filter((id) => inIds.has(id)).length
    return { open, expected, coachesIn, scheduled: coaches.size }
  }, [shifts, sessions, nowMin])

  const employee = (id: string) => navigate(`/admin/employees/directory/${id}`)

  return (
    <section className="rounded-xl border bg-card p-4" data-testid="home-in-building">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">In the building</h2>
        <span className="text-xs text-muted-foreground">
          {model.scheduled ? `${model.coachesIn} of ${model.scheduled} coach${model.scheduled === 1 ? '' : 'es'}` : `${model.open.length} clocked in`}
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
            {model.expected.map((t) => {
              const late = t.late
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => employee(t.id)}
                    className={cn('-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2.5 rounded-md px-1.5 py-1 text-left hover:bg-muted/60', !late && 'opacity-70')}
                  >
                    <PersonDot name={t.name} color={colorOf(t.id)} />
                    {late ? (
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate text-sm">{t.name}</span>
                        <span className="block text-xs font-medium text-amber-700 tabular-nums dark:text-amber-400">
                          Not clocked in · class started {formatMinutes(t.at)}
                        </span>
                      </span>
                    ) : (
                      <>
                        <span className="flex-1 truncate text-sm">{t.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {t.earlier ? 'next' : 'first'} class {formatMinutes(t.at)}
                        </span>
                      </>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
    </section>
  )
}
