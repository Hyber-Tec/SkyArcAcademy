import { AnimatePresence, type MotionValue, animate, motion, useInView, useMotionValue, useMotionValueEvent, useScroll, useSpring, useTransform } from 'motion/react'
import { type CSSProperties, type ReactNode, type Ref, type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { LuArrowRight, LuCheck } from 'react-icons/lu'
import { PELLET_MM, ringRadiusMm, wholeScore } from '@shared/shooting/target'
import { cn } from '@/lib/utils'
import { LEVELS, type Level, type Rank } from '@/site/kit/content'
import { Reveal, useReduced } from '@/site/kit/motion'
import { useSite } from '@/site/kit/site'
import { T } from '../i18n'

/**
 * The path, drawn: a 10 m air rifle target (to ISSF scale, from the app's own target geometry) whose ten-shot group
 * tightens from level to level, next to the academy's ranks on their 3×10 score (from their site). The group is an
 * illustration, tuned so its own score lands in each level's rank range: 4.6 a shot (138 of 300, Scout), 6.1 (183,
 * Hunter), 7.8 (234, Marksman) and 9.3 (279, Expert). The numbers shown are always the drawn group's.
 */

const BASE: [number, number][] = [
  [0.18, -0.42],
  [-0.51, 0.22],
  [0.64, 0.31],
  [-0.12, 0.71],
  [0.42, -0.08],
  [-0.73, -0.36],
  [0.05, 0.12],
  [0.33, 0.58],
  [-0.29, -0.66],
  [0.81, -0.47],
]
/** The group's spread (mm) and centre per level: wide and off-centre at Launchpad, tight on the ten at Performance. */
const SPREAD = [21.8, 16.7, 9.9, 4.45]
const DRIFT: [number, number][] = [
  [3.6, -2.8],
  [2.1, 1.5],
  [0.9, -0.6],
  [0.12, 0.08],
]
const PELLET = PELLET_MM / 2
const lerp = (a: number, b: number, f: number) => a + (b - a) * f

/** A shot's decimal score from its distance to the centre (the inverse of the app's `radiusFromScore`). */
const decimalAt = (r: number) => Math.max(0, Math.min(10.9, Math.floor((10.95 - r / 2.5) * 10 + 1e-9) / 10))

export interface Group {
  shots: { x: number; y: number }[]
  cx: number
  cy: number
  radius: number
  /** Whole-number average per shot. */
  perShot: number
  /** The same pace over a 3×10 (30 shots), as the ranks count. */
  match: number
}

export function groupAt(level: number): Group {
  const v = Math.min(3, Math.max(0, level))
  const i = Math.min(2, Math.floor(v))
  const f = v - i
  const spread = lerp(SPREAD[i], SPREAD[i + 1], f)
  const cx = lerp(DRIFT[i][0], DRIFT[i + 1][0], f)
  const cy = lerp(DRIFT[i][1], DRIFT[i + 1][1], f)
  const shots = BASE.map(([x, y]) => ({ x: cx + x * spread, y: cy + y * spread }))
  const total = shots.reduce((s, p) => s + wholeScore(decimalAt(Math.hypot(p.x, p.y))), 0)
  const reach = Math.max(...BASE.map(([x, y]) => Math.hypot(x, y)))
  return { shots, cx, cy, radius: spread * reach + PELLET + 0.6, perShot: total / 10, match: Math.round((total / 10) * 30) }
}

/* ------------------------------------------------------------------ the ranks */

export interface Band {
  level: number
  rank: Rank
  from: number
  to: number
}
/** Scout has no score of its own (entry): it sits below 150. NCAA Precision is a separate discipline, drawn apart. */
export const BANDS: Band[] = [
  { level: 0, rank: LEVELS[0].ranks[0], from: 125, to: 150 },
  { level: 1, rank: LEVELS[1].ranks[0], from: 150, to: 175 },
  { level: 1, rank: LEVELS[1].ranks[1], from: 175, to: 200 },
  { level: 2, rank: LEVELS[2].ranks[0], from: 200, to: 225 },
  { level: 2, rank: LEVELS[2].ranks[1], from: 225, to: 250 },
  { level: 3, rank: LEVELS[3].ranks[0], from: 250, to: 275 },
  { level: 3, rank: LEVELS[3].ranks[1], from: 275, to: 300 },
]
const PRECISION = LEVELS[3].ranks[2]
export const rankAt = (score: number) => BANDS.reduce((found, b) => (score >= b.from ? b : found), BANDS[0])

/** Each level's colour, from warm stone to ink (Performance). */
export const LEVEL_FILL = ['bg-warm-2 text-ink', 'bg-[#e8e3da] text-ink', 'bg-[#d4cdc1] text-ink', 'bg-ink text-white']

/* ------------------------------------------------------------------ the target */

function TargetFace() {
  return (
    <>
      <rect x={-27.5} y={-27.5} width={55} height={55} rx={1.6} fill="#fff" stroke="rgb(10 10 10 / 0.1)" strokeWidth={0.14} />
      {[1, 2, 3].map((k) => (
        <circle key={k} r={ringRadiusMm(k)} fill="none" stroke="#0a0a0a" strokeOpacity={0.45} strokeWidth={0.13} />
      ))}
      <circle r={ringRadiusMm(4)} fill="#0a0a0a" />
      {[5, 6, 7, 8, 9].map((k) => (
        <circle key={k} r={ringRadiusMm(k)} fill="none" stroke="#fff" strokeOpacity={0.42} strokeWidth={0.13} />
      ))}
      <circle r={0.25} fill="#fff" />
      {[1, 2, 3, 4, 5, 6, 7, 8].map((k) => {
        const at = (ringRadiusMm(k) + ringRadiusMm(k + 1)) / 2
        const color = k >= 4 ? 'rgb(255 255 255 / 0.55)' : 'rgb(10 10 10 / 0.45)'
        return (
          <g key={k} style={{ fontFamily: 'var(--font-mono)' }} fontSize={1.45} fill={color} textAnchor="middle" dominantBaseline="central">
            <text x={-at} y={0}>
              {k}
            </text>
            <text x={at} y={0}>
              {k}
            </text>
            <text x={0} y={-at}>
              {k}
            </text>
            <text x={0} y={at}>
              {k}
            </text>
          </g>
        )
      })}
    </>
  )
}

function Shot({ i, level }: { i: number; level: MotionValue<number> }) {
  const cx = useTransform(level, (v) => groupAt(v).shots[i].x)
  const cy = useTransform(level, (v) => -groupAt(v).shots[i].y)
  return <motion.circle cx={cx} cy={cy} r={PELLET} fill="#fb0202" fillOpacity={0.78} stroke="#fff" strokeOpacity={0.95} strokeWidth={0.24} />
}

/** The target with the group for a level value (0 = Launchpad … 3 = Performance; in between while it moves). */
export function GroupTarget({ level, className, title }: { level: MotionValue<number>; className?: string; title?: string }) {
  const cx = useTransform(level, (v) => groupAt(v).cx)
  const cy = useTransform(level, (v) => -groupAt(v).cy)
  const r = useTransform(level, (v) => groupAt(v).radius)
  const a = useTransform(cx, (x) => x - 1.4)
  const b = useTransform(cx, (x) => x + 1.4)
  const c = useTransform(cy, (y) => y - 1.4)
  const d = useTransform(cy, (y) => y + 1.4)
  return (
    <svg viewBox="-28 -28 56 56" className={cn('block h-auto w-full', className)} role="img" aria-label={title}>
      <TargetFace />
      <motion.circle cx={cx} cy={cy} r={r} fill="none" stroke="#fb0202" strokeWidth={0.18} strokeDasharray="0.8 0.7" />
      {BASE.map((_, i) => (
        <Shot key={i} i={i} level={level} />
      ))}
      <motion.line x1={a} x2={b} y1={cy} y2={cy} stroke="#fff" strokeWidth={0.24} />
      <motion.line x1={cx} x2={cx} y1={c} y2={d} stroke="#fff" strokeWidth={0.24} />
    </svg>
  )
}

/** The drawn group's numbers, following the level value. */
function useGroupNumbers(level: MotionValue<number>) {
  const [g, setG] = useState(() => groupAt(level.get()))
  useMotionValueEvent(level, 'change', (v) => {
    const next = groupAt(v)
    setG((prev) => (prev.perShot === next.perShot && prev.match === next.match ? prev : next))
  })
  return g
}

/* ------------------------------------------------------------------ the ladder */

const AXIS_MIN = 125
const AXIS_MAX = 300
const pct = (v: number) => ((Math.min(AXIS_MAX, Math.max(AXIS_MIN, v)) - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * 100

/** The ranks standing up (Expert at the top), the level's ranks lit, a red marker at the group's 3×10 score. */
export function RankLadder({ level, active, className }: { level: MotionValue<number>; active: number; className?: string }) {
  const { t } = useSite()
  const bottom = useTransform(level, (v) => `${pct(groupAt(v).match)}%`)
  return (
    <div className={cn('flex flex-col', className)}>
      <div className={cn('mb-2 flex items-center justify-between gap-2 rounded-xl border border-dashed px-3 py-2 transition-[opacity,border-color,background-color] duration-500', active === 3 ? 'border-red/50 bg-red/[0.04] opacity-100' : 'border-ink/20 opacity-45')}>
        <span className="text-[12.5px] leading-tight font-semibold text-ink">{t(PRECISION.name)}</span>
        <span className="text-right text-[11px] leading-tight text-stone">{t(T.path.separate)}</span>
      </div>
      <div className="relative flex flex-1 gap-3">
        {/* The axis */}
        <div className="relative w-7 shrink-0" aria-hidden="true">
          {[150, 175, 200, 225, 250, 275, 300].map((v) => (
            <span key={v} className="absolute right-0 translate-y-1/2 font-mono text-[10.5px] leading-none text-stone tabular-nums" style={{ bottom: `${pct(v)}%` }}>
              {v}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          <ol className="absolute inset-0 flex flex-col-reverse gap-[3px]">
            {BANDS.map((b) => {
              const on = b.level === active
              return (
                <li
                  key={b.rank.name.en}
                  className={cn(
                    'flex min-h-0 flex-1 items-center justify-between gap-1.5 rounded-lg px-2 transition-[opacity,box-shadow] duration-500 xl:gap-2 xl:px-2.5',
                    LEVEL_FILL[b.level],
                    on ? 'opacity-100 shadow-[0_0_0_1.5px_rgb(10_10_10/0.9)]' : 'opacity-40',
                  )}
                >
                  <span className="truncate text-[12.5px] leading-none font-semibold">{t(b.rank.name)}</span>
                  <span className={cn('shrink-0 font-mono text-[10.5px] leading-none tabular-nums', b.level === 3 ? 'text-white/75' : 'text-ink/65')}>{b.level === 0 ? t(T.path.entry) : t(b.rank.range)}</span>
                </li>
              )
            })}
          </ol>
          {/* The marker: the drawn group's 3×10 score */}
          <motion.div className="pointer-events-none absolute -left-2 h-0 w-4" style={{ bottom }} aria-hidden="true">
            <div className="absolute top-0 left-0 size-3 -translate-y-1/2 rounded-full bg-red ring-2 ring-white" />
            <div className="absolute top-0 left-2 h-[2px] w-3 -translate-y-1/2 rounded-full bg-red" />
          </motion.div>
        </div>
      </div>
    </div>
  )
}

/** Phones and tablets: the ranks on one bar (each band is 25 points), the level's lit, the marker above it. */
function RankScale({ level, active, className }: { level: MotionValue<number>; active: number; className?: string }) {
  const { t } = useSite()
  const left = useTransform(level, (v) => `${pct(groupAt(v).match)}%`)
  return (
    <div className={className}>
      <p className="text-[11.5px] font-medium text-stone">{t(T.path.scale)}</p>
      <div className="relative mt-2 pt-4">
        <motion.div className="pointer-events-none absolute top-0 h-0 w-0" style={{ left }} aria-hidden="true">
          <span className="absolute top-0 left-0 size-3 -translate-x-1/2 rounded-full bg-red ring-2 ring-white" />
          <span className="absolute top-2.5 left-0 h-2 w-[2px] -translate-x-1/2 bg-red" />
        </motion.div>
        <ol className="flex h-8 gap-[3px]">
          {BANDS.map((b) => (
            <li
              key={b.rank.name.en}
              title={`${t(b.rank.name)} · ${b.level === 0 ? t(T.path.entry) : t(b.rank.range)}`}
              className={cn('flex-1 rounded-md transition-[opacity,box-shadow] duration-500', LEVEL_FILL[b.level], b.level === active ? 'opacity-100 shadow-[0_0_0_1.5px_rgb(10_10_10/0.9)]' : 'opacity-35')}
            >
              <span className="sr-only">
                {t(b.rank.name)} {b.level === 0 ? t(T.path.entry) : t(b.rank.range)}
              </span>
            </li>
          ))}
        </ol>
        <div className="relative mt-1.5 h-4 font-mono text-[10.5px] text-stone tabular-nums" aria-hidden="true">
          {[150, 200, 250, 300].map((v) => (
            <span key={v} className={cn('absolute top-0', v === 300 ? '-translate-x-full' : '-translate-x-1/2')} style={{ left: `${pct(v)}%` }}>
              {v}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ the readout */

function Readout({ level, className, compact = false }: { level: MotionValue<number>; className?: string; compact?: boolean }) {
  const { t } = useSite()
  const g = useGroupNumbers(level)
  const rank = rankAt(g.match)
  return (
    <dl className={cn(compact ? 'grid content-center gap-3' : 'grid grid-cols-[auto_auto_1fr] items-end gap-x-5 gap-y-1', className)}>
      <div>
        <dt className="text-[11.5px] font-medium text-stone">{t(T.path.perShot)}</dt>
        <dd className={cn('font-semibold tracking-tight text-ink tabular-nums', compact ? 'text-[26px] leading-tight' : 'text-[34px] leading-none')}>
          {g.perShot.toFixed(1)}
          <span className="ml-1 text-[13px] font-medium text-stone">/ 10</span>
        </dd>
      </div>
      <div>
        <dt className="text-[11.5px] font-medium text-stone">{t(T.path.match)}</dt>
        <dd className={cn('font-semibold tracking-tight text-ink tabular-nums', compact ? 'text-[26px] leading-tight' : 'text-[34px] leading-none')}>
          {g.match}
          <span className="ml-1 text-[13px] font-medium text-stone">/ 300</span>
        </dd>
      </div>
      <div className={compact ? '' : 'justify-self-end'}>
        <dt className="sr-only">{t(T.path.rank)}</dt>
        <dd>
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold', LEVEL_FILL[rank.level])}>
            <span className="size-1.5 rounded-full bg-red" aria-hidden="true" />
            {t(rank.rank.name)}
          </span>
        </dd>
      </div>
    </dl>
  )
}

/* ------------------------------------------------------------------ the home section's two layouts */

/** The panel that stays beside the levels on wide screens. */
function PathPanel({ level, active }: { level: MotionValue<number>; active: number }) {
  const { t } = useSite()
  const lv = LEVELS[active]
  return (
    <div className="rounded-[30px] border border-line bg-white p-5 shadow-soft xl:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1" aria-hidden="true">
            {LEVELS.map((x, k) => (
              <span key={x.id} className={cn('h-1.5 w-5 rounded-full transition-colors duration-500', k < active ? 'bg-ink/80' : k === active ? 'bg-dot' : 'bg-line')} />
            ))}
          </div>
          <span className="font-mono text-[12px] text-stone tabular-nums">{String(active + 1).padStart(2, '0')} / 04</span>
        </div>
        <div className="relative h-7 min-w-0 flex-1 overflow-hidden text-right">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={lv.id}
              initial={{ y: 18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -18, opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="absolute right-0 inline-flex h-7 items-center rounded-full bg-warm-2 px-3 text-[12.5px] font-semibold whitespace-nowrap text-ink"
            >
              {t(lv.name)} · {t(lv.stage)}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:gap-5">
        <div className="rounded-[22px] bg-warm p-3">
          <GroupTarget level={level} title={t(T.path.targetTitle)} />
        </div>
        <RankLadder level={level} active={active} />
      </div>
      <Readout level={level} className="mt-5 border-t border-line pt-4" />
      <p className="mt-3 text-[12px] leading-snug text-stone">{t(T.path.caption)}</p>
    </div>
  )
}

function Chapter({
  level: lv,
  index,
  active,
  wide,
  visual,
  ref,
  style,
}: {
  level: Level
  index: number
  active: boolean
  wide: boolean
  visual?: ReactNode
  ref?: Ref<HTMLElement>
  style?: CSSProperties
}) {
  const { t, href } = useSite()
  const reduce = useReduced()
  return (
    <article
      ref={ref}
      style={style}
      // Wide: its first line level with the panel's (the panel's border and padding) where it comes to rest.
      className={cn('flex flex-col transition-opacity duration-500', wide ? 'pt-[21px] xl:pt-[25px]' : 'py-0', wide && index < LEVELS.length - 1 && 'pb-10', wide && !active && !reduce && 'opacity-35')}
      data-level={wide ? index : undefined}
      aria-current={wide && active ? 'step' : undefined}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="font-mono text-[13px] text-stone">{String(index + 1).padStart(2, '0')} / 04</span>
        <span className="rounded-full bg-warm-2 px-2.5 py-1 text-[12px] font-medium text-ink">{t(lv.stage)}</span>
      </div>
      <h3 className="mt-4 text-[40px] leading-none font-semibold tracking-[-0.035em] text-ink sm:text-[52px]">{t(lv.name)}</h3>
      <p className="accent mt-2.5 text-[23px] leading-snug text-ink/85 sm:text-[26px]">{t(lv.headline)}</p>
      {visual ? <div className="mt-6 max-w-xl">{visual}</div> : null}
      <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-stone">{t(lv.text)}</p>
      <ul className="mt-5 grid max-w-xl gap-2.5">
        {lv.focus.map((f) => (
          <li key={f.en} className="flex gap-2.5 text-[15px] leading-snug text-ink/85">
            <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-ink text-white">
              <LuCheck className="size-3" aria-hidden="true" />
            </span>
            {t(f)}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap gap-2">
        {lv.ranks.map((r) => (
          <span key={r.name.en} className={cn('inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13.5px] font-semibold', r.track?.en === 'Precision' ? 'border border-dashed border-ink/30 text-ink' : LEVEL_FILL[index])}>
            {t(r.name)}
            <span className={cn('text-[12px] font-medium opacity-70', /\d/.test(r.range.en) && 'font-mono')}>{t(r.range)}</span>
          </span>
        ))}
      </div>
      <a href={href(`programs?section=levels&level=${lv.id}`)} className="group mt-6 inline-flex min-h-11 items-center gap-1.5 self-start text-[15px] font-semibold text-ink underline-offset-[5px] hover:underline focus-visible:underline focus-visible:outline-none">
        {t(T.learnLevel)}<span className="sr-only"> · {t(lv.name)}</span> <LuArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
      </a>
    </article>
  )
}

/** The small panel (phones and tablets): the target beside its numbers, the rank bar under them. */
function CompactPanel({ level, active, className }: { level: MotionValue<number>; active: number; className?: string }) {
  const { t } = useSite()
  return (
    <div className={cn('rounded-[24px] border border-line bg-white p-3 shadow-soft sm:p-4', className)}>
      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] items-center gap-4">
        <div className="rounded-[18px] bg-warm p-2">
          <GroupTarget level={level} title={t(T.path.targetTitle)} />
        </div>
        <Readout level={level} compact />
      </div>
      <RankScale level={level} active={active} className="mt-4 border-t border-line pt-3.5" />
    </div>
  )
}

/** Phones and tablets: each level brings its own target, whose group tightens from the level before as it comes in. */
function LevelCardVisual({ index }: { index: number }) {
  const reduce = useReduced()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const level = useMotionValue(reduce ? index : Math.max(0, index - 1))
  useEffect(() => {
    if (!inView || reduce) return
    const c = animate(level, index, { duration: 1.4, delay: 0.15, ease: [0.22, 1, 0.36, 1] })
    return () => c.stop()
  }, [inView, reduce, index, level])
  return (
    <div ref={ref}>
      <CompactPanel level={level} active={index} />
    </div>
  )
}

/** The Programs page: one panel that moves to the level picked above it (the full panel on wide screens). */
export function LevelVisual({ index, className }: { index: number; className?: string }) {
  const reduce = useReduced()
  const level = useMotionValue(index)
  useEffect(() => {
    if (reduce) {
      level.set(index)
      return
    }
    const c = animate(level, index, { duration: 1.1, ease: [0.22, 1, 0.36, 1] })
    return () => c.stop()
  }, [index, reduce, level])
  return (
    <div className={className}>
      <div className="hidden lg:block">
        <PathPanel level={level} active={index} />
      </div>
      <CompactPanel level={level} active={index} className="lg:hidden" />
    </div>
  )
}

/** The keys that move the page by a screen. */
const PAGE_KEYS = ['PageDown', 'PageUp', ' ']

/** 0 → 1 with a pause at both ends: the group rests on a level near its place and moves in the middle of the way. */
const between = (f: number) => {
  const x = Math.min(1, Math.max(0, (f - 0.22) / 0.56))
  return x * x * (3 - 2 * x)
}

/**
 * The magnet: when a reader stops scrolling between two levels on a wide screen, the page glides on to the level they
 * were heading for (back to the one they left if they hardly moved), so a level always comes to rest lined up with the
 * panel. A little above the first level it draws the reader in; past the last it lets go. Only after the reader's own
 * wheel, trackpad or touch, or a page key (Page Down, Space), which settles on the nearest level; the arrow keys keep
 * their small steps, and the page finding its place again on Back is left alone. Never with reduced motion, and any
 * new scroll takes over at once.
 */
function useMagnet(on: boolean, chapters: RefObject<(HTMLElement | null)[]>, top: number) {
  useEffect(() => {
    if (!on || !top) return
    const wide = window.matchMedia('(min-width: 1024px)')
    let timer = 0
    let frame = 0
    let lastY = window.scrollY
    let heading = 0
    // What moved the page last: the reader's wheel, trackpad or touch, a page key, or something else (left alone).
    let by: 'hand' | 'page' | null = null
    const stop = () => {
      cancelAnimationFrame(frame)
      frame = 0
    }
    const glide = (to: number) => {
      const from = window.scrollY
      const d = to - from
      if (Math.abs(d) < 2) return
      const ms = Math.min(900, Math.max(450, 420 + Math.abs(d) * 0.45))
      const t0 = performance.now()
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / ms)
        // Eases in and out: the page starts moving gently from where the reader left it, and settles.
        const e = p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2
        window.scrollTo({ top: from + d * e, behavior: 'instant' })
        frame = p < 1 ? requestAnimationFrame(step) : 0
        lastY = window.scrollY
      }
      frame = requestAnimationFrame(step)
    }
    const settle = () => {
      if (!wide.matches || !by || frame) return
      // Where the page rests with each level lined up with the panel.
      const rest = chapters.current.map((c) => (c ? c.getBoundingClientRect().top + window.scrollY - top : NaN))
      if (rest.length < 2 || rest.some(Number.isNaN)) return
      const y = window.scrollY
      const last = rest.length - 1
      if (y < rest[0]) {
        // Just above the first level: the hand heading down is drawn in; a page key settles on it if it's nearest.
        const reach = (rest[1] - rest[0]) * (by === 'page' ? 0.5 : 0.25)
        if ((by === 'page' || heading > 0) && rest[0] - y < reach) glide(rest[0])
      } else if (y < rest[last] - 1) {
        let k = 0
        while (k + 1 < last && rest[k + 1] <= y) k++
        const f = (y - rest[k]) / (rest[k + 1] - rest[k])
        const way = by === 'hand' ? heading : 0
        const onward = way > 0 ? f > 0.1 : way < 0 ? f > 0.9 : f >= 0.5
        glide(rest[onward ? k + 1 : k])
      }
    }
    const onScroll = () => {
      if (frame) return
      const y = window.scrollY
      if (y !== lastY) heading = Math.sign(y - lastY)
      lastY = y
      clearTimeout(timer)
      timer = window.setTimeout(settle, 140)
    }
    const takeOver = (e: Event) => {
      by = e.type !== 'keydown' ? 'hand' : PAGE_KEYS.includes((e as KeyboardEvent).key) ? 'page' : null
      if (frame) stop()
    }
    const inputs = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const
    window.addEventListener('scroll', onScroll, { passive: true })
    for (const type of inputs) window.addEventListener(type, takeOver, { passive: true })
    return () => {
      stop()
      clearTimeout(timer)
      window.removeEventListener('scroll', onScroll)
      for (const type of inputs) window.removeEventListener(type, takeOver)
    }
  }, [on, chapters, top])
}

/**
 * The home's "One path, four levels": on wide screens the panel stays put while the four levels scroll past, and the
 * group tightens and climbs the ranks with them; each level comes to rest with its first line level with the panel's
 * (the magnet above). On phones and tablets each level has its own small panel.
 */
export function LevelPath() {
  const { t } = useSite()
  const reduce = useReduced()
  const panel = useRef<HTMLDivElement>(null)
  const chapters = useRef<(HTMLElement | null)[]>([])
  // The panel's place on screen (centred below the header) and its height, which set where the levels rest.
  const [fit, setFit] = useState({ top: 0, height: 0 })
  const raw = useMotionValue(0)
  const eased = useSpring(raw, { stiffness: 90, damping: 22, mass: 0.6 })
  const level = reduce ? raw : eased
  const [active, setActive] = useState(0)
  useMotionValueEvent(level, 'change', (v) => setActive(Math.min(3, Math.max(0, Math.round(v)))))

  // The level from where the chapters stand against the panel's top: 0 while Launchpad is level with it, 1 once
  // Foundations is, and in between on the way.
  const place = useCallback(() => {
    const line = panel.current?.getBoundingClientRect().top
    if (line === undefined) return
    const tops = chapters.current.map((c) => c?.getBoundingClientRect().top ?? Infinity)
    let k = -1
    while (k + 1 < tops.length && tops[k + 1] <= line + 1) k++
    if (k < 0 || k === tops.length - 1) raw.set(Math.max(0, k))
    else {
      const f = (line - tops[k]) / Math.max(1, tops[k + 1] - tops[k])
      raw.set(k + (reduce ? Number(f >= 0.5) : between(f)))
    }
  }, [raw, reduce])
  const { scrollY } = useScroll()
  useMotionValueEvent(scrollY, 'change', place)

  useLayoutEffect(() => {
    const el = panel.current
    if (!el) return
    const measure = () => {
      const header = document.querySelector('header')?.getBoundingClientRect().height ?? 76
      const height = el.offsetHeight
      setFit({ top: Math.round(Math.max(header + 24, header + (window.innerHeight - header - height) / 2)), height })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])
  useEffect(place, [fit, place])
  useMagnet(!reduce, chapters, fit.top)

  return (
    <>
      {/* Wide screens: the panel beside the levels */}
      <div className="mt-14 hidden grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-12 lg:grid xl:gap-16">
        <div className="relative">
          <div ref={panel} className={cn('sticky', !fit.top && 'top-[calc(50svh-290px)]')} style={fit.top ? { top: fit.top } : undefined}>
            <PathPanel level={level} active={active} />
          </div>
        </div>
        <div>
          {LEVELS.map((lv, i) => (
            <Chapter
              key={lv.id}
              ref={(el) => {
                chapters.current[i] = el
              }}
              level={lv}
              index={i}
              active={i === active}
              wide
              // A screen apart; the last as tall as the panel, so the two leave together.
              style={{ minHeight: i < LEVELS.length - 1 ? `max(72svh, ${fit.height + 140}px)` : fit.height || undefined }}
            />
          ))}
        </div>
      </div>
      {/* Phones and tablets: a panel per level */}
      <div className="mt-12 grid gap-16 lg:hidden">
        {LEVELS.map((lv, i) => (
          <Reveal key={lv.id}>
            <Chapter level={lv} index={i} active wide={false} visual={<LevelCardVisual index={i} />} />
          </Reveal>
        ))}
        <p className="-mt-8 max-w-xl text-[12px] leading-snug text-stone">{t(T.path.caption)}</p>
      </div>
    </>
  )
}
