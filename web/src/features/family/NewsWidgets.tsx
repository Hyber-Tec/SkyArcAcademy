import { LuImage, LuPaperclip, LuPin } from 'react-icons/lu'
import type { Announcement } from '@shared/comms'
import type { DateKey } from '@shared/time'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { isPicture, pictureCount, postedOn } from './news'

/** A post's title with "New" after its last word (until the person opens it), so a long title wraps around the mark. */
export function NewsTitle({ a, isNew, className }: { a: Pick<Announcement, 'title'>; isNew: boolean; className?: string }) {
  return (
    <span className={cn('block break-words', className)} data-testid="news-title">
      {a.title || 'News'}
      {isNew ? (
        <>
          {' '}
          <Badge className="ml-0.5 bg-brand-solid align-[0.1em] text-white" data-testid="news-new">
            New
          </Badge>
        </>
      ) : null}
    </span>
  )
}

/** Pinned, the category, the day it went up (the academy's), and how many pictures and files it has. */
export function NewsMeta({ a, timezone, today, className }: { a: Announcement; timezone: string; today: DateKey; className?: string }) {
  const pictures = pictureCount(a)
  const files = (a.attachments ?? []).filter((f) => !isPicture(f)).length
  return (
    <span className={cn('flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground', className)}>
      {a.pinned ? (
        <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
          <LuPin className="size-3.5" /> Pinned
        </span>
      ) : null}
      <Badge variant="secondary" className="max-w-full font-normal">
        <span className="truncate">{a.category || 'General'}</span>
      </Badge>
      <span className="whitespace-nowrap">{postedOn(a, timezone, today)}</span>
      {pictures ? (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <LuImage className="size-3.5" /> {pictures === 1 ? 'Picture' : `${pictures} pictures`}
        </span>
      ) : null}
      {files ? (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <LuPaperclip className="size-3.5" /> {files === 1 ? '1 file' : `${files} files`}
        </span>
      ) : null}
    </span>
  )
}
