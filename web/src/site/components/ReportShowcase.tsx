import { AnimatePresence, type MotionValue, motion, useMotionValue, useMotionValueEvent, useScroll, useSpring, useTransform } from 'motion/react'
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { IconType } from 'react-icons'
import { LuBatteryFull, LuChartLine, LuCrosshair, LuGauge, LuMessageSquareQuote, LuWifi } from 'react-icons/lu'
import { ReportDocument } from '@/features/reports/ReportDocument'
import { cn } from '@/lib/utils'
import { HOME, type L } from '@/site/kit/content'
import { useReduced } from '@/site/kit/motion'
import { SAMPLE_REPORT } from '@/site/kit/ReportPreview'
import { useSite } from '@/site/kit/site'
import { T } from '../i18n'

/**
 * "See every step of their progress": a portrait iPad (the Container Scroll design, turned upright, as HyberCRM's
 * landing page has it). It tilts flat as it comes in, then stays put while scrolling the page scrolls the report inside
 * it, top to bottom, so the report can't be skipped past. Notes beside the iPad (one under it on phones) light up as
 * their part of the report arrives, and the shots replay when "Where the shots went" reaches the middle.
 *
 * The report is the app's real component with the made-up "Sample Athlete". It's drawn at a paper width and scaled to
 * the iPad's screen, like a PDF; phones draw it narrower (the report's own phone layout) so the text stays readable.
 * With reduced motion the iPad stands still and its screen scrolls by itself.
 */
const PAPER = 720
const PAPER_PHONE = 430

interface Note {
  icon: IconType
  title: L
  text: L
  /** Text in the report where this note's part starts (null: the top). */
  anchor: string | null
  side: 'left' | 'right'
}

const NOTES: Note[] = [
  { icon: LuGauge, title: T.reportNotes[0].title, text: T.reportNotes[0].text, anchor: null, side: 'left' },
  { icon: LuChartLine, title: HOME.report.features[0].title, text: HOME.report.features[0].text, anchor: 'Scores over time', side: 'right' },
  { icon: LuCrosshair, title: HOME.report.features[1].title, text: HOME.report.features[1].text, anchor: 'Where the shots went', side: 'left' },
  { icon: LuMessageSquareQuote, title: HOME.report.features[2].title, text: HOME.report.features[2].text, anchor: 'Goals for next period', side: 'right' },
]
const SHOTS_NOTE = 2

/** The first element whose own text is `text` (the report's headings), or null. */
function findText(root: HTMLElement, text: string): HTMLElement | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.textContent?.trim() === text) return n.parentElement
  }
  return null
}

/** iPadOS status bar. */
function StatusBar() {
  return (
    <div className="flex h-7 shrink-0 items-center justify-between bg-[#efeee9] px-5 text-[11px] font-semibold text-neutral-900" aria-hidden="true">
      <span>9:41</span>
      <span className="flex items-center gap-1.5">
        <LuWifi className="size-3.5" />
        <LuBatteryFull className="size-4" />
      </span>
    </div>
  )
}

function NoteCard({ note, state, className }: { note: Note; state: 'off' | 'on' | 'past'; className?: string }) {
  const { t } = useSite()
  const Icon = note.icon
  return (
    <div
      className={cn(
        'w-64 rounded-[22px] bg-white p-5 shadow-soft ring-1 ring-ink/5 transition-[opacity,transform,box-shadow] duration-500 ease-out',
        state === 'off' && (note.side === 'left' ? '-translate-x-4 opacity-0' : 'translate-x-4 opacity-0'),
        state === 'past' && 'opacity-55',
        state === 'on' && 'shadow-float',
        className,
      )}
    >
      <span className={cn('inline-flex size-10 items-center justify-center rounded-2xl transition-colors duration-500', state === 'on' ? 'bg-ink text-white' : 'bg-warm text-ink')}>
        <Icon className="size-[18px]" aria-hidden="true" />
      </span>
      <p className="mt-3.5 text-[16px] font-semibold tracking-tight text-ink">{t(note.title)}</p>
      <p className="mt-1 text-[14px] leading-relaxed text-stone">{t(note.text)}</p>
    </div>
  )
}

/** The note for the part of the report on screen, under the iPad on phones and tablets. */
function NotePill({ index, progress }: { index: number; progress: MotionValue<number> }) {
  const { t } = useSite()
  const note = NOTES[index]
  const Icon = note.icon
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-2 px-4 xl:hidden sm:bottom-5">
      <div className="relative w-full max-w-[400px]" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-3 rounded-[18px] bg-white/95 px-3.5 py-3 shadow-float ring-1 ring-ink/5 backdrop-blur"
          >
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-ink text-white">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] leading-tight font-semibold text-ink">{t(note.title)}</span>
              <span className="mt-0.5 block text-[12.5px] leading-snug text-stone">{t(note.text)}</span>
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="h-1 w-24 overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
        <motion.div className="h-full origin-left rounded-full bg-ink/60" style={{ scaleX: progress }} />
      </div>
    </div>
  )
}

export function ReportShowcase({ header, footer, className }: { header?: ReactNode; footer?: ReactNode; className?: string }) {
  const { t } = useSite()
  const still = useReduced()
  const track = useRef<HTMLDivElement>(null)
  const screen = useRef<HTMLDivElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ screenW: 0, screenH: 0, paperH: 0, paper: PAPER })
  /** Where each note's part starts, in screen pixels from the report's top. */
  const [marks, setMarks] = useState<number[]>(NOTES.map(() => 0))
  const [active, setActive] = useState(0)
  const played = useRef(false)

  useLayoutEffect(() => {
    const s = screen.current
    const p = paperRef.current
    if (!s || !p) return
    const measure = () => {
      // The report's layout follows the window's width (its own breakpoints), so phones get its narrow layout.
      const paper = window.innerWidth < 640 ? PAPER_PHONE : PAPER
      setSize({ screenW: s.clientWidth, screenH: s.clientHeight, paperH: p.offsetHeight, paper })
      const top = p.getBoundingClientRect().top
      const at = NOTES.map((n) => (n.anchor ? (findText(p, n.anchor)?.getBoundingClientRect().top ?? top) - top : 0))
      // Parts side by side in the report (the chart and the target, on wide screens) take turns: the second a little later.
      for (let i = 1; i < at.length; i++) if (at[i] - at[i - 1] < 80) at[i] = at[i - 1] + s.clientHeight * 0.3
      setMarks(at)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(s)
    ro.observe(p)
    return () => ro.disconnect()
  }, [])

  const scale = size.screenW ? size.screenW / size.paper : 0.7
  const travel = Math.max(0, size.paperH * scale - size.screenH)
  const travelMv = useMotionValue(0)
  useEffect(() => travelMv.set(travel), [travel, travelMv])

  // Coming in: from a tilt to flat (the Container Scroll animation).
  const enter = useScroll({ target: track, offset: ['start end', 'start start'] }).scrollYProgress
  const rotateX = useTransform(enter, [0, 1], [22, 0])
  const lift = useTransform(enter, [0, 1], [0.9, 1])
  // Pinned: the page's scroll moves the report, eased a little so it glides.
  const pinned = useScroll({ target: track, offset: ['start start', 'end end'] }).scrollYProgress
  const smooth = useSpring(pinned, { stiffness: 140, damping: 30, mass: 0.4 })
  const y = useTransform([smooth, travelMv], ([p, d]: number[]) => -d * Math.min(1, Math.max(0, (p - 0.02) / 0.94)))

  useMotionValueEvent(y, 'change', (v) => {
    const line = size.screenH * 0.62
    let next = 0
    marks.forEach((m, i) => {
      if (m + v <= line) next = i
    })
    if (next !== active) setActive(next)
    if (next >= SHOTS_NOTE && !played.current) {
      played.current = true
      paperRef.current?.querySelector<HTMLButtonElement>('button[aria-label="Play the shots one by one"]')?.click()
    }
  })

  const noteState = (i: number) => (still ? 'on' : i === active ? 'on' : i < active ? 'past' : 'off')
  const ipadW = 'w-[min(calc(100vw-2.5rem),calc((100svh-68px-7.5rem)*0.74),40rem)] sm:w-[min(calc(100vw-4rem),calc((100svh-76px-7rem)*0.74),40rem)] xl:w-[min(calc((100svh-76px-3.5rem)*0.74),40rem)]'

  const ipad = (
    <motion.div
      style={still ? undefined : { rotateX, scale: lift }}
      className={cn(
        'relative aspect-[0.74] shrink-0 rounded-[2.6rem] border-[3px] border-[#6c6c6c] bg-[#1d1d1f] p-2.5 shadow-[0_0_#0000004d,0_9px_20px_#0000004a,0_37px_37px_#00000042,0_84px_50px_#00000026,0_149px_60px_#0000000a] sm:p-3.5',
        ipadW,
      )}
    >
      <span className="absolute top-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-[#3a3a3c] sm:top-1.5" aria-hidden="true" />
      <div className="app-light relative flex size-full flex-col overflow-hidden rounded-[1.9rem] bg-[#efeee9]">
        <StatusBar />
        <div ref={screen} className={cn('relative min-h-0 flex-1', still ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden')} tabIndex={still ? 0 : undefined} aria-label={still ? t(HOME.report.sampleNote) : undefined}>
          <motion.div style={still ? undefined : { y }} className="will-change-transform">
            <div style={{ height: size.paperH ? size.paperH * scale : undefined }}>
              <div ref={paperRef} className="report-canvas origin-top-left px-3 pt-3 pb-10" style={{ width: size.paper, transform: `scale(${scale})` }}>
                <ReportDocument report={SAMPLE_REPORT} audience="family" timezone="America/New_York" />
              </div>
            </div>
          </motion.div>
        </div>
        <div className="pointer-events-none absolute top-9 right-3 rounded-full bg-black/75 px-2.5 py-1 text-[10.5px] font-medium text-white backdrop-blur">{t(T.sampleChip)}</div>
      </div>
    </motion.div>
  )

  return (
    <section className={cn('relative', className)} aria-label={t(HOME.report.title)}>
      {header}
      <div ref={track} className="relative" style={still ? undefined : { height: `calc(100svh + ${Math.round(Math.max(travel, 1000) * 1.08)}px)` }}>
        <div
          className={cn('flex items-center justify-center', still ? 'py-12' : 'sticky top-[68px] h-[calc(100svh-68px)] overflow-hidden sm:top-[76px] sm:h-[calc(100svh-76px)]')}
          style={{ perspective: 1200 }}
        >
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <div className="h-[70%] w-[70%] rounded-full bg-[radial-gradient(closest-side,rgb(251_2_2/0.07),transparent)] blur-2xl" />
          </div>
          <div className={cn('relative flex items-center gap-12 2xl:gap-16', !still && 'max-xl:-translate-y-10 max-sm:-translate-y-12')}>
            <div className="hidden flex-col gap-24 xl:flex">
              {NOTES.map((n, i) => (n.side === 'left' ? <NoteCard key={n.title.en} note={n} state={noteState(i)} /> : null))}
            </div>
            {ipad}
            <div className="hidden flex-col gap-24 pt-40 xl:flex">
              {NOTES.map((n, i) => (n.side === 'right' ? <NoteCard key={n.title.en} note={n} state={noteState(i)} /> : null))}
            </div>
          </div>
          {!still ? <NotePill index={active} progress={pinned} /> : null}
        </div>
      </div>
      {still ? (
        <div className="mx-auto grid max-w-4xl gap-3 px-5 sm:grid-cols-2 sm:px-8 xl:hidden">
          {NOTES.map((n) => (
            <NoteCard key={n.title.en} note={n} state="on" className="w-auto" />
          ))}
        </div>
      ) : null}
      {footer}
    </section>
  )
}
