import type { Vec } from './geometry'

/**
 * Zooming a picture inside a view, as the website's card and bull close-up do (the phone app's ZoomCanvas does the
 * same on its own thread): content point (x, y) shows at (tx + x·s, ty + y·s) in the view, with s = fit × k. Pure, so
 * the gestures are tested here: whatever the wheel or the fingers do, the content point under them stays under them
 * (until an edge of the picture stops it), and adding or lifting a finger never moves the picture.
 */

export interface ZoomFrame {
  /** The view, in pixels. */
  width: number
  height: number
  /** The content, in its own units. */
  contentWidth: number
  contentHeight: number
  /** How far in it may go (1 shows the whole content). */
  maxZoom: number
}

export interface ZoomView {
  /** 1 shows the whole content, up to the frame's maxZoom. */
  k: number
  tx: number
  ty: number
}

/** View pixels per content unit at zoom 1 (the content fitted to the view). */
export function fitScale(f: ZoomFrame): number {
  return Math.min(f.width / f.contentWidth, f.height / f.contentHeight)
}

/** View pixels per content unit. */
export function scaleOf(f: ZoomFrame, v: ZoomView): number {
  return fitScale(f) * v.k
}

const clampK = (f: ZoomFrame, k: number) => Math.min(f.maxZoom, Math.max(1, Number.isFinite(k) ? k : 1))

/** Keeps the zoom in its range and the content covering the view: no margins once zoomed in, centred where it's smaller. */
export function clampView(f: ZoomFrame, v: ZoomView): ZoomView {
  const k = clampK(f, v.k)
  const s = fitScale(f) * k
  const w = f.contentWidth * s
  const h = f.contentHeight * s
  const tx = w <= f.width ? (f.width - w) / 2 : Math.min(0, Math.max(f.width - w, v.tx))
  const ty = h <= f.height ? (f.height - h) / 2 : Math.min(0, Math.max(f.height - h, v.ty))
  return { k, tx, ty }
}

/** The whole content, centred. */
export function restView(f: ZoomFrame): ZoomView {
  return clampView(f, { k: 1, tx: 0, ty: 0 })
}

/** The content point under view point `p`. */
export function toContent(f: ZoomFrame, v: ZoomView, p: Vec): Vec {
  const s = scaleOf(f, v)
  return { x: (p.x - v.tx) / s, y: (p.y - v.ty) / s }
}

/** Where content point `c` shows in the view. */
export function toView(f: ZoomFrame, v: ZoomView, c: Vec): Vec {
  const s = scaleOf(f, v)
  return { x: v.tx + c.x * s, y: v.ty + c.y * s }
}

/** Zoom `k`, keeping the content point under view point `at` where it is (until an edge stops it). */
export function zoomAt(f: ZoomFrame, v: ZoomView, at: Vec, k: number): ZoomView {
  const c = toContent(f, v, at)
  const next = clampK(f, k)
  const s = fitScale(f) * next
  return clampView(f, { k: next, tx: at.x - c.x * s, ty: at.y - c.y * s })
}

/** Moves the view by (dx, dy) pixels (the content follows), within the edges. */
export function panBy(f: ZoomFrame, v: ZoomView, dx: number, dy: number): ZoomView {
  return clampView(f, { k: v.k, tx: v.tx + dx, ty: v.ty + dy })
}

const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/**
 * The view after pointers moved from `from` to `to` (view pixels, the same pointers in the same order): one pointer
 * pans, two pinch and pan (the content point under their midpoint stays under it, the zoom following how far apart
 * they are). Call it with the previous move's positions each time; when a pointer is added or lifted, the next call
 * starts from the pointers still down (with nothing moved, nothing changes), so the picture never jumps.
 */
export function gestureView(f: ZoomFrame, v: ZoomView, from: readonly Vec[], to: readonly Vec[]): ZoomView {
  if (!from.length || from.length !== to.length) return v
  if (from.length === 1) return panBy(f, v, to[0].x - from[0].x, to[0].y - from[0].y)
  const m0 = mid(from[0], from[1])
  const m1 = mid(to[0], to[1])
  const d0 = Math.hypot(from[0].x - from[1].x, from[0].y - from[1].y)
  const d1 = Math.hypot(to[0].x - to[1].x, to[0].y - to[1].y)
  const c = toContent(f, v, m0)
  const k = clampK(f, v.k * (d0 > 0 && d1 > 0 ? d1 / d0 : 1))
  const s = fitScale(f) * k
  return clampView(f, { k, tx: m1.x - c.x * s, ty: m1.y - c.y * s })
}

/**
 * How much a wheel turn zooms (a factor: above 1 in, below 1 out). A trackpad pinch arrives as a wheel with the
 * control key and small steps, a mouse wheel as larger steps (pixels, or lines in some browsers); either way about
 * 1.2× a notch, smooth for a pinch.
 */
export function wheelZoomFactor(deltaY: number, deltaMode: number, pinch: boolean): number {
  const px = deltaMode === 1 ? deltaY * 33 : deltaMode === 2 ? deltaY * 400 : deltaY
  const step = Math.max(-300, Math.min(300, px))
  return Math.exp(-step * (pinch ? 0.01 : 0.002))
}
