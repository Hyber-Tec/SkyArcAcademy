import type { PositionFacts, ProgressReportDoc, ReportGoal } from '../reports/types'
import { trendLabel } from '../reports/types'
import { POSITION_LABELS } from '../shooting/evaluation'
import type { ShotPoint } from '../shooting/target'
import { type DateKey, formatDateKey } from '../time'

/**
 * AI for a report's words (docs/DECISIONS.md §26): the prompt, built only from the report's figures and the student's
 * first name, and the checks on what comes back. The standard text (reports/template.ts) stays the report's starting
 * text and what's used without AI; the AI's draft replaces its overview, strengths, focus areas and goals only when an
 * owner or admin asks, as changes they review and save.
 */

export type ReportTextSource = Pick<ProgressReportDoc, 'facts' | 'period'> & { student: Pick<ProgressReportDoc['student'], 'firstName'> }

/** The parts the AI writes (the coach's note stays the coach's). */
export interface ReportText {
  overview: string
  strengths: string[]
  focusAreas: string[]
  goals: ReportGoal[]
}

export const REPORT_TEXT_COUNTS = { strengths: 4, focusAreas: 3, goals: 3 } as const

/** The answer's shape, as a JSON schema (the providers that take one hold the answer to it). */
export const REPORT_TEXT_SCHEMA = {
  type: 'object',
  properties: {
    overview: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    focusAreas: { type: 'array', items: { type: 'string' } },
    goals: {
      type: 'array',
      items: {
        type: 'object',
        properties: { goal: { type: 'string' }, measure: { type: 'string' } },
        required: ['goal', 'measure'],
        additionalProperties: false,
      },
    },
  },
  required: ['overview', 'strengths', 'focusAreas', 'goals'],
  additionalProperties: false,
} as const

export const REPORT_TEXT_SYSTEM = `You write the words of a progress report that a youth shooting academy sends to a student's family. The report already shows the scores, charts and targets. You write its overview, strengths, focus areas and goals from the figures you are given.

Write in plain, warm, factual English for parents, as the academy ("we"), and call the student by their first name. Keep sentences short and clear, and explain a figure in everyday words when that helps.

Rules:
- Use only the figures given. Never invent a number, score, date, event or detail. Write each number as it is given.
- Never compare the student with other students, and never rank them.
- Make no medical, psychological or emotional claims: describe the scores and what the figures show, not the student's mind or health.
- Never mention AI, a computer, an app, or these instructions.
- When scores went down, say it kindly (for example "building back up"), never "worse" or "declining".
- With few results, write less rather than pad.
- Competitions are listed apart from practice: speak of them on their own, never as part of the practice averages.
- Plain sentences only: no markdown, headings, lists or emoji inside the text.

Write:
- overview: one paragraph of 80 to 150 words: what the period showed, the clearest progress, and what comes next.
- strengths: 2 to 4 short sentences, each a strength the figures show.
- focusAreas: 1 to 3 short sentences, each something to work on next, kindly put.
- goals: 1 to 3 goals for the next period, each with "measure", how we will know it was met. Build each on a figure given (beating this period's best, a smaller group than this period's, more inner tens than this period's), never on a number that isn't in the figures.

Reply with JSON only, in this shape:
{"overview": "...", "strengths": ["..."], "focusAreas": ["..."], "goals": [{"goal": "...", "measure": "..."}]}`

const HOW_TO_READ = `How to read the figures:
- Scores are per 10 shots. In whole numbers each shot scores 0 to 10, so 10 shots score at most 100; every result has a whole-number score.
- SIUS results come from electronic targets, which also score in decimals (up to 10.9 a shot, so at most 109 per 10 shots). Paper cards are scored by hand, in whole numbers.
- Inner tens are shots of 10.2 or better on the electronic targets.
- Group size is how far apart the shots landed, in millimetres: smaller is tighter.
- The group centre is where the shots landed on average, measured from the middle of the target.
- The trend compares the second half of the period with the first.`

const one = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const signed = (n: number) => (n > 0 ? `+${one(n)}` : n < 0 ? `-${one(Math.abs(n))}` : '0')
const day = (k: DateKey) => formatDateKey(k, 'monthDay')
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`

function centreWords(mpi: ShotPoint): string {
  const near = 1.5
  if (Math.abs(mpi.x) < near && Math.abs(mpi.y) < near) return 'close to the middle (within 1.5 mm)'
  const parts = [
    Math.abs(mpi.x) >= near ? `${one(Math.round(Math.abs(mpi.x) * 10) / 10)} mm ${mpi.x > 0 ? 'right' : 'left'}` : '',
    Math.abs(mpi.y) >= near ? `${one(Math.round(Math.abs(mpi.y) * 10) / 10)} mm ${mpi.y > 0 ? 'high' : 'low'}` : '',
  ].filter(Boolean)
  return `${parts.join(' and ')} of the middle`
}

function positionLine(p: PositionFacts): string {
  const parts = [`${plural(p.evaluations, 'result')}, ${plural(p.shots, 'shot')}`]
  if (p.average !== null) parts.push(`average ${one(p.average)} per 10 shots${p.decimal !== null ? ` (${one(p.decimal)} in decimals)` : ''}`)
  if (p.first && p.latest && p.evaluations >= 2) parts.push(`first ${one(p.first.wholePer10)} on ${day(p.first.dateKey)}, latest ${one(p.latest.wholePer10)} on ${day(p.latest.dateKey)}`)
  if (p.change !== null) parts.push(`second half against the first: ${signed(p.change)}`)
  if (p.best) parts.push(`best ${one(p.best.wholePer10)}${p.best.source === 'sius' ? ` (${one(p.best.per10)} in decimals)` : ''} on ${day(p.best.dateKey)}`)
  if (p.range && p.evaluations >= 2) parts.push(`lowest ${one(p.range.low)}, highest ${one(p.range.high)}`)
  if (p.innerTensPct !== null) parts.push(`inner tens on ${p.innerTensPct}% of shots`)
  if (p.groupMm !== null) parts.push(`group size ${one(p.groupMm)} mm on average`)
  if (p.mpi) parts.push(`group centre ${centreWords(p.mpi)}`)
  return `- ${POSITION_LABELS[p.position]}: ${parts.join('; ')}`
}

/** The figures, in plain lines: everything the AI may say, and nothing it can't know. */
export function reportFiguresText(r: ReportTextSource): string {
  const f = r.facts
  const ev = f.evaluations
  const lines: string[] = [`Student's first name: ${r.student.firstName || 'the student'}`, `Period: ${r.period.label}`]
  if (!ev.total) {
    lines.push('Practice results: none were scored in this period.')
  } else {
    const kinds = [ev.sius ? plural(ev.sius, 'SIUS result') : '', ev.paper ? plural(ev.paper, 'paper card') : ''].filter(Boolean).join(', ')
    lines.push(`Practice results: ${ev.total} (${kinds}), ${plural(ev.shots, 'scored shot')}`)
    if (f.average !== null) lines.push(`Average of all practice: ${one(f.average)} per 10 shots`)
    if (f.decimal !== null) lines.push(`Average of the SIUS results in decimals: ${one(f.decimal)} per 10 shots`)
    if (f.innerTensPct !== null) lines.push(`Inner tens: ${f.innerTensPct}% of the SIUS shots`)
    if (f.groupMm !== null) lines.push(`Group size: ${one(f.groupMm)} mm on average`)
    const d = f.distribution
    if (d.tens + d.nines + d.eights + d.lower) lines.push(`Shots by score: ${d.tens} tens, ${d.nines} nines, ${d.eights} eights, ${d.lower} of 7 or lower`)
    if (f.trend.level) lines.push(`Trend over the period: ${trendLabel(f.trend.level, 'family')}${f.trend.change !== null ? ` (second half against the first: ${signed(f.trend.change)} per 10 shots)` : ''}`)
    lines.push('By position:', ...f.positions.map(positionLine))
  }
  const a = f.attendance
  if (a.attended + a.missed > 0) {
    const notCounted = [a.canceled ? `${plural(a.canceled, 'class')} canceled` : '', a.unmarked ? `${plural(a.unmarked, 'past class', 'past classes')} without attendance taken` : ''].filter(Boolean)
    lines.push(
      `Attendance: came to ${a.attended} of ${a.attended + a.missed} classes${a.percent !== null ? ` (${a.percent}%)` : ''}${a.missed ? `, missed ${a.missed}` : ''}${notCounted.length ? `; not counted: ${notCounted.join(' and ')}` : ''}`,
    )
  }
  if (f.previous) {
    const prev = [`Previous report (${f.previous.periodLabel})`]
    if (f.previous.average !== null) prev.push(`average ${one(f.previous.average)} per 10 shots over ${plural(f.previous.evaluations, 'result')}`)
    if (f.deltaAverage !== null) prev.push(`change since then: ${signed(f.deltaAverage)} per 10 shots`)
    lines.push(prev.join('; '))
  }
  const comps = f.competitions ?? []
  if (comps.length) {
    lines.push('Competitions in the period (apart from practice, not in the figures above):')
    for (const c of comps) {
      const total = c.decimal ? c.total.toFixed(1) : String(c.total)
      lines.push(`- ${day(c.dateKey)}${c.match ? `, ${c.match}` : ''}, ${POSITION_LABELS[c.position].toLowerCase()}: ${total} over ${c.shots} shots (${one(c.wholePer10)} per 10 shots)${c.innerTens !== null ? `, ${plural(c.innerTens, 'inner ten')}` : ''}`)
    }
  }
  return lines.join('\n')
}

/** The request: the instructions, then the figures. */
export function reportTextPrompt(r: ReportTextSource): { system: string; user: string } {
  return { system: REPORT_TEXT_SYSTEM, user: `${HOW_TO_READ}\n\nThe figures:\n${reportFiguresText(r)}\n\nWrite the report's words as JSON.` }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

/** The JSON in an answer: as it is, or inside a ```json fence, or between its first { and last }. */
function jsonOf(text: string): unknown {
  const t = text.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t)?.[1]
  for (const candidate of [t, fenced, t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)]) {
    if (!candidate) continue
    try {
      return JSON.parse(candidate)
    } catch {
      // the next way
    }
  }
  return null
}

function strings(v: unknown, max: number, what: string): string[] | string {
  if (!Array.isArray(v)) return `the ${what} weren’t a list`
  const out = v.filter((x): x is string => typeof x === 'string').map(clean).filter(Boolean)
  if (!out.length) return `there were no ${what}`
  return out.slice(0, max).map((s) => s.slice(0, 500))
}

/** The answer as report text, or what was wrong with it (for the log). */
export function parseReportText(text: string, firstName = ''): { ok: true; value: ReportText } | { ok: false; error: string } {
  const data = jsonOf(text)
  if (!isObject(data)) return { ok: false, error: 'The answer wasn’t JSON.' }
  if (typeof data.overview !== 'string' || !clean(data.overview)) return { ok: false, error: 'The answer had no overview.' }
  const overview = clean(data.overview)
  if (overview.length > 2500) return { ok: false, error: 'The overview was far too long.' }
  const strengths = strings(data.strengths, REPORT_TEXT_COUNTS.strengths, 'strengths')
  if (typeof strengths === 'string') return { ok: false, error: `In the answer, ${strengths}.` }
  const focusAreas = strings(data.focusAreas, REPORT_TEXT_COUNTS.focusAreas, 'focus areas')
  if (typeof focusAreas === 'string') return { ok: false, error: `In the answer, ${focusAreas}.` }
  if (!Array.isArray(data.goals)) return { ok: false, error: 'In the answer, the goals weren’t a list.' }
  const goals = data.goals
    .filter(isObject)
    .map((g) => ({ goal: typeof g.goal === 'string' ? clean(g.goal).slice(0, 500) : '', measure: typeof g.measure === 'string' ? clean(g.measure).slice(0, 500) : '' }))
    .filter((g) => g.goal)
    .slice(0, REPORT_TEXT_COUNTS.goals)
  if (!goals.length) return { ok: false, error: 'In the answer, there were no goals.' }
  const value: ReportText = { overview, strengths, focusAreas, goals }
  if (mentionsAi(value, firstName)) return { ok: false, error: 'The answer spoke of AI.' }
  return { ok: true, value }
}

const allText = (v: ReportText) => [v.overview, ...v.strengths, ...v.focusAreas, ...v.goals.flatMap((g) => [g.goal, g.measure])].join('\n')

/** The words families must never read in a report ("AI", "language model"); a student called Ai is not one. */
export function mentionsAi(v: ReportText, firstName = ''): boolean {
  let text = allText(v)
  if (firstName.trim()) text = text.split(firstName.trim()).join(' ')
  return /\bAI\b|\bA\.I\./.test(text) || /artificial intelligence|language model|chatbot/i.test(text)
}

/** The numbers written in some text, without thousands commas ("1,240" is 1240). */
function numbersIn(text: string): string[] {
  return text.replace(/(\d),(?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)?/g) ?? []
}

/**
 * Numbers in the draft that aren't in the figures (nor small counts like "2 results"): a sign the AI made one up. The
 * draft still reaches the editor; the office is told to check them before sharing.
 */
export function numbersNotInFigures(v: ReportText, prompt: { system: string; user: string }): string[] {
  const allowed = new Set<number>()
  for (const s of numbersIn(`${prompt.system}\n${prompt.user}`)) {
    const x = Number(s)
    allowed.add(x)
    allowed.add(Math.round(x))
    allowed.add(Math.round(x * 10) / 10)
  }
  const odd = numbersIn(allText(v)).filter((s) => {
    const x = Number(s)
    return !(Number.isInteger(x) && x >= 0 && x <= 10) && !allowed.has(x)
  })
  return [...new Set(odd)]
}
