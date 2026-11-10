import { animate, motion, useMotionValue } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ProgressReportDoc } from '@shared/reports/types'
import { ReportDocument } from '@/features/reports/ReportDocument'
import { cn } from '@/lib/utils'
import { useReduced } from './motion'
import raw from './report-sample.json'

/**
 * The app's real progress report (the component families see), fed with made-up data: a "Sample Athlete" built from the
 * sample data's synthetic shooting. Never a real student. It's laid out at a fixed width (a tablet's or a phone's) and
 * zoomed to fit its box. With `play`, it glides down to "Where the shots went" and plays the shots one by one.
 */
const stamp = (iso: string) => ({ toDate: () => new Date(iso), toMillis: () => Date.parse(iso), seconds: Math.floor(Date.parse(iso) / 1000), nanoseconds: 0 })
const r = raw as unknown as Record<string, unknown> & { generatedAt: string; updatedAt: string; sharedAt: string }
export const SAMPLE_REPORT = { ...r, generatedAt: stamp(r.generatedAt), updatedAt: stamp(r.updatedAt), sharedAt: stamp(r.sharedAt) } as unknown as ProgressReportDoc

export function ReportPreview({ width = 880, play = false, className, label, glide = true }: { width?: number; play?: boolean; className?: string; label?: string | null; glide?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const mover = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const y = useMotionValue(0)
  const reduce = useReduced()

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const fit = () => setZoom(el.clientWidth / width)
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [width])

  useEffect(() => {
    if (!play) return
    const root = mover.current
    if (!root) return
    const heading = [...root.querySelectorAll('h3')].find((h) => h.textContent?.trim() === 'Where the shots went')
    const playButton = () => root.querySelector<HTMLButtonElement>('button[aria-label="Play the shots one by one"]')
    let stop: (() => void) | undefined
    const timer = setTimeout(() => {
      if (glide && heading && box.current) {
        const offset = heading.getBoundingClientRect().top - root.getBoundingClientRect().top
        const room = box.current.clientHeight
        const targetY = -Math.max(0, Math.min(offset - room * 0.12, root.scrollHeight * zoom - room))
        if (reduce) y.set(targetY)
        else stop = animate(y, targetY, { duration: 1.1, ease: [0.65, 0, 0.35, 1] }).stop
      }
      if (!reduce) setTimeout(() => playButton()?.click(), glide ? 1150 : 0)
    }, 350)
    return () => {
      clearTimeout(timer)
      stop?.()
    }
  }, [play, glide, reduce, zoom, y])

  return (
    <div ref={box} className={cn('app-light relative h-full w-full overflow-hidden bg-[#efeee9]', className)}>
      <motion.div ref={mover} style={{ y }}>
        <div style={{ width, zoom }} className="px-4 pt-5 pb-10 sm:px-6">
          <ReportDocument report={SAMPLE_REPORT} audience="family" timezone="America/New_York" />
        </div>
      </motion.div>
      {label ? <div className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/80 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">{label}</div> : null}
    </div>
  )
}
