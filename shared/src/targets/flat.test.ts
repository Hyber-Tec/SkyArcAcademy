import { describe, expect, it } from 'vitest'
import type { Evaluation } from '../shooting/evaluation'
import { CARD_BULLS, bullCentreMm } from './card'
import { FLAT, FLAT_SIZE, cardEvaluation, cardFileName, editModeOf, flatBull, flatPoint, flattenPhoto, isFlatCard, keepOnResave, savedReview, wasScanned } from './flat'
import { placeShot, startReview } from './review'
import { scanCard } from './scan'
import { type SyntheticShot, drawSyntheticCard } from './synthetic'

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

  it('keeps what a card was, and the score written on it, when it’s saved again', () => {
    const scanned = card(Array.from({ length: 10 }, () => ({ v: 8, x: 6, y: 6 })))
    const saved = { ...cardEvaluation({ student: { id: 's1', name: 'Test Student' }, position: 'prone', dateKey: '2026-10-01', note: '', review: savedReview(scanned)!, total: null }, 'f1'), id: 'e1', kind: 'competition' as const }
    const at = { seconds: 0, nanoseconds: 0, toDate: () => new Date(0), toMillis: () => 0 }
    const official = { ...saved, total: 85, wholeTotal: 85, official: { appTotal: 80, by: 'coach@example.test', at } }
    const moved = cardEvaluation({ student: { id: 's1', name: 'Test Student' }, position: 'prone', dateKey: '2026-10-01', note: '', review: placeShot(savedReview(scanned)!, 3, 0, 0, 0), total: null }, 'f1')
    expect(moved.total).toBe(82)
    expect(keepOnResave(saved, moved)).toMatchObject({ kind: 'competition', total: 82 })
    expect(keepOnResave(saved, moved)).not.toHaveProperty('id')
    expect(keepOnResave(official, moved)).toMatchObject({ kind: 'competition', total: 85, wholeTotal: 85, official: { appTotal: 82 } })
    // The reading now agrees with what the coach wrote: no longer marked.
    expect(keepOnResave({ ...official, total: 82, wholeTotal: 82 }, moved).official).toBeNull()
  })

  it('names a card in the Drive by its date and position', () => {
    expect(cardFileName('2026-11-02', 'kneeling')).toBe('2026-11-02 Kneeling paper card.jpg')
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

describe('a photo flattened into the card', () => {
  // Made-up holes on a made-up card, photographed at a slant and turned a little.
  const shots: SyntheticShot[] = [
    { bull: 1, x: 1.2, y: 0.4 },
    { bull: 2, x: -3.4, y: 1.1 },
    { bull: 3, x: 5.8, y: -2.9 },
    { bull: 4, x: -1.0, y: -8.6 },
    { bull: 5, x: 11.3, y: 0.9 },
    { bull: 6, x: -6.1, y: 6.4 },
    { bull: 7, x: 0.6, y: 12.2 },
    { bull: 8, x: 4.4, y: 3.6 },
    { bull: 9, x: -9.6, y: -4.1 },
    { bull: 10, x: 1.6, y: -0.9 },
  ]

  it('puts every bull where the flattened card has it, so the shots read the same there', () => {
    const photo = drawSyntheticCard({ width: 1200, height: 1600, shots, tilt: { x: 0.0003, y: -0.0002 }, turnDeg: 4, background: 'brown' })
    const scan = scanCard(photo)
    expect(scan.ok).toBe(true)
    const flat = flattenPhoto(photo, scan.cardToImage!)
    expect([flat.width, flat.height]).toEqual([FLAT_SIZE.width, FLAT_SIZE.height])
    expect(isFlatCard(flat.width, flat.height)).toBe(true)
    // Read again from the flattened card: each bull where flatBull says, and the same shots in the same places.
    const again = scanCard(flat)
    expect(again.ok).toBe(true)
    const first = startReview(scan)
    for (const b of startReview(again).bulls) {
      expect(Math.hypot(b.center.x - flatBull(b.n)!.center.x, b.center.y - flatBull(b.n)!.center.y), `bull ${b.n}`).toBeLessThan(2)
      const was = first.bulls.find((x) => x.n === b.n)!.shots[0]
      expect(b.shots[0].value, `bull ${b.n}`).toBe(was.value)
      expect(Math.hypot((b.shots[0].x ?? 0) - (was.x ?? 0), (b.shots[0].y ?? 0) - (was.y ?? 0)), `bull ${b.n}`).toBeLessThan(0.3)
    }
  })
})
