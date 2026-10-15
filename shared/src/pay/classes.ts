import { type BusinessRules, payModelOn } from '../settings/businessRules'
import type { BranchSettings } from '../settings/defaults'
import type { DateKey } from '../time'
import type { Session } from '../types'
import { type Interval, type PricedSegment, hoursOf, round2 } from './segment'
import type { StaffPay } from './shifts'

type TaughtClass = Pick<Session, 'coachId' | 'studentId' | 'dateKey' | 'isDeleted' | 'status' | 'startAt' | 'endAt'>

/** A block of classes a coach taught, paid under Classes taught. */
export interface ClassBlockPay {
  staffId: string
  dateKey: DateKey
  /** The block, priced as teaching time at the coach's teaching rate. */
  segment: PricedSegment
  /** Students taught in the block. */
  students: number
}

/**
 * A coach's classes that overlap form one block, so students taught together count once. Blocks back to back stay
 * apart, one pay line each.
 */
function blocksOf(spans: readonly Interval[]): Interval[] {
  const out: Interval[] = []
  for (const s of [...spans].sort((a, b) => a.startMs - b.startMs)) {
    const last = out[out.length - 1]
    if (last && s.startMs < last.endMs) last.endMs = Math.max(last.endMs, s.endMs)
    else out.push({ startMs: s.startMs, endMs: s.endMs })
  }
  return out
}

/**
 * Pay under Classes taught: coaches are paid their teaching rate for the classes they taught, from the schedule, not
 * the clock. Only classes whose status counts as teaching (`payroll.teachingSessionStatuses`, by default attended
 * ones) and only on dates the academy pays this way. Each block is paid once however many students are in it (a
 * trial visit inside a block adds nothing). Owners and admins are paid for their clocked time instead, under every
 * model.
 */
export function priceClassBlocks(opts: {
  sessions: readonly TaughtClass[]
  settings: Pick<BranchSettings, 'payroll'>
  rules: Pick<BusinessRules, 'payModels'>
  ratesFor: (staffId: string) => StaffPay
}): ClassBlockPay[] {
  const counted = new Set(opts.settings.payroll.teachingSessionStatuses)
  const days = new Map<string, TaughtClass[]>()
  for (const s of opts.sessions) {
    if (s.isDeleted || !counted.has(s.status) || payModelOn(opts.rules, s.dateKey) !== 'classes') continue
    const key = `${s.coachId}|${s.dateKey}`
    days.set(key, [...(days.get(key) ?? []), s])
  }
  const out: ClassBlockPay[] = []
  for (const list of days.values()) {
    const { coachId: staffId, dateKey } = list[0]
    const { rates, role } = opts.ratesFor(staffId)
    if (role === 'owner' || role === 'admin') continue
    const spans = list.map((s) => ({ startMs: s.startAt.toMillis(), endMs: s.endAt.toMillis(), studentId: s.studentId }))
    for (const { startMs, endMs } of blocksOf(spans)) {
      const students = new Set(spans.filter((s) => s.startMs >= startMs && s.endMs <= endMs).map((s) => s.studentId)).size
      const hours = hoursOf(endMs - startMs)
      out.push({ staffId, dateKey, students, segment: { type: 'teaching', startMs, endMs, hours, rate: rates.teaching, pay: round2(hours * rates.teaching) } })
    }
  }
  return out.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.segment.startMs - b.segment.startMs || a.staffId.localeCompare(b.staffId))
}
