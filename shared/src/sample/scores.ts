import { type PaperShot, type Position, POSITION_LABELS, paperEvaluation, shotGroup, shotTotals } from '../shooting/evaluation'
import type { Evaluation } from '../shooting/evaluation'
import { radiusFromScore } from '../shooting/target'
import { CARD_EDGES_MM } from '../targets/card'
import { FLAT, FLAT_SIZE, flatPoint } from '../targets/flat'
import { scoreHole } from '../targets/score'
import type { SyntheticCard, SyntheticShot } from '../targets/synthetic'
import { type DateKey, addDays, diffDays, toInstant, tzOffsetMinutes } from '../time'
import type { AuditStamp } from '../types'
import { SAMPLE_PREFIX, type SampleDoc } from './data'

/**
 * Sample scores for the sample students (shared/src/sample/data.ts): SIUS results on days they came to class, with
 * the made-up shots a synthetic SIUS PDF prints (scripts/lib/sius-pdf.ts), and a few paper cards, the recent ones
 * mostly scanned with the phone app (a made-up picture of the card in the Drive, shared/src/targets/synthetic.ts).
 * Better students shoot tighter groups, everyone improves a little week to week, and one of the two SIUS computers
 * runs on Pacific time, like the academy's. Deterministic for a given today, so running it again rewrites the same
 * documents.
 */

export interface SampleShot {
  v: number
  a: number | null
}

/** What a synthetic SIUS PDF needs (the shape scripts/lib/sius-pdf.ts takes). */
export interface SampleSiusSpec {
  printed: { year: number; month: number; day: number; hour: number; minute: number; second: number }
  pcOffsetMin: number
  series: { sighter?: boolean; shots: SampleShot[] }[]
}

/** A scanned card's picture: the card as the phone app flattens it for the Drive, with these made-up holes. */
export interface SampleCardSpec {
  holes: SyntheticShot[]
  /** Coaches' red pen marks beside the bulls. */
  ink: boolean
  seed: number
}

/** A SIUS result's PDF, or a scanned card's picture. */
export type SampleFile = { kind: 'sius'; fileId: string; name: string; spec: SampleSiusSpec } | { kind: 'card'; fileId: string; name: string; card: SampleCardSpec }

export interface SampleScore {
  evaluationId: string
  evaluation: Omit<Evaluation, keyof AuditStamp>
  /** SIUS results come with their PDF, scanned paper cards with the card's picture; typed cards have no file. */
  file: SampleFile | null
  /** When the result was shot (the upload time in the Drive). */
  at: Date
}

/**
 * A sample card's picture as the phone app would have saved it (shared/src/targets/flat.ts): the flattened card,
 * six pixels a millimetre and square to the card, every hole where flatPoint puts it.
 */
export function sampleCardPicture(card: SampleCardSpec): SyntheticCard {
  // The synthetic photo samples each pixel at its whole coordinates; the flattened card has a pixel's centre half a
  // pixel in, so the card sits half a pixel up and left of flatPoint's middle.
  const middle = flatPoint((CARD_EDGES_MM.left + CARD_EDGES_MM.right) / 2, (CARD_EDGES_MM.top + CARD_EDGES_MM.bottom) / 2)
  return { width: FLAT_SIZE.width, height: FLAT_SIZE.height, pxPerMm: FLAT.pxPerMm, centre: { x: middle.x - 0.5, y: middle.y - 0.5 }, shots: card.holes, ink: card.ink, noise: 0, seed: card.seed }
}

/** How far out a sample card's hole may be (mm): every hole stays on its bull's close-up (26 mm around it). */
const CARD_REACH_MM = 24
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * A card scanned with the phone: its holes, and what the scan saved for them, each hole as its shot scored by the
 * matches' rule at the hole's own size (shared/src/targets/score.ts), a made-up size for the card's holes a little
 * under the pellet's. Now and then the scan missed a hole (the bull saved as a 0 without a place) or put a shot a
 * little off its hole: the card's page on the website is where the office puts that right.
 */
function scannedCard(points: { x: number; y: number }[], r: () => number): { card: SampleCardSpec; shots: PaperShot[] } {
  const holes: SyntheticShot[] = points.map((p, i) => {
    const d = Math.hypot(p.x, p.y)
    const k = d > CARD_REACH_MM ? CARD_REACH_MM / d : 1
    return { bull: i + 1, x: round2(p.x * k), y: round2(p.y * k), look: r() < 0.3 ? 'fibres' : 'wall' }
  })
  const slip = r()
  const which = Math.floor(r() * holes.length)
  const turn = r() * Math.PI * 2
  const by = 0.7 + r() * 0.6
  const ink = r() < 0.5
  const seed = Math.floor(r() * 1e9)
  const size = round2(1.95 + r() * 0.3)
  const shots = holes.map((h, i): PaperShot => {
    if (i === which && slip < 0.25) return { v: 0 }
    const x = i === which && slip < 0.6 ? round2(h.x + by * Math.cos(turn)) : h.x
    const y = i === which && slip < 0.6 ? round2(h.y + by * Math.sin(turn)) : h.y
    return { v: scoreHole(Math.hypot(x, y), size).value, x, y, r: size }
  })
  return { card: { holes: holes.map((h) => ({ ...h, radiusMm: size })), ink, seed }, shots }
}

/** A small deterministic random generator per key (mulberry32), giving numbers from 0 up to 1. */
function rng(key: string) {
  let h = 2166136261
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(r: () => number): number {
  const u = Math.max(1e-9, r())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r())
}

/** A shot from a point on the target: its decimal score and its direction. */
function shotAt(x: number, y: number): SampleShot {
  const d = Math.hypot(x, y)
  const v = d <= 0.125 ? 10.9 : Math.max(0, Math.min(10.9, Math.floor((10.95 - d / 2.5) * 10 + 1e-9) / 10))
  if (v <= 0 || radiusFromScore(v) === null) return { v: 0, a: Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360) }
  return { v, a: Math.round((((Math.atan2(y, x) * 180) / Math.PI + 360) % 360) * 10) / 10 }
}

const POSITIONS_BY_LEVEL = (level: number): Position[] => (level <= 2 ? ['prone'] : level <= 5 ? ['prone', 'kneeling', 'prone', 'standing'] : ['prone', 'kneeling', 'standing'])

/**
 * How widely shots spread (mm, per axis) by level and position: about 8 per shot for a beginner prone, about 10 for the
 * top of the ladder, a little less kneeling and standing; the academy's sample PDFs score 87 to 102 per 10 shots.
 */
const spreadFor = (level: number, position: Position) => (5.2 - level * 0.45) * (position === 'standing' ? 1.35 : position === 'kneeling' ? 1.12 : 1)

export function buildSampleScores(docs: readonly SampleDoc[], opts: { academyId: string; timezone: string; today: DateKey; levels: readonly string[] }): SampleScore[] {
  const base = `branches/${opts.academyId}/`
  const students = docs
    .filter((d) => d.path.startsWith(`${base}students/`) && d.path.split('/').length === 4)
    .map((d) => ({ id: d.path.split('/')[3], name: String(d.data.name), level: opts.levels.indexOf(String(d.data.level ?? '')), status: String(d.data.status) }))
    .filter((s) => s.level >= 0 && s.status === 'enrolled')
  const classes = docs
    .filter((d) => d.path.startsWith(`${base}sessions/`) && d.data.status === 'present' && String(d.data.dateKey) < opts.today && String(d.data.dateKey) >= addDays(opts.today, -42))
    .map((d) => ({ studentId: String(d.data.studentId), dateKey: String(d.data.dateKey), startMin: Number(d.data.startMin) }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  const out: SampleScore[] = []
  for (const s of students) {
    const r = rng(`${s.id}|scores`)
    if (r() < 0.25) continue // not everyone has been evaluated yet
    const mine = classes.filter((c) => c.studentId === s.id)
    const positions = POSITIONS_BY_LEVEL(s.level)
    const bias = { x: (r() - 0.5) * 2.6, y: (r() - 0.5) * 2.6 }
    let n = 0
    mine.forEach((c, i) => {
      if (i % 2 === 1 && r() < 0.7) return // about one class in two or three
      const position = positions[n % positions.length]
      const key = `${s.id.slice(SAMPLE_PREFIX.length)}-${c.dateKey}`
      // Everyone improves a little week to week: older results spread wider and sit further off centre.
      const weeksAgo = Math.max(0, diffDays(c.dateKey, opts.today) / 7)
      const spread = Math.max(1.6, spreadFor(s.level, position) * (1 + 0.035 * weeksAgo))
      const off = { x: bias.x * (0.7 + 0.07 * weeksAgo), y: bias.y * (0.7 + 0.07 * weeksAgo) }
      const minute = c.startMin + 25 + Math.floor(r() * 35)
      const at = toInstant(c.dateKey, minute, opts.timezone)
      const evaluationId = `${SAMPLE_PREFIX}e-${key}`
      if (r() < 0.2) {
        // A paper card: ten bulls, a shot at each. About half of the last two weeks' were scanned with the phone (the
        // shots keep their places, and the Drive the card's picture); the others were typed in as whole numbers.
        const points = Array.from({ length: 10 }, () => ({ x: off.x + gaussian(r) * spread, y: off.y + gaussian(r) * spread }))
        const card = rng(`${key}|card`)
        if (weeksAgo < 2 && card() < 0.45) {
          const scan = scannedCard(points, card)
          const fileId = `${SAMPLE_PREFIX}f-${key}`
          out.push({
            evaluationId,
            evaluation: paperEvaluation({ studentId: s.id, studentName: s.name, position, dateKey: c.dateKey, shots: scan.shots, total: null, fileId, note: '' }),
            file: { kind: 'card', fileId, name: `${c.dateKey} ${POSITION_LABELS[position]} paper card.png`, card: scan.card },
            at,
          })
        } else {
          const values = points.map((p) => Math.floor(shotAt(p.x, p.y).v))
          out.push({
            evaluationId,
            evaluation: paperEvaluation({ studentId: s.id, studentName: s.name, position, dateKey: c.dateKey, shots: values, total: null, fileId: null, note: '' }),
            file: null,
            at,
          })
        }
      } else {
        const sighters = r() < 0.6 ? Array.from({ length: 3 + Math.floor(r() * 5) }, () => shotAt(off.x + gaussian(r) * spread * 1.2, off.y + gaussian(r) * spread * 1.2)) : []
        const series = [0, 1].map(() => Array.from({ length: 10 }, () => shotAt(off.x + gaussian(r) * spread, off.y + gaussian(r) * spread)))
        const shots = series.flat()
        const totals = shotTotals(shots)
        const group = shotGroup(shots)
        // One of the two SIUS computers is on Pacific time (academy question A7).
        const pacific = r() < 0.3
        const academyOffset = tzOffsetMinutes(at, opts.timezone)
        const pcOffsetMin = pacific ? -420 : academyOffset
        const printedAt = new Date(at.getTime() + pcOffsetMin * 60_000)
        const spec: SampleSiusSpec = {
          printed: { year: printedAt.getUTCFullYear(), month: printedAt.getUTCMonth() + 1, day: printedAt.getUTCDate(), hour: printedAt.getUTCHours(), minute: printedAt.getUTCMinutes(), second: Math.floor(r() * 60) },
          pcOffsetMin,
          series: [...(sighters.length ? [{ sighter: true, shots: sighters }] : []), ...series.map((shots) => ({ shots }))],
        }
        const h12 = spec.printed.hour % 12 || 12
        const printed = `${spec.printed.month}/${spec.printed.day}/${spec.printed.year} ${h12}:${String(spec.printed.minute).padStart(2, '0')}:${String(spec.printed.second).padStart(2, '0')} ${spec.printed.hour < 12 ? 'AM' : 'PM'}`
        const fileId = `${SAMPLE_PREFIX}f-${key}`
        out.push({
          evaluationId,
          evaluation: {
            studentId: s.id,
            studentName: s.name,
            source: 'sius',
            position,
            dateKey: c.dateKey,
            timeMin: minute,
            shots: shots.length,
            total: totals.total,
            wholeTotal: totals.wholeTotal,
            innerTens: totals.innerTens,
            mpi: group.mpi,
            groupMm: group.groupMm,
            series: series.map((ss, k) => ({ n: k + 1, total: shotTotals(ss).total, shots: ss, ...shotGroup(ss) })),
            sighters: sighters.length,
            fileId,
            note: '',
            problems: [],
            sius: { printed, event: 'Air Rifle 60', clockFixMin: academyOffset - pcOffsetMin },
          },
          file: { kind: 'sius', fileId, name: `${c.dateKey} ${POSITION_LABELS[position]} ${totals.total.toFixed(1)}.pdf`, spec },
          at,
        })
      }
      n++
    })
  }
  return out
}
