import { type CSSProperties, useRef } from 'react'
import { PELLET_MM, ringRadiusMm } from '@shared/shooting/target'
import { CARD_BULLS, bullCentreMm } from '@shared/targets/card'
import { FLAT, FLAT_SIZE, flatPoint } from '@shared/targets/flat'
import type { Vec } from '@shared/targets/geometry'
import { type CardReview, bullState } from '@shared/targets/review'
import { SHOT_COLOR, STATE_COLORS, drawPill, scoreLabel } from './parts'
import { type ZoomInfo, ZoomCanvas } from './ZoomCanvas'

const RING1 = ringRadiusMm(1) * FLAT.pxPerMm
const PELLET = (PELLET_MM / 2) * FLAT.pxPerMm

/**
 * The scanned card as the Drive keeps it (the flattened card, shared/src/targets/flat.ts) with what was found drawn
 * on it, as the phone app draws it: each record bull's outer ring in its state's colour with a badge of its score, and
 * every counted shot as a pellet-sized circle. It zooms and moves (ZoomCanvas); clicking a bull opens it up close.
 */
export function CardPicture({
  image,
  review,
  selected,
  onBull,
  className,
  style,
}: {
  image: CanvasImageSource
  review: CardReview
  /** The bull open up close, ringed. */
  selected: number | null
  onBull: (n: number) => void
  className?: string
  style?: CSSProperties
}) {
  const hovered = useRef<number | null>(null)
  const bulls = review.bulls.map((b) => {
    const centre = bullCentreMm(CARD_BULLS.find((x) => x.kind === 'record' && x.n === b.n)!)
    return {
      b,
      at: flatPoint(centre.x, centre.y),
      state: bullState(b, review.shotsPerBull),
      shots: b.shots.filter((t) => t.x !== null && t.y !== null).map((t) => flatPoint(centre.x + (t.x as number), centre.y - (t.y as number))),
    }
  })
  const bullAt = (c: Vec) => bulls.find(({ at }) => (at.x - c.x) ** 2 + (at.y - c.y) ** 2 <= RING1 * RING1)?.b.n ?? null

  const draw = (ctx: CanvasRenderingContext2D, z: ZoomInfo) => {
    const px = 1 / z.s
    ctx.save()
    ctx.translate(z.tx, z.ty)
    ctx.scale(z.s, z.s)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, FLAT_SIZE.width, FLAT_SIZE.height)
    for (const { b, at, state, shots } of bulls) {
      const on = b.n === selected
      ctx.beginPath()
      ctx.arc(at.x, at.y, RING1, 0, Math.PI * 2)
      if (on) {
        // The bull open up close: a dark edge under a thicker ring, so it stands out on paper and on black.
        ctx.lineWidth = 7 * px
        ctx.strokeStyle = 'rgba(10, 10, 10, 0.5)'
        ctx.stroke()
      }
      ctx.lineWidth = (on ? 4 : b.n === hovered.current ? 3.5 : 2.5) * px
      ctx.strokeStyle = STATE_COLORS[state]
      ctx.stroke()
      for (const p of shots) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, PELLET, 0, Math.PI * 2)
        ctx.lineWidth = 2 * px
        ctx.strokeStyle = SHOT_COLOR
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(p.x, p.y, 1.5 * px, 0, Math.PI * 2)
        ctx.fillStyle = SHOT_COLOR
        ctx.fill()
      }
    }
    ctx.restore()
    for (const { b, at, state } of bulls) {
      const corner = z.toView({ x: at.x + RING1 * 0.72, y: at.y + RING1 * 0.72 })
      drawPill(ctx, corner.x, corner.y, `${b.n}: ${scoreLabel(b.shots.map((t) => t.value))}`, STATE_COLORS[state])
    }
  }

  return (
    <ZoomCanvas
      contentWidth={FLAT_SIZE.width}
      contentHeight={FLAT_SIZE.height}
      draw={draw}
      onTap={(c) => {
        const n = bullAt(c)
        if (n !== null) onBull(n)
      }}
      onHover={(c) => {
        const n = c ? bullAt(c) : null
        if (n === hovered.current) return false
        hovered.current = n
        return true
      }}
      cursorAt={(c) => (bullAt(c) !== null ? 'pointer' : null)}
      touchAtRest="page"
      label="The card. Choose a bull to check it up close; zoom with the wheel, a pinch, or the + and − keys, and 0 to see it whole."
      className={className}
      style={style}
      testId="card-picture"
    />
  )
}
