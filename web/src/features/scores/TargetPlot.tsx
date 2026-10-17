import { type ReactNode, useId } from 'react'
import { type EvalShot, pointOf } from '@shared/shooting/evaluation'
import { type ShotPoint, BLACK_RADIUS_MM, PELLET_MM, meanPoint, ringRadiusMm, targetViewMm } from '@shared/shooting/target'

/** The last shot (and the newest one while a result plays back): amber, apart from every position's color. */
export const LAST_SHOT_FILL = '#e8b100'
export const LAST_SHOT_STROKE = '#b88a00'

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
 * (`children`, in millimetres with y down) clipped to it.
 */
export function TargetFace({ view, size, label, className, children }: { view: number; size: number; label: string; className?: string; children?: ReactNode }) {
  const clip = useId()
  const rings = Array.from({ length: 10 }, (_, i) => 10 - i).map((ring) => ({ ring, r: ringRadiusMm(ring) }))
  return (
    <svg viewBox={`${-view} ${-view} ${view * 2} ${view * 2}`} width={size} height={size} role="img" aria-label={label} className={className}>
      <defs>
        <clipPath id={clip}>
          <circle cx="0" cy="0" r={view} />
        </clipPath>
      </defs>
      <circle cx="0" cy="0" r={view} fill="#fbfaf7" />
      <g clipPath={`url(#${clip})`}>
        {rings
          .slice()
          .reverse()
          .map(({ ring, r }) => (
            <circle key={ring} cx="0" cy="0" r={r} fill={ring >= 4 ? '#161616' : '#fbfaf7'} stroke={ring >= 4 ? '#fbfaf7' : '#a8a59c'} strokeWidth={ring === 4 ? 0 : view / 220} />
          ))}
        <circle cx="0" cy="0" r={BLACK_RADIUS_MM} fill="none" stroke="#161616" strokeWidth={view / 300} />
        {view > 14 && size >= 120
          ? [1, 2, 3, 4, 5, 6, 7, 8].map((ring) => {
              const r = ringRadiusMm(ring) - 1.25
              if (r > view - 1) return null
              const fill = ring >= 4 ? '#e9e7e0' : '#7d7a72'
              return (
                <g key={ring} fontSize={1.6} fill={fill} textAnchor="middle" dominantBaseline="central" fontFamily="ui-sans-serif, system-ui">
                  <text x={-r} y={0}>{ring}</text>
                  <text x={r} y={0}>{ring}</text>
                </g>
              )
            })
          : null}
        {children}
      </g>
      <circle cx="0" cy="0" r={view - view / 300} fill="none" stroke="#d9d6cd" strokeWidth={view / 150} />
    </svg>
  )
}

/** One shot: a pellet-sized circle, see-through with a solid edge so shots that overlap still read one by one. */
export function ShotMark({ point, view, color, last = false }: { point: ShotPoint; view: number; color: string; last?: boolean }) {
  return <circle cx={point.x} cy={-point.y} r={PELLET_MM / 2} fill={last ? LAST_SHOT_FILL : color} fillOpacity={0.5} stroke={last ? LAST_SHOT_STROKE : color} strokeWidth={view / 140} />
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
