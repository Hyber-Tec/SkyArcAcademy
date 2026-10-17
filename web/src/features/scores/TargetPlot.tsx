import { type ReactNode, useId } from 'react'
import { type EvalShot, pointOf } from '@shared/shooting/evaluation'
import { type ShotPoint, BLACK_RADIUS_MM, PELLET_MM, meanPoint, ringRadiusMm, targetViewMm } from '@shared/shooting/target'

/** The last shot (and the newest one while a result plays back): amber, apart from every position's color. */
export const LAST_SHOT_FILL = '#e8b100'
export const LAST_SHOT_STROKE = '#b88a00'

/** The newest shot's number, on an amber tag so it can't be read together with a ring number beside it. */
const TAG_TEXT = '#1f1600'

const PAPER = '#fbfaf7'
const BLACK = '#161616'
const LINE = '#a8a59c'
const FRAME = '#d9d6cd'

/**
 * A 10 m air rifle target drawn from the scores: each shot sits where its score and direction put it (SIUS results),
 * or where it was measured (paper cards scanned with the phone app; typed-in cards have no places). It zooms to the
 * shots, so a tight group is still easy to read, and it stays on light "paper" in dark mode, like the reports.
 */
export function TargetPlot({
  shots,
  size = 160,
  color = '#c80000',
  highlightLast = false,
  showMpi = true,
  zoom = 'auto',
  title,
  className,
}: {
  shots: readonly Pick<EvalShot, 'v' | 'a' | 'x' | 'y'>[]
  size?: number
  color?: string
  /** The last shot in another color, as SIUS draws it. */
  highlightLast?: boolean
  showMpi?: boolean
  /** `auto` zooms to the group (never closer than the 5 ring, and not below 120 px); `full` shows the whole card. */
  zoom?: 'auto' | 'full'
  title?: string
  className?: string
}) {
  const points = shots.map(pointOf).filter((p): p is ShotPoint => p !== null)
  const view = targetViewMm(points, size, zoom)
  const mpi = showMpi && points.length >= 2 ? meanPoint(points) : null
  const label = title ?? (points.length ? `${points.length} shots on the target` : 'Target')
  return (
    <TargetFace view={view} size={size} label={label} className={className}>
      {points.map((p, i) => (
        <ShotMark key={i} point={p} view={view} color={color} last={highlightLast && i === points.length - 1} />
      ))}
      {mpi ? <MpiCross point={mpi} view={view} /> : null}
    </TargetFace>
  )
}

/**
 * The target itself, `view` mm around its centre: paper, rings, ring numbers and the frame, with what's drawn on it
 * (`children`, in millimetres with y down) clipped to it. Lines and numbers keep a readable size in pixels, from a
 * thumbnail to a full-width picture.
 */
export function TargetFace({ view, size, label, className, children }: { view: number; size: number; label: string; className?: string; children?: ReactNode }) {
  const clip = useId()
  const mm = (2 * view) / size // millimetres per pixel
  const rings = Array.from({ length: 10 }, (_, i) => 10 - i).map((ring) => ({ ring, r: ringRadiusMm(ring) }))
  // Ring numbers: about 9 to 12 px whatever the zoom, and never wider than their ring (2.5 mm).
  const numberSize = Math.min(1.8, Math.min(12, Math.max(9, size / 20)) * mm)
  // Hairlines on a small picture (the whole card, where heavier rings would grey the black); at least half a pixel on a large one.
  const line = size < 120 ? view / 220 : Math.max(view / 220, 0.5 * mm)
  return (
    <svg viewBox={`${-view} ${-view} ${view * 2} ${view * 2}`} width={size} height={size} role="img" aria-label={label} className={className}>
      <defs>
        <clipPath id={clip}>
          <circle cx="0" cy="0" r={view} />
        </clipPath>
      </defs>
      <circle cx="0" cy="0" r={view} fill={PAPER} />
      <g clipPath={`url(#${clip})`}>
        {rings
          .slice()
          .reverse()
          .map(({ ring, r }) => (
            <circle key={ring} cx="0" cy="0" r={r} fill={ring >= 4 ? BLACK : PAPER} stroke={ring >= 4 ? PAPER : LINE} strokeWidth={ring === 4 ? 0 : line} />
          ))}
        <circle cx="0" cy="0" r={BLACK_RADIUS_MM} fill="none" stroke={BLACK} strokeWidth={view / 300} />
        {size >= 120
          ? [1, 2, 3, 4, 5, 6, 7, 8].map((ring) => {
              const r = ringRadiusMm(ring) - 1.25
              if (r > view - 1) return null
              const fill = ring >= 4 ? '#e9e7e0' : '#7d7a72'
              return (
                <g key={ring} fontSize={numberSize} fill={fill} textAnchor="middle" dominantBaseline="central" fontFamily="ui-sans-serif, system-ui">
                  <text x={-r} y={0}>
                    {ring}
                  </text>
                  <text x={r} y={0}>
                    {ring}
                  </text>
                </g>
              )
            })
          : null}
        {children}
      </g>
      <circle cx="0" cy="0" r={view - view / 300} fill="none" stroke={FRAME} strokeWidth={Math.max(view / 150, mm)} />
    </svg>
  )
}

/**
 * One shot: a pellet-sized circle, see-through with a solid edge so shots that overlap still read one by one. `faint`
 * keeps it in the background while another shot is the one being looked at.
 */
export function ShotMark({ point, view, color, last = false, faint = false }: { point: ShotPoint; view: number; color: string; last?: boolean; faint?: boolean }) {
  return (
    <circle
      cx={point.x}
      cy={-point.y}
      r={PELLET_MM / 2}
      fill={last ? LAST_SHOT_FILL : color}
      fillOpacity={faint ? 0.16 : 0.5}
      stroke={last ? LAST_SHOT_STROKE : color}
      strokeOpacity={faint ? 0.4 : 1}
      strokeWidth={view / 140}
    />
  )
}

/** The average point of impact, as a blue cross. */
export function MpiCross({ point, view }: { point: ShotPoint; view: number }) {
  return (
    <g stroke="#2f80ed" strokeWidth={view / 90} strokeLinecap="round">
      <line x1={point.x - 1.4} x2={point.x + 1.4} y1={-point.y} y2={-point.y} />
      <line x1={point.x} x2={point.x} y1={-point.y - 1.4} y2={-point.y + 1.4} />
    </g>
  )
}

/**
 * The newest shot drops in: it starts large and see-through and settles on its place, within the shortest step
 * (none with reduced motion).
 */
const POP = `
@keyframes skyarc-shot-pop { 0% { transform: scale(2.6); opacity: 0 } 55% { opacity: 1 } 100% { transform: scale(1); opacity: 1 } }
@keyframes skyarc-shot-label { 0% { opacity: 0 } 100% { opacity: 1 } }
.skyarc-shot-pop { transform-box: fill-box; transform-origin: center; animation: skyarc-shot-pop 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both }
.skyarc-shot-label { animation: skyarc-shot-label 160ms ease-out 60ms both }
@media (prefers-reduced-motion: reduce) { .skyarc-shot-pop, .skyarc-shot-label { animation: none } }
`

/**
 * The shot being looked at (a replay's newest, or the one a shot's dialog shows): amber, dropping into its place, with
 * its number on an amber tag beside it. The tag keeps a readable size in pixels whatever the picture's size and zoom.
 */
export function NewestShot({ point, number, view, size }: { point: ShotPoint; number: number; view: number; size: number }) {
  const tag = tagPlace(point, number, view, size)
  return (
    <>
      <style>{POP}</style>
      <circle className="skyarc-shot-pop" cx={point.x} cy={-point.y} r={PELLET_MM / 2} fill={LAST_SHOT_FILL} fillOpacity={0.85} stroke={LAST_SHOT_STROKE} strokeWidth={view / 90} />
      <g className="skyarc-shot-label">
        <rect x={tag.left} y={tag.top} width={tag.width} height={tag.height} rx={tag.height / 2} fill={LAST_SHOT_FILL} stroke={LAST_SHOT_STROKE} strokeWidth={tag.edge} />
        <text x={tag.left + tag.width / 2} y={tag.top + tag.height / 2 + tag.font * 0.36} textAnchor="middle" fontSize={tag.font} fontWeight={700} fill={TAG_TEXT} fontFamily="ui-sans-serif, system-ui">
          {number}
        </text>
      </g>
    </>
  )
}

/**
 * Where the newest shot's number tag goes, in the picture's millimetres (y down): up and to the right of the shot, or
 * on the first other side that keeps the whole tag on the target when the shot sits near its edge. As the phone app
 * draws it: the number 12 to 17 px, the tag 1.3 times as tall with 5 px each side, 4 px from the shot.
 */
function tagPlace(point: ShotPoint, n: number, view: number, sizePx: number) {
  const mm = (2 * view) / sizePx // millimetres per pixel
  const r = PELLET_MM / 2
  const font = Math.min(17, Math.max(12, sizePx / 22)) * mm
  const height = font * 1.3
  // Bold digits are about 0.62 em wide.
  const width = String(n).length * font * 0.62 + 10 * mm
  const gap = 4 * mm
  const place = (right: boolean, up: boolean) => ({
    left: right ? point.x + r + gap : point.x - r - gap - width,
    bottom: up ? point.y + r : point.y - r - height,
  })
  const onTarget = ({ left, bottom }: { left: number; bottom: number }) =>
    [left, left + width].every((x) => [bottom, bottom + height].every((y) => Math.hypot(x, y) < view * 0.93))
  const best = [place(true, true), place(false, true), place(true, false), place(false, false)].find(onTarget) ?? place(true, true)
  return { left: best.left, top: -(best.bottom + height), width, height, font, edge: mm }
}

/**
 * A small target (a list's thumbnail, a shot's dart): the card at `view` (by default the scale `targetViewMm` gives its
 * shots at this size, the whole card under 120 px), its rings as fine lines and no numbers, with solid shots edged in
 * white so they read on the black even when the picture is a few dozen pixels wide.
 */
export function MiniTarget({ points, color, size, view: givenView, className, label }: { points: readonly ShotPoint[]; color: string; size: number; view?: number; className?: string; label?: string }) {
  const clip = useId()
  const view = givenView ?? targetViewMm(points, size)
  const mm = (2 * view) / size // millimetres per pixel
  const line = 0.5 * mm
  const r = Math.max(PELLET_MM / 2, 2 * mm)
  // Every ring when they're 4 px apart or more; every other one on the black when they'd blur together.
  const every = 2.5 / mm >= 4
  return (
    <svg viewBox={`${-view} ${-view} ${view * 2} ${view * 2}`} width={size} height={size} className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <clipPath id={clip}>
          <circle cx="0" cy="0" r={view} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <circle cx="0" cy="0" r={view} fill={PAPER} />
        {[1, 2, 3].map((ring) => (
          <circle key={ring} cx="0" cy="0" r={ringRadiusMm(ring)} fill="none" stroke={LINE} strokeWidth={line} />
        ))}
        <circle cx="0" cy="0" r={BLACK_RADIUS_MM} fill={BLACK} />
        {(every ? [5, 6, 7, 8, 9] : [5, 7, 9]).map((ring) => (
          <circle key={ring} cx="0" cy="0" r={ringRadiusMm(ring)} fill="none" stroke={PAPER} strokeOpacity={every ? 0.55 : 0.4} strokeWidth={line} />
        ))}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={-p.y} r={r} fill={color} fillOpacity={points.length > 1 ? 0.85 : 1} stroke="#ffffff" strokeWidth={0.75 * mm} />
        ))}
      </g>
      <circle cx="0" cy="0" r={view - mm / 2} fill="none" stroke={FRAME} strokeWidth={mm} />
    </svg>
  )
}
