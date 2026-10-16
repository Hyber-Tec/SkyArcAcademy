import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../settings/defaults'
import { per10 } from '../shooting/evaluation'
import { buildSampleData } from './data'
import { buildSampleScores } from './scores'

describe('sample scores', () => {
  const now = new Date('2026-10-16T16:00:00Z')
  const opts = { academyId: 'skyarc', timezone: 'America/New_York', today: '2026-10-16', levels: DEFAULT_SETTINGS.students.levels }
  const { docs } = buildSampleData({ ...opts, now, week: DEFAULT_SETTINGS.schedule.defaultWeek, programs: DEFAULT_SETTINGS.students.programs, maxStudentsPerCoach: 5 })
  const scores = buildSampleScores(docs, opts)

  const finite = (v: unknown): boolean =>
    typeof v === 'number' ? Number.isFinite(v) : Array.isArray(v) ? v.every(finite) : v && typeof v === 'object' && !(v instanceof Date) ? Object.values(v).every(finite) : true

  it('gives the sample students realistic SIUS results and paper cards', () => {
    expect(scores.length).toBeGreaterThan(30)
    expect(scores.every((s) => finite(s.evaluation))).toBe(true)
    const sius = scores.filter((s) => s.evaluation.source === 'sius')
    const paper = scores.filter((s) => s.evaluation.source === 'paper')
    expect(sius.length).toBeGreaterThan(paper.length)
    expect(paper.length).toBeGreaterThan(0)
    for (const s of scores) {
      const p10 = per10(s.evaluation.wholeTotal, s.evaluation.shots) ?? 0
      expect(p10).toBeGreaterThan(55)
      expect(p10).toBeLessThanOrEqual(100)
      expect(s.evaluation.series.flatMap((x) => x.shots).every((t) => t.v >= 0 && t.v <= 10.9)).toBe(true)
    }
    // Every SIUS result has its PDF, named by date, position and total; some come from the computer on Pacific time.
    expect(sius.every((s) => s.file && s.file.name === `${s.evaluation.dateKey} ${s.evaluation.position[0].toUpperCase()}${s.evaluation.position.slice(1)} ${s.evaluation.total.toFixed(1)}.pdf`)).toBe(true)
    expect(sius.some((s) => s.evaluation.sius?.clockFixMin === 180)).toBe(true)
  })

  it('is the same for the same day', () => {
    expect(buildSampleScores(docs, opts).map((s) => s.evaluation.total)).toEqual(scores.map((s) => s.evaluation.total))
  })
})
