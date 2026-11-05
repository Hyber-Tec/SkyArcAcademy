import type { EvaluationPoint } from '@shared/reports/types'
import { type Evaluation, pointOf } from '@shared/shooting/evaluation'
import { type ReplayShot, replayShots, showsTenths } from '@shared/shooting/replay'
import { type Lang, dateText } from '@shared/i18n'
import { type ShotPoint, offsetWords, targetViewMm } from '@shared/shooting/target'

/**
 * What the website's shot replay plays: one result's shots in firing order (shared/src/shooting/replay.ts), or a
 * report's results one after another. Each shot carries the words its readout shows.
 */
export interface PlayShot {
  /** 1, 2, 3… in the order it plays. */
  n: number
  /** The number drawn beside it on the target: its shot number on its own result. */
  number: number
  value: number
  /** "9.8" for SIUS, "9" for a paper card. */
  valueText: string
  point: ShotPoint | null
  /** "Shot 7 of 20". */
  of: string
  /** What it belongs to: "Series 2" (SIUS), or its result's date when several results play together. */
  context: string | null
  /** The total so far, this shot included; null when several results play together. */
  runningText: string | null
}

const scoreText = (sius: boolean, v: number) => (sius ? v.toFixed(1) : String(Math.round(v)))

/** "Shot 7 of 20", "20발 중 7번째". */
export const shotOfText = (n: number, of: number, lang: Lang = 'en'): string => (lang === 'ko' ? `${of}발 중 ${n}번째` : `Shot ${n} of ${of}`)

/** "Series 2", "2시리즈". */
export const seriesText = (n: number, lang: Lang = 'en'): string => (lang === 'ko' ? `${n}시리즈` : `Series ${n}`)

/** One result's shots (SIUS series by series, a paper card bull by bull). */
export function playEvaluation(e: Pick<Evaluation, 'source' | 'series'>, lang: Lang = 'en'): PlayShot[] {
  const sius = showsTenths(e)
  const shots = replayShots(e)
  return shots.map((s) => ({
    n: s.n,
    number: s.n,
    value: s.value,
    valueText: scoreText(sius, s.value),
    point: s.point,
    of: shotOfText(s.n, shots.length, lang),
    context: s.series !== null ? seriesText(s.series, lang) : null,
    runningText: scoreText(sius, s.running),
  }))
}

/**
 * A report's results (oldest first), each one's shots in the order they were fired. One result plays as itself (its
 * series aren't kept in a report, so none are named); several play one after another under their dates.
 */
export function playPoints(points: readonly EvaluationPoint[], lang: Lang = 'en'): PlayShot[] {
  const several = points.length > 1
  const out: PlayShot[] = []
  for (const p of points) {
    const sius = p.source === 'sius'
    let running = 0
    p.marks.forEach((m, i) => {
      running = Math.round((running + m.v) * 10) / 10
      out.push({
        n: out.length + 1,
        number: i + 1,
        value: m.v,
        valueText: scoreText(sius, m.v),
        point: pointOf(m),
        of: shotOfText(i + 1, p.marks.length, lang),
        context: several ? dateText(p.dateKey, 'monthDay', lang) : null,
        runningText: several ? null : scoreText(sius, running),
      })
    })
  }
  return out
}

/** A result's shots that have a place on the target. */
export function placedShots<T extends Pick<ReplayShot, 'point'>>(shots: readonly T[]): (T & { point: ShotPoint })[] {
  return shots.filter((s): s is T & { point: ShotPoint } => s.point !== null)
}

/** A shot "dart" at its largest, in pixels (ten in a row where there's room, five on a phone). */
export const DART_PX = 64

/**
 * One scale for every dart of a result, so their places compare: the replay's, zoomed to the group (`targetViewMm` of
 * all its placed shots at a large picture's size), as the phone app's darts.
 */
export function dartView(shots: readonly Pick<ReplayShot, 'point'>[]): number {
  return targetViewMm(
    placedShots(shots).map((s) => s.point),
    300,
  )
}

/** How far a shot sits from the centre (mm, one decimal) and which way in words ("low left", or "centre"; "왼쪽 아래"). */
export function shotOffset(p: ShotPoint, lang: Lang = 'en'): { mm: string; words: string } {
  return { mm: Math.hypot(p.x, p.y).toFixed(1), words: lang === 'ko' ? (offsetWordsKo(p, 0.5) ?? '정중앙') : (offsetWords(p, 0.5) ?? 'centre') }
}

/** Which way the shots lean, in Korean: "왼쪽 아래", "위" (as shared/src/shooting/target.ts's offsetWords). */
export function offsetWordsKo(p: ShotPoint | null, withinMm = 1.5): string | null {
  if (!p) return null
  const h = Math.abs(p.x) >= withinMm ? (p.x > 0 ? '오른쪽' : '왼쪽') : ''
  const v = Math.abs(p.y) >= withinMm ? (p.y > 0 ? '위' : '아래') : ''
  return [h, v].filter(Boolean).join(' ') || null
}

/** Playback speeds, in the order the speed button steps through them. */
export const SPEEDS = [1, 2, 0.5] as const
export type Speed = (typeof SPEEDS)[number]

export function speedLabel(s: Speed): string {
  return `${s}×`
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}
