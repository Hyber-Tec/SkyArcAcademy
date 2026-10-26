import type { CSSProperties } from 'react'
import { LuBan, LuCheck, LuUserX } from 'react-icons/lu'
import { STAFF_COLORS } from '@shared/colors'
import { seatKind } from '@shared/schedule/classes'
import { KIND_COLORS, type SeatColor, levelColor } from '@shared/schedule/seatColors'
import { SESSION_STATUS_LABELS } from '@shared/schedule/status'
import type { SessionStatus } from '@shared/settings/defaults'
import { cn } from '@/lib/utils'

/** A seat colour as CSS variables, so one class list paints it in light and dark mode (`SEAT_FILL`). */
export function seatVars(c: SeatColor): CSSProperties {
  return { '--seat-bg': c.bg, '--seat-ink': c.ink, '--seat-bg-dark': c.darkBg, '--seat-ink-dark': c.darkInk, '--seat-dot': c.dot } as CSSProperties
}
export const SEAT_FILL = 'bg-(--seat-bg) text-(--seat-ink) dark:bg-(--seat-bg-dark) dark:text-(--seat-ink-dark)'

/** "Mark" for Marksman: what a small cell has room for. */
export function abbreviate(level: string): string {
  const known: Record<string, string> = { Discovery: 'Disc', Hunter: 'Hunt', 'Hunter+': 'Hunt+', Marksman: 'Mark', 'Marksman+': 'Mark+', 'Sharp Shooter': 'Sharp', Expert: 'Exp', Precision: 'Prec' }
  return known[level] ?? (level.length > 6 ? level.slice(0, 5) : level)
}

/** The level in its colour, with the rifle code beside it ("Marksman · C7"). */
export function LevelChip({ level, levels, rifle, short, className }: { level: string | null; levels: readonly string[]; rifle?: string | null; short?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-px text-[11px] leading-4 font-medium', SEAT_FILL, className)} style={seatVars(levelColor(level, levels))}>
      {level ? (short ? abbreviate(level) : level) : 'New'}
      {rifle ? <span className="opacity-75">· {rifle}</span> : null}
    </span>
  )
}

/** A seat's label in the sheets' colour: make-up, practice, trial, evaluation (nothing for a regular seat's note). */
export function KindTag({ note, className }: { note: string | null | undefined; className?: string }) {
  const kind = seatKind(note)
  if (kind === 'regular') return null
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-md px-1.5 py-px text-[11px] leading-4 font-semibold', SEAT_FILL, className)} style={seatVars(KIND_COLORS[kind])}>
      {(note ?? '').trim() || KIND_COLORS[kind].name}
    </span>
  )
}

/** A coach's colour: their own, or one picked from their ID where it can't be read (a coach seeing another coach). */
export function coachColor(staffId: string, own?: string | null): string {
  if (own) return own
  let h = 0
  for (const ch of staffId) h = (h * 31 + ch.charCodeAt(0)) | 0
  return STAFF_COLORS[Math.abs(h) % STAFF_COLORS.length]
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

/** A coach's initials in their colour, on a light wash of it. */
export function CoachBadge({ name, color, size = 'md', className }: { name: string; color: string; size?: 'xs' | 'sm' | 'md'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'xs' ? 'size-[18px] text-[8px]' : size === 'sm' ? 'size-6 text-[10px]' : 'size-7 text-[11px]',
        className,
      )}
      style={{ background: `color-mix(in oklab, ${color} 14%, var(--card))`, color: `color-mix(in oklab, ${color} 85%, var(--foreground))` }}
      title={name}
    >
      {initialsOf(name) || '?'}
    </span>
  )
}

/** "4/6" with a small bar per seat. */
export function SeatCount({ used, of, className }: { used: number; of: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums', className)}>
      <span className="flex gap-px">
        {Array.from({ length: of }, (_, i) => (
          <span key={i} className={cn('h-2.5 w-1.5 rounded-[2px]', i < used ? 'bg-foreground/60' : 'bg-foreground/15')} />
        ))}
      </span>
      {used}/{of}
    </span>
  )
}

/** The red "Now" pill on the class that's on. */
export function NowPill({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-solid px-1.5 text-[9px] leading-4 font-bold tracking-wide text-white uppercase', className)}>
      {compact ? null : <span className="size-1 animate-pulse rounded-full bg-white" />}
      Now
    </span>
  )
}

/** A seat's mark on a coloured cell: here, no-show or canceled. */
export function StatusDot({ status, className }: { status: SessionStatus; className?: string }) {
  if (status !== 'present' && status !== 'no_show' && status !== 'canceled') return null
  const Icon = status === 'present' ? LuCheck : status === 'no_show' ? LuUserX : LuBan
  return (
    <span
      className={cn(
        'inline-flex size-3.5 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.06)] dark:bg-zinc-900',
        status === 'present' ? 'text-emerald-600' : status === 'no_show' ? 'text-zinc-600 dark:text-zinc-300' : 'text-red-600',
        className,
      )}
      aria-label={SESSION_STATUS_LABELS[status]}
    >
      <Icon className="size-2.5" strokeWidth={3} />
    </span>
  )
}

/** "4:30–6 PM", or "11:30 AM–1 PM" across noon: a class's time, as the sheets write it. */
export function classRange(a: number, b: number): string {
  const part = (m: number) => {
    const h = Math.floor(m / 60) % 24
    return `${((h + 11) % 12) + 1}${m % 60 ? `:${String(m % 60).padStart(2, '0')}` : ''}`
  }
  const pa = Math.floor(a / 60) % 24 >= 12 ? 'PM' : 'AM'
  const pb = Math.floor(b / 60) % 24 >= 12 ? 'PM' : 'AM'
  return pa === pb ? `${part(a)}–${part(b)} ${pb}` : `${part(a)} ${pa}–${part(b)} ${pb}`
}

/** "Gr 8", or "Adult" / "College" as written. */
export const gradeLabel = (grade: string | null | undefined) => (grade && /^\d+$/.test(grade) ? `Gr ${grade}` : (grade ?? ''))

/** "Mia C.": first name and last initial, for the week's small cells. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : name
}
