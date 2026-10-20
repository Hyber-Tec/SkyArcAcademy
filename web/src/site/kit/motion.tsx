import { MotionConfig, animate, motion, useInView, useReducedMotion } from 'motion/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

/**
 * Motion for every option: one place that knows about reduced motion (the system setting, or `?motion=reduce` in the
 * address to try it), reveals as things scroll in, and numbers that count up once.
 */
export const forcedReduce = typeof location !== 'undefined' && new URLSearchParams(location.search).get('motion') === 'reduce'
if (forcedReduce) document.documentElement.classList.add('reduce-motion')

export function useReduced(): boolean {
  const system = useReducedMotion()
  return forcedReduce || !!system
}

export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion={forcedReduce ? 'always' : 'user'}>{children}</MotionConfig>
}

export const EASE_OUT = [0.22, 1, 0.36, 1] as const

/** Fades and rises into place the first time it scrolls into view; shown as is with reduced motion. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 18,
  x = 0,
  blur = false,
  amount = 0.2,
  duration = 0.75,
}: {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
  x?: number
  blur?: boolean
  amount?: number
  duration?: number
}) {
  const reduce = useReduced()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, x, filter: blur ? 'blur(10px)' : 'blur(0px)' }}
      whileInView={{ opacity: 1, y: 0, x: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, amount }}
      transition={{ duration, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  )
}

/** A number that counts up once when it comes into view (its final value with reduced motion). */
export function CountUp({ value, decimals = 0, duration = 1.6, className, suffix = '' }: { value: number; decimals?: number; duration?: number; className?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const reduce = useReduced()
  const [n, setN] = useState(reduce ? value : 0)
  useEffect(() => {
    if (!inView || reduce) {
      if (reduce) setN(value)
      return
    }
    const controls = animate(0, value, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: setN })
    return () => controls.stop()
  }, [inView, reduce, value, duration])
  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {n.toFixed(decimals)}
      {suffix}
    </span>
  )
}

/**
 * Splits a line into words that rise in turn (for headlines). The whole line is watched for coming into view (each
 * word starts below its own clipping box, where the browser would never report it visible), and screen readers get the
 * line once.
 */
export function RiseWords({ text, className, delay = 0, stagger = 0.06, once = true }: { text: string; className?: string; delay?: number; stagger?: number; once?: boolean }) {
  const reduce = useReduced()
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once, amount: 0.3 })
  const words = text.split(' ')
  if (reduce) return <span className={className}>{text}</span>
  return (
    <span ref={ref} className={className}>
      <span className="sr-only">{text}</span>
      {words.map((w, i) => (
        <span key={`${w}-${i}`} aria-hidden="true" className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <motion.span className="inline-block" initial={{ y: '110%' }} animate={{ y: inView ? '0%' : '110%' }} transition={{ duration: 0.8, delay: delay + i * stagger, ease: EASE_OUT }}>
            {w}
            {i < words.length - 1 ? '\u00a0' : ''}
          </motion.span>
        </span>
      ))}
    </span>
  )
}
