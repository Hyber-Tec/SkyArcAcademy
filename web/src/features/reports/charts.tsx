import { useId, useMemo, useState } from 'react'
import { type DateKey, diffDays, formatDateKey } from '@shared/time'
import { cn } from '@/lib/utils'
import { INK, RING_COLORS } from './paper'

/**
 * The report's charts, drawn by hand in SVG (no chart library). They sit on light "paper" in every theme, like the
 * printed report, so the position colors always clear contrast. Thin marks, solid hairline grids, a legend for more
 * than one series, labels only where they help, and every value is also in a table nearby.
 */

const round1 = (n: number) => Math.round(n * 10) / 10
const one = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/** A tiny trend line for a stat tile, stretched to the tile's width. */
export function Sparkline({ values, color, height = 18 }: { values: (number | null)[]; color: string; height?: number }) {
  const v = values.filter((x): x is number => x !== null)
  if (v.length < 2) return null
  const min = Math.min(...v)
  const max = Math.max(...v)
  const span = max - min || 1
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * 100).toFixed(2)},${(18 - ((x - min) / span) * 16).toFixed(2)}`)
  return (
    <svg viewBox="0 0 100 20" preserveAspectRatio="none" width="100%" height={height} aria-hidden className="block overflow-visible">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export interface TrendSeries {
  key: string
  label: string
  color: string
  points: { dateKey: DateKey; value: number; detail?: string }[]
}

/** Clean y-axis bounds around the values (scores per 10 shots, at most 100 when whole). */
function yBounds(values: number[], cap: number) {
  if (!values.length) return { lo: 0, hi: cap }
  const min = Math.min(...values)
  const max = Math.max(...values)
  let lo = Math.max(0, Math.floor((min - 3) / 5) * 5)
  let hi = Math.min(cap, Math.ceil((max + 2) / 5) * 5)
  if (hi - lo < 10) {
    lo = Math.max(0, hi - 10)
    if (hi - lo < 10) hi = lo + 10
  }
  return { lo, hi }
}

/**
 * Scores over time, one line per position, on one axis. Hover or focus (then ← →) shows every position's score on
 * that date; the latest value of each line is labeled at its end.
 */
export function TrendChart({
  series,
  from,
  to,
  cap = 100,
  height = 210,
  label,
  className,
}: {
  series: TrendSeries[]
  from: DateKey
  to: DateKey
  /** The top of the scale: 100 for whole scores, 109 for decimals. */
  cap?: number
  height?: number
  label: string
  className?: string
}) {
  const W = 640
  const H = height
  const L = 36
  const R = 596
  const T = 14
  const B = H - 28
  const clip = useId()
  const span = Math.max(1, diffDays(from, to))
  const x = (d: DateKey) => L + (Math.min(span, Math.max(0, diffDays(from, d))) / span) * (R - L)
  const all = series.flatMap((s) => s.points.map((p) => p.value))
  const { lo, hi } = yBounds(all, cap)
  const y = (v: number) => B - ((v - lo) / (hi - lo || 1)) * (B - T)
  const step = hi - lo <= 20 ? 5 : 10
  const ticks: number[] = []
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t)
  const dates = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p.dateKey)))].sort(), [series])
  const [active, setActive] = useState<number | null>(null)
  const activeDate = active !== null ? dates[active] : null

  // Date labels: the first and last day, and the evaluation dates in between when they have room.
  const labels: DateKey[] = []
  for (const d of [from, ...dates, to]) {
    if (labels.includes(d)) continue
    if (labels.some((l) => Math.abs(x(l) - x(d)) < 62)) {
      if (d === to) {
        labels.pop()
        labels.push(d)
      }
      continue
    }
    labels.push(d)
  }

  const nearest = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W
    let best = 0
    let dist = Infinity
    dates.forEach((d, i) => {
      const dx = Math.abs(x(d) - px)
      if (dx < dist) {
        dist = dx
        best = i
      }
    })
    return dates.length ? best : null
  }

  const ends = series
    .filter((s) => s.points.length)
    .map((s) => ({ s, last: s.points[s.points.length - 1] }))
    .sort((a, b) => y(a.last.value) - y(b.last.value))
  // End labels only when they don't collide; the legend and the readout carry the rest.
  const endLabels = ends.filter((e, i) => i === 0 || Math.abs(y(e.last.value) - y(ends[i - 1].last.value)) >= 13)

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={label}
        tabIndex={dates.length ? 0 : undefined}
        className="block touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-[#2f68c4]/40"
        onPointerMove={(e) => setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive((a) => a ?? (dates.length ? dates.length - 1 : null))}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (!dates.length) return
          if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? dates.length) - 1))
          if (e.key === 'ArrowRight') setActive((a) => Math.min(dates.length - 1, (a ?? -1) + 1))
        }}
      >
        <defs>
          <clipPath id={clip}>
            <rect x={L - 6} y={T - 6} width={R - L + 12} height={B - T + 12} />
          </clipPath>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={R} y1={y(t)} y2={y(t)} stroke={INK.hairline} strokeWidth="1" />
            <text x={L - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill={INK.muted} className="tabular-nums">
              {t}
            </text>
          </g>
        ))}
        {labels.map((d) => (
          <text key={d} x={x(d)} y={H - 8} textAnchor={d === from ? 'start' : d === to ? 'end' : 'middle'} fontSize="10" fill={INK.muted}>
            {formatDateKey(d, 'monthDay')}
          </text>
        ))}
        {activeDate ? <line x1={x(activeDate)} x2={x(activeDate)} y1={T - 4} y2={B} stroke={INK.secondary} strokeWidth="1" opacity=".5" /> : null}
        <g clipPath={`url(#${clip})`}>
          {series.map((s) => (
            <g key={s.key}>
              {s.points.length > 1 ? (
                <path
                  d={s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.dateKey).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
              {s.points.map((p, i) => (
                <circle key={i} cx={x(p.dateKey)} cy={y(p.value)} r={activeDate === p.dateKey ? 5.5 : 4} fill={s.color} stroke={INK.paper} strokeWidth="2" />
              ))}
            </g>
          ))}
        </g>
        {endLabels.map(({ s, last }) => (
          <text key={s.key} x={Math.min(R + 4, x(last.dateKey) + 8)} y={y(last.value) + 3.5} fontSize="11" fontWeight="600" fill={INK.secondary} className="tabular-nums">
            {one(last.value)}
          </text>
        ))}
      </svg>
      {activeDate ? (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-lg border border-[#e3e1da] bg-white px-3 py-2 text-[12px] text-[#0b0b0b] shadow-md print:hidden"
          style={{ left: `${Math.min(70, Math.max(2, (x(activeDate) / W) * 100 - 12))}%` }}
          role="status"
        >
          <div className="mb-1 text-[11px] text-[#7d7a72]">{formatDateKey(activeDate, 'weekdayMedium')}</div>
          {series.map((s) => {
            const here = s.points.filter((p) => p.dateKey === activeDate)
            if (!here.length) return null
            return here.map((p, i) => (
              <div key={`${s.key}-${i}`} className="flex items-center gap-2">
                <span className="h-0.5 w-3 shrink-0 rounded" style={{ background: s.color }} />
                <span className="font-semibold tabular-nums">{one(p.value)}</span>
                <span className="text-[#52514e]">{s.label}</span>
                {p.detail ? <span className="text-[#7d7a72]">{p.detail}</span> : null}
              </div>
            ))
          })}
        </div>
      ) : null}
      {series.length > 1 ? <ChartLegend items={series.map((s) => ({ key: s.key, label: s.label, color: s.color }))} /> : null}
    </div>
  )
}

/** A legend whose keys mirror the marks (short lines for lines, squares for bars); the text stays in ink. */
export function ChartLegend({ items, shape = 'line' }: { items: { key: string; label: string; color: string; value?: string }[]; shape?: 'line' | 'square' }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[#52514e]">
      {items.map((i) => (
        <li key={i.key} className="flex items-center gap-1.5">
          <span className={shape === 'line' ? 'h-0.5 w-3.5 rounded' : 'size-2.5 rounded-[3px]'} style={{ background: i.color }} />
          {i.label}
          {i.value ? <span className="font-medium text-[#0b0b0b] tabular-nums">{i.value}</span> : null}
        </li>
      ))}
    </ul>
  )
}

/** Every counted shot by whole score, as one bar (2 px gaps between parts) with a legend of counts. */
export function DistributionBar({ tens, nines, eights, lower }: { tens: number; nines: number; eights: number; lower: number }) {
  const total = tens + nines + eights + lower
  if (!total) return null
  const parts = [
    { key: 'tens', label: '10', n: tens, color: RING_COLORS.tens },
    { key: 'nines', label: '9', n: nines, color: RING_COLORS.nines },
    { key: 'eights', label: '8', n: eights, color: RING_COLORS.eights },
    { key: 'lower', label: '7 or less', n: lower, color: RING_COLORS.lower },
  ]
  const shown = parts.filter((p) => p.n > 0)
  const pct = (n: number) => `${round1((n / total) * 100)}%`
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label}: ${p.n} shots`).join(', ')}>
        {shown.map((p) => (
          <span key={p.key} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(p.n / total) * 100}%`, background: p.color }} title={`${p.label}: ${p.n} shots (${pct(p.n)})`} />
        ))}
      </div>
      <ChartLegend shape="square" items={parts.map((p) => ({ key: p.key, label: p.label, color: p.color, value: `${p.n} · ${pct(p.n)}` }))} />
    </div>
  )
}
