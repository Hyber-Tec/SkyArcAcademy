import { describe, expect, it } from 'vitest'
import { arrowAngle } from './arrow'
import { parseSiusPage, pdfDateOffsetMinutes, positionFromName, readSiusResult } from './parse'

describe('reading SIUS results', () => {
  it('says a PDF that isn’t a SIUS result isn’t one', () => {
    expect(parseSiusPage({ items: [{ str: 'Invoice', x: 10, y: 10, w: 30, font: 'f1' }], images: [], arrowAngles: {}, creationDate: null })).toBeNull()
  })

  it('flags a total that doesn’t add up', () => {
    const items = [
      { str: 'Results', x: 270, y: 788, w: 65, font: 'b' },
      { str: 'Air Rifle 60', x: 55, y: 771, w: 47, font: 'r' },
      { str: '10/7/2026 6:35:59 PM', x: 452, y: 771, w: 96, font: 'r' },
      { str: 'Total:', x: 62, y: 729, w: 24, font: 'r' },
      { str: '20.0', x: 136, y: 729, w: 19, font: 'b' },
      { str: 'Series 1:', x: 143, y: 573, w: 38, font: 'r' },
      { str: '9.0', x: 200, y: 573, w: 13.5, font: 'b' },
      { str: '9.5', x: 232, y: 573, w: 13.5, font: 'b' },
      { str: 'Series total:', x: 143, y: 547, w: 51, font: 'r' },
      { str: '18.5', x: 213, y: 547, w: 19, font: 'r' },
    ]
    const images = [
      { id: 'a', pw: 20, ph: 20, x: 213.6, y: 573 },
      { id: 'b', pw: 20, ph: 20, x: 245.6, y: 573 },
    ]
    const result = parseSiusPage({ items, images, arrowAngles: { a: 90, b: 0 }, creationDate: "D:20261007183559-04'00'" })!
    const reading = readSiusResult(result, 'America/New_York')
    expect(reading.problems).toEqual(['The series add up to 18.5, not the printed total 20.0.'])
  })

  it('keeps a result with no shots at all as a file, without scores', () => {
    const items = [
      { str: 'Results', x: 270, y: 788, w: 65, font: 'b' },
      { str: 'Air Rifle 60', x: 55, y: 771, w: 47, font: 'r' },
      { str: '10/7/2026 6:35:59 PM', x: 452, y: 771, w: 96, font: 'r' },
      { str: 'Total:', x: 62, y: 729, w: 24, font: 'r' },
      { str: '0', x: 136, y: 729, w: 6, font: 'b' },
    ]
    const result = parseSiusPage({ items, images: [], arrowAngles: {}, creationDate: "D:20261007183559-04'00'" })!
    const reading = readSiusResult(result, 'America/New_York')
    expect(reading).toMatchObject({ shots: 0, noShots: true, fromSighters: false, problems: [] })
    expect(reading.notes).toContain('No shots: the file is kept without scores.')
  })
})

describe('SIUS helpers', () => {
  it('reads the offset of a PDF date', () => {
    expect(pdfDateOffsetMinutes("D:20261007152941-07'00'")).toBe(-420)
    expect(pdfDateOffsetMinutes("D:20261007152941+05'30'")).toBe(330)
    expect(pdfDateOffsetMinutes('D:20261007152941Z')).toBe(0)
    expect(pdfDateOffsetMinutes('D:20261007152941')).toBeNull()
    expect(pdfDateOffsetMinutes(null)).toBeNull()
  })

  it('reads the position from a file name', () => {
    expect(positionFromName('Jo 20 shot Prone.pdf')).toBe('prone')
    expect(positionFromName('standing 10.pdf')).toBe('standing')
    expect(positionFromName('kneeling-set.pdf')).toBe('kneeling')
    expect(positionFromName('result.pdf')).toBeNull()
  })

  it('reads an arrow pointing right and one pointing down from their pixels', () => {
    const draw = (head: 'right' | 'down') => {
      const W = 20
      const data = new Uint8Array(W * W * 4)
      const set = (x: number, y: number) => (data[(y * W + x) * 4 + 3] = 255)
      for (let i = 3; i <= 16; i++) for (let w = -1; w <= 0; w++) (head === 'right' ? set(i, 10 + w) : set(10 + w, i))
      for (let i = 12; i <= 16; i++) for (let w = -(16 - i) - 1; w <= 16 - i; w++) (head === 'right' ? set(i, 10 + w) : set(10 + w, i))
      return { width: W, height: W, data }
    }
    expect(Math.abs(((arrowAngle(draw('right')) ?? 99) + 180) % 360 - 180)).toBeLessThan(5)
    expect(Math.abs((arrowAngle(draw('down')) ?? 0) - 270)).toBeLessThan(5)
  })
})
