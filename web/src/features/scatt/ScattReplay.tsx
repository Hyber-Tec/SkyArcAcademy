import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LuChevronLeft, LuChevronRight, LuPause, LuPlay, LuRotateCcw } from 'react-icons/lu'
import { decodeTrace } from '@shared/scatt/codec'
import type { ScattSession, ScattShot, ScattTraces } from '@shared/scatt/session'
import { SCATT_ARROWS, SCATT_TARGETS, type Point } from '@shared/scatt/trace'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * A SCATT session played back shot by shot (the fourth meeting's R2, from the research's prototype): the aim moving over
 * the target in SCATT's colours (green while aiming, yellow for the last second, red after the shot), the shot, and
 * its numbers in plain words. Play, pause, scrub, three speeds, and the whole target or its centre. Places are the
 * app's way up (y up); SCATT's numbers are its own (shared/src/scatt).
 */

const TARGET = Object.values(SCATT_TARGETS)[0]
const COLORS = { aim: '#00e000', last: '#ffd400', after: '#ff2a2a' }
const ARROW_GLYPH = ['•', '↑', '↗', '→', '↘', '↓', '↙', '←', '↖']
const SPEEDS = [0.5, 1, 2] as const
const ZOOMS = [
  { half: 32, label: 'Whole target' },
  { half: 9, label: 'Centre' },
] as const

interface Track {
  t0: number
  dt: number
  pts: Point[]
}

const shotLabel = (s: ScattShot) => (s.sighting ? 'Sighter' : `Shot ${s.n}`)
const one = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '–' : v.toFixed(d))

export function ScattReplay({ session, traces, loading }: { session: ScattSession; traces: ScattTraces | null; loading?: boolean }) {
  const tracks = useMemo<(Track | null)[]>(
    () => session.shots.map((_, i) => (traces?.shots[i] ? { t0: traces.shots[i].t0, dt: 1000 / (traces.rateHz || 50), pts: decodeTrace(traces.shots[i].xy) } : null)),
    [session.shots, traces],
  )
  const [cur, setCur] = useState(() => Math.max(0, session.shots.findIndex((s) => !s.sighting)))
  // The time around the shot (ms; null: the trace's start), kept in a ref too for the playback loop.
  const [time, setTime] = useState<number | null>(null)
  const timeRef = useRef<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<number>(1)
  const [half, setHalf] = useState<number>(ZOOMS[0].half)
  const shot = session.shots[cur]
  const track = tracks[cur]
  const tStart = track ? track.t0 : 0
  const tEnd = track ? track.t0 + (track.pts.length - 1) * track.dt : 0
  const t = time ?? tStart
  const setT = useCallback((v: number | null) => {
    timeRef.current = v
    setTime(v)
  }, [])

  const select = useCallback(
    (k: number, play: boolean) => {
      const n = (k + session.shots.length) % session.shots.length
      setCur(n)
      setT(null)
      setPlaying(play && !!tracks[n])
    },
    [session.shots.length, tracks, setT],
  )

  // Playback: the time moves on with the clock, at the chosen speed, until the trace ends.
  useEffect(() => {
    if (!playing || !track) return
    let last = performance.now()
    let id = 0
    const tick = (now: number) => {
      const next = Math.min(tEnd, (timeRef.current ?? track.t0) + (now - last) * speed)
      last = now
      setT(next)
      if (next >= tEnd) setPlaying(false)
      else id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [playing, speed, tEnd, track, setT])

  // Drawing.
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState(600)
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      setSize(Math.max(200, Math.round(el.getBoundingClientRect().width * dpr)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    if (el.width !== size) {
      el.width = size
      el.height = size
    }
    draw(ctx, size, half, session.shots, cur, track, t)
  }, [size, half, session.shots, cur, track, t])

  const togglePlay = () => {
    if (!track) return
    if (!playing && t >= tEnd) setT(tStart)
    setPlaying((p) => !p)
  }
  const when = !track ? '' : Math.abs(t) < 15 ? 'The shot' : t < 0 ? `${(Math.abs(t) / 1000).toFixed(2)} s before the shot` : `${(t / 1000).toFixed(2)} s after the shot`
  const rows: [string, string, string][] = [
    ['Score', 'R', one(shot.score)],
    ['Direction', 'D', `${ARROW_GLYPH[shot.dir] ?? ''} ${SCATT_ARROWS[shot.dir] ?? ''}`],
    ['Aiming time', 'T', `${one(shot.aimS)} s`],
    ['Movement, last second', 'S1', `${one(shot.s1)} mm/s`],
    ['Movement, last quarter second', 'S2', `${one(shot.s2)} mm/s`],
    ['Inside the 10, last second', '10.0', shot.in10 === null ? '–' : `${shot.in10}%`],
    ['Steady hold, last second', '10a0', shot.steady === null ? '–' : `${shot.steady}%`],
    ['Shot vs. average aim', 'DA', `${one(shot.da)} mm`],
  ]

  return (
    <div className="grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_17rem]" data-testid="scatt-replay">
      <div className="min-w-0">
        <div className="relative">
          <canvas ref={canvas} className="block aspect-square w-full rounded-xl bg-[#c0c0c0]" role="img" aria-label={`Target with the aim of ${shotLabel(shot).toLowerCase()}: ${one(shot.score)}, ${SCATT_ARROWS[shot.dir]}.`} />
          {t >= 0 && track ? (
            <span className="absolute bottom-3 left-3 rounded-lg bg-black/70 px-2.5 py-1 text-xl font-semibold text-white tabular-nums">
              {one(shot.score)} <span className="text-sm font-medium opacity-85">{ARROW_GLYPH[shot.dir]}</span>
            </span>
          ) : null}
          {loading && !track ? <span className="absolute inset-0 flex items-center justify-center text-sm text-white/90">Loading the traces…</span> : null}
        </div>
        <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" aria-label="Previous shot" onClick={() => select(cur - 1, true)}>
              <LuChevronLeft />
            </Button>
            <Button size="icon" aria-label={playing ? 'Pause' : t >= tEnd ? 'Play again' : 'Play'} onClick={togglePlay} disabled={!track} data-testid="scatt-play">
              {playing ? <LuPause /> : t >= tEnd && track ? <LuRotateCcw /> : <LuPlay />}
            </Button>
            <Button size="icon" variant="ghost" aria-label="Next shot" onClick={() => select(cur + 1, true)}>
              <LuChevronRight />
            </Button>
          </div>
          <input
            type="range"
            aria-label="Time around the shot"
            className="w-full accent-foreground"
            min={tStart}
            max={tEnd}
            step={10}
            value={t}
            disabled={!track}
            onChange={(e) => {
              setPlaying(false)
              setT(Number(e.target.value))
            }}
          />
          <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{when}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            {SPEEDS.map((s) => (
              <button key={s} type="button" onClick={() => setSpeed(s)} aria-pressed={speed === s} className={cn('rounded-full px-2 py-0.5', speed === s ? 'bg-foreground text-background' : 'hover:bg-muted')}>
                {s}×
              </button>
            ))}
          </span>
          <span className="flex items-center gap-1">
            {ZOOMS.map((z) => (
              <button key={z.half} type="button" onClick={() => setHalf(z.half)} aria-pressed={half === z.half} className={cn('rounded-full px-2 py-0.5', half === z.half ? 'bg-foreground text-background' : 'hover:bg-muted')}>
                {z.label}
              </button>
            ))}
          </span>
          <span className="flex items-center gap-3">
            <Legend color={COLORS.aim} label="Aiming" />
            <Legend color={COLORS.last} label="Last second" />
            <Legend color={COLORS.after} label="After the shot" />
          </span>
        </div>
      </div>

      <div className="min-w-0 space-y-4">
        <div>
          <h4 className="text-sm font-semibold">{shotLabel(shot)}</h4>
          <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-sm">
            {rows.map(([label, code, value]) => (
              <div key={code} className="contents">
                <dt className="text-muted-foreground">
                  {label} <code className="ml-1 text-[10px] text-muted-foreground/70">{code}</code>
                </dt>
                <dd className="text-right font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h4 className="text-xs text-muted-foreground">All shots</h4>
          <ol className="mt-1.5 flex flex-wrap gap-1.5">
            {session.shots.map((s, k) => (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => select(k, true)}
                  aria-pressed={k === cur}
                  aria-label={`${shotLabel(s)}: ${one(s.score)}, ${SCATT_ARROWS[s.dir]}`}
                  className={cn('flex h-11 min-w-10 flex-col items-center justify-center rounded-lg border px-1 tabular-nums', k === cur ? 'border-foreground bg-foreground text-background' : 'bg-card hover:bg-muted/60', s.sighting && k !== cur && 'border-dashed text-muted-foreground')}
                >
                  <span className="text-[10px] leading-none opacity-75">{s.sighting ? 'S' : s.n}</span>
                  <span className="mt-0.5 text-sm leading-none font-semibold">{one(s.score)}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-0.5 w-4 rounded" style={{ background: color }} />
      {label}
    </span>
  )
}

/** The target, the other shots faint, the trace up to `t`, and the aim and shot. */
function draw(ctx: CanvasRenderingContext2D, size: number, half: number, shots: ScattShot[], cur: number, track: Track | null, t: number) {
  const scale = size / (2 * half)
  const c = size / 2
  const X = (mm: number) => c + mm * scale
  const Y = (mm: number) => c - mm * scale
  ctx.fillStyle = '#c0c0c0'
  ctx.fillRect(0, 0, size, size)
  const [wx, wy, ww, wh] = TARGET.world
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(X(wx), Y(wy + wh), ww * scale, wh * scale)
  ctx.fillStyle = '#0a0a0a'
  ctx.beginPath()
  ctx.arc(c, c, (TARGET.black / 2) * scale, 0, Math.PI * 2)
  ctx.fill()
  const lw = Math.max(1, size / 700)
  for (let ring = 1; ring <= 10; ring++) {
    const r = (TARGET.rings[ring - 1] / 2) * scale
    if (ring === 10) {
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(c, c, Math.max(r, lw), 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    ctx.strokeStyle = TARGET.rings[ring - 1] < TARGET.black - 1e-9 ? '#ffffff' : '#0a0a0a'
    ctx.lineWidth = lw
    ctx.beginPath()
    ctx.arc(c, c, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  const fs = Math.max(9, Math.min(1.55 * scale, size / 34))
  ctx.font = `600 ${fs}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let ring = 1; ring <= 8; ring++) {
    const rOut = TARGET.rings[ring - 1] / 2
    const rm = (rOut + TARGET.rings[ring] / 2) / 2
    if ((rOut - TARGET.rings[ring] / 2) * scale < fs * 0.9) continue
    ctx.fillStyle = rOut <= TARGET.black / 2 + 1e-9 ? '#ffffff' : '#0a0a0a'
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      ctx.fillText(String(ring), X(dx * rm), Y(dy * rm))
  }
  const pellet = (x: number, y: number, fill: string, border: string, label: string, alpha: number) => {
    const r = (4.5 / 2) * scale
    ctx.globalAlpha = alpha
    ctx.fillStyle = fill
    ctx.strokeStyle = border
    ctx.lineWidth = Math.max(1.5, size / 450)
    ctx.beginPath()
    ctx.arc(X(x), Y(y), r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    if (label && r > 7) {
      ctx.fillStyle = '#0a0a0a'
      ctx.font = `700 ${Math.round(Math.min(r * 1.05, size / 30))}px system-ui, -apple-system, sans-serif`
      ctx.fillText(label, X(x), Y(y) + 0.5)
    }
    ctx.globalAlpha = 1
  }
  // The other shots of the same series, faint.
  const now = shots[cur]
  shots.forEach((o, k) => {
    if (k !== cur && o.series === now.series && o.sighting === now.sighting) pellet(o.x, o.y, '#ffffff', '#9a9a80', o.sighting ? 'S' : String(o.n), 0.35)
  })
  if (track && track.pts.length) {
    const idxAt = (ms: number) => Math.max(0, Math.min(track.pts.length - 1, Math.floor((ms - track.t0) / track.dt)))
    const k = idxAt(t)
    const yellow = idxAt(-1000)
    const shotIdx = idxAt(0)
    const stroke = (a: number, b: number, color: string) => {
      if (b <= a) return
      ctx.strokeStyle = color
      ctx.lineWidth = Math.max(1.5, size / 420)
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(X(track.pts[a][0]), Y(track.pts[a][1]))
      for (let i = a + 1; i <= b; i++) ctx.lineTo(X(track.pts[i][0]), Y(track.pts[i][1]))
      ctx.stroke()
    }
    stroke(0, Math.min(k, yellow), COLORS.aim)
    if (k > yellow) stroke(yellow, Math.min(k, shotIdx), COLORS.last)
    if (k > shotIdx) stroke(shotIdx, k, COLORS.after)
    if (t >= 0) pellet(now.x, now.y, '#ff00ff', '#ffaa00', now.sighting ? 'S' : String(now.n), 1)
    const r = Math.max(size / 160, Math.min(1.1 * scale, size / 70))
    ctx.fillStyle = '#ff0000'
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = Math.max(1, size / 600)
    ctx.beginPath()
    ctx.arc(X(track.pts[k][0]), Y(track.pts[k][1]), r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  } else {
    pellet(now.x, now.y, '#ff00ff', '#ffaa00', now.sighting ? 'S' : String(now.n), 1)
  }
}
