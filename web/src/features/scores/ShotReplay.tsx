import { type KeyboardEvent, useEffect, useMemo, useState } from 'react'
import { LuChevronLeft, LuChevronRight, LuPause, LuPlay, LuRotateCcw } from 'react-icons/lu'
import type { Evaluation } from '@shared/shooting/evaluation'
import { type ReplayShot, replayShots, replayStepMs } from '@shared/shooting/replay'
import { PELLET_MM, type ShotPoint, meanPoint, targetViewMm } from '@shared/shooting/target'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LAST_SHOT_FILL, LAST_SHOT_STROKE, MpiCross, ShotMark, TargetFace } from './TargetPlot'

/** The newest shot's number: a darker amber than its mark, edged in white, so it reads on the paper and on the black. */
const NEWEST_NUMBER = '#9a6f00'

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

type Placed = ReplayShot & { point: ShotPoint }

/**
 * One result's shots played back on the target, one by one in the order they were fired (a whole result in about
 * twelve seconds): the newest in amber with its number, the earlier ones in the position's color, and the running
 * total under it. Before playing (and once it ends) every shot shows, with the average point, as the static picture
 * does. Shots without a place (a typed paper card's, a SIUS shot without an arrow) still count in the total.
 * Keyboard: Space plays or pauses, the arrows step.
 */
export function ShotReplay({
  evaluation,
  color,
  size = 168,
  highlightLast = false,
  className,
}: {
  evaluation: Pick<Evaluation, 'source' | 'series'>
  color: string
  size?: number
  /** In the static picture, the last shot in another color, as SIUS draws it. */
  highlightLast?: boolean
  className?: string
}) {
  const shots = useMemo(() => replayShots(evaluation), [evaluation])
  const placed = useMemo(() => shots.filter((s): s is Placed => s.point !== null), [shots])
  /** The shot being shown as the newest (1…n); null shows every shot. */
  const [step, setStep] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const sius = evaluation.source === 'sius'
  const count = shots.length

  useEffect(() => {
    if (!playing || step === null) return
    const timer = setTimeout(() => {
      if (step < count) setStep(step + 1)
      else {
        // The end: every shot again, with the average point.
        setPlaying(false)
        setStep(null)
      }
    }, replayStepMs(count))
    return () => clearTimeout(timer)
  }, [playing, step, count])

  if (!placed.length) return null

  const view = targetViewMm(
    placed.map((s) => s.point),
    size,
  )
  const fmt = (v: number) => (sius ? v.toFixed(1) : String(Math.round(v)))
  const total = shots.length ? shots[shots.length - 1].running : 0
  const current = step !== null ? shots[step - 1] : null
  const mpi = step === null && placed.length >= 2 ? meanPoint(placed.map((s) => s.point)) : null

  const play = () => {
    if (playing) return setPlaying(false)
    setStep(step === null ? 1 : step)
    setPlaying(true)
  }
  const restart = () => {
    setStep(1)
    setPlaying(true)
  }
  const back = () => {
    setPlaying(false)
    setStep(step === null ? count : Math.max(1, step - 1))
  }
  const forward = () => {
    setPlaying(false)
    setStep(step === null ? 1 : step >= count ? null : step + 1)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // A focused button handles its own keys.
    if ((e.target as HTMLElement).closest('button')) return
    if (e.key === ' ') {
      e.preventDefault()
      play()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      back()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      forward()
    }
  }

  const readout = current
    ? [current.series !== null ? `Series ${current.series}` : null, `Shot ${current.n} of ${count}`, `${fmt(current.value)}${current.point ? '' : ' (no place on the target)'}`, `total ${fmt(current.running)}`]
        .filter(Boolean)
        .join(' · ')
    : [`${count} shots`, `total ${fmt(total)}`, placed.length < count ? `${count - placed.length} without a place` : null].filter(Boolean).join(' · ')

  return (
    <div role="group" aria-label="Play the shots back" tabIndex={0} onKeyDown={onKeyDown} className={cn('flex flex-col items-center gap-2 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50', className)}>
      <div className="rounded-xl bg-white p-1">
        <TargetFace view={view} size={size} label={current ? `Shot ${current.n} of ${count}` : `${placed.length} shots on the target`}>
          <style>{POP}</style>
          {step === null
            ? placed.map((s, i) => <ShotMark key={`all-${s.n}`} point={s.point} view={view} color={color} last={highlightLast && i === placed.length - 1} />)
            : placed
                .filter((s) => s.n < step)
                .map((s) => <ShotMark key={`old-${s.n}`} point={s.point} view={view} color={color} />)}
          {current?.point ? <NewestShot key={`new-${current.n}`} shot={current as Placed} view={view} /> : null}
          {mpi ? <MpiCross point={mpi} view={view} /> : null}
        </TargetFace>
      </div>
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Play again from the first shot" onClick={restart}>
          <LuRotateCcw />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Previous shot" onClick={back} disabled={step === 1}>
          <LuChevronLeft />
        </Button>
        <Button type="button" variant="outline" size="icon" aria-label={playing ? 'Pause' : 'Play the shots one by one'} aria-pressed={playing} onClick={play}>
          {playing ? <LuPause /> : <LuPlay />}
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Next shot" onClick={forward}>
          <LuChevronRight />
        </Button>
      </div>
      <p className="max-w-[18rem] text-center text-xs text-muted-foreground tabular-nums" aria-live={playing ? 'off' : 'polite'}>
        {readout}
      </p>
    </div>
  )
}

/** The newest shot: amber, dropping into its place, with its number beside it. */
function NewestShot({ shot, view }: { shot: Placed; view: number }) {
  const r = PELLET_MM / 2
  const { x, y } = shot.point
  const label = numberPlace(shot, view)
  return (
    <>
      <circle className="skyarc-shot-pop" cx={x} cy={-y} r={r} fill={LAST_SHOT_FILL} fillOpacity={0.85} stroke={LAST_SHOT_STROKE} strokeWidth={view / 90} />
      <text
        className="skyarc-shot-label"
        x={label.x}
        y={label.y}
        textAnchor={label.anchor}
        fontSize={label.size}
        fontWeight={700}
        fill={NEWEST_NUMBER}
        stroke="#ffffff"
        strokeWidth={view / 45}
        paintOrder="stroke"
        fontFamily="ui-sans-serif, system-ui"
      >
        {shot.n}
      </text>
    </>
  )
}

/**
 * Where the newest shot's number goes, in the picture's millimetres (y down): up and to the right of the shot, or on
 * the first other side that keeps the whole number on the target when the shot sits near its edge.
 */
function numberPlace({ n, point }: Placed, view: number) {
  const r = PELLET_MM / 2
  const size = view / 6
  const gap = view / 40
  // Roughly the room the number takes: bold digits are about 0.6 em wide and 0.75 em tall.
  const width = String(n).length * size * 0.62
  const height = size * 0.75
  const place = (right: boolean, up: boolean) => ({
    right,
    left: right ? point.x + r + gap : point.x - r - gap - width,
    bottom: up ? point.y + r : point.y - r - height,
  })
  const onTarget = ({ left, bottom }: { left: number; bottom: number }) =>
    [left, left + width].every((x) => [bottom, bottom + height].every((y) => Math.hypot(x, y) < view * 0.93))
  const best = [place(true, true), place(false, true), place(true, false), place(false, false)].find(onTarget) ?? place(true, true)
  return { x: best.right ? best.left : best.left + width, y: -best.bottom, anchor: best.right ? ('start' as const) : ('end' as const), size }
}
