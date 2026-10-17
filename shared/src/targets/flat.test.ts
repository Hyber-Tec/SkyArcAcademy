import { describe, expect, it } from 'vitest'
import type { Evaluation } from '../shooting/evaluation'
import { CARD_BULLS, bullCentreMm } from './card'
import { FLAT, FLAT_SIZE, cardEvaluation, editModeOf, flatBull, flatPoint, isFlatCard, savedReview, wasScanned } from './flat'
import { placeShot } from './review'

type Saved = Pick<Evaluation, 'source' | 'series'>

const card = (shots: { v: number; x?: number; y?: number }[]): Saved => ({
  source: 'paper',
  series: [{ n: 1, total: shots.reduce((t, s) => t + s.v, 0), mpi: null, groupMm: null, shots: shots.map((s) => ({ a: null, ...s })) }],
})

describe('the flattened card', () => {
  it('is a fixed size, with the top-left bull where its millimetres say', () => {
    expect(isFlatCard(FLAT_SIZE.width, FLAT_SIZE.height)).toBe(true)
    expect(isFlatCard(FLAT_SIZE.width - 1, FLAT_SIZE.height)).toBe(false)
    const first = flatBull(1)!
    expect(first.center).toEqual(flatPoint(0, 0))
    expect(first.axes).toEqual([FLAT.pxPerMm, 0, 0, FLAT.pxPerMm])
  })

  it('places every record bull on its grid square, and no sighter', () => {
    for (const b of CARD_BULLS.filter((x) => x.kind === 'record')) {
      const c = bullCentreMm(b)
      expect(flatBull(b.n)!.center).toEqual(flatPoint(c.x, c.y))
    }
    expect(flatBull(11)).toBeNull()
  })
})

describe('changing a saved score', () => {
  it('changes a card of ten (or twenty, thirty…) bull by bull, a total-only card by its total, and nothing else', () => {
    expect(editModeOf(card(Array.from({ length: 10 }, () => ({ v: 9 }))))).toBe('card')
    expect(editModeOf(card(Array.from({ length: 20 }, () => ({ v: 9 }))))).toBe('card')
    expect(editModeOf({ source: 'paper', series: [] })).toBe('total')
    expect(editModeOf(card(Array.from({ length: 12 }, () => ({ v: 9 }))))).toBe('fixed')
    expect(editModeOf({ ...card(Array.from({ length: 10 }, () => ({ v: 9 }))), source: 'sius' })).toBe('fixed')
  })

  it('brings a scanned card back with its shots on the flattened card, and a typed one without places', () => {
    const scanned = card([{ v: 10, x: 0.5, y: -1 }, ...Array.from({ length: 9 }, () => ({ v: 8, x: 6, y: 6 }))])
    expect(wasScanned(scanned)).toBe(true)
    const review = savedReview(scanned)!
    expect(review.bulls).toHaveLength(10)
    expect(review.bulls[0].found).toBe(true)
    expect(review.bulls[0].center).toEqual(flatBull(1)!.center)
    expect(review.bulls[0].shots[0]).toMatchObject({ x: 0.5, y: -1, value: 10, saved: true })

    const typed = card(Array.from({ length: 10 }, () => ({ v: 7 })))
    expect(wasScanned(typed)).toBe(false)
    expect(savedReview(typed)!.bulls.every((b) => !b.found && b.shots[0].x === null)).toBe(true)
    expect(savedReview({ source: 'paper', series: [] })).toBeNull()
  })

  it('saves a corrected card with the moved shot rescored', () => {
    const scanned = card(Array.from({ length: 10 }, () => ({ v: 8, x: 6, y: 6 })))
    const moved = placeShot(savedReview(scanned)!, 3, 0, 0, 0)
    const e = cardEvaluation({ student: { id: 's1', name: 'Test Student' }, position: 'prone', dateKey: '2026-10-01', note: '  steady ', review: moved, total: null }, 'f1')
    expect(e.total).toBe(82)
    expect(e.shots).toBe(10)
    expect(e.note).toBe('steady')
    expect(e.fileId).toBe('f1')
    expect(e.series.flatMap((s) => s.shots)[2]).toMatchObject({ v: 10, x: 0, y: 0 })
  })
})
