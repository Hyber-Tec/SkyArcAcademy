import type { IconType } from 'react-icons'
import { LuFile, LuFileSpreadsheet, LuFileText, LuFileVideo, LuImage, LuPresentation } from 'react-icons/lu'
import { type FileCategory, categoryOf } from '@shared/drive/files'
import { actorName } from '@shared/drive/model'
import type { DriveActor } from '@shared/drive/types'
import { formatInstant } from '@shared/time'
import { cn } from '@/lib/utils'

/** The Drive's small pieces: folder and file icons, the owner chip and the "Updated" text. */

export function FolderGlyph({ student = false, className }: { student?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 32 26" className={cn('size-8 shrink-0', className)} aria-hidden>
      <path d="M2 4.5A2.5 2.5 0 0 1 4.5 2h7.2c.7 0 1.3.3 1.8.8L16 5.5h11.5A2.5 2.5 0 0 1 30 8v13.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 21.5z" fill="#f4b73f" />
      <path d="M2 9h28v12.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 21.5z" fill="#ffcf5c" />
      {student ? (
        <g fill="#b07a12">
          <circle cx="16" cy="14.2" r="2.6" />
          <path d="M10.6 21.2c.6-2.6 2.9-4.2 5.4-4.2s4.8 1.6 5.4 4.2z" />
        </g>
      ) : null}
    </svg>
  )
}

const ICONS: Record<FileCategory, { icon: IconType; color: string }> = {
  pdf: { icon: LuFileText, color: 'text-red-600' },
  image: { icon: LuImage, color: 'text-emerald-600' },
  document: { icon: LuFileText, color: 'text-blue-600' },
  spreadsheet: { icon: LuFileSpreadsheet, color: 'text-green-700' },
  presentation: { icon: LuPresentation, color: 'text-orange-600' },
  video: { icon: LuFileVideo, color: 'text-violet-600' },
  text: { icon: LuFileText, color: 'text-muted-foreground' },
  other: { icon: LuFile, color: 'text-muted-foreground' },
}

export function FileGlyph({ kind, className }: { kind: string; className?: string }) {
  const { icon: Icon, color } = ICONS[categoryOf(kind)]
  return <Icon className={cn('size-7 shrink-0', color, className)} aria-hidden />
}

const AVATAR_COLORS = ['#c80000', '#1f5fbf', '#0f7a6c', '#8a4fbf', '#b4651c', '#3f6b2a', '#a0306a']

function colorOf(key: string): string {
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

/** Who made it: an initial in a colored circle, and their name. */
export function PersonChip({ person, className }: { person: DriveActor | null | undefined; className?: string }) {
  if (!person) return <span className="text-muted-foreground/50">—</span>
  const full = person.name || person.email
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)} title={full}>
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: colorOf(person.email || full) }}>
        {(full || '?').trim().charAt(0).toUpperCase()}
      </span>
      <span className="truncate">{full}</span>
    </span>
  )
}

/** "Oct 16, 2026 by Paige". */
export function updatedText(at: unknown, by: DriveActor | null | undefined, timezone: string): string {
  const ms = (at as { toMillis?: () => number } | null)?.toMillis?.() ?? 0
  if (!ms) return ''
  const day = formatInstant(ms, timezone, { month: 'short', day: 'numeric', year: 'numeric' })
  const who = actorName(by)
  return who ? `${day} by ${who}` : day
}
