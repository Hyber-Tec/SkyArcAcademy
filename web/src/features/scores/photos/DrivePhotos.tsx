import { useEffect, useMemo, useRef, useState } from 'react'
import { LuCheck, LuImage } from 'react-icons/lu'
import { isViewableImage } from '@shared/drive/files'
import { tsMs } from '@shared/drive/model'
import { scoreTotal, scoresByFile } from '@shared/drive/scores'
import { type DriveFile, studentFolderId } from '@shared/drive/types'
import { dateKeyOf, formatInstant, todayKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Skeleton } from '@/components/ui/skeleton'
import { fileBlob } from '@/features/drive/FilePreview'
import { useDriveIndex } from '@/features/drive/useDriveIndex'
import { useStudentEvaluations } from '@/features/scores/hooks'
import { cn } from '@/lib/utils'
import { isPhoto } from './cards'

/** "Today, 4:12 PM", or "Oct 26, 2026". */
function addedText(f: Pick<DriveFile, 'uploadedAt'>, timezone: string): string {
  const ms = tsMs(f.uploadedAt)
  if (!ms) return ''
  return dateKeyOf(ms, timezone) === todayKey(timezone) ? `Today, ${formatInstant(ms, timezone, { hour: 'numeric', minute: '2-digit' })}` : formatInstant(ms, timezone, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** A photo's small picture, fetched once it scrolls into view (through the Storage rules, never a link). */
export function DriveThumb({ file }: { file: WithId<DriveFile> }) {
  const { branchId } = useBranch()
  const box = useRef<HTMLSpanElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const shows = isViewableImage(file.kind)
  useEffect(() => {
    const el = box.current
    if (!el || !shows) return
    let made: string | null = null
    let alive = true
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      seen.disconnect()
      fileBlob(branchId, file.id)
        .then((blob) => {
          if (!alive) return
          made = URL.createObjectURL(blob)
          setUrl(made)
        })
        .catch(() => undefined)
    })
    seen.observe(el)
    return () => {
      alive = false
      seen.disconnect()
      if (made) URL.revokeObjectURL(made)
    }
  }, [branchId, file.id, shows])
  return (
    <span ref={box} className="flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-md bg-muted">
      {url ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <span className="flex flex-col items-center gap-1 text-muted-foreground">
          <LuImage className="size-6" aria-hidden />
          {shows ? null : <span className="text-[10px] font-semibold uppercase">{file.kind}</span>}
        </span>
      )}
    </span>
  )
}

/**
 * Add paper scores → From the student's Drive: the photos in their folder (the phone app's land there), newest first.
 * The ones without scores yet can be ticked, to be read; the ones already scored show their score.
 */
export function DrivePhotos({ studentId, studentName, picked, onPick }: { studentId: string; studentName: string; picked: ReadonlySet<string>; onPick: (file: WithId<DriveFile>) => void }) {
  const { timezone } = useBranch()
  const index = useDriveIndex()
  const { data: evaluations, loading } = useStudentEvaluations(studentId)
  const scores = useMemo(() => scoresByFile(evaluations), [evaluations])
  const photos = useMemo(
    () =>
      index
        .subtreeFiles(studentFolderId(studentId))
        .filter((f) => isPhoto(f) && f.status === 'ready')
        .sort((a, b) => tsMs(b.uploadedAt) - tsMs(a.uploadedAt)),
    [index, studentId],
  )
  if (index.loading || loading)
    return (
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="aspect-[4/5] rounded-xl" />
        ))}
      </div>
    )
  const fresh = photos.filter((f) => !scores.has(f.id))
  const scored = photos.filter((f) => scores.has(f.id))
  if (!photos.length)
    return <p className="mt-4 rounded-xl border border-dashed px-4 py-10 text-center text-sm text-balance text-muted-foreground">No photos in {studentName}’s Drive folder yet. Photos added to it, from the phone or here, show up here to read.</p>

  const tile = (f: WithId<DriveFile>, done: boolean) => {
    const on = picked.has(f.id)
    const total = scores.get(f.id)?.[0]
    return (
      <li key={f.id} className="min-w-0">
        <button
          type="button"
          disabled={done}
          aria-pressed={done ? undefined : on}
          onClick={() => onPick(f)}
          className={cn(
            'relative flex w-full flex-col gap-1.5 rounded-xl border bg-card p-1.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            on ? 'border-foreground ring-1 ring-foreground' : 'hover:border-foreground/30',
            done && 'cursor-default opacity-75',
          )}
          data-testid="drive-photo"
        >
          <DriveThumb file={f} />
          {done ? (
            <span className="absolute top-3 left-3 inline-flex h-5 items-center gap-1 rounded-full bg-background/95 px-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
              <LuCheck className="size-3" aria-hidden /> Scored{total ? ` · ${scoreTotal(total)}` : ''}
            </span>
          ) : (
            <span className={cn('absolute top-3 left-3 flex size-5 items-center justify-center rounded-md border-[1.5px]', on ? 'border-foreground bg-foreground text-background' : 'border-muted-foreground/60 bg-background/90')} aria-hidden>
              {on ? <LuCheck className="size-3.5" strokeWidth={3} /> : null}
            </span>
          )}
          <span className="truncate px-0.5 text-[13px] font-medium">{f.name}</span>
          <span className="truncate px-0.5 text-[11px] text-muted-foreground">{addedText(f, timezone)}</span>
        </button>
      </li>
    )
  }
  return (
    <div className="mt-3 space-y-4" data-testid="drive-photos">
      <p className="text-sm text-muted-foreground">
        Photos in <span className="font-medium text-foreground">{studentName}</span>’s Drive folder: the ones added from the phone land here. Tick the cards to read.
      </p>
      {fresh.length ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">New photos</h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">{fresh.map((f) => tile(f, false))}</ul>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">Every photo in the folder is scored already.</p>
      )}
      {scored.length ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Already scored</h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">{scored.map((f) => tile(f, true))}</ul>
        </section>
      ) : null}
    </div>
  )
}
