import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/** What the signing page asks of the pad. */
export interface SignaturePadHandle {
  clear: () => void
  /** The signature as a PNG (dark ink on transparent), or null when there's (almost) nothing drawn. */
  toPng: () => string | null
}

type Point = { x: number; y: number }

/** The pad is twice as wide as it's tall; points are kept as fractions of it, so a resize (a phone turned) redraws them. */
const ASPECT = 2
/** Less ink than this (in fractions of the width) isn't a signature. */
const MIN_INK = 0.12
const INK = '#111827'

/**
 * Where a signature is drawn with a finger, a pen or a mouse: on white, like paper, in light and dark, with a line to
 * sign on. Drawing never scrolls the page (touch-action: none).
 */
export function SignaturePad({ ref, invalid, onChange, label }: { ref?: React.Ref<SignaturePadHandle>; invalid?: boolean; onChange?: (hasInk: boolean) => void; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Point[][]>([])
  const drawing = useRef<{ id: number; stroke: Point[] } | null>(null)
  const [hasInk, setHasInk] = useState(false)

  const ink = () => strokes.current.reduce((n, s) => n + s.slice(1).reduce((m, p, i) => m + Math.hypot((p.x - s[i].x) * ASPECT, p.y - s[i].y), 0), 0)

  /** Draws every stroke, at the canvas's size (CSS pixels × the screen's density). */
  const redraw = useCallback(() => {
    const c = canvas.current
    if (!c) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const w = c.clientWidth
    const h = c.clientHeight
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
    }
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    paint(ctx, strokes.current, w, h, Math.max(2, w / 180))
  }, [])

  useEffect(() => {
    redraw()
    const c = canvas.current
    if (!c || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => redraw())
    ro.observe(c)
    return () => ro.disconnect()
  }, [redraw])

  useImperativeHandle(
    ref,
    () => ({
      clear: () => {
        strokes.current = []
        setHasInk(false)
        onChange?.(false)
        redraw()
      },
      toPng: () => {
        if (ink() < MIN_INK) return null
        const out = document.createElement('canvas')
        out.width = 1000
        out.height = 1000 / ASPECT
        const ctx = out.getContext('2d')
        if (!ctx) return null
        paint(ctx, strokes.current, out.width, out.height, 6)
        return out.toDataURL('image/png')
      },
    }),
    [onChange, redraw],
  )

  const at = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }

  return (
    <div className={cn('relative w-full overflow-hidden rounded-lg border bg-white', invalid && 'border-destructive ring-3 ring-destructive/20')} style={{ aspectRatio: String(ASPECT) }}>
      {/* The line to sign on, and what to do, until there's ink. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-[6%] bottom-[24%] flex items-end gap-2 border-b border-zinc-300 pb-1 text-zinc-400">
        <span className="text-lg leading-none">×</span>
        {hasInk ? null : <span className="text-sm">Sign here with your finger or mouse</span>}
      </div>
      <canvas
        ref={canvas}
        role="img"
        aria-label={label}
        className="absolute inset-0 size-full cursor-crosshair touch-none"
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          const stroke = [at(e)]
          drawing.current = { id: e.pointerId, stroke }
          strokes.current = [...strokes.current, stroke]
          redraw()
        }}
        onPointerMove={(e) => {
          const d = drawing.current
          if (!d || d.id !== e.pointerId) return
          const events = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? []
          if (events.length) {
            const r = e.currentTarget.getBoundingClientRect()
            for (const ev of events) d.stroke.push({ x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)) })
          } else d.stroke.push(at(e))
          redraw()
        }}
        onPointerUp={(e) => {
          if (drawing.current?.id !== e.pointerId) return
          drawing.current = null
          const now = ink() >= MIN_INK
          setHasInk(now || strokes.current.length > 0)
          onChange?.(now)
        }}
        onPointerCancel={() => {
          drawing.current = null
        }}
      />
    </div>
  )
}

/** Strokes as smooth lines (a dot for a tap), on a `w` × `h` surface. */
function paint(ctx: CanvasRenderingContext2D, strokes: Point[][], w: number, h: number, width: number) {
  ctx.strokeStyle = INK
  ctx.fillStyle = INK
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const s of strokes) {
    if (!s.length) continue
    if (s.length === 1) {
      ctx.beginPath()
      ctx.arc(s[0].x * w, s[0].y * h, width / 2, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    ctx.beginPath()
    ctx.moveTo(s[0].x * w, s[0].y * h)
    for (let i = 1; i < s.length - 1; i++) {
      const mx = ((s[i].x + s[i + 1].x) / 2) * w
      const my = ((s[i].y + s[i + 1].y) / 2) * h
      ctx.quadraticCurveTo(s[i].x * w, s[i].y * h, mx, my)
    }
    const last = s[s.length - 1]
    ctx.lineTo(last.x * w, last.y * h)
    ctx.stroke()
  }
}
