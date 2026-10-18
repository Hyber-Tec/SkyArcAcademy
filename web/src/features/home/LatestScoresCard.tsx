import { query, where } from 'firebase/firestore'
import { useMemo } from 'react'
import { LuArrowRight, LuTarget } from 'react-icons/lu'
import { Link } from 'react-router'
import { COL } from '@shared/paths'
import { type Evaluation, POSITION_COLORS, POSITION_LABELS, SOURCE_LABELS, evaluationPoints, per10, wholePer10 } from '@shared/shooting/evaluation'
import { addDays, diffDays, formatDateKey, todayKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Skeleton } from '@/components/ui/skeleton'
import { one } from '@/features/reports/model'
import { MiniTarget } from '@/features/scores/TargetPlot'
import { branchCol, useQuery } from '@/lib/firestore'

/** How far back staff's Home looks for results, and how many it shows. */
const DAYS = 14
const SHOWN = 8

const newestFirst = (a: Evaluation, b: Evaluation) =>
  b.dateKey.localeCompare(a.dateKey) || (b.timeMin ?? 0) - (a.timeMin ?? 0) || (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)

/**
 * Home's latest scores, for admins and coaches: the newest results across the academy (each SIUS result and paper card
 * of the last two weeks), each with its target in small, whose it is, the position and the score per 10 shots. A
 * result opens the student's Scores with it chosen.
 */
export function LatestScoresCard({ portal }: { portal: 'admin' | 'coach' }) {
  const { branchId, timezone } = useBranch()
  const today = todayKey(timezone)
  const from = addDays(today, -(DAYS - 1))
  const q = useMemo(() => query(branchCol(branchId, COL.evaluations), where('dateKey', '>=', from)), [branchId, from])
  const { data, loading } = useQuery<Evaluation>(q, `home-latest-scores-${branchId}-${from}`)
  const scored = useMemo(() => data.filter((e) => e.shots > 0), [data])
  const rows = useMemo(() => [...scored].sort(newestFirst).slice(0, SHOWN), [scored])
  const students = new Set(scored.map((e) => e.studentId)).size

  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-label="Latest scores" data-testid="latest-scores">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <LuTarget className="size-4 text-muted-foreground" /> Latest scores
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {loading ? ' ' : scored.length ? `${scored.length} in ${DAYS} days · ${students} ${students === 1 ? 'student' : 'students'}` : `Last ${DAYS} days`}
        </span>
      </div>
      {loading ? (
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[72px] rounded-lg" />
          ))}
        </div>
      ) : rows.length ? (
        <ul className="grid gap-px bg-border sm:grid-cols-2">
          {rows.map((e) => (
            <li key={e.id} className="bg-card">
              <ScoreTile e={e} to={`/${portal}/students/${e.studentId}/scores?score=${e.id}`} today={today} />
            </li>
          ))}
          {rows.length % 2 ? <li className="hidden bg-card sm:block" aria-hidden /> : null}
        </ul>
      ) : (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">No scores in the last {DAYS} days. SIUS results dropped in the Drive and paper cards show here.</p>
      )}
      {portal === 'admin' && rows.length ? (
        <Link to="/admin/students" className="flex items-center justify-center gap-1 border-t px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground">
          Every student’s scores <LuArrowRight className="size-3" />
        </Link>
      ) : null}
    </section>
  )
}

/** "Today", "Yesterday", "3 days ago" or "Oct 4". */
function whenLabel(d: string, today: string) {
  const ago = diffDays(d, today)
  if (ago <= 0) return 'Today'
  if (ago === 1) return 'Yesterday'
  if (ago < 7) return `${ago} days ago`
  return formatDateKey(d, 'monthDay')
}

function ScoreTile({ e, to, today }: { e: WithId<Evaluation>; to: string; today: string }) {
  const color = POSITION_COLORS[e.position]
  const points = evaluationPoints(e)
  const whole = wholePer10(e)
  const decimal = e.source === 'sius' ? per10(e.total, e.shots) : null
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40" data-testid="latest-score">
      {points.length ? (
        <MiniTarget points={points} color={color} size={52} className="shrink-0" label={`${e.studentName}'s ${POSITION_LABELS[e.position].toLowerCase()} shots`} />
      ) : (
        <span className="flex size-[52px] shrink-0 items-center justify-center rounded-full border text-[10px] text-muted-foreground">Total</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{e.studentName}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate">
            {POSITION_LABELS[e.position]} · {SOURCE_LABELS[e.source]}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">{whenLabel(e.dateKey, today)}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-lg leading-tight font-semibold tabular-nums">{whole !== null ? one(whole) : '—'}</p>
        <p className="text-[11px] text-muted-foreground tabular-nums">{decimal !== null ? `${one(decimal)} decimal` : 'per 10'}</p>
      </div>
    </Link>
  )
}
