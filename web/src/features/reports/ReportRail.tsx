import { LuCircleAlert, LuExternalLink } from 'react-icons/lu'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { type ReportOptions, trendLabel } from '@shared/reports/types'
import { POSITION_COLORS, POSITION_LABELS } from '@shared/shooting/evaluation'
import { formatDateKey, formatInstant } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { setOption } from './api'
import { TrendChip } from './ReportParts'
import { type Report, errorMessage, one, signed, toDate } from './model'

const OPTIONS: [keyof ReportOptions, string][] = [
  ['showStatus', 'Trend'],
  ['showTargets', 'Where the shots went'],
  ['showComparison', 'First vs latest'],
  ['showAttendance', 'Attendance'],
]

/** Staff only: why the trend is what it is, what to check, what the report is built from, and what it shows. */
export function ReportRail({
  report: r,
  portal,
  mayEdit,
  stale,
  problems,
  onRefresh,
}: {
  report: Report
  portal: 'admin' | 'coach'
  mayEdit: boolean
  /** The student's evaluations in the period changed after the report was made. */
  stale: boolean
  /** Evaluations in the period with something to check from when they were read. */
  problems: number
  onRefresh: () => void
}) {
  const { branchId, actor, timezone } = useBranch()
  const f = r.facts
  const level = f.trend?.level ?? null
  const generated = toDate(r.generatedAt)
  const edited = Object.values(r.narrativeMeta?.sections ?? {}).some((m) => m?.source === 'staff')
  const unmarked = f.attendance?.unmarked ?? 0

  async function toggle(key: keyof ReportOptions, value: boolean) {
    try {
      await setOption(branchId, actor, r, key, value)
    } catch (e) {
      toast.error('Could not change that', { description: errorMessage(e, 'Try again.') })
    }
  }

  return (
    <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start" data-testid="report-rail">
      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">Trend</h2>
        <div className="mt-2">{level ? <TrendChip level={level} audience="staff" /> : <span className="text-sm text-muted-foreground">Not enough evaluations for a trend</span>}</div>
        {f.positions.some((p) => p.change !== null) ? (
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {f.positions
              .filter((p) => p.change !== null && p.first && p.latest)
              .map((p) => (
                <li key={p.position} className="flex items-center gap-1.5">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: POSITION_COLORS[p.position] }} />
                  {POSITION_LABELS[p.position]}: <span className="font-medium text-foreground tabular-nums">{one(p.first!.wholePer10)} → {one(p.latest!.wholePer10)}</span>
                  <span className="tabular-nums">({signed(p.change as number)} second half)</span>
                </li>
              ))}
          </ul>
        ) : null}
        <p className="mt-3 text-[11px] text-muted-foreground">
          {level ? `Families see “${trendLabel(level, 'family')}”. ` : ''}It’s worked out from the scores, never typed in.
        </p>
      </section>

      {stale || unmarked || problems ? (
        <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <h2 className="flex items-center gap-1.5 font-semibold">
            <LuCircleAlert className="size-4" /> Check before sharing
          </h2>
          {stale ? (
            <div>
              Some evaluations changed after this report was made.
              {mayEdit ? (
                <Button size="xs" variant="outline" className="ml-2 bg-white text-foreground" onClick={onRefresh}>
                  Update figures
                </Button>
              ) : null}
            </div>
          ) : null}
          {unmarked ? (
            <div>
              {unmarked} past {unmarked === 1 ? 'class has' : 'classes have'} no attendance taken, so attendance may read low.
            </div>
          ) : null}
          {problems ? (
            <div>
              {problems} {problems === 1 ? 'evaluation had' : 'evaluations had'} something to check when {problems === 1 ? 'it was' : 'they were'} read. See the student’s Scores.
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-xl border bg-card p-4 text-sm">
        <h2 className="font-semibold">Built from</h2>
        <dl className="mt-2 space-y-1.5 text-xs">
          <Row label="Period">{r.period.label}</Row>
          <Row label="Evaluations">
            {f.evaluations.total}
            {f.evaluations.total ? ` (${[f.evaluations.sius ? `${f.evaluations.sius} SIUS` : '', f.evaluations.paper ? `${f.evaluations.paper} paper` : ''].filter(Boolean).join(', ')})` : ''}
          </Row>
          <Row label="Prepared">
            {generated ? formatInstant(generated, timezone, { dateStyle: 'medium', timeStyle: 'short' }) : '—'} by {r.generatedBy?.name}
          </Row>
          <Row label="Written by">{edited ? 'Standard text, edited by staff' : 'Standard text'}</Row>
        </dl>
        {r.series?.length ? (
          <ul className="mt-3 max-h-56 divide-y overflow-y-auto rounded-lg border text-xs">
            {r.series.map((p) => (
              <li key={p.id}>
                <Link to={`/${portal}/students/${r.studentId}/scores`} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/50">
                  <span className="w-12 shrink-0 tabular-nums text-muted-foreground">{formatDateKey(p.dateKey, 'monthDay')}</span>
                  <span className="size-2 shrink-0 rounded-full" style={{ background: POSITION_COLORS[p.position] }} />
                  <span className="min-w-0 flex-1 truncate">
                    {POSITION_LABELS[p.position]} · {p.source === 'sius' ? 'SIUS' : 'Paper'}
                  </span>
                  <span className="tabular-nums">{one(p.wholePer10)}</span>
                  <LuExternalLink className="size-3 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-xl border bg-card p-4 text-sm">
        <h2 className="font-semibold">Show in the report</h2>
        <div className="mt-3 space-y-2.5">
          {OPTIONS.map(([key, label]) => (
            <label key={key} className={cn('flex items-center justify-between gap-3', !mayEdit && 'opacity-60')}>
              <span>{label}</span>
              <Switch checked={r.options?.[key] ?? true} disabled={!mayEdit} onCheckedChange={(v) => void toggle(key, v)} aria-label={label} />
            </label>
          ))}
        </div>
      </section>
    </aside>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}
