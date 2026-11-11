import type { ReactNode } from 'react'
import type { IconType } from 'react-icons'
import { LuChevronDown } from 'react-icons/lu'
import { cn } from '@/lib/utils'

/**
 * A part of the page folded under its title, a card of its own (Goo, 2026-11-11: each apart, with the scores' gap
 * between them; docs/DECISIONS.md §46), opened and closed by a click on it (sections.ts remembers which). `flush`: what
 * it holds runs from edge to edge, as a list of rows does (the SCATT sessions); `id` is where a link brings it.
 */
export function FoldedSection({
  icon: Icon,
  title,
  sub,
  open,
  onToggle,
  testId,
  id,
  flush = false,
  children,
}: {
  icon: IconType
  title: string
  sub: string
  open: boolean
  onToggle: () => void
  testId?: string
  id?: string
  flush?: boolean
  children: ReactNode
}) {
  return (
    <section id={id} className="@container overflow-hidden rounded-xl border bg-card" data-testid={testId}>
      <h2>
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset @xl:px-5 @xl:py-3.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-[17px]" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{title}</span>
            <span className="block truncate text-[12.5px] font-normal text-muted-foreground">{sub}</span>
          </span>
          <LuChevronDown className={cn('size-[18px] shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180 text-foreground')} aria-hidden />
        </button>
      </h2>
      {open ? <div className={flush ? undefined : 'px-4 pt-1 pb-5 @xl:pr-5 @xl:pl-[4.25rem]'}>{children}</div> : null}
    </section>
  )
}
