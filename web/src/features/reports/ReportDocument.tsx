import { useEffect, useRef } from 'react'
import { LuArrowRight, LuCheck, LuCrosshair, LuFlag, LuGitCompareArrows, LuMessageSquareQuote, LuTable2, LuTarget, LuTrendingUp, LuTrophy } from 'react-icons/lu'
import { type Lang, dateText, josa } from '@shared/i18n'
import type { ProgressReportDoc } from '@shared/reports/types'
import { POSITIONS, POSITION_COLORS, type Position } from '@shared/shooting/evaluation'
import { type DateKey, dateKeyOf, formatDateKey, formatInstant } from '@shared/time'
import { SkyArcLogo } from '@/components/app/SkyArcMark'
import { periodIn, positionIn } from '@/features/family/familyText'
import { useLang, useT } from '@/lib/lang'
import { cn } from '@/lib/utils'
import { DistributionBar, TrendChart } from './charts'
import { EditableGoals, EditableList, EditableText, type EditApi } from './ReportEditors'
import { Comparison, Heading, KpiTile, PositionTable, ReportTarget, type Tile, TrendChip } from './ReportParts'
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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** The previous report, named in a tile: "Sep" (a whole month) or "the last report"; "9월", "지난 리포트". */
function previousName(periodLabel: string, lang: Lang): string {
  const month = /^([A-Z][a-z]+) \d{4}$/.exec(periodLabel)?.[1]
  if (lang !== 'ko') return month ? periodLabel.slice(0, 3) : 'the last report'
  const m = month ? MONTHS.indexOf(month) + 1 : 0
  return m ? `${m}월` : '지난 리포트'
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
  edit,
}: {
  report: ProgressReportDoc
  audience: 'family' | 'staff'
  timezone: string
  edit?: EditApi | null
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  usePrintFit(rootRef)
  const lang = useLang()
  const t = useT()
  const n = edit?.narrative ?? r.narrative
  const f = r.facts
  const o = r.options
  const editing = !!edit
  const brand = r.snapshot?.academyName ?? ''
  const prepared = toDate(r.sharedAt) ?? toDate(r.generatedAt)
  const preparedText =
    lang === 'ko'
      ? dateText(prepared ? dateKeyOf(prepared, timezone) : r.period.to, 'long', 'ko')
      : prepared
        ? formatInstant(prepared, timezone, { month: 'long', day: 'numeric', year: 'numeric' })
        : formatDateKey(r.period.to, 'long')
  const period = periodIn(r.period, lang)
  const contact = [brand, r.snapshot?.contact?.phone, r.snapshot?.contact?.email, r.snapshot?.contact?.website].filter(Boolean).join(' · ')
  const series = r.series ?? []
  const sius = series.filter((p) => p.source === 'sius')
  const prevShort = f.previous ? previousName(f.previous.periodLabel, lang) : null
  const show = (k: 'overview' | 'strengths' | 'focusAreas' | 'goals' | 'coachNote') => {
    const v = n[k]
    return editing || (Array.isArray(v) ? v.length > 0 : !!String(v ?? '').trim())
  }

  const tiles: Tile[] = [
    { label: t('Evaluations', '기록'), value: String(f.evaluations.total), sub: { text: t(`${f.evaluations.shots} scored shots`, `총 ${f.evaluations.shots}발`), tone: 'flat' } },
    ...(f.average !== null
      ? [
          {
            label: t('Average per 10 shots', '10발 평균'),
            value: one(f.average),
            spark: series.map((p) => p.wholePer10),
            sub:
              f.deltaAverage !== null && prevShort
                ? {
                    text:
                      f.deltaAverage === 0
                        ? t(`same as ${prevShort}`, `${josa(prevShort, '과/와')} 같음`)
                        : t(`${signed(f.deltaAverage)} vs. ${prevShort}`, `${prevShort}보다 ${signed(f.deltaAverage)}`),
                    tone: f.deltaAverage > 0 ? ('up' as const) : f.deltaAverage < 0 ? ('down' as const) : ('flat' as const),
                  }
                : { text: t('out of 100', '100점 만점'), tone: 'flat' as const },
          },
        ]
      : []),
    ...(f.decimal !== null
      ? [{ label: t('Decimal average', '소수점 평균'), value: one(f.decimal), spark: sius.map((p) => p.per10), sub: { text: t('SIUS results, out of 109', 'SIUS 기록, 109점 만점'), tone: 'flat' as const } }]
      : []),
    ...(f.innerTensPct !== null
      ? [
          {
            label: t('Inner tens', '이너 텐'),
            value: `${f.innerTensPct}%`,
            spark: sius.map((p) => (p.innerTens !== null && p.shots ? (p.innerTens / p.shots) * 100 : null)),
            sub: { text: t('shots of 10.2 or better', '10.2점 이상인 발의 비율'), tone: 'flat' as const },
          },
        ]
      : []),
    ...(f.groupMm !== null
      ? [{ label: t('Group size', '탄착군 크기'), value: `${one(f.groupMm)} mm`, spark: sius.map((p) => p.groupMm), sub: { text: t('average; smaller is tighter', '평균, 작을수록 좋아요'), tone: 'flat' as const } }]
      : []),
    ...(o.showAttendance && f.attendance.percent !== null
      ? [
          {
            label: t('Attendance', '출석'),
            value: `${f.attendance.percent}%`,
            sub: {
              text: t(`${f.attendance.attended} of ${f.attendance.attended + f.attendance.missed} classes`, `수업 ${f.attendance.attended + f.attendance.missed}회 중 ${f.attendance.attended}회`),
              tone: 'flat' as const,
            },
          },
        ]
      : []),
  ]

  const trend = trendSeries(series, lang)
  const main = mainPosition(r)
  // The target shows the position with the most shots that have a place (SIUS, and paper cards scanned with the app),
  // its results played back one after another on screen.
  const placed = series.filter((p) => p.marks.some((m) => m.a !== null))
  const targetPosition = POSITIONS.map((pos) => {
    const points = placed.filter((p) => p.position === pos)
    return { pos, points, shots: points.flatMap((p) => p.marks.filter((m) => m.a !== null)) }
  })
    .filter((t) => t.shots.length > 0)
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
        {/* On a phone the two lines stack, rather than leave the dot at the end of one. */}
        <div>
          {t('Questions about this report? We’re happy to talk.', '리포트에 궁금한 점이 있으면 편하게 문의해 주세요.')}
          <span className="hidden sm:inline print:inline"> · </span>
          <span className="block sm:inline print:inline">{t(`Prepared ${preparedText}`, `작성일 ${preparedText}`)}</span>
        </div>
      </div>
      <div className="shrink-0 tabular-nums">{t(`Page ${page} of ${PAGES}`, `${page} / ${PAGES}`)}</div>
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
            <div className="min-w-0">
              <SkyArcLogo tone="black" className="h-16" />
              <div className="mt-2 text-[11px]" style={{ color: INK.muted }}>
                {t('Progress report', '성장 리포트')} · {period}
              </div>
            </div>
            <div className="hidden shrink-0 text-right text-[11px] sm:block" style={{ color: INK.muted }}>
              {lang === 'ko' ? '작성일' : r.student.lastName ? `Prepared for the ${r.student.lastName} family` : 'Prepared'}
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
                {[
                  r.student.level ? t(`Level: ${r.student.level}`, `레벨: ${r.student.level}`) : '',
                  r.student.program ? t(`Program: ${r.student.program}`, `프로그램: ${r.student.program}`) : '',
                  t(`${f.evaluations.total} scored ${f.evaluations.total === 1 ? 'evaluation' : 'evaluations'}`, `기록 ${f.evaluations.total}개`),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            {o.showStatus && level ? (
              <div className="shrink-0 sm:text-right">
                <TrendChip level={level} audience={audience} />
                <div className="mt-1.5 text-[11px]" style={{ color: INK.muted }}>
                  {t('From the scores across the period', '이 기간의 점수 기준')}
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
                {t('This period at a glance', '이번 기간 요약')}
              </Heading>
              <EditableText k="overview" value={n.overview} edit={edit} className="mt-3 text-[15px] leading-[1.65]" placeholder="Three or four sentences: what was shot, how it went, and the next step." />
            </div>
          ) : null}

          {show('strengths') || show('focusAreas') ? (
            <div className="mt-7 grid gap-4 sm:grid-cols-2 print:mt-5">
              {show('strengths') ? (
                <div className="break-inside-avoid rounded-2xl p-5" style={{ background: '#0ca30c0d', boxShadow: 'inset 0 0 0 1px #0ca30c26' }}>
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#087a08]">
                    <LuTrendingUp className="size-4" /> {t('Strengths', '잘하는 점')}
                  </div>
                  <EditableList k="strengths" label="Strength" items={n.strengths} edit={edit} icon={<LuCheck className="mt-0.5 size-4 shrink-0 text-[#0ca30c]" />} max={4} />
                </div>
              ) : null}
              {show('focusAreas') ? (
                <div className="break-inside-avoid rounded-2xl p-5" style={{ background: '#fab2190f', boxShadow: 'inset 0 0 0 1px #fab21933' }}>
                  <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#8a5d00]">
                    <LuTarget className="size-4" /> {t('Focus areas', '집중할 점')}
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
                    <h3 className="text-[13px] font-semibold">{t('Scores over time', '점수 변화')}</h3>
                    <span className="text-[11px]" style={{ color: INK.muted }}>
                      {t('per 10 shots', '10발 평균')}
                    </span>
                  </div>
                  <TrendChart className="mt-2" series={trend} from={r.period.from} to={r.period.to} label={t(`Scores per 10 shots over ${r.period.label}`, `${period} 10발 평균 점수 변화`)} />
                </div>
              ) : null}
              {showTargets ? (
                <div className="min-w-0 break-inside-avoid">
                  <h3 className="text-[13px] font-semibold">{t('Where the shots went', '탄착 위치')}</h3>
                  {targetPosition ? (
                    <div className="mt-3 flex flex-col items-center gap-1">
                      <ReportTarget
                        points={targetPosition.points}
                        size={170}
                        color={POSITION_COLORS[targetPosition.pos]}
                        title={t(`${positionIn(targetPosition.pos, lang)}: ${targetPosition.shots.length} shots`, `${positionIn(targetPosition.pos, lang)}: ${targetPosition.shots.length}발`)}
                        caption={t(
                          `${positionIn(targetPosition.pos, lang)} · ${targetPosition.shots.length} shots · the cross marks the average`,
                          `${positionIn(targetPosition.pos, lang)} · ${targetPosition.shots.length}발 · 십자 표시는 평균 탄착점이에요`,
                        )}
                      />
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
              {r.student.name} · {period}
            </span>
            <SkyArcLogo tone="black" className="h-9" />
          </div>

          <div className="mt-6 break-inside-avoid">
            <Heading icon={LuTable2} accent={ACCENT}>
              {t('By position', '자세별')}
            </Heading>
            <div className="mt-4">
              <PositionTable positions={f.positions} />
            </div>
          </div>

          {f.competitions?.length ? (
            <div className="mt-9 break-inside-avoid print:mt-6" data-testid="report-competitions">
              <Heading icon={LuTrophy} accent={ACCENT}>
                {t('Competitions', '대회')}
              </Heading>
              <table className="mt-4 w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px]" style={{ color: INK.muted }}>
                    <th className="pb-1.5 font-medium">{t('Date', '날짜')}</th>
                    <th className="pb-1.5 font-medium">{t('Match', '경기')}</th>
                    <th className="pb-1.5 font-medium">{t('Position', '자세')}</th>
                    <th className="pb-1.5 text-right font-medium">{t('Score', '점수')}</th>
                    <th className="pb-1.5 text-right font-medium">{t('Per 10', '10발 평균')}</th>
                    {f.competitions.some((c) => c.since) ? <th className="pb-1.5 text-right font-medium">{t('Since the last match', '직전 경기 대비')}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {f.competitions.map((c) => (
                    <tr key={c.id} className="border-t" style={{ borderColor: INK.hairline }}>
                      <td className="py-1.5 whitespace-nowrap">{dateText(c.dateKey, 'monthDay', lang)}</td>
                      <td className="py-1.5">{c.match || t('Competition', '대회')}</td>
                      <td className="py-1.5">{positionIn(c.position, lang)}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {c.decimal ? c.total.toFixed(1) : c.total}
                        {c.innerTens !== null ? `-${c.innerTens}` : ''}
                        <span style={{ color: INK.muted }}> / {c.shots}</span>
                      </td>
                      <td className="py-1.5 text-right font-semibold tabular-nums">{c.wholePer10.toFixed(1)}</td>
                      {f.competitions?.some((x) => x.since) ? (
                        <td
                          className="py-1.5 text-right tabular-nums"
                          title={
                            c.since
                              ? t(
                                  `${c.since.match || 'Competition'}, ${formatDateKey(c.since.dateKey, 'monthDay')}: ${c.since.wholePer10.toFixed(1)} per 10`,
                                  `${c.since.match || '대회'}, ${dateText(c.since.dateKey, 'monthDay', 'ko')}: 10발 평균 ${c.since.wholePer10.toFixed(1)}`,
                                )
                              : undefined
                          }
                        >
                          {c.since ? <SinceLast change={c.wholePer10 - c.since.wholePer10} dateKey={c.since.dateKey} /> : <span style={{ color: INK.muted }}>{t('First', '첫 경기')}</span>}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px]" style={{ color: INK.muted }}>
                {t(
                  'Matches are listed apart from practice; the figures above are from practice and evaluations. The score is the total, then the inner tens; each match is compared, per 10 shots, with the same position’s match before it.',
                  '대회 기록은 연습 기록과 따로 모았어요. 위 수치는 연습과 평가 기록으로 계산했어요. 점수는 ‘총점-이너 텐 수’로 적었고, 각 경기는 같은 자세의 직전 경기와 10발 평균으로 비교했어요.',
                )}
              </p>
            </div>
          ) : null}

          {o.showComparison && compare.length >= 2 && main ? (
            <div className="mt-9 break-inside-avoid print:mt-6">
              <Heading icon={LuGitCompareArrows} accent={ACCENT}>
                {t('First vs latest', '처음 vs 최근')} · {positionIn(main, lang)}
              </Heading>
              <div className="mt-4">
                <Comparison a={compare[0]} b={compare[compare.length - 1]} labelA={t('First', '처음')} labelB={t('Latest', '최근')} />
              </div>
            </div>
          ) : null}

          {show('goals') ? (
            <div className="mt-9 break-inside-avoid print:mt-6">
              <Heading icon={LuFlag} accent={ACCENT}>
                {t('Goals for next period', '다음 기간 목표')}
              </Heading>
              <EditableGoals goals={n.goals} edit={edit} accent={ACCENT} />
            </div>
          ) : null}

          {show('coachNote') ? (
            <figure className="mt-9 break-inside-avoid rounded-2xl p-6 print:mt-6" style={{ background: `${ACCENT}0a`, boxShadow: `inset 3px 0 0 ${ACCENT}` }}>
              <figcaption className="flex items-center gap-1.5 text-[13px] font-semibold">
                <LuMessageSquareQuote className="size-4" style={{ color: ACCENT }} /> {t('A note from the coach', '코치 한마디')}
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

/** A match against the same position's match before it: up green, down red, per 10 shots. */
function SinceLast({ change, dateKey }: { change: number; dateKey: DateKey }) {
  const lang = useLang()
  const v = Math.round(change * 10) / 10
  const color = v > 0 ? '#15803d' : v < 0 ? '#b91c1c' : INK.muted
  return (
    <span>
      <span className="font-semibold" style={{ color }}>
        {v > 0 ? `+${v.toFixed(1)}` : v < 0 ? `−${Math.abs(v).toFixed(1)}` : '±0'}
      </span>
      <span style={{ color: INK.muted }}>{lang === 'ko' ? ` (${dateText(dateKey, 'monthDay', 'ko')} 대비)` : ` vs ${formatDateKey(dateKey, 'monthDay')}`}</span>
    </span>
  )
}
