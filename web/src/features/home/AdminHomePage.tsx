import { useCallback, useMemo, useState } from 'react'
import { LuCalendarDays, LuPlus } from 'react-icons/lu'
import { Link, useNavigate } from 'react-router'
import { formatInstant, nowMinutes, toInstant } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { useStaffList } from '@/features/data/hooks'
import { coachColor } from '@/features/schedule/seatParts'
import { useSessionDialog } from '@/features/schedule/useSessionDialog'
import type { ClockShift } from '@/features/timeclock/api'
import { useWebsiteMessages } from '@/features/website/api'
import { ClockOutDialog } from './ClockOutDialog'
import { InBuildingCard } from './InBuildingCard'
import { LatestScoresCard } from './LatestScoresCard'
import { RequestsCard } from '@/features/requests/OfficeRequests'
import { MessagesCard } from './MessagesCard'
import { NeedsYouCard } from './NeedsYouCard'
import { TodayCard } from './TodayCard'
import { useAttention } from './attention'
import { plural } from './parts'

function greeting(minutes: number) {
  if (minutes < 12 * 60) return 'Good morning'
  if (minutes < 17 * 60) return 'Good afternoon'
  return 'Good evening'
}

/**
 * Admin → Home (Round 3, option 1 "Today"): a calm agenda of today's classes with a red "now" line, the latest scores,
 * and a side rail with what needs the admin, the messages from the website, and who is in the building.
 */
export function AdminHomePage() {
  const { timezone, actor } = useBranch()
  const navigate = useNavigate()
  const attention = useAttention()
  const { today, now } = attention
  const nowMin = nowMinutes(timezone, new Date(now))
  const [fixing, setFixing] = useState<WithId<ClockShift> | null>(null)
  const sessionDialog = useSessionDialog({ source: 'manual' })
  const { data: staff } = useStaffList()
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff])
  const nameOf = useCallback((id: string, fallback?: string) => staffById.get(id)?.name ?? (fallback || 'Former staff'), [staffById])
  const messages = useWebsiteMessages()
  const newMessages = messages.data.filter((m) => m.status !== 'done').length
  const conflictMap = useMemo(() => new Map(attention.conflicts.map((k) => [k.v.c.id, k.conflicts])), [attention.conflicts])

  const classes = attention.byDate.get(today) ?? []
  const loading = attention.classesLoading
  const coachCount = new Set(classes.flatMap((v) => v.coaches.map((k) => k.staffId))).size
  const peopleToday = useMemo(() => attention.availability.filter((a) => a.dateKey === today), [attention.availability, today])
  const todaysClasses = useMemo(() => (attention.byDate.get(today) ?? []).map((v) => v.c), [attention.byDate, today])
  const roleOf = useCallback((id: string) => staffById.get(id)?.role, [staffById])

  const date = formatInstant(toInstant(today, 720, timezone), timezone, { weekday: 'long', month: 'long', day: 'numeric' })
  const firstName = actor.name.trim().split(/\s+/)[0]
  const needs = attention.total
  // A booking starts from the next half hour's class (inside the day's hours).
  const nextSlot = Math.ceil((nowMin + 1) / 30) * 30

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{date}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {greeting(nowMin)}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground" data-testid="home-summary">
            {loading
              ? 'Loading today…'
              : classes.length
                ? `${plural(classes.length, 'class')} with ${coachCount ? plural(coachCount, 'coach') : 'no coach'} in today.`
                : 'No classes today.'}{' '}
            {needs ? (
              <span className="font-medium text-foreground">
                {plural(needs, 'thing')} need{needs === 1 ? 's' : ''} you.
              </span>
            ) : attention.loading ? null : (
              'Nothing needs you right now.'
            )}{' '}
            {newMessages ? (
              <Link to="/admin/settings/website/messages" className="font-medium text-foreground underline-offset-2 hover:underline">
                {plural(newMessages, 'new message')} from the website.
              </Link>
            ) : null}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={`/admin/schedule/day/${today}`}>
              <LuCalendarDays /> Open schedule
            </Link>
          </Button>
          <Button onClick={() => sessionDialog.openCreate(null, today, nextSlot)}>
            <LuPlus /> Book a class
          </Button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="order-2 space-y-6 lg:order-1">
          <TodayCard
            classes={classes}
            loading={loading}
            today={today}
            nowMin={nowMin}
            hours={attention.hoursOf(today)}
            conflictsOf={(id) => conflictMap.get(id)}
            staffName={nameOf}
            staffColor={(id) => coachColor(id, staffById.get(id)?.color)}
            onOpen={(id) => navigate(`/admin/schedule/day/${today}?class=${id}`)}
          />
          <LatestScoresCard portal="admin" />
        </div>
        <div className="order-1 space-y-6 lg:order-2">
          <NeedsYouCard attention={attention} onFixClock={setFixing} />
          <RequestsCard />
          <MessagesCard messages={messages.data} loading={messages.loading} />
          <InBuildingCard
            shifts={attention.shifts}
            people={peopleToday}
            classes={todaysClasses}
            hours={attention.hoursOf(today)}
            today={today}
            nowMin={nowMin}
            nameOf={nameOf}
            colorOf={(id) => staffById.get(id)?.color || null}
            roleOf={roleOf}
          />
        </div>
      </div>
      <ClockOutDialog shift={fixing} onClose={() => setFixing(null)} />
      {sessionDialog.element}
    </div>
  )
}
