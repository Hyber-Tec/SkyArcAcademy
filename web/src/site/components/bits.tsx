import type { ReactNode } from 'react'
import { LuCalendarCheck } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { type Lang, UI } from '@/site/kit/content'
import { Reveal } from '@/site/kit/motion'
import { useSite } from '@/site/kit/site'
import { useBooking } from '../booking-context'

/** The site's small building blocks: the page width, section headings, buttons. */
export const btnRed =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-red px-6 text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgb(224_0_0/0.7)] transition hover:bg-red-deep focus-visible:ring-2 focus-visible:ring-red/40 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px'
export const btnOutline =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-ink/15 bg-white px-6 text-[15px] font-semibold text-ink transition hover:border-ink/35 hover:bg-warm focus-visible:ring-2 focus-visible:ring-ink/25 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px'
export const btnInk =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-[15px] font-semibold text-white transition hover:bg-ink/85 focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px'
export const linkArrow = 'group inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-ink underline-offset-[5px] hover:underline focus-visible:outline-none focus-visible:underline'

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-[1240px] px-5 sm:px-8', className)}>{children}</div>
}

export function Kicker({ children, className, tone = 'ink' }: { children: ReactNode; className?: string; tone?: 'ink' | 'light' }) {
  return (
    <p className={cn('kicker accent flex items-center gap-2.5 text-[19px] leading-none sm:text-[21px]', tone === 'light' ? 'text-white/75' : 'text-stone', className)}>
      <span className={cn('h-px w-7 shrink-0', tone === 'light' ? 'bg-white/40' : 'bg-ink/25')} aria-hidden="true" />
      {children}
    </p>
  )
}

export function SectionHead({
  kicker,
  title,
  text,
  align = 'left',
  tone = 'ink',
  className,
  action,
  as: H = 'h2',
}: {
  kicker?: ReactNode
  title: ReactNode
  text?: ReactNode
  align?: 'left' | 'center'
  tone?: 'ink' | 'light'
  className?: string
  action?: ReactNode
  as?: 'h1' | 'h2'
}) {
  return (
    <Reveal className={cn(align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl', className)}>
      {kicker ? <Kicker className={cn(align === 'center' && 'justify-center')} tone={tone}>{kicker}</Kicker> : null}
      <H className={cn('mt-4 text-[34px] leading-[1.06] font-semibold tracking-[-0.03em] text-balance sm:text-[44px] lg:text-[50px]', tone === 'light' ? 'text-white' : 'text-ink')}>{title}</H>
      {text ? <p className={cn('mt-4 text-[16.5px] leading-relaxed text-pretty sm:text-[18px]', tone === 'light' ? 'text-white/70' : 'text-stone')}>{text}</p> : null}
      {action ? <div className={cn('mt-6', align === 'center' && 'flex justify-center')}>{action}</div> : null}
    </Reveal>
  )
}

/** The red "Book a trial" button: opens the trial drawer wherever it is. */
export function BookButton({ className, label, icon = true }: { className?: string; label?: string; icon?: boolean }) {
  const { t } = useSite()
  const { openBooking } = useBooking()
  return (
    <button type="button" onClick={() => openBooking()} className={cn(btnRed, className)} aria-haspopup="dialog">
      {icon ? <LuCalendarCheck className="size-[18px]" aria-hidden="true" /> : null}
      {label ?? t(UI.trial)}
    </button>
  )
}

/** The text after "Placeholder:" (the tag already says it). */
export const stripTodo = (s: string) => {
  const rest = s.replace(/^(Placeholder|임시)\s*:\s*/, '')
  return rest.charAt(0).toUpperCase() + rest.slice(1)
}

/** "Placeholder" note, for content the academy still has to send. */
export function TodoNote({ children, className }: { children: ReactNode; className?: string }) {
  const { lang } = useSite()
  return (
    <p className={cn('ph-soft flex items-start gap-2.5 rounded-xl border border-dashed border-ink/20 px-3.5 py-2.5 text-[12.5px] leading-relaxed', className)}>
      <span className="mt-px shrink-0 rounded-[5px] bg-ink px-1.5 py-0.5 font-mono text-[9.5px] font-medium tracking-[0.16em] text-white uppercase">{lang === 'ko' ? '임시' : 'Placeholder'}</span>
      <span className="text-ink/75">{typeof children === 'string' ? stripTodo(children) : children}</span>
    </p>
  )
}

/** "30 min" / "30분". */
export const mins = (n: number, lang: Lang) => (lang === 'ko' ? `${n}분` : `${n} min`)
