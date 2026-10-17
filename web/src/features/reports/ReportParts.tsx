import { useMemo } from 'react'
import type { IconType } from 'react-icons'
import { LuArrowDownRight, LuArrowRight, LuArrowUpRight } from 'react-icons/lu'
import { type EvaluationPoint, type PositionFacts, type TrendLevel, trendLabel } from '@shared/reports/types'
import { POSITION_COLORS, POSITION_LABELS } from '@shared/shooting/evaluation'
import { formatDateKey } from '@shared/time'
import { playPoints } from '@/features/scores/playback'
import { ShotReplay } from '@/features/scores/ShotReplay'
import { TargetPlot } from '@/features/scores/TargetPlot'
import { cn } from '@/lib/utils'
import { Sparkline } from './charts'
import { TREND_STYLE, one, signed } from './model'
import { INK } from './paper'

/** Pieces of the report document (ReportDocument.tsx), on its light paper. */

export interface Tile {
  label: string
  value: string
  spark?: (number | null)[]
  sub: { text: string; tone: 'up' | 'down' | 'flat' } | null
}

export function KpiTile({ tile: t, color }: { tile: Tile; color: string }) {
  const Arrow = t.sub?.tone === 'up' ? LuArrowUpRight : t.sub?.tone === 'down' ? LuArrowDownRight : null
  return (
    <div className="flex min-w-0 break-inside-avoid flex-col overflow-hidden rounded-xl border p-3.5" style={{ borderColor: INK.hairline }}>
      <div className="min-h-7 text-[11px] leading-tight font-medium" style={{ color: INK.secondary }}>
        {t.label}
      </div>
      <div className="mt-1 text-[26px] leading-none font-semibold tracking-tight">{t.value}</div>
      <div className="mt-2 h-[18px]">{t.spark ? <Sparkline values={t.spark} color={color} /> : null}</div>
      {t.sub ? (
        <div className={cn('mt-1.5 inline-flex items-start gap-1 text-[11px] leading-tight font-medium', t.sub.tone === 'up' ? 'text-[#087a08]' : t.sub.tone === 'down' ? 'text-[#b42318]' : 'text-[#7d7a72]')}>
          {Arrow ? <Arrow className="size-3.5 shrink-0" /> : null}
          {t.sub.text}
        </div>
      ) : null}
    </div>
  )
}

export function Heading({ icon: Icon, accent, children }: { icon: IconType; accent: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 break-after-avoid">
      <span className="flex size-7 items-center justify-center rounded-lg" style={{ background: `${accent}12`, color: accent }}>
        <Icon className="size-4" />
      </span>
      <h2 className="text-[18px] font-semibold tracking-tight">{children}</h2>
    </div>
  )
}

/** The trend, with an icon and words so it never relies on color. */
export function TrendChip({ level, audience, size = 'md' }: { level: TrendLevel; audience: 'family' | 'staff'; size?: 'sm' | 'md' }) {
  const s = TREND_STYLE[level]
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap', size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs')}
      style={{ background: s.bg, color: s.fg, boxShadow: `inset 0 0 0 1px ${s.ring}` }}
      data-testid="report-trend"
    >
      <s.icon className={size === 'md' ? 'size-4' : 'size-3.5'} />
      {trendLabel(level, audience)}
    </span>
  )
}

const dash = <span style={{ color: INK.muted }}>—</span>

/** Every position side by side: the table twin of the charts. Phones get a card per position instead of a wide table. */
export function PositionTable({ positions }: { positions: PositionFacts[] }) {
  return (
    <div>
      <div className="space-y-3 sm:hidden print:hidden">
        {positions.map((p) => {
          const cells: [string, React.ReactNode][] = [
            ['Average', p.average !== null ? <span key="average" className="font-semibold">{one(p.average)}</span> : dash],
            ['Decimal', p.decimal !== null ? one(p.decimal) : dash],
            ['Best', p.best ? `${one(p.best.wholePer10)} · ${formatDateKey(p.best.dateKey, 'monthDay')}` : dash],
            ['Latest', p.latest ? one(p.latest.wholePer10) : dash],
            ['Inner tens', p.innerTensPct !== null ? `${p.innerTensPct}%` : dash],
            ['Group', p.groupMm !== null ? `${one(p.groupMm)} mm` : dash],
          ]
          return (
            <div key={p.position} className="rounded-xl border p-3.5" style={{ borderColor: INK.hairline }}>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-[13px] font-semibold">
                  <span className="size-2.5 rounded-full" style={{ background: POSITION_COLORS[p.position] }} />
                  {POSITION_LABELS[p.position]}
                </span>
                <span className="text-[11px]" style={{ color: INK.muted }}>
                  {p.evaluations} {p.evaluations === 1 ? 'evaluation' : 'evaluations'}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2.5 text-[12.5px] tabular-nums">
                {cells.map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-[11px]" style={{ color: INK.muted }}>
                      {label}
                    </dt>
                    <dd className="mt-0.5">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )
        })}
      </div>
      <div className="-mx-1 hidden overflow-x-auto px-1 sm:block print:block">
        <table className="w-full min-w-[520px] border-collapse text-[12.5px]">
          <thead>
            <tr className="text-left text-[11px]" style={{ color: INK.muted }}>
              <th className="py-2 pr-3 font-medium">Position</th>
              <th className="py-2 pr-3 text-right font-medium">Evaluations</th>
              <th className="py-2 pr-3 text-right font-medium">Average</th>
              <th className="py-2 pr-3 text-right font-medium">Decimal</th>
              <th className="py-2 pr-3 text-right font-medium">Best</th>
              <th className="py-2 pr-3 text-right font-medium">Latest</th>
              <th className="py-2 pr-3 text-right font-medium">Inner tens</th>
              <th className="py-2 text-right font-medium">Group</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {positions.map((p) => (
              <tr key={p.position} className="border-t" style={{ borderColor: INK.hairline }}>
                <td className="py-2.5 pr-3">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <span className="size-2.5 rounded-full" style={{ background: POSITION_COLORS[p.position] }} />
                    {POSITION_LABELS[p.position]}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-right">{p.evaluations}</td>
                <td className="py-2.5 pr-3 text-right font-semibold">{p.average !== null ? one(p.average) : dash}</td>
                <td className="py-2.5 pr-3 text-right">{p.decimal !== null ? one(p.decimal) : dash}</td>
                <td className="py-2.5 pr-3 text-right">
                  {p.best ? (
                    <>
                      {one(p.best.wholePer10)} <span style={{ color: INK.muted }}>{formatDateKey(p.best.dateKey, 'monthDay')}</span>
                    </>
                  ) : (
                    dash
                  )}
                </td>
                <td className="py-2.5 pr-3 text-right">{p.latest ? one(p.latest.wholePer10) : dash}</td>
                <td className="py-2.5 pr-3 text-right">{p.innerTensPct !== null ? `${p.innerTensPct}%` : dash}</td>
                <td className="py-2.5 text-right">{p.groupMm !== null ? `${one(p.groupMm)} mm` : dash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px]" style={{ color: INK.muted }}>
        Scores are per 10 shots: whole numbers out of 100 for every result, and decimals (out of 109) for SIUS results.
      </p>
    </div>
  )
}

function Delta({ value, unit = '', goodWhenUp = true }: { value: number | null; unit?: string; goodWhenUp?: boolean }) {
  if (value === null) return null
  const up = value > 0
  const good = value === 0 ? null : up === goodWhenUp
  const Arrow = value === 0 ? LuArrowRight : up ? LuArrowUpRight : LuArrowDownRight
  return (
    <span
      className={cn('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums', good === null ? 'bg-[#f1f0eb] text-[#52514e]' : good ? 'bg-[#0ca30c14] text-[#087a08]' : 'bg-[#d03b3b14] text-[#b42318]')}
    >
      <Arrow className="size-3" />
      {value === 0 ? 'No change' : `${signed(value)}${unit}`}
    </span>
  )
}

const pct = (p: EvaluationPoint) => (p.innerTens !== null && p.shots ? Math.round((p.innerTens / p.shots) * 100) : null)

/**
 * A report's target: on screen its shots play back one by one (results in date order, each one's shots in the order
 * they were fired); printed and in the PDF, the still picture with every shot and the average point.
 */
export function ReportTarget({ points, color, size, title, caption }: { points: readonly EvaluationPoint[]; color: string; size: number; title: string; caption?: string }) {
  const shots = useMemo(() => playPoints(points), [points])
  const marks = useMemo(() => points.flatMap((p) => p.marks), [points])
  return (
    <>
      <ShotReplay shots={shots} color={color} size={size} tone="paper" caption={caption} className="print:hidden" />
      <div className="hidden flex-col items-center gap-1 print:flex">
        <TargetPlot shots={marks} size={size} color={color} title={title} />
        {caption ? (
          <div className="text-center text-[11px]" style={{ color: INK.muted }}>
            {caption}
          </div>
        ) : null}
      </div>
    </>
  )
}

/** A result's target (SIUS, or a paper card scanned with the phone app), or a note for a card typed in by hand. */
function picture(p: EvaluationPoint, label: string, color: string) {
  if (p.marks.some((m) => m.a !== null)) return <ReportTarget points={[p]} size={150} color={color} title={`${label}: ${p.marks.length} shots`} />
  return (
    <div className="flex aspect-square w-full max-w-[150px] items-center justify-center self-start rounded-full border border-dashed p-5 text-center text-[11px] leading-snug" style={{ borderColor: INK.hairline, color: INK.muted }}>
      Paper card: where the shots landed isn’t recorded
    </div>
  )
}

/**
 * Two evaluations of one position side by side: the scores, the change between them and both targets (SIUS). Used
 * by the report ("First vs latest") and the student's Scores tab (any two).
 */
export function Comparison({ a, b, labelA, labelB }: { a: EvaluationPoint; b: EvaluationPoint; labelA: string; labelB: string }) {
  const color = POSITION_COLORS[b.position]
  const targets = a.marks.some((m) => m.a !== null) || b.marks.some((m) => m.a !== null)
  const change = Math.round((b.wholePer10 - a.wholePer10) * 10) / 10
  const tens = pct(a) !== null && pct(b) !== null ? (pct(b) as number) - (pct(a) as number) : null
  const group = a.groupMm !== null && b.groupMm !== null ? Math.round((b.groupMm - a.groupMm) * 10) / 10 : null
  const side = (p: EvaluationPoint, label: string, align: 'left' | 'right') => (
    <div className={cn('min-w-0', align === 'right' && 'sm:text-right')}>
      <div className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: INK.muted }}>
        {label}
      </div>
      <div className="text-[12px]" style={{ color: INK.secondary }}>
        {formatDateKey(p.dateKey, 'medium')} · {p.source === 'sius' ? 'SIUS' : 'Paper'}
      </div>
      <div className="mt-1 text-[34px] leading-none font-semibold tracking-tight">{one(p.wholePer10)}</div>
      <div className="mt-1 text-[11.5px]" style={{ color: INK.secondary }}>
        per 10 shots{p.source === 'sius' ? ` · ${one(p.per10)} decimal` : ''}
      </div>
    </div>
  )
  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: INK.hairline }}>
      <div className="grid grid-cols-2 items-start gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        {side(a, labelA, 'left')}
        <div className="col-span-2 flex justify-center sm:col-span-1 sm:pb-6">
          <Delta value={change} />
        </div>
        <div className="col-start-2 row-start-1 sm:col-start-3">{side(b, labelB, 'right')}</div>
      </div>
      {targets ? (
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="flex min-w-0 justify-center">{picture(a, labelA, color)}</div>
          <div className="flex min-w-0 justify-center">{picture(b, labelB, color)}</div>
        </div>
      ) : null}
      {tens !== null || group !== null ? (
        <dl className="mt-4 grid gap-2 text-[12.5px] sm:grid-cols-2">
          {tens !== null ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-[#f7f6f2] px-3 py-2">
              <dt style={{ color: INK.secondary }}>Inner tens</dt>
              <dd className="flex items-center gap-2 tabular-nums">
                {pct(a)}% → {pct(b)}% <Delta value={tens} unit=" pts" />
              </dd>
            </div>
          ) : null}
          {group !== null ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-[#f7f6f2] px-3 py-2">
              <dt style={{ color: INK.secondary }}>Group size</dt>
              <dd className="flex items-center gap-2 tabular-nums">
                {one(a.groupMm as number)} → {one(b.groupMm as number)} mm <Delta value={group} unit=" mm" goodWhenUp={false} />
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  )
}
