import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../settings/defaults'
import { per10 } from '../shooting/evaluation'
import { CARD_BULLS, bullCentreMm } from '../targets/card'
import { FLAT_SIZE, flatBull, savedReview, wasScanned } from '../targets/flat'
import { applyH } from '../targets/geometry'
import { scoreAt } from '../targets/score'
import { syntheticCardToImage } from '../targets/synthetic'
import { buildSampleData } from './data'
import { buildSampleScores, sampleCardPicture } from './scores'

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

  it('has some recent paper cards scanned with the phone: shots with places, and the card’s picture in the Drive', () => {
    const scanned = scores.filter((s) => s.file?.kind === 'card')
    const typed = scores.filter((s) => s.evaluation.source === 'paper' && !s.file)
    expect(scanned.length).toBeGreaterThan(1)
    expect(typed.length).toBeGreaterThan(0)
    expect(typed.every((s) => !wasScanned(s.evaluation) && s.evaluation.fileId === null)).toBe(true)
    let slips = 0
    for (const s of scanned) {
      const e = s.evaluation
      const file = s.file!
      if (file.kind !== 'card') throw new Error('a card')
      expect(wasScanned(e)).toBe(true)
      expect(e.fileId).toBe(file.fileId)
      expect(file.name).toBe(`${e.dateKey} ${e.position[0].toUpperCase()}${e.position.slice(1)} paper card.png`)
      const shots = e.series[0].shots
      expect(shots).toHaveLength(10)
      expect(e.total).toBe(shots.reduce((n, t) => n + t.v, 0))
      // Each shot scored by ISSF's rule where it was saved; each hole on its bull's close-up, and the saved shot on
      // it but for the scan's odd slip (a hole missed, or a shot put a little off it).
      file.card.holes.forEach((h, i) => {
        const t = shots[i]
        expect(h.bull).toBe(i + 1)
        expect(Math.hypot(h.x, h.y)).toBeLessThanOrEqual(24.01)
        if (typeof t.x !== 'number' || typeof t.y !== 'number') {
          expect(t.v).toBe(0)
          slips++
          return
        }
        expect(t.v).toBe(scoreAt(Math.hypot(t.x, t.y)).value)
        const off = Math.hypot(t.x - h.x, t.y - h.y)
        if (off > 0.01) slips++
        expect(off).toBeLessThan(1.4)
      })
      expect(savedReview(e)!.bulls.every((b) => b.found)).toBe(true)
    }
    expect(slips).toBeGreaterThan(0)
  })

  it('draws a scanned card’s picture as the phone flattens it: every bull where the website looks for it', () => {
    const spec = sampleCardPicture({ holes: [{ bull: 4, x: 1.5, y: -2 }], ink: false, seed: 1 })
    expect([spec.width, spec.height]).toEqual([FLAT_SIZE.width, FLAT_SIZE.height])
    const toPicture = syntheticCardToImage(spec)
    for (const b of CARD_BULLS.filter((x) => x.kind === 'record')) {
      // The pixel showing the bull's centre, whose own centre is half a pixel further in.
      const at = applyH(toPicture, bullCentreMm(b))
      const want = flatBull(b.n)!.center
      expect(at.x + 0.5).toBeCloseTo(want.x, 6)
      expect(at.y + 0.5).toBeCloseTo(want.y, 6)
    }
  })

  it('is the same for the same day', () => {
    const again = buildSampleScores(docs, opts)
    expect(again.map((s) => s.evaluation.total)).toEqual(scores.map((s) => s.evaluation.total))
    expect(again.map((s) => s.file)).toEqual(scores.map((s) => s.file))
  })
})
