import { useEffect, useMemo, useRef } from 'react'
import { LuBan, LuCalendarCheck, LuCalendarClock, LuLock } from 'react-icons/lu'
import { useSearchParams } from 'react-router'
import { availabilityGaps, dayHours, effectiveLockDays, lastAnswered } from '@shared/availability'
import { type DateKey, addDays, formatDateKey, isDateKey, todayKey } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { Button } from '@/components/ui/button'
import { useAvailability, useDayConfigs } from '@/features/data/hooks'
import { NOT_LINKED, useMyStaff } from '@/features/coach/hooks'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'
import { AvailabilityCalendar, type AvailabilityCalendarHandle } from './AvailabilityCalendar'

/** How far "Set through" looks ahead. */
const HORIZON_DAYS = 180

/** 14 → "2 weeks", 10 → "10 days". */
function span(days: number): string {
  if (days % 7 === 0) return days === 7 ? 'week' : `${days / 7} weeks`
  return `${days} days`
}

/**
 * Coach → Availability: where the coach stands (how far ahead it's set and
 * which open days in the notice window still need an answer: times, or not
 * available), then the calendar. `?date=` opens that day (links from Home).
 */
export function CoachAvailabilityPage() {
  const { staffId, settings, timezone } = useBranch()
  const { data: staff } = useMyStaff()
  const calendar = useRef<AvailabilityCalendarHandle>(null)
  const [params, setParams] = useSearchParams()
  const now = useNow()
  const today = todayKey(timezone, now)
  const until = addDays(today, HORIZON_DAYS)
  const { map: availability, loading } = useAvailability(staffId, today, until)
  const { map: dayConfigs } = useDayConfigs(today, until)
  const a = settings.availability
  const lockDays = effectiveLockDays(settings)
  // A branch whose lead time is "Do nothing" doesn't ask for notice: no reminder days, no "all set".
  const asksNotice = a.leadTimeEnforcement !== 'off'

  const status = useMemo(() => {
    const hoursOf = (d: DateKey) => dayHours(d, settings, dayConfigs)
    // Days marked not available are answered too.
    const lastSet = lastAnswered(availability, hoursOf)
    const gaps = availabilityGaps({ today, timeZone: timezone, settings, dayConfigs, dayOn: (d) => availability.get(d), now: new Date(now) })
    return { lastSet, gaps }
  }, [availability, dayConfigs, settings, today, timezone, now])

  // Links from Home: open the asked day once, then drop it from the address.
  const asked = params.get('date')
  useEffect(() => {
    if (!asked || !isDateKey(asked)) return
    calendar.current?.openDay(asked)
    setParams(
      (p) => {
        p.delete('date')
        return p
      },
      { replace: true },
    )
  }, [asked, setParams])

  if (!staffId) return <p className="text-sm text-muted-foreground">{NOT_LINKED}</p>
  const { lastSet, gaps } = status
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Availability"
        description={
          <>
            {asksNotice ? (
              <>
                Set your availability at least <span className="font-medium text-foreground">{a.leadTimeDays} days</span> in advance.{' '}
              </>
            ) : null}
            {lockDays > 0 ? (
              <>
                Changes within <span className="font-medium text-foreground">{lockDays} days</span> need an admin.
              </>
            ) : asksNotice ? null : (
              'Past days can’t be changed.'
            )}
          </>
        }
      />
      <section
        className={cn(
          'mb-5 flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center',
          gaps.length ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20' : 'bg-card',
        )}
        aria-label="Where your availability stands"
        data-testid="availability-status"
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg',
              gaps.length ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
            )}
          >
            {gaps.length ? <LuCalendarClock className="size-4" /> : <LuCalendarCheck className="size-4" />}
          </span>
          <div className="min-w-0 text-sm leading-snug">
            <p className="font-medium">
              {loading ? 'Checking your availability…' : lastSet ? `Set through ${formatDateKey(lastSet, 'weekdayMedium')}` : 'No availability set ahead yet'}
              {!loading && lastSet && lastSet.slice(0, 4) !== today.slice(0, 4) ? `, ${lastSet.slice(0, 4)}` : ''}
            </p>
            <p className={cn('mt-0.5', gaps.length ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground')}>
              {loading
                ? ' '
                : !asksNotice
                  ? 'Add the days and times you can teach.'
                  : gaps.length
                  ? `${gaps.length} open ${gaps.length === 1 ? 'day' : 'days'} in the next ${span(a.leadTimeDays)} ${gaps.length === 1 ? 'isn’t' : 'aren’t'} set yet: give your times, or mark ${gaps.length === 1 ? 'it' : 'them'} not available.`
                  : lockDays >= a.leadTimeDays
                    ? `The next ${span(a.leadTimeDays)} are locked. Ask an admin to change them.`
                    : `The next ${span(a.leadTimeDays)} are set. Days within ${lockDays} days are locked.`}
            </p>
          </div>
        </div>
        {gaps.length ? (
          <div className="flex flex-col gap-2 sm:max-w-[55%] sm:items-end">
            <ul className="flex flex-wrap gap-1.5 sm:justify-end" aria-label="Days not set yet">
              {gaps.map((d) => (
                <li key={d}>
                  <button
                    type="button"
                    onClick={() => calendar.current?.openDay(d)}
                    className="h-7 rounded-full border border-amber-300 bg-background px-3 text-xs font-medium text-amber-900 tabular-nums hover:bg-amber-100 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950/60"
                  >
                    {formatDateKey(d, 'weekdayMedium')}
                  </button>
                </li>
              ))}
            </ul>
            <Button variant="outline" size="sm" className="self-start sm:self-end" onClick={() => calendar.current?.markNotAvailable(gaps)} data-testid="gaps-not-available">
              <LuBan /> {gaps.length === 1 ? 'Not available that day' : `Not available on all ${gaps.length}`}
            </Button>
          </div>
        ) : lockDays > 0 ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <LuLock className="size-3.5" /> Locked through {formatDateKey(addDays(today, lockDays), 'monthDay')}
          </span>
        ) : null}
      </section>
      <AvailabilityCalendar ref={calendar} staffId={staffId} staffName={staff?.name ?? ''} staffRole="coach" mode="coach" />
    </div>
  )
}
