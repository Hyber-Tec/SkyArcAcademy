import { useMemo, useState } from 'react'
import { LuCalendarDays, LuCalendarPlus, LuChevronDown, LuList } from 'react-icons/lu'
import { useSearchParams } from 'react-router'
import type { Lang } from '@shared/i18n'
import { addDays, todayKey } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { type AskPreset, AskForClassDialog } from '@/features/requests/AskForClassDialog'
import { FamilyRequestsPanel } from '@/features/requests/FamilyRequestsPanel'
import { useLang, useT } from '@/lib/lang'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'
import { type Family, andList, hasEnded, useFamily, useFamilySessions } from './data'
import { FamilyMonthCalendar } from './FamilyMonthCalendar'
import { ClassDetails, ClassList, ContactCard, KidFilter, NotLinked } from './FamilyWidgets'

/** Weeks of classes a list shows at first, and adds with "Show more". */
const STEP_WEEKS = 4

/** "Jiwoo’s and Minjun’s classes", "Jiwoo’s classes", "Your classes"; "Jiwoo, Minjun 학생의 …". */
function whose(f: Family, kid: string, lang: Lang): string {
  const ids = kid === 'all' ? f.kids.map((k) => k.id) : [kid]
  if (lang === 'ko') return f.who === 'student' ? '예정된 수업과 지난 수업이에요.' : `${andList(ids.map((id) => f.firstName(id)), 'ko')} 학생의 예정된 수업과 지난 수업이에요.`
  if (f.who === 'student') return 'Your classes, upcoming and past.'
  return `${andList(ids.map((id) => `${f.firstName(id)}’s`))} classes, upcoming and past.`
}

/**
 * Parent and Student → Classes: upcoming and past classes by day with their status in plain words, or the months
 * scrolling vertically; a class opens its details. Parents with more than one child pick whose (or everyone's).
 * The view, the list and the child are in the address (`?view=month`, `?when=past`, `?child=`), so links and Back
 * keep them.
 */
export function FamilyClassesPage() {
  const lang = useLang()
  const t = useT()
  const family = useFamily()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'month' ? 'month' : 'list'
  const when = params.get('when') === 'past' ? 'past' : 'upcoming'
  const childParam = params.get('child') ?? 'all'
  const kid = family.kids.some((k) => k.id === childParam) ? childParam : 'all'
  const ids = useMemo(() => (kid === 'all' ? family.ids : [kid]), [kid, family.ids])
  const now = useNow(30_000)
  const [open, setOpen] = useState<WithId<Session> | null>(null)
  // "Ask for a class": a makeup, a class moved, or an extra class (docs/DECISIONS.md §23).
  const [asking, setAsking] = useState<AskPreset | null>(null)

  const set = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) next.delete(k)
          else next.set(k, v)
        }
        return next
      },
      { replace: true },
    )

  if (family.notLinked) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <PageHeader title={t('Classes', '수업')} />
        <NotLinked family={family} />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title={t('Classes', '수업')}
        description={family.loading ? '\u00a0' : whose(family, kid, lang)}
        className="mb-4"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setAsking({ studentId: kid === 'all' ? undefined : kid })} disabled={family.loading} data-testid="ask-for-class-open">
              <LuCalendarPlus /> {t('Ask for a class', '수업 신청')}
            </Button>
            <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={(v) => v && set({ view: v === 'month' ? 'month' : null })} aria-label={t('View', '보기')}>
              <ToggleGroupItem value="list" aria-label={t('List', '목록')}>
                <LuList /> {t('List', '목록')}
              </ToggleGroupItem>
              <ToggleGroupItem value="month" aria-label={t('Month', '달력')}>
                <LuCalendarDays /> {t('Month', '달력')}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        }
      />
      <FamilyRequestsPanel family={family} ids={ids} onAsk={setAsking} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <KidFilter family={family} value={kid} onChange={(id) => set({ child: id === 'all' ? null : id })} />
        {view === 'list' ? (
          <div className="inline-flex rounded-lg bg-muted p-0.5 text-sm" role="group" aria-label={t('Which classes', '수업 구분')}>
            {(
              [
                ['upcoming', t('Upcoming', '예정된 수업')],
                ['past', t('Past', '지난 수업')],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={when === v}
                onClick={() => set({ when: v === 'past' ? 'past' : null })}
                className={cn('h-8 rounded-md px-3 font-medium whitespace-nowrap', when === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {view === 'list' ? (
        // A new list (whose, which) starts at its first weeks again.
        <ClassesList key={`${when}-${kid}`} family={family} ids={ids} showKid={family.kids.length > 1 && kid === 'all'} past={when === 'past'} now={now} onOpen={setOpen} />
      ) : (
        <FamilyMonthCalendar family={family} ids={ids} now={now} onOpen={setOpen} />
      )}
      <div className="mt-6">
        <ContactCard />
      </div>
      <ClassDetails session={open} family={family} now={now} onClose={() => setOpen(null)} onAsk={setAsking} />
      <AskForClassDialog open={asking !== null} onOpenChange={(o) => !o && setAsking(null)} family={family} preset={asking ?? undefined} />
    </div>
  )
}

/** Upcoming classes from now on, or past ones latest first, a few weeks at a time. */
function ClassesList({ family, ids, showKid, past, now, onOpen }: { family: Family; ids: string[]; showKid: boolean; past: boolean; now: number; onOpen: (s: WithId<Session>) => void }) {
  const { timezone } = useBranch()
  const t = useT()
  const today = todayKey(timezone, now)
  const [weeks, setWeeks] = useState(STEP_WEEKS)
  const from = past ? addDays(today, -weeks * 7) : today
  const to = past ? today : addDays(today, weeks * 7 - 1)
  const { data, loading } = useFamilySessions(ids, from, to, { keepPrevious: true })
  const sessions = data.filter((s) => (past ? hasEnded(s, now) : !hasEnded(s, now)))
  const first = loading && !data.length
  // Past classes go back only as far as the first class of the children shown.
  const firstClass = family.kids
    .filter((k) => ids.includes(k.id))
    .map((k) => k.firstSessionDate ?? '')
    .reduce((a, b) => (!a || (b && b < a) ? b : a), '')
  // Without a first class on record, earlier weeks are worth a look only while there are classes.
  const more = !past || (firstClass ? from > firstClass : sessions.length > 0)

  return (
    <div className="space-y-3">
      {first ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <ClassList
          sessions={sessions}
          family={family}
          showKid={showKid}
          now={now}
          today={today}
          past={past}
          onOpen={onOpen}
          empty={
            past
              ? more
                ? t(`No classes in the last ${weeks} weeks.`, `최근 ${weeks}주 동안 수업이 없어요.`)
                : t('No past classes yet.', '아직 지난 수업이 없어요.')
              : t(`No classes booked in the next ${weeks} weeks.`, `앞으로 ${weeks}주 동안 잡힌 수업이 없어요.`)
          }
        />
      )}
      {more ? (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setWeeks((w) => w + STEP_WEEKS)} disabled={loading}>
            <LuChevronDown /> {past ? t(`Show ${STEP_WEEKS} earlier weeks`, `이전 ${STEP_WEEKS}주 더 보기`) : t(`Show ${STEP_WEEKS} more weeks`, `${STEP_WEEKS}주 더 보기`)}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
