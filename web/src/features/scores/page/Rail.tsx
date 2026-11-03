import { type ReactNode, useRef, useState } from 'react'
import { LuChevronRight, LuCircleAlert, LuTrendingDown, LuTrendingUp, LuTrophy, LuUpload } from 'react-icons/lu'
import { type QuietStudent, type WeekNumbers, dayWords, shortDay } from '@shared/scores/feed'
import { type Evaluation, POSITION_COLORS, POSITION_LABELS, wholePer10 } from '@shared/shooting/evaluation'
import type { DateKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { one } from '@/features/reports/model'
import { initialsOf } from '@/features/schedule/seatParts'
import { cn } from '@/lib/utils'
import { ACCEPTED_FILES } from './files'

const plural = (n: number, word: string, words = `${word}s`) => `${n} ${n === 1 ? word : words}`

/** Up (good), down, or the same, with how much. */
function Change({ by, words, digits = false }: { by: number | null; words?: string; digits?: boolean }) {
  if (by === null) return null
  if (by === 0) return <span className="text-xs text-muted-foreground">Same as {words ?? 'before'}</span>
  const up = by > 0
  const Icon = up ? LuTrendingUp : LuTrendingDown
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap tabular-nums', up ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400')}>
      <Icon className="size-3.5" aria-hidden />
      {up ? '+' : '−'}
      {digits ? one(Math.abs(by)) : Math.abs(by)}
      {words ? ` from ${words}` : ''}
    </span>
  )
}

function Card({ title, aside, children, className, testId }: { title: string; aside?: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section className={cn('rounded-xl border bg-card p-4', className)} aria-label={title} data-testid={testId}>
      <h2 className="flex items-baseline justify-between gap-2 text-[13px] font-semibold text-muted-foreground">
        {title}
        {aside ? <span className="text-xs font-normal">{aside}</span> : null}
      </h2>
      {children}
    </section>
  )
}

/** A list in a card, its first few shown until asked for the rest; null while it's worked out. */
function Few<T>({ items, render, empty, first = 6 }: { items: readonly T[] | null; render: (item: T) => ReactNode; empty: string; first?: number }) {
  const [all, setAll] = useState(false)
  if (!items)
    return (
      <div className="mt-2 space-y-2" aria-busy>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    )
  if (!items.length) return <p className="mt-2 text-[13px] text-muted-foreground">{empty}</p>
  const shown = all ? items : items.slice(0, first)
  return (
    <>
      <ul className="mt-1.5">{shown.map(render)}</ul>
      {items.length > first ? (
        <Button variant="ghost" size="xs" className="mt-1 -ml-2 text-muted-foreground" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </Button>
      ) : null}
    </>
  )
}

const ITEM = 'grid w-[calc(100%+1rem)] -mx-2 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'

/**
 * Add scores' drop place: files dropped here (or anywhere on the page) or chosen are read, each filed in its student's
 * Drive folder with its result. `hot` while files are dragged over the page.
 */
export function DropCard({ hot, onFiles }: { hot: boolean; onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  // A phone or a tablet has nothing to drop: its files are chosen.
  const [touch] = useState(() => window.matchMedia('(pointer: coarse)').matches)
  return (
    <div
      className={cn('flex flex-col items-center gap-1.5 rounded-xl border-[1.5px] border-dashed bg-card px-4 py-5 text-center transition-colors', hot ? 'border-foreground/70 bg-muted' : 'border-border')}
      data-testid="scores-drop"
    >
      <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-muted">
        <LuUpload className="size-[18px]" aria-hidden />
      </span>
      <p className="font-semibold">{touch ? 'Add scores' : 'Drop files to add scores'}</p>
      <p className="text-[13px] leading-snug text-balance text-muted-foreground">SIUS PDFs, photos of paper cards, or a results sheet</p>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPTED_FILES}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length) onFiles(files)
        }}
        data-testid="scores-drop-input"
      />
      <Button variant="outline" size="sm" className="mt-2" onClick={() => input.current?.click()}>
        Choose files
      </Button>
    </div>
  )
}

/** The last seven days: how many results from how many students, against the week before, and each position's average. */
export function WeekCard({ week, today }: { week: WeekNumbers; today: DateKey }) {
  return (
    <Card title="Last 7 days" aside={`${shortDay(week.from, today)} – ${shortDay(week.to, today)}`} testId="scores-week">
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
        <span className="text-3xl leading-none font-semibold tracking-tight tabular-nums">{week.results}</span>
        <span className="text-[13px] text-muted-foreground">
          {week.results === 1 ? 'result' : 'results'} from {plural(week.students, 'student')}
        </span>
      </p>
      <p className="mt-1.5 min-h-4">
        <Change by={week.results - week.before} words="the week before" />
      </p>
      <div className="mt-3 border-t">
        <p className="pt-2.5 pb-0.5 text-xs text-muted-foreground">Average per 10 shots, by position</p>
        <ul>
          {week.positions.map((p) => (
            <li key={p.position} className="grid grid-cols-[auto_minmax(0,1fr)_auto_3.5rem] items-center gap-2 border-b py-2 text-[13.5px] last:border-b-0 last:pb-0">
              <span className="size-2 rounded-full" style={{ background: POSITION_COLORS[p.position] }} aria-hidden />
              <span className="truncate">
                {POSITION_LABELS[p.position]} <span className="text-xs text-muted-foreground">· {p.results}</span>
              </span>
              <span className="font-semibold tabular-nums">{p.average !== null ? one(p.average) : '—'}</span>
              <span className="text-right">
                <Change by={p.change} digits />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

/** The week's new personal bests; one opens its row in the list. */
export function BestsCard({ bests, today, nameOf, onOpen }: { bests: readonly WithId<Evaluation>[] | null; today: DateKey; nameOf: (e: WithId<Evaluation>) => string; onOpen: (id: string) => void }) {
  return (
    <Card title="New bests" aside="last 7 days" testId="scores-bests">
      <Few
        items={bests}
        empty="None in the last 7 days yet."
        render={(e) => (
          <li key={e.id}>
            <button type="button" className={ITEM} onClick={() => onOpen(e.id)} data-testid="scores-best">
              <span className="flex size-7 items-center justify-center rounded-full bg-amber-100 text-amber-800 ring-1 ring-amber-300/70 ring-inset dark:bg-amber-950/60 dark:text-amber-200 dark:ring-amber-800">
                <LuTrophy className="size-3.5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold">{nameOf(e)}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: POSITION_COLORS[e.position] }} aria-hidden />
                  <span className="truncate">
                    {POSITION_LABELS[e.position]} · {dayWords(e.dateKey, today)}
                  </span>
                </span>
              </span>
              <span className="text-[15px] font-semibold tabular-nums">{one(wholePer10(e) ?? 0)}</span>
            </button>
          </li>
        )}
      />
    </Card>
  )
}

/**
 * What needs a look: results marked Check in the last 30 days (each opens its row), and enrolled students without a
 * score for 30 days (each opens their scores).
 */
export function LookCard({
  checks,
  quiet,
  today,
  nameOf,
  studentOf,
  levelOf,
  onOpen,
  onStudent,
}: {
  checks: readonly WithId<Evaluation>[]
  /** Null while the older scores are read. */
  quiet: readonly QuietStudent[] | null
  today: DateKey
  nameOf: (e: WithId<Evaluation>) => string
  studentOf: (id: string) => { name: string; signUpDate: DateKey | null } | null
  levelOf: (id: string) => ReactNode
  onOpen: (id: string) => void
  onStudent: (id: string) => void
}) {
  return (
    <Card title="Needs a look" testId="scores-look">
      <h3 className="mt-3 text-xs font-semibold text-muted-foreground">To check · {checks.length}</h3>
      <Few
        items={checks}
        first={4}
        empty="Nothing to check in the last 30 days."
        render={(e) => (
          <li key={e.id}>
            <button type="button" className={cn(ITEM, 'items-start')} onClick={() => onOpen(e.id)} data-testid="scores-check">
              <LuCircleAlert className="mt-0.5 size-4 text-amber-600 dark:text-amber-400" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold">
                  {nameOf(e)} · {POSITION_LABELS[e.position]}
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{e.problems[0]}</span>
              </span>
              <LuChevronRight className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
            </button>
          </li>
        )}
      />
      <h3 className="mt-4 text-xs font-semibold text-muted-foreground">No score for 30 days{quiet ? ` · ${quiet.length}` : ''}</h3>
      <Few
        items={quiet}
        first={5}
        empty="Every enrolled student has a score from the last 30 days."
        render={(q) => {
          const s = studentOf(q.id)
          if (!s) return null
          return (
            <li key={q.id}>
              <button type="button" className={ITEM} onClick={() => onStudent(q.id)} data-testid="scores-quiet">
                <span className="flex size-7 items-center justify-center rounded-full bg-muted text-[10.5px] font-semibold text-muted-foreground">{initialsOf(s.name)}</span>
                {/* The level beside the name, as in the list, so the line under it has the card's width for its date. */}
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[13.5px] font-semibold">{s.name}</span>
                    {levelOf(q.id)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {q.last ? `Last score ${shortDay(q.last, today)} · ${q.days} days ago` : `No scores yet${s.signUpDate ? ` · joined ${shortDay(s.signUpDate, today)}` : ''}`}
                  </span>
                </span>
              </button>
            </li>
          )
        }}
      />
    </Card>
  )
}
