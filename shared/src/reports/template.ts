import { POSITION_LABELS } from '../shooting/evaluation'
import { offsetWords } from '../shooting/target'
import { formatDateKey } from '../time'
import type { PositionFacts, ReportFacts, ReportGoal, ReportNarrative } from './types'

/**
 * The standard text: plain sentences built only from the figures, so every number in them is true. Staff edit it
 * before sharing (or not); nothing here is written by AI.
 */

const one = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
/** "1 point", "9.5 points". */
const points = (n: number) => `${one(n)} point${n === 1 ? '' : 's'}`
const lower = (s: string) => s.toLowerCase()

function listWords(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function main(facts: ReportFacts): PositionFacts | null {
  return [...facts.positions].sort((a, b) => b.evaluations - a.evaluations || (b.average ?? 0) - (a.average ?? 0))[0] ?? null
}

export function templateNarrative(facts: ReportFacts, firstName: string, periodLabel: string): ReportNarrative {
  const name = firstName || 'The student'
  const ev = facts.evaluations
  const sentences: string[] = []
  if (!ev.total) {
    sentences.push(`${name} has no scored evaluations in ${periodLabel} yet.`)
  } else {
    const breakdown = facts.positions.map((p) => `${p.evaluations} ${lower(POSITION_LABELS[p.position])}`)
    sentences.push(`In ${periodLabel}, ${name} shot ${plural(ev.total, 'evaluation')} (${listWords(breakdown)}), ${plural(ev.shots, 'scored shot')} in all.`)
    const top = main(facts)
    if (top?.first && top.latest && top.evaluations >= 2) {
      const pos = lower(POSITION_LABELS[top.position])
      if (facts.trend.level === 'improving') sentences.push(`${pos[0].toUpperCase()}${pos.slice(1)} scores rose from ${one(top.first.wholePer10)} to ${one(top.latest.wholePer10)} per 10 shots.`)
      else if (facts.trend.level === 'dipping') sentences.push(`${pos[0].toUpperCase()}${pos.slice(1)} scores averaged ${one(top.average ?? 0)} per 10 shots, a little below where the period started.`)
      else sentences.push(`${pos[0].toUpperCase()}${pos.slice(1)} scores held steady at about ${one(top.average ?? 0)} per 10 shots.`)
    } else if (facts.average !== null) {
      sentences.push(`The average was ${one(facts.average)} per 10 shots.`)
    }
    const best = [...facts.positions].filter((p) => p.best).sort((a, b) => (b.best!.wholePer10 - a.best!.wholePer10))[0]
    if (best?.best) {
      const decimal = best.best.source === 'sius' ? ` (${best.best.per10.toFixed(1)} in decimals)` : ''
      sentences.push(`The best result was ${one(best.best.wholePer10)} per 10 shots${decimal}, ${lower(POSITION_LABELS[best.position])}, on ${formatDateKey(best.best.dateKey, 'monthDay')}.`)
    }
  }
  const a = facts.attendance
  if (a.attended + a.missed > 0) {
    sentences.push(a.missed === 0 ? `${name} came to every class (${a.attended}).` : `${name} came to ${a.attended} of ${a.attended + a.missed} classes.`)
  }
  return {
    overview: sentences.join(' '),
    strengths: strengths(facts),
    focusAreas: focusAreas(facts),
    goals: goals(facts),
    coachNote: '',
  }
}

function strengths(facts: ReportFacts): string[] {
  const out: string[] = []
  for (const p of facts.positions) {
    if (p.change !== null && p.change >= 1) out.push(`${POSITION_LABELS[p.position]} scores up ${points(p.change)} per 10 shots over the period.`)
  }
  if (facts.innerTensPct !== null && facts.innerTensPct >= 20) out.push(`Inner tens on ${facts.innerTensPct}% of shots.`)
  if (facts.groupMm !== null && facts.groupMm <= 16) out.push(`Tight groups: ${one(facts.groupMm)} mm across on average.`)
  const steady = facts.positions.find((p) => p.evaluations >= 3 && p.range && p.range.high - p.range.low <= 3)
  if (steady) out.push(`Consistent ${lower(POSITION_LABELS[steady.position])} scores, all within ${one(steady.range!.high - steady.range!.low)} points.`)
  const a = facts.attendance
  if (a.attended >= 4 && a.missed === 0) out.push('Came to every class.')
  if (!out.length && facts.evaluations.total) out.push(`Shot ${plural(facts.evaluations.total, 'evaluation')} this period.`)
  return out.slice(0, 4)
}

function focusAreas(facts: ReportFacts): string[] {
  const out: string[] = []
  const sius = facts.positions.filter((p) => p.mpi)
  for (const p of sius) {
    const words = offsetWords(p.mpi)
    if (words && p.mpi) {
      const parts = [Math.abs(p.mpi.x) >= 1.5 ? `${one(Math.abs(p.mpi.x))} mm ${p.mpi.x > 0 ? 'right' : 'left'}` : '', Math.abs(p.mpi.y) >= 1.5 ? `${one(Math.abs(p.mpi.y))} mm ${p.mpi.y > 0 ? 'high' : 'low'}` : '']
      out.push(`${POSITION_LABELS[p.position]} groups sit ${words} of the centre on average (${parts.filter(Boolean).join(', ')}).`)
      break
    }
  }
  if (facts.groupMm !== null && facts.groupMm > 20) out.push(`Groups average ${one(facts.groupMm)} mm across; tighter groups are the next step.`)
  if (facts.positions.length >= 2) {
    const sorted = [...facts.positions].filter((p) => p.average !== null).sort((a, b) => (b.average ?? 0) - (a.average ?? 0))
    const gap = sorted.length >= 2 ? (sorted[0].average ?? 0) - (sorted[sorted.length - 1].average ?? 0) : 0
    if (gap >= 4) out.push(`${POSITION_LABELS[sorted[sorted.length - 1].position]} trails ${lower(POSITION_LABELS[sorted[0].position])} by ${points(gap)} per 10 shots.`)
  }
  const wide = facts.positions.find((p) => p.range && p.range.high - p.range.low >= 8)
  if (wide?.range) out.push(`${POSITION_LABELS[wide.position]} scores ranged from ${one(wide.range.low)} to ${one(wide.range.high)}; steadier series are the goal.`)
  if (facts.trend.level === 'dipping') out.push('Scores dipped in the second half of the period.')
  const a = facts.attendance
  if (a.missed >= 2 && a.percent !== null && a.percent < 80) out.push(`Missed ${a.missed} of ${a.attended + a.missed} classes.`)
  if (!out.length && facts.evaluations.total) out.push('Keep building consistency from series to series.')
  return out.slice(0, 3)
}

function goals(facts: ReportFacts): ReportGoal[] {
  const out: ReportGoal[] = []
  const top = main(facts)
  if (top?.latest) {
    const target = Math.min(100, Math.ceil(Math.max(top.latest.wholePer10, top.average ?? 0) + 2))
    out.push({ goal: `Average ${target} per 10 shots in ${lower(POSITION_LABELS[top.position])}.`, measure: 'Across the next period’s evaluations.' })
  }
  if (facts.innerTensPct !== null) {
    out.push({ goal: `Reach ${Math.min(100, facts.innerTensPct + 5)}% inner tens.`, measure: 'Shots of 10.2 or better on the SIUS results.' })
  }
  if (facts.groupMm !== null && facts.groupMm > 10) {
    out.push({ goal: `Keep groups under ${Math.max(8, Math.floor(facts.groupMm - 2))} mm.`, measure: 'The group size on each SIUS result.' })
  }
  if (facts.attendance.percent !== null && facts.attendance.percent < 90) out.push({ goal: 'Come to every class.', measure: 'Attendance next period.' })
  return out.slice(0, 3)
}
