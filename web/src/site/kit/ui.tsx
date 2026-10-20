import { Accordion as AccordionPrimitive } from 'radix-ui'
import type { CSSProperties, ComponentProps, ReactNode } from 'react'
import { LuChevronDown } from 'react-icons/lu'
import { cn } from '@/lib/utils'

/** shadcn/ui's Accordion (not yet in the app), on Radix. */
export function Accordion(props: ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />
}

export function AccordionItem({ className, ...props }: ComponentProps<typeof AccordionPrimitive.Item>) {
  return <AccordionPrimitive.Item data-slot="accordion-item" className={cn('border-b last:border-b-0', className)} {...props} />
}

export function AccordionTrigger({ className, children, iconClassName, ...props }: ComponentProps<typeof AccordionPrimitive.Trigger> & { iconClassName?: string }) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&[data-state=open]>svg]:rotate-180',
          className,
        )}
        {...props}
      >
        {children}
        <LuChevronDown className={cn('pointer-events-none size-4 shrink-0 translate-y-0.5 text-muted-foreground transition-transform duration-200', iconClassName)} />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

export function AccordionContent({ className, children, ...props }: ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content data-slot="accordion-content" className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down" {...props}>
      <div className={cn('pt-0 pb-4', className)}>{children}</div>
    </AccordionPrimitive.Content>
  )
}

/**
 * Marquee (after Magic UI's): CSS only, the copies hidden from screen readers and from the keyboard, paused on hover or
 * focus, and still with reduced motion.
 */
export function Marquee({
  children,
  className,
  reverse = false,
  vertical = false,
  pauseOnHover = true,
  repeat = 3,
  duration = '40s',
  gap = '1rem',
}: {
  children: ReactNode
  className?: string
  reverse?: boolean
  vertical?: boolean
  pauseOnHover?: boolean
  repeat?: number
  duration?: string
  gap?: string
}) {
  return (
    <div className={cn('demo-marquee flex overflow-hidden', vertical ? 'flex-col' : 'flex-row', className)} style={{ '--marquee-duration': duration, '--marquee-gap': gap, gap } as CSSProperties}>
      {Array.from({ length: repeat }, (_, i) => (
        <div
          key={i}
          aria-hidden={i > 0 || undefined}
          inert={i > 0 || undefined}
          className={cn('demo-marquee-track flex shrink-0 justify-around', vertical ? 'flex-col' : 'flex-row')}
          style={{ gap }}
          data-vertical={vertical || undefined}
          data-reverse={reverse || undefined}
          data-pause={pauseOnHover || undefined}
        >
          {children}
        </div>
      ))}
    </div>
  )
}

/**
 * Testimonials in columns that drift up at different speeds (after efferd's "testimonials-columns-1"), fixed for
 * accessibility: the duplicate copies are hidden from screen readers, hovering or focusing pauses them, and with
 * reduced motion they stand still. One column on phones, two on tablets, three on desktops.
 */
export function TestimonialsColumns({ items, className, durations }: { items: ReactNode[]; className?: string; durations?: string[] }) {
  // About six and a half seconds a card, so every column moves at a reading pace however many cards there are.
  const pace = (n: number, i: number) => durations?.[i % durations.length] ?? `${Math.round(Math.ceil(items.length / n) * 6.5 * [1, 1.18, 1.09][i % 3])}s`
  const split = (n: number) => {
    const cols: ReactNode[][] = Array.from({ length: n }, () => [])
    items.forEach((it, i) => cols[i % n].push(it))
    return cols
  }
  const fade = 'relative justify-center overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)]'
  const layout = (n: number, show: string) => (
    <div className={cn(fade, 'gap-1', show)} style={{ maxHeight: n === 1 ? 560 : 680 }}>
      {split(n).map((col, i) => (
        // Padded at the sides so the cards' shadows aren't cut off by the column.
        <Marquee key={i} vertical repeat={2} duration={pace(n, i)} gap="1.25rem" className="w-full max-w-[25.5rem] px-3">
          {col}
        </Marquee>
      ))}
    </div>
  )
  // Every card shows at every width: one column on phones, two on tablets, three on desktops.
  return (
    <div className={className}>
      {layout(1, 'flex md:hidden')}
      {layout(2, 'hidden md:flex lg:hidden')}
      {layout(3, 'hidden lg:flex')}
    </div>
  )
}
