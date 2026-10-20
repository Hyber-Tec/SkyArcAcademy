import { useId } from 'react'
import { LOGO } from './logo-parts'

/**
 * The official full logo drawn from its own parts (shared/logo-parts.ts), so an intro can move each part and still end
 * on exactly the official drawing. Every part carries a data attribute for the options' CSS and animations:
 *   [data-part="arcs"]    > path[data-ring="outer"|"inner"]
 *   [data-part="ticks"]   > path[data-side="top"|"right"|"bottom"][data-ring="outer"|"inner"]
 *   [data-part="letters"] > path[data-letter="S"|"K"|"Y"|"A"|"R"|"C"]
 *   [data-part="flanks"]  > path, [data-part="subtitle"], [data-part="dot"]
 * With `sweep`, the arcs are drawn through masks ([data-sweep="outer"|"inner"] circles, pathLength 1, starting at
 * 12 o'clock): animate their stroke-dashoffset from 1 to 0 and the arcs sweep in around the reticle.
 */
export const RETICLE = LOGO.center
export const DOT_CENTER = { x: 865.2, y: 281.9 }
export const LOGO_RED = LOGO.red

export function LogoArt({ ink = LOGO.ink, className, sweep = false, title = 'Sky Arc Sports Academy', style }: { ink?: string; className?: string; sweep?: boolean; title?: string; style?: React.CSSProperties }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const outer = LOGO.arcs.filter((a) => a.ring === 'outer')
  const inner = LOGO.arcs.filter((a) => a.ring === 'inner')
  const ring = (name: 'outer' | 'inner', r: number, w: number) => (
    <mask id={`${id}-${name}`} maskUnits="userSpaceOnUse" x="-400" y="-400" width="2000" height="1400">
      <circle
        data-sweep={name}
        cx={RETICLE.x}
        cy={RETICLE.y}
        r={r}
        fill="none"
        stroke="#fff"
        strokeWidth={w}
        pathLength={1}
        strokeDasharray="1 1"
        transform={`rotate(-90 ${RETICLE.x} ${RETICLE.y})`}
      />
    </mask>
  )
  return (
    <svg viewBox={LOGO.viewBox} className={className} role="img" aria-label={title} style={{ overflow: 'visible', ...style }}>
      {sweep ? (
        <defs>
          {ring('outer', 242, 96)}
          {ring('inner', 160, 44)}
        </defs>
      ) : null}
      <g data-part="arcs" fill={ink}>
        <g mask={sweep ? `url(#${id}-outer)` : undefined}>
          {outer.map((a, i) => (
            <path key={i} d={a.d} data-ring="outer" data-arc={i} />
          ))}
        </g>
        <g mask={sweep ? `url(#${id}-inner)` : undefined}>
          {inner.map((a, i) => (
            <path key={i} d={a.d} data-ring="inner" data-arc={i} />
          ))}
        </g>
      </g>
      <g data-part="ticks" fill={ink}>
        {LOGO.ticks.map((t, i) => (
          <path key={i} d={t.d} data-side={t.side} data-ring={t.ring} />
        ))}
      </g>
      <g data-part="letters" fill={ink} fillRule={LOGO.letterRule}>
        {LOGO.letters.map((l) => (
          <path key={l.id} d={l.d} data-letter={l.id} />
        ))}
      </g>
      <g data-part="flanks" fill={ink}>
        {LOGO.flanks.map((f, i) => (
          <path key={i} d={f.d} data-flank={i} />
        ))}
      </g>
      <path data-part="subtitle" d={LOGO.subtitle.d} fill={ink} fillRule={LOGO.subtitle.rule} />
      <path data-part="dot" d={LOGO.dot.d} fill={LOGO.red} />
    </svg>
  )
}

/**
 * The reticle alone, from the same parts (arcs, ticks and the dot), in its own box: for marks, loaders and watermarks.
 * `viewBox` is cropped around the reticle.
 */
export function ReticleArt({ ink = '#FFFFFF', className, sweep = false, dot = true, style }: { ink?: string; className?: string; sweep?: boolean; dot?: boolean; style?: React.CSSProperties }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const outer = LOGO.arcs.filter((a) => a.ring === 'outer')
  const inner = LOGO.arcs.filter((a) => a.ring === 'inner')
  const size = 290
  const vb = `${RETICLE.x - size} ${RETICLE.y - size} ${size * 2} ${size * 2}`
  const ring = (name: 'outer' | 'inner', r: number, w: number) => (
    <mask id={`${id}-${name}`} maskUnits="userSpaceOnUse" x="-400" y="-400" width="2000" height="1400">
      <circle data-sweep={name} cx={RETICLE.x} cy={RETICLE.y} r={r} fill="none" stroke="#fff" strokeWidth={w} pathLength={1} strokeDasharray="1 1" transform={`rotate(-90 ${RETICLE.x} ${RETICLE.y})`} />
    </mask>
  )
  return (
    <svg viewBox={vb} className={className} aria-hidden="true" style={{ overflow: 'visible', ...style }}>
      {sweep ? (
        <defs>
          {ring('outer', 242, 96)}
          {ring('inner', 160, 44)}
        </defs>
      ) : null}
      <g data-part="arcs" fill={ink}>
        <g mask={sweep ? `url(#${id}-outer)` : undefined}>
          {outer.map((a, i) => (
            <path key={i} d={a.d} data-ring="outer" />
          ))}
        </g>
        <g mask={sweep ? `url(#${id}-inner)` : undefined}>
          {inner.map((a, i) => (
            <path key={i} d={a.d} data-ring="inner" />
          ))}
        </g>
      </g>
      <g data-part="ticks" fill={ink}>
        {LOGO.ticks.map((t, i) => (
          <path key={i} d={t.d} data-side={t.side} data-ring={t.ring} />
        ))}
      </g>
      {dot ? <path data-part="dot" d={LOGO.dot.d} fill={LOGO.red} /> : null}
    </svg>
  )
}
