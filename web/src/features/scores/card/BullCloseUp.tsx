import { useRef, useState } from 'react'
import { LuChevronLeft, LuChevronRight, LuMinus, LuPlus, LuX } from 'react-icons/lu'
import { ringRadiusMm } from '@shared/shooting/target'
import type { Vec } from '@shared/targets/geometry'
import { type BullState, type CardReview, type ReviewBull, SURE, bullState, closeCall, holeRadiusOf, placeShot, removeShot, typeScores } from '@shared/targets/review'
import { scoreHole } from '@shared/targets/score'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MOVING_COLOR, RING_LINE, SHOT_COLOR, STATE_COLORS, drawPill, useTouchScreen } from './parts'
import { type ZoomDrag, type ZoomInfo, ZoomCanvas } from './ZoomCanvas'

/** How much of the bull the close-up shows around its centre, in millimetres: ring 1 and a little beyond (the phone's). */
const VIEW_MM = 26
/** How far beyond a circle's edge a press still picks it up (view pixels): a finger needs more room than a mouse. */
const REACH_PX = { mouse: 4, other: 12 }

/** A shot being moved: which one, and where it is now (mm from the bull's centre, x right and y up). */
export interface Moving {
  i: number
  x: number
  y: number
}

function stateText(state: BullState, touch: boolean): string {
  if (state === 'ok') return 'Looks right. To move a shot, press its green circle and drag it onto the hole: its score follows.'
  if (state === 'check') return 'Worth a look: the hole only just touches a line, or the scan wasn’t sure. Zoom in, then drag the green circle onto the hole.'
  if (state === 'missing') return `No hole found here: it counts as a miss (0). If there is one, ${touch ? 'tap' : 'click'} its centre, then drag the green circle to fine-tune.`
  return 'The photo doesn’t show this bull. Type its score below.'
}

const placed = (s: { x: number | null; y: number | null }) => s.x !== null && s.y !== null
const firstPlaced = (b: ReviewBull) => {
  const i = b.shots.findIndex(placed)
  return i < 0 ? null : i
}
const inView = (mm: number) => Math.max(-VIEW_MM, Math.min(VIEW_MM, mm))

/**
 * One bull up close, to check and correct what was found: the flattened card's photo around it with the ring lines 1
 * to 9 drawn thin over it, and each counted shot as a green circle the size of its hole (as the scan measured it, or
 * the card's usual hole for one placed by hand), which is what it's scored with. Press a circle and drag it: it
 * follows the pointer (held where it was grabbed) and its score follows it; let go to move the shot. Clicking the
 * paper places a missing shot; the arrow keys nudge the chosen shot by 0.1 mm (Shift: 0.5 mm). It zooms like the card.
 * Below: the shots with how each was counted (and why a close call is one), Remove, and typed scores for a bull the
 * picture can't settle. As the phone app's BullEditor.
 */
export function BullCloseUp({
  image,
  review,
  n,
  total,
  moving,
  onMoving,
  onChange,
  onStep,
  onClose,
}: {
  /** The flattened card; null without a picture (typed scores only). */
  image: CanvasImageSource | null
  review: CardReview
  n: number
  /** The card's total as it stands (a shot being dragged counted where it is now), shown beside the bull's name. */
  total: number
  moving: Moving | null
  /** A shot being dragged, as its score changes (null once it's put down). */
  onMoving: (m: Moving | null) => void
  onChange: (next: CardReview) => void
  /** Opens another bull. */
  onStep: (n: number) => void
  onClose: () => void
}) {
  const touch = useTouchScreen()
  const bull = review.bulls.find((b) => b.n === n)!
  const state = bullState(bull, review.shotsPerBull, review)
  const short = bull.shots.length < review.shotsPerBull
  const pictured = bull.found && !!image
  const [chosen, setChosen] = useState<number | null>(() => firstPlaced(bull))
  const selected = chosen !== null && chosen < bull.shots.length && placed(bull.shots[chosen]) ? chosen : firstPlaced(bull)
  // The shot under the pointer, and the one being dragged (close-up millimetres, y down; held off the grabbed point).
  const hovered = useRef<number | null>(null)
  const dragging = useRef<{ i: number; dx: number; dy: number; x: number; y: number; tenth: number } | null>(null)

  /** The shots' places on the close-up (mm from its top-left, y down); null for typed scores. Each hole's radius (mm). */
  const places = bull.shots.map((s) => (s.x === null || s.y === null ? null : { x: VIEW_MM + s.x, y: VIEW_MM - s.y }))
  const radii = bull.shots.map((s) => holeRadiusOf(s, review))
  /** The shot whose circle is at `c`, or within `beyond` mm of its edge. */
  const shotAt = (c: Vec, beyond: number) => {
    let best: number | null = null
    let bestD = Infinity
    places.forEach((p, i) => {
      const d = p ? Math.hypot(p.x - c.x, p.y - c.y) : Infinity
      if (d <= radii[i] + beyond && d < bestD) {
        best = i
        bestD = d
      }
    })
    return best as number | null
  }

  const drag: ZoomDrag = {
    start: (c, z, pointerType) => {
      const i = shotAt(c, (pointerType === 'mouse' ? REACH_PX.mouse : REACH_PX.other) / z.s)
      if (i === null) return false
      const p = places[i]!
      dragging.current = { i, dx: p.x - c.x, dy: p.y - c.y, x: p.x, y: p.y, tenth: -1 }
      setChosen(i)
      return true
    },
    move: (c) => {
      const d = dragging.current
      if (!d) return
      d.x = Math.max(0, Math.min(2 * VIEW_MM, c.x + d.dx))
      d.y = Math.max(0, Math.min(2 * VIEW_MM, c.y + d.dy))
      const x = d.x - VIEW_MM
      const y = VIEW_MM - d.y
      // The page hears of it as the score changes (every 0.25 mm, a tenth of the decimal score).
      const tenth = Math.floor(Math.hypot(x, y) * 4)
      if (tenth !== d.tenth) {
        d.tenth = tenth
        onMoving({ i: d.i, x, y })
      }
    },
    end: (how) => {
      const d = dragging.current
      dragging.current = null
      onMoving(null)
      if (d && how === 'drop') onChange(placeShot(review, n, d.i, d.x - VIEW_MM, VIEW_MM - d.y))
    },
  }

  const add = (x: number, y: number) => {
    setChosen(bull.shots.length)
    onChange(placeShot(review, n, null, x, y))
  }

  const draw = (ctx: CanvasRenderingContext2D, z: ZoomInfo) => {
    const px = 1 / z.s
    ctx.save()
    ctx.translate(z.tx, z.ty)
    ctx.scale(z.s, z.s)
    if (image) {
      // The flattened card around the bull: its pixels → millimetres from the close-up's corner (a flat card's
      // bulls are square to it, `axes` pixels a millimetre).
      const kx = bull.axes[0]
      const ky = bull.axes[3]
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, bull.center.x - VIEW_MM * kx, bull.center.y - VIEW_MM * ky, 2 * VIEW_MM * kx, 2 * VIEW_MM * ky, 0, 0, 2 * VIEW_MM, 2 * VIEW_MM)
    }
    ctx.lineWidth = px
    ctx.strokeStyle = RING_LINE
    for (let ring = 1; ring <= 9; ring++) {
      ctx.beginPath()
      ctx.arc(VIEW_MM, VIEW_MM, ringRadiusMm(ring), 0, Math.PI * 2)
      ctx.stroke()
    }
    const d = dragging.current
    places.forEach((p, i) => {
      if (!p) return
      const moved = d && d.i === i
      const at = moved ? { x: d.x, y: d.y } : p
      const color = moved ? MOVING_COLOR : SHOT_COLOR
      const strong = moved || i === selected || i === hovered.current
      if (i === selected && !moved) {
        // The chosen shot (the arrow keys move it): a light edge around it.
        ctx.beginPath()
        ctx.arc(at.x, at.y, radii[i] + 3 * px, 0, Math.PI * 2)
        ctx.lineWidth = 1.5 * px
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(at.x, at.y, radii[i], 0, Math.PI * 2)
      ctx.lineWidth = (strong ? 3 : 2) * px
      ctx.strokeStyle = color
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(at.x, at.y, 1.6 * px, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    })
    ctx.restore()
    if (d) {
      // The score where it is now, over the circle.
      const s = scoreHole(Math.hypot(d.x - VIEW_MM, VIEW_MM - d.y), radii[d.i])
      const top = z.toView({ x: d.x, y: d.y - radii[d.i] })
      drawPill(ctx, top.x, top.y - 6, `${s.value} · ${s.decimal.toFixed(1)}`, MOVING_COLOR, 'above')
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || selected === null) return false
    const s = bull.shots[selected]
    const step = e.shiftKey ? 0.5 : 0.1
    const by: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    const d = by[e.key]
    if (!d || s.x === null || s.y === null) return false
    onChange(placeShot(review, n, selected, inView(s.x + d[0]), inView(s.y + d[1])))
    return true
  }

  // The list shows a shot being dragged where it is now, with its score there.
  const shown = bull.shots.map((s, i) => (moving && moving.i === i ? { ...s, x: moving.x, y: moving.y, ...scoreHole(Math.hypot(moving.x, moving.y), radii[i]) } : s))
  const typedOnly = bull.shots.length > 0 && !bull.shots.some(placed)
  const text = pictured
    ? typedOnly
      ? `Typed in, without a place on the target. To place it on its hole instead, remove it, then ${touch ? 'tap' : 'click'} the hole.`
      : stateText(state, touch)
    : bull.shots.length
      ? 'Typed in, without a place on the target. Change it below.'
      : image
        ? stateText('unseen', touch)
        : 'No score here: it counts as a miss (0). Type it below.'
  const warn = pictured && !typedOnly ? state !== 'ok' : !bull.shots.length

  return (
    <div className="space-y-4" data-testid="bull-close-up">
      <div className="flex items-center gap-1">
        <span className="mr-1 size-2.5 shrink-0 rounded-full" style={{ background: STATE_COLORS[state] }} aria-hidden />
        <h2 className="min-w-0 flex-1 text-base font-semibold">Bull {n}</h2>
        <span className="mr-1 text-sm whitespace-nowrap text-muted-foreground tabular-nums" data-testid="bull-card-total">
          Total <span className="font-semibold text-foreground">{total}</span>
        </span>
        <Button type="button" variant="ghost" size="icon" aria-label="Previous bull" title="Previous bull" disabled={n <= 1} onClick={() => onStep(n - 1)}>
          <LuChevronLeft />
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Next bull" title="Next bull" disabled={n >= review.bulls.length} onClick={() => onStep(n + 1)}>
          <LuChevronRight />
        </Button>
        <Button type="button" variant="ghost" size="icon" aria-label="Close the bull" title="Close (Esc)" onClick={onClose}>
          <LuX />
        </Button>
      </div>
      <p className={cn('text-sm', warn ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground')}>{text}</p>
      {pictured ? (
        <div>
          <ZoomCanvas
            key={n}
            contentWidth={2 * VIEW_MM}
            contentHeight={2 * VIEW_MM}
            draw={draw}
            drag={drag}
            tapDelay="always"
            onTap={(c) => {
              if (short && Math.hypot(c.x - VIEW_MM, c.y - VIEW_MM) <= VIEW_MM) add(c.x - VIEW_MM, VIEW_MM - c.y)
            }}
            onHover={(c) => {
              const i = c ? shotAt(c, 0) : null
              if (i === hovered.current) return false
              hovered.current = i
              return true
            }}
            cursorAt={(c, z) => (shotAt(c, REACH_PX.mouse / z.s) !== null ? 'grab' : short ? 'crosshair' : null)}
            onKey={onKey}
            label={`Bull ${n}, up close. Drag a green circle to move its shot; the arrow keys nudge the chosen shot, with Shift further.`}
            keyShortcuts="+ - 0 ArrowLeft ArrowRight ArrowUp ArrowDown"
            className="mx-auto aspect-square w-full max-w-[460px] bg-black"
            testId="bull-zoom"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {touch
              ? 'Press a green circle and drag it onto its hole. Pinch to zoom, double-tap to zoom in there.'
              : 'Drag a green circle onto its hole. Scroll or pinch to zoom, double-click to zoom in there. The arrow keys nudge the chosen shot by 0.1 mm (Shift: 0.5 mm).'}
          </p>
        </div>
      ) : null}
      {pictured && short ? (
        <Button type="button" variant="outline" className="w-full" onClick={() => add(0, 0)} data-testid="bull-add-shot">
          Add the shot, then drag it onto the hole
        </Button>
      ) : null}
      <section aria-label={review.shotsPerBull === 1 ? 'The shot' : 'The shots'}>
        <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">{review.shotsPerBull === 1 ? 'The shot' : 'The shots'}</h3>
        {shown.length ? (
          <ul className="space-y-1.5">
            {shown.map((s, i) => {
              const close = closeCall(s, review)
              const size = s.x !== null ? ` · hole ${(2 * radii[i]).toFixed(1)} mm across` : ''
              const how =
                moving?.i === i
                  ? 'Moving'
                  : s.saved
                    ? s.x === null
                      ? 'Typed in, as saved'
                      : 'As saved'
                    : s.x === null
                      ? 'Typed in'
                      : s.manual
                        ? 'Placed by you'
                        : s.confidence < SURE
                          ? 'The scan wasn’t sure'
                          : 'Found by the scan'
              const choosable = pictured && placed(s)
              return (
                <li key={i} className={cn('flex items-center gap-2 rounded-lg border py-1.5 pr-1.5 pl-3', i === selected && pictured && 'border-foreground/30 bg-muted/60')} data-testid={`bull-shot-${i}`}>
                  <button
                    type="button"
                    disabled={!choosable}
                    aria-pressed={choosable ? i === selected : undefined}
                    onClick={() => setChosen(i)}
                    className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default"
                    title={choosable ? 'Choose it: the arrow keys on the picture then nudge it' : undefined}
                  >
                    <span className="block text-sm font-semibold tabular-nums">
                      {s.value}
                      {s.decimal !== null ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">({s.decimal.toFixed(1)})</span> : null}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {close ? `${how}${size} · close call: its edge reaches the ${close.ring} ring’s line by only ${close.byMm.toFixed(2)} mm, so it counts ${close.ring}` : `${how}${size}`}
                    </span>
                  </button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => onChange(removeShot(review, n, i))} aria-label={`Remove shot ${i + 1}`}>
                    Remove
                  </Button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
            No shot. {pictured ? 'It counts as a miss (0) unless you place it.' : 'Type the score below.'}
          </p>
        )}
      </section>
      <Typed key={n} bull={bull} shots={review.shotsPerBull} open={!pictured} onType={(values) => onChange(typeScores(review, n, values))} />
    </div>
  )
}

/** Scores typed for the bull: one stepper per shot, for a bull the picture doesn't show (or to override it). */
function Typed({ bull, shots, open: openAtFirst, onType }: { bull: ReviewBull; shots: number; open: boolean; onType: (values: number[]) => void }) {
  const [open, setOpen] = useState(openAtFirst)
  const values = Array.from({ length: shots }, (_, i) => bull.shots[i]?.value ?? 0)
  if (!open)
    return (
      <Button type="button" variant="link" className="h-auto px-0" onClick={() => setOpen(true)} data-testid="bull-type-open">
        Type the score instead
      </Button>
    )
  return (
    <section aria-label="Type the score" className="space-y-2">
      <div>
        <h3 className="text-xs font-medium text-muted-foreground">Type the score</h3>
        <p className="text-xs text-muted-foreground">Whole numbers, 0 to 10. Typed scores have no place on the target.</p>
      </div>
      {values.map((v, i) => {
        const what = shots === 1 ? 'the score' : `shot ${i + 1}`
        return (
          <div key={i} className="flex items-center justify-between gap-3 rounded-lg border py-1.5 pr-1.5 pl-3">
            <span className="text-sm">{shots === 1 ? 'Score' : `Shot ${i + 1}`}</span>
            <div className="flex items-center gap-1.5">
              <Button type="button" variant="outline" size="icon" aria-label={`One less for ${what}`} disabled={v <= 0} onClick={() => onType(values.map((x, j) => (j === i ? Math.max(0, x - 1) : x)))}>
                <LuMinus />
              </Button>
              <span className="w-8 text-center text-lg font-semibold tabular-nums" aria-live="polite">
                {v}
              </span>
              <Button type="button" variant="outline" size="icon" aria-label={`One more for ${what}`} disabled={v >= 10} onClick={() => onType(values.map((x, j) => (j === i ? Math.min(10, x + 1) : x)))}>
                <LuPlus />
              </Button>
            </div>
          </div>
        )
      })}
    </section>
  )
}
