import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { extractSiusPage } from '../../shared/src/sius/extract'
import { parseSiusPage, readSiusResult } from '../../shared/src/sius/parse'
import { type SiusSpec, siusPdf } from './sius-pdf'

/** A synthetic result read back through pdf.js and the shared parser, as an upload in the browser is. */
async function read(spec: SiusSpec, timezone = 'America/New_York') {
  const bytes = await siusPdf(spec)
  const task = pdfjs.getDocument({ data: bytes, isOffscreenCanvasSupported: false, verbosity: 0 })
  const doc = await task.promise
  try {
    const page = await extractSiusPage(doc as never, pdfjs.OPS as never)
    const result = parseSiusPage(page)
    return { result, reading: result ? readSiusResult(result, timezone) : null }
  } finally {
    await task.destroy()
  }
}

const printed = { year: 2026, month: 10, day: 7, hour: 18, minute: 35, second: 59 }
const angle = (i: number) => (i * 37) % 360
const shots = (values: number[]) => values.map((v, i) => ({ v, a: angle(i + 1) }))

describe('synthetic SIUS PDFs read back', () => {
  it('reads two match series: totals, inner tens, shots and directions', async () => {
    const s1 = [9.4, 10.3, 8.4, 8.4, 8.3, 10.4, 9.7, 9.3, 9.4, 9.2]
    const s2 = [10.0, 9.9, 10.0, 9.8, 10.1, 10.4, 5.2, 9.6, 9.5, 9.5]
    const { result, reading } = await read({ printed, pcOffsetMin: -240, series: [{ shots: shots(s1) }, { shots: shots(s2) }] })
    expect(result?.event).toBe('Air Rifle 60')
    expect(result?.printed).toBe('10/7/2026 6:35:59 PM')
    expect(reading).toMatchObject({ dateKey: '2026-10-07', timeMin: 18 * 60 + 35, clockFixMin: 0, shots: 20, total: 186.8, wholeTotal: 179, innerTens: 3, sighters: 0, fromSighters: false, noShots: false })
    expect(reading?.problems).toEqual([])
    expect(reading?.series.map((s) => s.total)).toEqual([92.8, 94])
    const got = reading!.series.flatMap((s) => s.shots)
    expect(got.map((t) => t.v)).toEqual([...s1, ...s2])
    for (const [i, t] of got.entries()) {
      const want = angle((i % 10) + 1)
      const diff = Math.abs((((t.a ?? -999) - want + 540) % 360) - 180)
      expect(diff).toBeLessThan(3)
    }
  })

  it('moves the time when the SIUS computer is set to another time zone', async () => {
    const { reading } = await read({ printed: { ...printed, hour: 15, minute: 29 }, pcOffsetMin: -420, series: [{ shots: shots([9, 9, 9, 9, 9, 9, 9, 9, 9, 9]) }] })
    expect(reading).toMatchObject({ dateKey: '2026-10-07', timeMin: 18 * 60 + 29, clockFixMin: 180 })
    expect(reading?.notes.some((n) => n.includes('3 hours later'))).toBe(true)
  })

  it('leaves out sighters and arrowless 0.0 entries, and notes odd shot counts', async () => {
    const match = [...shots([10.4, 9.9, 9.0]), { v: 0, a: null }, ...shots([10.7, 9.7, 10.7, 9.0, 10.2, 10.3, 9.9])]
    const { reading } = await read({ printed, pcOffsetMin: -240, series: [{ sighter: true, shots: shots([8.4, 10.2, 9.3]) }, { shots: match }, { shots: shots([9.1]) }] })
    expect(reading?.shots).toBe(11)
    expect(reading?.sighters).toBe(3)
    expect(reading?.problems).toEqual([])
    expect(reading?.notes).toEqual(expect.arrayContaining(['One 0.0 entry without a direction wasn’t counted as a shot.', '11 match shots, all counted.']))
  })

  it('reads a 20-shot session whose target recorded sensor zeros, re-shot by the student (24 entries)', async () => {
    // Target #3's sensor sometimes records a 0.0 with no direction; the student shoots again (the manager, 2026-10-27).
    const zero = { v: 0, a: null }
    const real = [9.8, 10.2, 9.5, 10.6, 9.1, 9.9, 10.4, 9.3, 10.0, 9.7, 9.6, 10.1, 9.2, 10.5, 9.8, 9.4, 10.3, 9.9, 9.0, 10.2]
    const entries = [...shots(real.slice(0, 5)), zero, ...shots(real.slice(5, 9)), zero, zero, ...shots(real.slice(9, 16)), zero, ...shots(real.slice(16))]
    const { reading } = await read({ printed, pcOffsetMin: -240, series: [{ shots: entries.slice(0, 12) }, { shots: entries.slice(12) }] })
    expect(entries).toHaveLength(24)
    expect(reading?.shots).toBe(20)
    expect(reading?.total).toBe(Math.round(real.reduce((n, v) => n + v, 0) * 10) / 10)
    expect(reading?.problems).toEqual([])
    expect(reading?.notes).toContain('4 entries of 0.0 without a direction weren’t counted as shots.')
    expect(reading?.notes.some((n) => n.includes('match shots, all counted'))).toBe(false)
  })

  it('keeps the other words on the page, such as a name set on the lane, and nothing from the academy’s own layout', async () => {
    const plain = await read({ printed, pcOffsetMin: -240, series: [{ shots: shots([9.1, 9.4]) }] })
    expect(plain.result?.pageText).toEqual([])
    const named = await read({ printed, pcOffsetMin: -240, name: 'Avery Stone', series: [{ shots: shots([9.1, 9.4]) }] })
    expect(named.result?.pageText).toEqual(['Avery Stone'])
    expect(named.result?.event).toBe('Air Rifle 60')
  })

  it('counts the sighters of a result shot without switching to match mode (Total 0)', async () => {
    const { reading } = await read({ printed, pcOffsetMin: -240, series: [{ sighter: true, shots: shots([9.1, 10.4, 8.8]) }, { sighter: true, shots: shots([10.2, 9.9]) }] })
    expect(reading).toMatchObject({ shots: 5, total: 48.4, innerTens: 2, sighters: 0, fromSighters: true, noShots: false, problems: [] })
    expect(reading?.series.map((s) => s.n)).toEqual([1, 2])
    expect(reading?.mpi).not.toBeNull()
    expect(reading?.notes).toContain('Shot without switching to match mode: its 5 sighters are counted as the session\'s shots.')
  })
})
