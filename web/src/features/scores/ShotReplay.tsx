import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { LuChevronLeft, LuChevronRight, LuPause, LuPlay, LuRotateCcw } from 'react-icons/lu'
import type { Evaluation } from '@shared/shooting/evaluation'
import { replayStepMs } from '@shared/shooting/replay'
import { type ShotPoint, meanPoint, targetViewMm } from '@shared/shooting/target'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { type PlayShot, SPEEDS, type Speed, playEvaluation, prefersReducedMotion, speedLabel } from './playback'
import { MpiCross, NewestShot, ShotMark, TargetFace } from './TargetPlot'

type Placed = PlayShot & { point: ShotPoint }

/** The speed last picked, for the next replay opened in this tab. */
let lastSpeed: Speed = 1

/** The controls and words in the app's theme, or on a report's light paper (light in dark mode too). */
const TONES = {
  app: {
    button: 'text-muted-foreground hover:text-foreground',
    play: 'bg-primary text-primary-foreground hover:bg-primary/85',
    speed: 'border-border text-foreground',
    text: 'text-muted-foreground',
    strong: 'text-foreground',
    faint: 'text-muted-foreground/85',
    track: 'bg-muted',
  },
  paper: {
    button: 'text-[#52514e] hover:bg-black/5 hover:text-[#0b0b0b] dark:hover:bg-black/5 dark:hover:text-[#0b0b0b]',
    play: 'bg-[#0b0b0b] text-white hover:bg-[#0b0b0b]/85',
    speed: 'border-[#e3e1da] text-[#0b0b0b] hover:bg-black/5 hover:text-[#0b0b0b] dark:hover:bg-black/5 dark:hover:text-[#0b0b0b]',
    text: 'text-[#52514e]',
    strong: 'text-[#0b0b0b]',
    faint: 'text-[#7d7a72]',
    track: 'bg-[#efeee9]',
  },
}

/**
 * Shots played back on the target one by one, in the order they were fired (a whole result in about twelve seconds
 * at 1×): the newest in amber with its number, the earlier ones in the position's color, a thin bar for how far it
 * has got, and what the shot was under it. Before playing (and once it ends) every shot shows, with the average point,
 * as the static picture does. Shots without a place (a typed paper card's, a SIUS shot without an arrow) still count.
 * Keyboard: Space plays or pauses, the arrows step, Home goes to the first shot and End shows them all.
 */
export function ShotReplay({
  evaluation,
  shots: given,
  color,
  size = 168,
  highlightLast = false,
  tone = 'app',
  autoPlay = false,
  onStep,
  caption,
  className,
}: {
  /** The result to play… */
  evaluation?: Pick<Evaluation, 'source' | 'series'>
  /** …or shots ready to play (a report's: `playPoints`). */
  shots?: PlayShot[]
  color: string
  /** The picture's size in pixels; it shrinks to fit narrower room. */
  size?: number
  /** In the still picture, the last shot in another color, as SIUS draws it. */
  highlightLast?: boolean
  /** `paper` on a report's light paper, whatever the theme. */
  tone?: 'app' | 'paper'
  /** Starts playing by itself a moment after it appears (never with reduced motion). */
  autoPlay?: boolean
  /** The shot shown as the newest (1…n), or null when every shot shows. */
  onStep?: (n: number | null) => void
  /** In place of "20 shots · total 185.0" while it isn't playing. */
  caption?: string
  className?: string
}) {
  const shots = useMemo(() => given ?? (evaluation ? playEvaluation(evaluation) : []), [given, evaluation])
  const placed = useMemo(() => shots.filter((s): s is Placed => s.point !== null), [shots])
  /** The shot being shown as the newest (1…n); null shows every shot. */
  const [step, setStep] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<Speed>(lastSpeed)
  const count = shots.length
  const onStepRef = useRef(onStep)
  useEffect(() => {
    onStepRef.current = onStep
  })

  useEffect(() => {
    if (!autoPlay || !count || prefersReducedMotion()) return
    const timer = setTimeout(() => {
      setStep(1)
      setPlaying(true)
      onStepRef.current?.(1)
    }, 450)
    return () => clearTimeout(timer)
  }, [autoPlay, count])

  useEffect(() => {
    if (!playing || step === null) return
    const timer = setTimeout(() => {
      // After the last shot: every shot again, with the average point.
      const next = step < count ? step + 1 : null
      if (next === null) setPlaying(false)
      setStep(next)
      onStepRef.current?.(next)
    }, replayStepMs(count) / speed)
    return () => clearTimeout(timer)
  }, [playing, step, count, speed])

  if (!placed.length) return null

  const t = TONES[tone]
  const compact = size < 200
  const view = targetViewMm(
    placed.map((s) => s.point),
    size,
  )
  const current = step !== null ? shots[step - 1] : null
  const total = shots[count - 1].runningText
  const mpi = step === null && placed.length >= 2 ? meanPoint(placed.map((s) => s.point)) : null

  const go = (n: number | null) => {
    setStep(n)
    onStepRef.current?.(n)
  }
  const play = () => {
    if (playing) return setPlaying(false)
    go(step === null || step >= count ? 1 : step)
    setPlaying(true)
  }
  const restart = () => {
    go(1)
    setPlaying(true)
  }
  const back = () => {
    setPlaying(false)
    go(step === null ? count : Math.max(1, step - 1))
  }
  const forward = () => {
    setPlaying(false)
    go(step === null ? 1 : step >= count ? null : step + 1)
  }
  const changeSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
    lastSpeed = next
    setSpeed(next)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Space on a focused button presses that button; the arrows, Home and End work from anywhere in the player.
    const onButton = !!(e.target as HTMLElement).closest('button')
    const keys: Record<string, (() => void) | undefined> = {
      ' ': onButton ? undefined : play,
      ArrowLeft: back,
      ArrowRight: forward,
      Home: () => {
        setPlaying(false)
        go(1)
      },
      End: () => {
        setPlaying(false)
        go(null)
      },
    }
    const run = keys[e.key]
    if (!run) return
    e.preventDefault()
    run()
  }

  const line1 = current ? (
    <>
      {current.of} · <span className={cn('font-semibold', t.strong)}>{current.valueText}</span>
      {current.point ? null : ' (no place on the target)'}
    </>
  ) : caption ? (
    caption
  ) : (
    <>
      {count} shots
      {total !== null ? (
        <>
          {' '}
          · total <span className={cn('font-semibold', t.strong)}>{total}</span>
        </>
      ) : null}
    </>
  )
  const line2 = current
    ? [current.context, current.runningText !== null ? `total ${current.runningText}` : null].filter(Boolean).join(' · ')
    : [placed.length < count ? `${count - placed.length} without a place` : null, compact ? 'Play to see each shot' : 'Press play to see them one by one'].filter(Boolean).join(' · ')

  const icon = compact ? 'icon-sm' : 'icon'
  const playButton = (
    <Button
      type="button"
      size="icon"
      aria-label={playing ? 'Pause' : 'Play the shots one by one'}
      aria-pressed={playing}
      onClick={play}
      className={cn('rounded-full', compact ? 'size-8' : 'size-11', t.play)}
    >
      {playing ? <LuPause className={compact ? 'size-4' : 'size-5'} /> : <LuPlay className={cn(compact ? 'size-4' : 'size-5', 'translate-x-px')} />}
    </Button>
  )
  const backButton = (
    <Button type="button" variant="ghost" size={icon} aria-label="Previous shot" onClick={back} disabled={step === 1} className={t.button}>
      <LuChevronLeft />
    </Button>
  )
  const nextButton = (
    <Button type="button" variant="ghost" size={icon} aria-label="Next shot" onClick={forward} className={t.button}>
      <LuChevronRight />
    </Button>
  )
  const restartButton = (
    <Button type="button" variant="ghost" size="icon-sm" aria-label="Play again from the first shot" onClick={restart} className={t.button}>
      <LuRotateCcw />
    </Button>
  )

  return (
    <div
      role="group"
      aria-label="Play the shots back"
      aria-keyshortcuts="Space ArrowLeft ArrowRight Home End"
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={cn('flex w-full flex-col items-center rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50', compact ? 'gap-1.5' : 'gap-2.5', className)}
      style={{ maxWidth: size }}
    >
      <div className="w-full rounded-xl bg-white p-1">
        <TargetFace view={view} size={size} label={current ? `Shot ${current.number}: ${current.valueText}` : `${placed.length} shots on the target`} className="block h-auto w-full">
          {step === null
            ? placed.map((s, i) => <ShotMark key={`all-${s.n}`} point={s.point} view={view} color={color} last={highlightLast && i === placed.length - 1} />)
            : placed.filter((s) => s.n < step).map((s) => <ShotMark key={`old-${s.n}`} point={s.point} view={view} color={color} />)}
          {current?.point ? <NewestShot key={`new-${current.n}`} point={current.point} number={current.number} view={view} size={size} /> : null}
          {mpi ? <MpiCross point={mpi} view={view} /> : null}
        </TargetFace>
      </div>
      <div className={cn('h-1 w-full overflow-hidden rounded-full transition-opacity duration-300 motion-reduce:transition-none', t.track, step === null && 'opacity-0')} aria-hidden>
        <div className="h-full rounded-full bg-[#e8b100] transition-[width] duration-200 ease-out motion-reduce:transition-none" style={{ width: `${((step ?? 0) / count) * 100}%` }} />
      </div>
      {compact ? (
        <div className="flex items-center gap-1">
          {restartButton}
          {backButton}
          {playButton}
          {nextButton}
        </div>
      ) : (
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center">
          <div>{restartButton}</div>
          <div className="flex items-center gap-2">
            {backButton}
            {playButton}
            {nextButton}
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={changeSpeed}
              aria-label={`Speed ${speedLabel(speed)}. Change the speed`}
              title="Speed"
              className={cn('h-7 min-w-11 rounded-full border px-2 text-xs tabular-nums', t.speed)}
            >
              {speedLabel(speed)}
            </Button>
          </div>
        </div>
      )}
      <div className={cn('w-full text-center tabular-nums', compact ? 'text-xs' : 'text-sm', compact && caption && 'min-h-12')} aria-live={playing ? 'off' : 'polite'}>
        <p className={t.text}>{line1}</p>
        <p className={cn('mt-0.5 min-h-[1lh]', compact ? 'text-[11px]' : 'text-xs', t.faint)}>{line2}</p>
      </div>
    </div>
  )
}
