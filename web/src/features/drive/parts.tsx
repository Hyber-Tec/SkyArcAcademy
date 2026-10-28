import type { IconType } from 'react-icons'
import { LuFile, LuFileSpreadsheet, LuFileText, LuFileVideo, LuImage, LuLock, LuPresentation } from 'react-icons/lu'
import { type FileCategory, categoryOf } from '@shared/drive/files'
import { DRIVE_ACCESS_LABELS, type DriveActor } from '@shared/drive/types'
import { cn } from '@/lib/utils'

/** The Drive's small pieces: folder and file icons and the owner chip (the "Updated" text is @shared/drive/model's). */

/** A folder: a student's shows a person, one only owners and admins see a padlock. */
export function FolderGlyph({ student = false, locked = false, className }: { student?: boolean; locked?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 32 26" className={cn('size-8 shrink-0', className)} aria-hidden>
      <path d="M2 4.5A2.5 2.5 0 0 1 4.5 2h7.2c.7 0 1.3.3 1.8.8L16 5.5h11.5A2.5 2.5 0 0 1 30 8v13.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 21.5z" fill="#f4b73f" />
      <path d="M2 9h28v12.5a2.5 2.5 0 0 1-2.5 2.5h-23A2.5 2.5 0 0 1 2 21.5z" fill="#ffcf5c" />
      {student ? (
        <g fill="#b07a12">
          <circle cx="16" cy="14.2" r="2.6" />
          <path d="M10.6 21.2c.6-2.6 2.9-4.2 5.4-4.2s4.8 1.6 5.4 4.2z" />
        </g>
      ) : locked ? (
        <g fill="#b07a12">
          <path d="M13 15.6v-1.5a3 3 0 0 1 6 0v1.5h-1.7v-1.5a1.3 1.3 0 0 0-2.6 0v1.5z" />
          <rect x="11.8" y="15.2" width="8.4" height="6.4" rx="1.3" />
        </g>
      ) : null}
    </svg>
  )
}

/** "Owners and admins": on what only they see (a lock and the words; coaches never see these). */
export function AccessBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300/70 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200', className)}
      title="Only owners and admins see it. Coaches don’t."
    >
      <LuLock className="size-3" aria-hidden />
      {DRIVE_ACCESS_LABELS.admins}
    </span>
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
