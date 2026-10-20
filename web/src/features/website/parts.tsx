import { useState } from 'react'
import type { IconType } from 'react-icons'
import { LuArrowDown, LuArrowLeft, LuArrowRight, LuArrowUp, LuCheck, LuImage, LuImageOff, LuTriangleAlert } from 'react-icons/lu'
import type { WithId } from '@shared/types'
import type { WebsiteImage, WebsitePhoto } from '@shared/website/types'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { websiteImageUrl } from './images'
import type { SaveState } from './useTextDraft'
import { type PhotoUpload, uploadStageText } from './uploads'

/** A website picture in the CRM: its 640-wide copy, with its blurred copy and color behind it while it loads. */
export function WebsiteImg({ image, focus, alt = '', className, want = 640 }: { image: WebsiteImage; focus?: string; alt?: string; className?: string; want?: number }) {
  return (
    <img
      src={websiteImageUrl(image, want)}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cn('size-full object-cover', className)}
      style={{
        objectPosition: focus || '50% 50%',
        backgroundColor: image.color || undefined,
        backgroundImage: image.blur ? `url("${image.blur}")` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: focus || '50% 50%',
      }}
    />
  )
}

/** A photo still uploading: the file itself, with its progress (or its failure) along the bottom. */
export function UploadPreview({ upload, className }: { upload: PhotoUpload; className?: string }) {
  const failed = upload.stage === 'failed'
  // The browser can't draw some files (a HEIC in Chrome): an icon stands in for them.
  const [broken, setBroken] = useState(false)
  return (
    <div className={cn('relative flex size-full items-center justify-center bg-muted text-muted-foreground', className)}>
      {broken ? (
        <LuImageOff className="size-6" aria-hidden="true" />
      ) : (
        <img
          src={upload.preview}
          alt=""
          draggable={false}
          className={cn('absolute inset-0 size-full object-cover', failed ? 'opacity-40 grayscale' : 'opacity-70')}
          onError={() => setBroken(true)}
        />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-background/85 px-2.5 py-1.5 text-xs backdrop-blur-sm">
        <div className={cn('flex items-center gap-1.5 font-medium', failed && 'text-destructive')}>
          {failed ? <LuTriangleAlert className="size-3.5 shrink-0" /> : <Spinner className="size-3.5 shrink-0" />}
          <span className="truncate">{uploadStageText(upload)}</span>
        </div>
        {failed ? null : <Progress value={Math.max(4, upload.progress * 100)} className="mt-1 h-1" />}
      </div>
    </div>
  )
}

/**
 * The photo a place or a coach card names: the photo, the upload it's waiting for, or an empty frame. A photo ID that
 * matches neither was deleted.
 */
export function PhotoSlot({
  photoId,
  photos,
  uploads,
  className,
  empty = 'No photo',
}: {
  photoId: string | null | undefined
  photos: WithId<WebsitePhoto>[]
  uploads: PhotoUpload[]
  className?: string
  empty?: string
}) {
  const photo = photoId ? photos.find((p) => p.id === photoId) : undefined
  const upload = photoId && !photo ? uploads.find((u) => u.id === photoId) : undefined
  return (
    <div className={cn('relative shrink-0 overflow-hidden rounded-lg border bg-muted', className)}>
      {photo ? (
        <WebsiteImg image={photo} focus={photo.focus} alt={photo.alt} />
      ) : upload ? (
        <UploadPreview upload={upload} />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted-foreground">
          {photoId ? <LuImageOff className="size-5" /> : <LuImage className="size-5" />}
          {photoId ? 'Photo deleted' : empty}
        </div>
      )}
    </div>
  )
}

/** A small icon button with its name in a tooltip (`children` instead of `icon` for a drawing of its own). */
export function IconAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger,
  className,
  children,
}: {
  icon?: IconType
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  className?: string
  children?: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          className={cn(danger && 'text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50', className)}
          onClick={onClick}
        >
          {Icon ? <Icon /> : children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Earlier and later, for an item in an ordered list. In a grid (`grid`) they point sideways once it has columns. */
export function MoveButtons({ index, count, onMove, grid = false }: { index: number; count: number; onMove: (to: number) => void; grid?: boolean }) {
  return (
    <>
      <IconAction label="Move earlier" disabled={index <= 0} onClick={() => onMove(index - 1)}>
        <LuArrowUp className={cn(grid && 'sm:hidden')} />
        {grid ? <LuArrowLeft className="hidden sm:block" /> : null}
      </IconAction>
      <IconAction label="Move later" disabled={index >= count - 1} onClick={() => onMove(index + 1)}>
        <LuArrowDown className={cn(grid && 'sm:hidden')} />
        {grid ? <LuArrowRight className="hidden sm:block" /> : null}
      </IconAction>
    </>
  )
}

/** "Saving…" then "Saved" beside a field's label, for fields saved without a button. */
export function SaveNote({ state }: { state: SaveState }) {
  if (state === 'idle') return null
  return (
    <span className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-muted-foreground" aria-live="polite">
      {state === 'saving' ? <Spinner className="size-3" /> : <LuCheck className="size-3" />}
      {state === 'saving' ? 'Saving…' : 'Saved'}
    </span>
  )
}
