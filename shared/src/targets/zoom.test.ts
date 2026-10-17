import { describe, expect, it } from 'vitest'
import { type ZoomFrame, type ZoomView, clampView, fitScale, gestureView, panBy, restView, toContent, toView, wheelZoomFactor, zoomAt } from './zoom'

// A view the shape of the content (as the card's), and a square one around a taller picture.
const card: ZoomFrame = { width: 400, height: 500, contentWidth: 1200, contentHeight: 1500, maxZoom: 6 }
const square: ZoomFrame = { width: 300, height: 300, contentWidth: 100, contentHeight: 200, maxZoom: 6 }

const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6)
  expect(a.y).toBeCloseTo(b.y, 6)
}

describe('zooming a picture', () => {
  it('starts with the whole picture, centred', () => {
    expect(restView(card)).toEqual({ k: 1, tx: 0, ty: 0 })
    const r = restView(square)
    expect(fitScale(square)).toBe(1.5)
    expect(r.tx).toBe(75)
    expect(r.ty).toBe(0)
  })

  it('keeps the point under the wheel where it is', () => {
    const at = { x: 130, y: 210 }
    let v: ZoomView = restView(card)
    const under = toContent(card, v, at)
    for (const k of [1.4, 2.2, 3.7, 6]) {
      v = zoomAt(card, v, at, k)
      near(toView(card, v, under), at)
    }
    // Further than the most it zooms: the zoom stops, the point still stays put.
    v = zoomAt(card, v, at, 20)
    expect(v.k).toBe(6)
    near(toView(card, v, under), at)
  })

  it('never lets the picture drift off: zoomed out it comes back whole, zoomed in it covers the view', () => {
    const v = zoomAt(card, restView(card), { x: 390, y: 490 }, 3)
    expect(zoomAt(card, v, { x: 10, y: 10 }, 0.2)).toEqual(restView(card))
    const far = panBy(card, v, 5000, -5000)
    expect(far.tx).toBe(0)
    expect(far.ty).toBe(card.height - card.contentHeight * fitScale(card) * 3)
    expect(clampView(card, { k: 2, tx: 50, ty: 50 })).toEqual({ k: 2, tx: 0, ty: 0 })
  })

  it('pans with one pointer: the point under it follows it', () => {
    const v = zoomAt(card, restView(card), { x: 200, y: 250 }, 4)
    const grab = { x: 150, y: 200 }
    const under = toContent(card, v, grab)
    const to = { x: 190, y: 160 }
    near(toView(card, gestureView(card, v, [grab], [to]), under), to)
  })

  it('pinches around the fingers: the point under their midpoint stays under it, the zoom following their spread', () => {
    let v = restView(card)
    let from = [
      { x: 150, y: 250 },
      { x: 250, y: 250 },
    ]
    const under = toContent(card, v, { x: 200, y: 250 })
    // Spread to twice as far apart, moving down a little: twice the zoom, the midpoint's point under the new midpoint.
    const to = [
      { x: 100, y: 270 },
      { x: 300, y: 270 },
    ]
    v = gestureView(card, v, from, to)
    expect(v.k).toBeCloseTo(2, 9)
    near(toView(card, v, under), { x: 200, y: 270 })
    // Step by step, in many small moves, it ends where one big move does.
    from = to
    let step = v
    let prev = from
    for (let i = 1; i <= 20; i++) {
      const next = [
        { x: 100 - i * 2, y: 270 + i },
        { x: 300 + i * 2, y: 270 + i },
      ]
      step = gestureView(card, step, prev, next)
      prev = next
    }
    const once = gestureView(card, v, from, prev)
    expect(step.k).toBeCloseTo(once.k, 9)
    expect(step.tx).toBeCloseTo(once.tx, 6)
    expect(step.ty).toBeCloseTo(once.ty, 6)
  })

  it('doesn’t jump when a finger is added or lifted mid-gesture', () => {
    const a = { x: 120, y: 300 }
    const b = { x: 280, y: 200 }
    let v = gestureView(card, restView(card), [a, b], [{ x: 100, y: 320 }, { x: 300, y: 180 }])
    // One finger lifts: the gesture goes on from the finger still down, where it is. Nothing moves until it does.
    const still = { x: 300, y: 180 }
    expect(gestureView(card, v, [still], [still])).toEqual(v)
    const under = toContent(card, v, still)
    v = gestureView(card, v, [still], [{ x: 280, y: 190 }])
    near(toView(card, v, under), { x: 280, y: 190 })
    // A second finger comes down: again nothing moves until the fingers do.
    const two = [{ x: 280, y: 190 }, { x: 150, y: 260 }]
    expect(gestureView(card, v, two, two)).toEqual(v)
    // Pointers that don't match up (a pointer list in the middle of changing) change nothing.
    expect(gestureView(card, v, two, [two[0]])).toEqual(v)
  })

  it('zooms about 1.2× a mouse notch, in or out, and smoothly for a pinch', () => {
    expect(wheelZoomFactor(-100, 0, false)).toBeCloseTo(1.2214, 3)
    expect(wheelZoomFactor(100, 0, false)).toBeCloseTo(1 / 1.2214, 3)
    expect(wheelZoomFactor(-3, 1, false)).toBeCloseTo(wheelZoomFactor(-99, 0, false), 6)
    expect(wheelZoomFactor(-4, 0, true)).toBeCloseTo(Math.exp(0.04), 6)
    expect(wheelZoomFactor(-100000, 0, false)).toBeCloseTo(Math.exp(0.6), 6)
  })
})
