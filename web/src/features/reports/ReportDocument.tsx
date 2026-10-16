import { useEffect, useRef } from 'react'
import { LuArrowRight, LuCheck, LuCrosshair, LuFlag, LuGitCompareArrows, LuMessageSquareQuote, LuTable2, LuTarget, LuTrendingUp } from 'react-icons/lu'
import type { ProgressReportDoc } from '@shared/reports/types'
import { POSITIONS, POSITION_COLORS, POSITION_LABELS, type Position } from '@shared/shooting/evaluation'
import { formatDateKey, formatInstant } from '@shared/time'
import { SkyArcMark } from '@/components/app/SkyArcMark'
import { TargetPlot } from '@/features/scores/TargetPlot'
import { cn } from '@/lib/utils'
import { DistributionBar, TrendChart } from './charts'
import { EditableGoals, EditableList, EditableText, type EditApi } from './ReportEditors'
import { Comparison, Heading, KpiTile, PositionTable, type Tile, TrendChip } from './ReportParts'
import { one, signed, toDate, trendSeries } from './model'
import { ACCENT, INK } from './paper'

/** Letter minus the @page margins (report.css), in CSS pixels. */
const PRINT_WIDTH = 730
const PRINT_HEIGHT = 955
const PAGES = 2

/**
 * Before printing, each page is scaled (never below 70%) so it fills exactly one sheet whatever the length of its
 * text; after printing it's reset.
 */
function usePrintFit(root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const pages = () => [...(root.current?.querySelectorAll<HTMLElement>('.report-page') ?? [])]
    const fit = () => {
      for (const el of pages()) {
        el.style.zoom = ''
        el.style.maxWidth = 'none'
        let zoom = 1
        for (let i = 0; i < 5; i++) {
          el.style.width = `${PRINT_WIDTH / zoom}px`
          const next = Math.max(0.7, Math.min(1, PRINT_HEIGHT / el.scrollHeight))
          if (Math.abs(next - zoom) < 0.005) break
          zoom = next
        }
        el.style.width = `${PRINT_WIDTH / zoom}px`
        el.style.zoom = String(zoom)
      }
    }
    const reset = () => {
      for (const el of pages()) {
        el.style.width = ''
        el.style.maxWidth = ''
        el.style.zoom = ''
      }
    }
    const media = window.matchMedia('print')
    const onMedia = (e: MediaQueryListEvent) => (e.matches ? fit() : reset())
    media.addEventListener('change', onMedia)
    window.addEventListener('beforeprint', fit)
    window.addEventListener('afterprint', reset)
    return () => {
      media.removeEventListener('change', onMedia)
      window.removeEventListener('beforeprint', fit)
      window.removeEventListener('afterprint', reset)
    }
  }, [root])
}

/** The position with the most evaluations (ties: the better average). */
function mainPosition(r: ProgressReportDoc): Position | null {
  return [...r.facts.positions].sort((a, b) => b.evaluations - a.evaluations || (b.average ?? 0) - (a.average ?? 0))[0]?.position ?? null
}

/**
 * The family-facing progress report: page 1 is the summary, page 2 the details. The paper stays light in dark mode
 * and prints to clean Letter pages. With `edit`, the written sections are editable in place.
 */
export function ReportDocument({
  report: r,
  audience,
  timezone,
  logoUrl,
  edit,
}: {
  report: ProgressReportDoc
  audience: 'family' | 'staff'
  timezone: string
  logoUrl?: string | null
  edit?: EditApi | null
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  usePrintFit(rootRef)
  const n = edit?.narrative ?? r.narrative
  const f = r.facts
  const o = r.options
  const editing = !!edit
  const brand = r.snapshot?.academyName ?? ''
  const logo = logoUrl || r.snapshot?.logoUrl || null
  const prepared = toDate(r.sharedAt) ?? toDate(r.generatedAt)
  const preparedText = prepared ? formatInstant(prepared, timezone, { month: 'long', day: 'numeric', year: 'numeric' }) : formatDateKey(r.period.to, 'long')
  const contact = [brand, r.snapshot?.contact?.phone, r.snapshot?.contact?.email, r.snapshot?.contact?.website].filter(Boolean).join(' · ')
  const series = r.series ?? []
  const sius = series.filter((p) => p.source === 'sius')
  const prevShort = f.previous ? (/^[A-Z][a-z]+ \d{4}$/.test(f.previous.periodLabel) ? f.previous.periodLabel.slice(0, 3) : 'the last report') : null
  const show = (k: 'overview' | 'strengths' | 'focusAreas' | 'goals' | 'coachNote') => {
    const v = n[k]
    return editing || (Array.isArray(v) ? v.length > 0 : !!String(v ?? '').trim())
  }

  const tiles: Tile[] = [
    { label: 'Evaluations', value: String(f.evaluations.total), sub: { text: `${f.evaluations.shots} scored shots`, tone: 'flat' } },
    ...(f.average !== null
      ? [
          {
            label: 'Average per 10 shots',
            value: one(f.average),
            spark: series.map((p) => p.wholePer10),
            sub:
              f.deltaAverage !== null && prevShort
                ? { text: f.deltaAverage === 0 ? `same as ${prevShort}` : `${signed(f.deltaAverage)} vs. ${prevShort}`, tone: f.deltaAverage > 0 ? ('up' as const) : f.deltaAverage < 0 ? ('down' as const) : ('flat' as const) }
                : { text: 'out of 100', tone: 'flat' as const },
          },
        ]
      : []),
    ...(f.decimal !== null ? [{ label: 'Decimal average', value: one(f.decimal), spark: sius.map((p) => p.per10), sub: { text: 'SIUS results, out of 109', tone: 'flat' as const } }] : []),
    ...(f.innerTensPct !== null
      ? [{ label: 'Inner tens', value: `${f.innerTensPct}%`, spark: sius.map((p) => (p.innerTens !== null && p.shots ? (p.innerTens / p.shots) * 100 : null)), sub: { text: 'shots of 10.2 or better', tone: 'flat' as const } }]
      : []),
    ...(f.groupMm !== null ? [{ label: 'Group size', value: `${one(f.groupMm)} mm`, spark: sius.map((p) => p.groupMm), sub: { text: 'average; smaller is tighter', tone: 'flat' as const } }] : []),
    ...(o.showAttendance && f.attendance.percent !== null
      ? [{ label: 'Attendance', value: `${f.attendance.percent}%`, sub: { text: `${f.attendance.attended} of ${f.attendance.attended + f.attendance.missed} classes`, tone: 'flat' as const } }]
      : []),
  ]

  const trend = trendSeries(series)
  const main = mainPosition(r)
  // The target shows the position with the most SIUS shots.
  const targetPosition = POSITIONS.map((pos) => ({ pos, shots: sius.filter((p) => p.position === pos).flatMap((p) => p.marks) }))
    .filter((t) => t.shots.some((m) => m.a !== null))
    .sort((a, b) => b.shots.length - a.shots.length)[0]
  const compare = main ? series.filter((p) => p.position === main) : []
  const showTargets = o.showTargets && (!!targetPosition || f.distribution.tens + f.distribution.nines + f.distribution.eights + f.distribution.lower > 0)
  const level = f.trend?.level ?? null

  const footer = (page: number) => (
    <div className="mt-auto flex items-end justify-between gap-4 border-t pt-4 text-[11px]" style={{ borderColor: INK.hairline, color: INK.muted }}>
      <div>
        {contact ? (
          <div className="font-medium" style={{ color: INK.secondary }}>
            {contact}
          </div>
        ) : null}
        <div>Questions about this report? We’re happy to talk. · Prepared {preparedText}</div>
      </div>
      <div className="shrink-0 tabular-nums">
        Page {page} of {PAGES}
      </div>
    </div>
  )

  return (
    <div ref={rootRef} className="report-doc space-y-6 font-sans text-[#0b0b0b] antialiased print:space-y-0">
      {r.status === 'draft' ? <div className="report-watermark">Draft</div> : null}

      {/* ------------------------------------------------------------ page 1 */}
      <section className="report-page flex flex-col overflow-hidden">
        <div className="relative px-6 pt-8 pb-7 sm:px-12" style={{ background: `linear-gradient(180deg, ${ACCENT}0d, transparent)` }}>
          <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: ACCENT }} />
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              {logo ? (
                <img src={logo} alt="" className="size-11 shrink-0 rounded-xl border bg-white object-contain p-1" style={{ borderColor: INK.hairline }} />
              ) : (
                <SkyArcMark className="size-11" />
              )}
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[15px] font-semibold">{brand}</div>
                <div className="text-[11px]" style={{ color: INK.muted }}>
                  Progress report · {r.period.label}
                </div>
              </div>
            </div>
            <div className="hidden shrink-0 text-right text-[11px] sm:block" style={{ color: INK.muted }}>
              {r.student.lastName ? `Prepared for the ${r.student.lastName} family` : 'Prepared'}
              <div className="font-medium" style={{ color: INK.secondary }}>
                {preparedText}
              </div>
            </div>
          </div>
          <div className="mt-8 flex flex-wrap items-end justify-between gap-4 sm:flex-nowrap">
            <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
              <h1 className="text-[34px] leading-tight font-semibold tracking-tight" data-testid="report-student">
                {r.student.name}
              </h1>
              <div className="mt-1 text-[13px]" style={{ color: INK.secondary }}>
                {[r.student.level ? `Level: ${r.student.level}` : '', r.student.program ? `Program: ${r.student.program}` : '', `${f.evaluations.total} scored ${f.evaluations.total === 1 ? 'evaluation' : 'evaluations'}`]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            {o.showStatus && level ? (
              <div className="shrink-0 sm:text-right">
                <TrendChip level={level} audience={audience} />
                <div className="mt-1.5 text-[11px]" style={{ color: INK.muted }}>
                  From the scores across the period
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-1 flex-col px-6 pb-10 sm:px-12">
          <div className={cn('grid grid-cols-2 gap-3', tiles.length === 4 ? 'sm:grid-cols-4' : tiles.length === 5 ? 'sm:grid-cols-5' : 'sm:grid-cols-3')}>
            {tiles.map((t) => (
              <KpiTile key={t.label} tile={t} color={ACCENT} />
            ))}
          </div>

          {show('overview') ? (
            <div className="mt-8 break-inside-avoid print:mt-5">
              <Heading icon={LuCrosshair} accent={ACCENT}>
                This period at a glance
              </Heading>
              <EditableText k="overview" value={n.overview} edit={edit} className="mt-3 text-[15px] leading-[1.65]" placeholder="Three or four sentences: what was shot, how it went, and the next step." />
            </div>
          ) : null}

          {show('strengths') || show('focusAreas') ? (
            <div className="mt-7 grid gap-4 sm:grid-cols-2 print:mt-5">
              {show('strengths') ? (
                <div className="break-inside-avoid rounded-2xl p-5" style={{ background: '#0ca30c0d', boxShadow: 'inset 0 0 0 1px #0ca30c26' }}>
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#087a08]">
                    <LuTrendingUp className="size-4" /> Strengths
                  </div>
                  <EditableList k="strengths" label="Strength" items={n.strengths} edit={edit} icon={<LuCheck className="mt-0.5 size-4 shrink-0 text-[#0ca30c]" />} max={4} />
                </div>
              ) : null}
              {show('focusAreas') ? (
                <div className="break-inside-avoid rounded-2xl p-5" style={{ background: '#fab2190f', boxShadow: 'inset 0 0 0 1px #fab21933' }}>
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#8a5d00]">
                    <LuTarget className="size-4" /> Focus areas
                  </div>
                  <EditableList k="focusAreas" label="Focus area" items={n.focusAreas} edit={edit} icon={<LuArrowRight className="mt-0.5 size-4 shrink-0 text-[#c58a00]" />} max={3} />
                </div>
              ) : null}
            </div>
          ) : null}

          {series.length >= 2 || showTargets ? (
            <div className={cn('mt-8 grid gap-6 print:mt-5', series.length >= 2 && showTargets ? 'sm:grid-cols-[1.45fr_1fr]' : '')}>
              {series.length >= 2 ? (
                <div className="min-w-0 break-inside-avoid">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-[13px] font-semibold">Scores over time</h3>
                    <span className="text-[11px]" style={{ color: INK.muted }}>
                      per 10 shots
                    </span>
                  </div>
                  <TrendChart className="mt-2" series={trend} from={r.period.from} to={r.period.to} label={`Scores per 10 shots over ${r.period.label}`} />
                </div>
              ) : null}
              {showTargets ? (
                <div className="min-w-0 break-inside-avoid">
                  <h3 className="text-[13px] font-semibold">Where the shots went</h3>
                  {targetPosition ? (
                    <div className="mt-3 flex flex-col items-center gap-1">
                      <TargetPlot shots={targetPosition.shots} size={170} color={POSITION_COLORS[targetPosition.pos]} title={`${POSITION_LABELS[targetPosition.pos]}: ${targetPosition.shots.length} shots`} />
                      <div className="text-[11px]" style={{ color: INK.muted }}>
                        {POSITION_LABELS[targetPosition.pos]} · {targetPosition.shots.length} SIUS shots · the cross marks the average
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-4">
                    <DistributionBar {...f.distribution} />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="mt-10 print:mt-6">{footer(1)}</div>
        </div>
      </section>

      {/* ------------------------------------------------------------ page 2 */}
      <section className="report-page flex flex-col overflow-hidden">
        <div className="flex flex-1 flex-col px-6 pt-10 pb-10 sm:px-12">
          <div className="flex items-center justify-between text-[11px]" style={{ color: INK.muted }}>
            <span>
              {r.student.name} · {r.period.label}
            </span>
            <span>{brand}</span>
          </div>

          <div className="mt-6 break-inside-avoid">
            <Heading icon={LuTable2} accent={ACCENT}>
              By position
            </Heading>
            <div className="mt-4">
              <PositionTable positions={f.positions} />
            </div>
          </div>

          {o.showComparison && compare.length >= 2 && main ? (
            <div className="mt-9 break-inside-avoid print:mt-6">
              <Heading icon={LuGitCompareArrows} accent={ACCENT}>
                First vs latest · {POSITION_LABELS[main]}
              </Heading>
              <div className="mt-4">
                <Comparison a={compare[0]} b={compare[compare.length - 1]} labelA="First" labelB="Latest" />
              </div>
            </div>
          ) : null}

          {show('goals') ? (
            <div className="mt-9 break-inside-avoid print:mt-6">
              <Heading icon={LuFlag} accent={ACCENT}>
                Goals for next period
              </Heading>
              <EditableGoals goals={n.goals} edit={edit} accent={ACCENT} />
            </div>
          ) : null}

          {show('coachNote') ? (
            <figure className="mt-9 break-inside-avoid rounded-2xl p-6 print:mt-6" style={{ background: `${ACCENT}0a`, boxShadow: `inset 3px 0 0 ${ACCENT}` }}>
              <figcaption className="flex items-center gap-1.5 text-[13px] font-semibold">
                <LuMessageSquareQuote className="size-4" style={{ color: ACCENT }} /> A note from the coach
              </figcaption>
              {editing ? (
                <EditableText k="coachNote" value={n.coachNote} edit={edit} className="mt-2 text-[14.5px] leading-[1.65]" placeholder="A few warm words from the coach (left out of the report when empty)." />
              ) : (
                <blockquote className="mt-2 text-[14.5px] leading-[1.65]">“{n.coachNote}”</blockquote>
              )}
              <div className="mt-3 text-[12px]" style={{ color: INK.muted }}>
                {brand}
              </div>
            </figure>
          ) : null}

          <div className="mt-10 print:mt-6">{footer(2)}</div>
        </div>
      </section>
    </div>
  )
}
