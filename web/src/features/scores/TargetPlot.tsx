import { useId } from 'react'
import { type ShotPoint, BLACK_RADIUS_MM, PELLET_MM, meanPoint, ringRadiusMm, shotPoint } from '@shared/shooting/target'

/**
 * A 10 m air rifle target drawn from the scores: each shot sits where its score and direction put it (SIUS results;
 * paper cards have no directions). It zooms to the shots, so a tight group is still easy to read, and it stays on
 * light "paper" in dark mode, like the reports.
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
  shots: readonly { v: number; a: number | null }[]
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
  const clip = useId()
  const points = shots.map((s) => shotPoint(s.v, s.a)).filter((p): p is ShotPoint => p !== null)
  const farthest = points.reduce((m, p) => Math.max(m, Math.hypot(p.x, p.y)), 0) + PELLET_MM / 2 + 0.8
  const full = ringRadiusMm(1) + 1.5
  const view = zoom === 'full' || size < 120 ? full : Math.min(full, Math.max(ringRadiusMm(5) + 1, farthest))
  const mpi = showMpi && points.length >= 2 ? meanPoint(points) : null
  const rings = Array.from({ length: 10 }, (_, i) => 10 - i).map((ring) => ({ ring, r: ringRadiusMm(ring) }))
  const label = title ?? (points.length ? `${points.length} shots on the target` : 'Target')
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
        {points.map((p, i) => {
          const last = highlightLast && i === points.length - 1
          // See-through with a solid edge, so shots that overlap still read one by one.
          return <circle key={i} cx={p.x} cy={-p.y} r={PELLET_MM / 2} fill={last ? '#e8b100' : color} fillOpacity={0.5} stroke={last ? '#b88a00' : color} strokeWidth={view / 140} />
        })}
        {mpi ? (
          <g stroke="#2f80ed" strokeWidth={view / 90} strokeLinecap="round">
            <line x1={mpi.x - 1.4} x2={mpi.x + 1.4} y1={-mpi.y} y2={-mpi.y} />
            <line x1={mpi.x} x2={mpi.x} y1={-mpi.y - 1.4} y2={-mpi.y + 1.4} />
          </g>
        ) : null}
      </g>
      <circle cx="0" cy="0" r={view - view / 300} fill="none" stroke="#d9d6cd" strokeWidth={view / 150} />
    </svg>
  )
}
