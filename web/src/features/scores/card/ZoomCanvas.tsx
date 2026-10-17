import { type CSSProperties, type KeyboardEvent, type PointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { LuMaximize, LuZoomIn, LuZoomOut } from 'react-icons/lu'
import type { Vec } from '@shared/targets/geometry'
import { type ZoomFrame, type ZoomView, clampView, gestureView, panBy, restView, scaleOf, toContent, toView, wheelZoomFactor, zoomAt } from '@shared/targets/zoom'
import { Button } from '@/components/ui/button'
import { prefersReducedMotion } from '@/features/scores/playback'
import { cn } from '@/lib/utils'

/** How far in it zooms, and where a double click or a double tap goes. */
const MAX_ZOOM = 6
const DOUBLE_ZOOM = 3
/** A pointer moving this far (pixels) is a drag, not a click or a tap. */
const SLOP = { mouse: 3, other: 6 }
/** A second tap within this long and this near makes a double tap. */
const DOUBLE_MS = 320
const DOUBLE_PX = 30
const STEP = 1.5

/** Where the content is in the view, for drawing: content point (x, y) shows at (tx + x·s, ty + y·s). */
export interface ZoomInfo {
  /** View pixels per content unit. */
  s: number
  k: number
  tx: number
  ty: number
  width: number
  height: number
  toView: (c: Vec) => Vec
}

/** Something of the caller's that a pointer can pick up and move (a shot), instead of moving the view. */
export interface ZoomDrag {
  /** A pointer went down at content point `c`; true picks the caller's thing up. */
  start: (c: Vec, z: ZoomInfo, pointerType: string) => boolean
  /** The pointer moved: the content point under it now. */
  move: (c: Vec) => void
  /** It's put down: moved (`drop`), only pressed (`tap`), or called off (`cancel`: Escape, or the browser took the touch). */
  end: (how: 'drop' | 'tap' | 'cancel') => void
}

interface Pointer {
  x: number
  y: number
  downX: number
  downY: number
  type: string
}

interface Gesture {
  frame: ZoomFrame | null
  view: ZoomView
  pointers: Map<number, Pointer>
  mode: 'idle' | 'pan' | 'pinch' | 'drag'
  dragId: number | null
  /** The pointers' places at the last move (the gesture goes on from them). */
  last: Vec[]
  moved: boolean
  /** More than one pointer has been down since the first: no tap then. */
  several: boolean
  lastTap: { t: number; x: number; y: number } | null
  tapTimer: number | null
  anim: { to: (t: number) => ZoomView; start: number; duration: number } | null
  raf: number | null
  hover: Vec | null
  level: Level
}

type Level = 'rest' | 'in' | 'max'

const ease = (t: number) => 1 - (1 - t) ** 3

/**
 * A picture the person zooms and moves around, drawn on a canvas from full resolution at every scale (sharp at 6×),
 * frame by frame: the mouse wheel or a trackpad pinch zooms around the pointer, a drag moves a zoomed picture, a double
 * click (or double tap) zooms in there and back out, + and − (buttons and keys) zoom around the middle, 0 shows it
 * whole. On a touch screen two fingers pinch around their midpoint and one finger moves a zoomed picture; at its
 * whole size, one finger scrolls the page (`touchAtRest="page"`). The point under the pointer or the fingers stays
 * under them, and a finger added or lifted mid-gesture never makes it jump (shared/src/targets/zoom.ts).
 *
 * The caller draws (`draw`, in view pixels with the zoom given), hears taps in content units, and can pick things up
 * (`drag`) and take keys first (`onKey`, arrows to nudge a shot).
 */
export function ZoomCanvas({
  contentWidth,
  contentHeight,
  draw,
  onTap,
  tapDelay = 'touch',
  drag,
  onHover,
  cursorAt,
  onKey,
  touchAtRest = 'none',
  label,
  keyShortcuts = '+ - 0',
  className,
  style,
  testId,
}: {
  contentWidth: number
  contentHeight: number
  /** Draws a frame: the context is in view pixels (the screen's pixel ratio already applied). */
  draw: (ctx: CanvasRenderingContext2D, z: ZoomInfo) => void
  onTap?: (c: Vec) => void
  /** Taps wait a moment for a double tap: on touch screens only, or for every pointer (when a tap changes things). */
  tapDelay?: 'touch' | 'always'
  drag?: ZoomDrag
  /** The mouse is over content point `c` (null: it left); true when that changes the drawing (it's drawn again). */
  onHover?: (c: Vec | null) => boolean
  /** The mouse pointer over content point `c` (null: the default for zooming). */
  cursorAt?: (c: Vec, z: ZoomInfo) => string | null
  /** Keys go here first; true when it used the key. */
  onKey?: (e: KeyboardEvent<HTMLDivElement>) => boolean
  /** One finger on the whole picture: scrolls the page, or does nothing (the picture holds every touch). */
  touchAtRest?: 'page' | 'none'
  label: string
  keyShortcuts?: string
  /** The frame's size and shape (the canvas fills it). */
  className?: string
  style?: CSSProperties
  testId?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [level, setLevel] = useState<Level>('rest')
  // The latest props, for the handlers and the frame drawn (kept outside render).
  const props = useRef({ draw, onTap, tapDelay, drag, onHover, cursorAt, onKey })

  const g = (): Gesture =>
    (gesture.current ??= {
      frame: null,
      view: { k: 1, tx: 0, ty: 0 },
      pointers: new Map(),
      mode: 'idle',
      dragId: null,
      last: [],
      moved: false,
      several: false,
      lastTap: null,
      tapTimer: null,
      anim: null,
      raf: null,
      hover: null,
      level: 'rest',
    })

  const info = (st: Gesture): ZoomInfo | null => {
    const f = st.frame
    if (!f) return null
    const v = st.view
    return { s: scaleOf(f, v), k: v.k, tx: v.tx, ty: v.ty, width: f.width, height: f.height, toView: (c) => toView(f, v, c) }
  }

  const paint = () => {
    const st = g()
    st.raf = null
    const el = canvas.current
    const f = st.frame
    if (!el || !f) return
    if (st.anim) {
      const t = Math.min(1, (performance.now() - st.anim.start) / st.anim.duration)
      st.view = st.anim.to(ease(t))
      if (t < 1) schedule()
      else st.anim = null
    }
    const dpr = window.devicePixelRatio || 1
    const w = Math.round(f.width * dpr)
    const h = Math.round(f.height * dpr)
    if (el.width !== w || el.height !== h) {
      el.width = w
      el.height = h
    }
    const ctx = el.getContext('2d')
    const z = info(st)
    if (!ctx || !z) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, f.width, f.height)
    props.current.draw(ctx, z)
    // What it shows, for the browser tests (scripts read these back).
    el.dataset.k = z.k.toFixed(4)
    el.dataset.tx = z.tx.toFixed(2)
    el.dataset.ty = z.ty.toFixed(2)
    const next: Level = st.view.k >= MAX_ZOOM - 1e-6 ? 'max' : st.view.k > 1.0005 ? 'in' : 'rest'
    if (next !== st.level) {
      st.level = next
      setLevel(next)
    }
  }

  const schedule = () => {
    const st = g()
    st.raf ??= requestAnimationFrame(paint)
  }

  const animate = (to: (t: number) => ZoomView, duration = 220) => {
    const st = g()
    if (prefersReducedMotion()) {
      st.anim = null
      st.view = to(1)
    } else st.anim = { to, start: performance.now(), duration }
    schedule()
  }

  /** Zooms to `k` around view point `at`, the point under it staying there all the way. */
  const zoomTo = (at: Vec, k: number) => {
    const st = g()
    const f = st.frame
    if (!f) return
    const from = st.view
    animate((t) => zoomAt(f, from, at, from.k * (k / from.k) ** t))
  }

  const fit = () => {
    const st = g()
    const f = st.frame
    if (!f) return
    const from = st.view
    const to = restView(f)
    animate((t) => clampView(f, { k: from.k + (to.k - from.k) * t, tx: from.tx + (to.tx - from.tx) * t, ty: from.ty + (to.ty - from.ty) * t }))
  }

  const middle = (): Vec => {
    const f = g().frame
    return f ? { x: f.width / 2, y: f.height / 2 } : { x: 0, y: 0 }
  }

  const setCursor = () => {
    const st = g()
    const el = canvas.current
    const z = info(st)
    if (!el || !z || !st.frame) return
    let cursor = 'default'
    if (st.mode === 'drag' || (st.mode === 'pan' && st.pointers.size && st.view.k > 1.0005)) cursor = 'grabbing'
    else if (st.hover) cursor = props.current.cursorAt?.(toContent(st.frame, st.view, st.hover), z) ?? (st.view.k > 1.0005 ? 'grab' : 'default')
    el.style.cursor = cursor
  }

  // The latest props for the handlers, and a new frame after every render (the caller's drawing may have changed).
  useLayoutEffect(() => {
    props.current = { draw, onTap, tapDelay, drag, onHover, cursorAt, onKey }
    schedule()
  })

  // The view's size (the canvas's, inside the frame's border): measured, and kept as it changes (the zoom and the
  // point in the middle stay).
  useLayoutEffect(() => {
    const el = canvas.current
    if (!el) return
    const measure = () => {
      const st = g()
      const { width, height } = el.getBoundingClientRect()
      if (width < 1 || height < 1) return
      const next: ZoomFrame = { width, height, contentWidth, contentHeight, maxZoom: MAX_ZOOM }
      const prev = st.frame
      if (prev && prev.width === width && prev.height === height && prev.contentWidth === contentWidth && prev.contentHeight === contentHeight) return
      if (!prev || st.view.k <= 1.0005) st.view = restView(next)
      else {
        const c = toContent(prev, st.view, { x: prev.width / 2, y: prev.height / 2 })
        const s = scaleOf(next, st.view)
        st.view = clampView(next, { k: st.view.k, tx: width / 2 - c.x * s, ty: height / 2 - c.y * s })
      }
      st.anim = null
      st.frame = next
      schedule()
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
    // `g` and `schedule` only reach refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentWidth, contentHeight])

  // The wheel (and Safari's own pinch events) can only be held from the page with listeners that aren't passive.
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const local = (e: { clientX: number; clientY: number }): Vec => {
      const r = el.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const onWheel = (e: WheelEvent) => {
      const st = g()
      const f = st.frame
      if (!f) return
      e.preventDefault()
      st.anim = null
      if (!e.ctrlKey && (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))) {
        // Sideways (a trackpad's swipe, or the wheel with Shift): moves a zoomed picture.
        const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0)
        st.view = panBy(f, st.view, -dx, e.shiftKey ? 0 : -e.deltaY)
      } else st.view = zoomAt(f, st.view, local(e), st.view.k * wheelZoomFactor(e.deltaY, e.deltaMode, e.ctrlKey))
      schedule()
    }
    // Safari on a Mac sends a trackpad pinch as gesture events (no wheel): zoom with them, and keep the page from
    // zooming. On a touch screen the fingers' own pointers zoom the picture, so these only stop the page.
    let gestureFrom: { view: ZoomView; at: Vec } | null = null
    const onGestureStart = (e: Event) => {
      e.preventDefault()
      const st = g()
      gestureFrom = st.pointers.size ? null : { view: st.view, at: local(e as unknown as MouseEvent) }
    }
    const onGestureChange = (e: Event) => {
      e.preventDefault()
      const st = g()
      const f = st.frame
      const scale = (e as unknown as { scale: number }).scale
      if (!f || !gestureFrom || st.pointers.size || !Number.isFinite(scale)) return
      st.view = zoomAt(f, gestureFrom.view, gestureFrom.at, gestureFrom.view.k * scale)
      schedule()
    }
    const onGestureEnd = (e: Event) => {
      e.preventDefault()
      gestureFrom = null
    }
    // A touch that began with one finger on the whole picture may scroll the page (touch-action: pan-y). Once the
    // picture has it (a second finger, a zoomed picture, a shot being moved), the page must not scroll for the rest
    // of that touch, even with a finger lifted: its moves are held here.
    const onTouchMove = (e: TouchEvent) => {
      const st = g()
      const held = st.mode === 'pinch' || st.mode === 'drag' || st.several || (st.mode === 'pan' && st.view.k > 1.0005)
      if (held && e.cancelable) e.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('gesturestart', onGestureStart)
    el.addEventListener('gesturechange', onGestureChange)
    el.addEventListener('gestureend', onGestureEnd)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('gesturestart', onGestureStart)
      el.removeEventListener('gesturechange', onGestureChange)
      el.removeEventListener('gestureend', onGestureEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(
    () => () => {
      const st = gesture.current
      if (!st) return
      if (st.raf) cancelAnimationFrame(st.raf)
      if (st.tapTimer) clearTimeout(st.tapTimer)
      st.raf = null
      st.tapTimer = null
    },
    [],
  )

  const localOf = (e: PointerEvent<HTMLCanvasElement>): Vec => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  /** The first two pointers down, in the order they went down. */
  const firstTwo = (st: Gesture): Vec[] => [...st.pointers.values()].slice(0, 2).map((p) => ({ x: p.x, y: p.y }))

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const st = g()
    const f = st.frame
    const z = info(st)
    if (!f || !z) return
    const p = localOf(e)
    box.current?.focus({ preventScroll: true })
    e.currentTarget.setPointerCapture(e.pointerId)
    st.anim = null
    st.pointers.set(e.pointerId, { x: p.x, y: p.y, downX: p.x, downY: p.y, type: e.pointerType })
    if (st.pointers.size === 1) {
      st.moved = false
      st.several = false
      const picked = props.current.drag?.start(toContent(f, st.view, p), z, e.pointerType) ?? false
      st.mode = picked ? 'drag' : 'pan'
      st.dragId = picked ? e.pointerId : null
      st.last = [p]
    } else {
      // A second finger: a pinch, from where the fingers are now. A shot being moved is put down first.
      st.several = true
      if (st.mode === 'drag') props.current.drag?.end(st.moved ? 'drop' : 'cancel')
      st.dragId = null
      st.mode = 'pinch'
      st.last = firstTwo(st)
    }
    setCursor()
  }

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const st = g()
    const f = st.frame
    if (!f) return
    const p = localOf(e)
    const ptr = st.pointers.get(e.pointerId)
    if (!ptr) {
      if (e.pointerType === 'mouse') {
        st.hover = p
        if (props.current.onHover?.(toContent(f, st.view, p))) schedule()
        setCursor()
      }
      return
    }
    ptr.x = p.x
    ptr.y = p.y
    if (!st.moved) {
      if (Math.hypot(p.x - ptr.downX, p.y - ptr.downY) > (e.pointerType === 'mouse' ? SLOP.mouse : SLOP.other)) st.moved = true
      else if (st.mode !== 'pinch') return
    }
    if (st.mode === 'drag') {
      if (e.pointerId === st.dragId) props.current.drag?.move(toContent(f, st.view, p))
    } else if (st.mode === 'pinch') {
      const next = firstTwo(st)
      st.view = gestureView(f, st.view, st.last, next)
      st.last = next
    } else if (st.mode === 'pan') {
      const next = [{ x: p.x, y: p.y }]
      st.view = gestureView(f, st.view, st.last, next)
      st.last = next
    }
    schedule()
  }

  /** A tap at view point `p`: a second one soon after zooms in there (or back out); `fire` tells the caller of one. */
  const tapped = (p: Vec, pointerType: string, fire: boolean) => {
    const st = g()
    const f = st.frame
    if (!f) return
    const now = performance.now()
    const prev = st.lastTap
    if (prev && now - prev.t < DOUBLE_MS && Math.hypot(p.x - prev.x, p.y - prev.y) < DOUBLE_PX) {
      st.lastTap = null
      if (st.tapTimer) clearTimeout(st.tapTimer)
      st.tapTimer = null
      if (st.view.k > 1.05) fit()
      else zoomTo(p, DOUBLE_ZOOM)
      return
    }
    st.lastTap = { t: now, x: p.x, y: p.y }
    if (st.tapTimer) clearTimeout(st.tapTimer)
    st.tapTimer = null
    if (!fire) return
    const c = toContent(f, st.view, p)
    const tell = () => props.current.onTap?.(c)
    if (props.current.tapDelay === 'touch' && pointerType === 'mouse') return tell()
    st.tapTimer = window.setTimeout(() => {
      st.tapTimer = null
      tell()
    }, DOUBLE_MS - 40)
  }

  const onPointerEnd = (e: PointerEvent<HTMLCanvasElement>) => {
    const st = g()
    const ptr = st.pointers.get(e.pointerId)
    if (!ptr) return
    st.pointers.delete(e.pointerId)
    const cancelled = e.type === 'pointercancel'
    const wasDrag = st.mode === 'drag' && e.pointerId === st.dragId
    if (wasDrag) {
      props.current.drag?.end(cancelled ? 'cancel' : st.moved ? 'drop' : 'tap')
      st.dragId = null
    }
    if (!st.pointers.size) {
      // A press on the caller's thing that didn't move (it picked it up and put it back) still counts toward a
      // double tap, without being a tap of its own.
      if (!st.moved && !st.several && !cancelled) tapped({ x: ptr.x, y: ptr.y }, e.pointerType, !wasDrag)
      st.mode = 'idle'
      // Barely zoomed: back to the whole picture.
      const f = st.frame
      if (f && st.view.k > 1.0005 && st.view.k < 1.03) fit()
    } else {
      // The fingers still down carry on from where they are.
      st.mode = st.pointers.size >= 2 ? 'pinch' : 'pan'
      st.last = firstTwo(st).slice(0, st.mode === 'pinch' ? 2 : 1)
    }
    setCursor()
    schedule()
  }

  const onPointerLeave = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType !== 'mouse') return
    const st = g()
    st.hover = null
    if (props.current.onHover?.(null)) schedule()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const st = g()
    const f = st.frame
    if (!f) return
    if (e.key === 'Escape' && st.mode === 'drag') {
      // Puts the shot back where it was.
      props.current.drag?.end('cancel')
      if (st.dragId !== null) {
        if (canvas.current?.hasPointerCapture(st.dragId)) canvas.current.releasePointerCapture(st.dragId)
        st.pointers.delete(st.dragId)
      }
      st.dragId = null
      st.mode = 'idle'
      setCursor()
      schedule()
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (props.current.onKey?.(e)) {
      e.preventDefault()
      schedule()
      return
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const zoomed = st.view.k > 1.0005
    const pan = (dx: number, dy: number) => {
      const from = st.view
      animate((t) => panBy(f, from, dx * t, dy * t), 160)
    }
    if (e.key === '+' || e.key === '=') zoomTo(middle(), st.view.k * STEP)
    else if (e.key === '-' || e.key === '_') zoomTo(middle(), st.view.k / STEP)
    else if (e.key === '0') fit()
    else if (zoomed && e.key === 'ArrowLeft') pan(f.width * 0.2, 0)
    else if (zoomed && e.key === 'ArrowRight') pan(-f.width * 0.2, 0)
    else if (zoomed && e.key === 'ArrowUp') pan(0, f.height * 0.2)
    else if (zoomed && e.key === 'ArrowDown') pan(0, -f.height * 0.2)
    else return
    e.preventDefault()
  }

  return (
    <div
      ref={box}
      role="group"
      aria-label={label}
      aria-keyshortcuts={keyShortcuts}
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-testid={testId}
      className={cn('relative overflow-hidden rounded-xl border bg-muted outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50', className)}
      style={style}
    >
      <canvas
        ref={canvas}
        aria-hidden
        className="block size-full"
        style={{ touchAction: touchAtRest === 'page' && level === 'rest' ? 'pan-y' : 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={onPointerLeave}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="absolute top-2 right-2 flex items-center gap-0.5 rounded-lg border bg-background/90 p-0.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <Button type="button" variant="ghost" size="icon" aria-label="Zoom out" title="Zoom out (−)" disabled={level === 'rest'} onClick={() => zoomTo(middle(), g().view.k / STEP)}>
          <LuZoomOut />
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Zoom in" title="Zoom in (+)" disabled={level === 'max'} onClick={() => zoomTo(middle(), g().view.k * STEP)}>
          <LuZoomIn />
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Show the whole picture" title="Whole picture (0)" disabled={level === 'rest'} onClick={fit}>
          <LuMaximize />
        </Button>
      </div>
    </div>
  )
}
