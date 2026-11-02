import type { CSSProperties } from 'react'
import { STAFF_STATUS_COLORS, STAFF_STATUS_LABELS, STUDENT_STATUS_COLORS, STUDENT_STATUS_LABELS, STUDENT_STATUS_TONES } from '@shared/people'
import type { StaffStatus, StudentStatus } from '@shared/types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

function Pill({ label, colors, className }: { label: string; colors: { bg: string; text: string; border: string }; className?: string }) {
  return (
    <span
      className={cn('inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap', className)}
      style={{ backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: colors.text }} />
      {label}
    </span>
  )
}

export function StudentStatusBadge({ status, className }: { status: StudentStatus; className?: string }) {
  return <Pill label={STUDENT_STATUS_LABELS[status] ?? status} colors={STUDENT_STATUS_COLORS[status] ?? STUDENT_STATUS_COLORS.signed_up} className={className} />
}

/** A status's tones (`STUDENT_STATUS_TONES`) as CSS variables, so one class list paints it in light and dark mode. */
const toneVars = (status: StudentStatus) => {
  const t = STUDENT_STATUS_TONES[status] ?? STUDENT_STATUS_TONES.signed_up
  return { '--status-dot': t.dot, '--status-dot-dark': t.darkDot, '--status-word': t.word, '--status-word-dark': t.darkWord } as CSSProperties
}

/** The status dot, which says its status on hover; `tip={false}` beside a word that already says it. */
export function StudentStatusDot({ status, tip = true, className }: { status: StudentStatus; tip?: boolean; className?: string }) {
  const label = STUDENT_STATUS_LABELS[status] ?? status
  const dot = (
    <span
      {...(tip ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      className={cn('inline-block size-2 shrink-0 rounded-full bg-(--status-dot) dark:bg-(--status-dot-dark)', className)}
      style={toneVars(status)}
      data-status={status}
    />
  )
  if (!tip) return dot
  return (
    <Tooltip>
      <TooltipTrigger asChild>{dot}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** The status in a small word of its colour; nothing for Enrolled, the usual one. */
export function StudentStatusWord({ status, className }: { status: StudentStatus; className?: string }) {
  if (status === 'enrolled') return null
  return (
    <span className={cn('text-[12.5px] font-medium whitespace-nowrap text-(--status-word) dark:text-(--status-word-dark)', className)} style={toneVars(status)}>
      {STUDENT_STATUS_LABELS[status] ?? status}
    </span>
  )
}

export function StaffStatusBadge({ status, className }: { status: StaffStatus; className?: string }) {
  return <Pill label={STAFF_STATUS_LABELS[status] ?? status} colors={STAFF_STATUS_COLORS[status] ?? STAFF_STATUS_COLORS.active} className={className} />
}
