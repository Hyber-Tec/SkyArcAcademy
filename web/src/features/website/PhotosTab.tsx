import { useRef, useState } from 'react'
import { LuCrosshair, LuEye, LuEyeOff, LuGripVertical, LuImagePlus, LuImages, LuMapPin, LuRotateCw, LuTrash2, LuX } from 'react-icons/lu'
import { toast } from 'sonner'
import type { WithId } from '@shared/types'
import { WEBSITE_ALBUMS, WEBSITE_ALBUM_LABELS, type WebsiteAlbum, type WebsiteContent, type WebsitePhoto } from '@shared/website/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useFileDropZone, useWindowDropGuard } from '@/features/drive/dropzone'
import { cn } from '@/lib/utils'
import { deletePhoto, forgetUnsavedPhoto, joinList, movePhoto, photoName, photoUses, setPhotoAlbum, updatePhoto } from './api'
import { FocusDialog } from './FocusDialog'
import { isImageFile } from './images'
import { IconAction, MoveButtons, SaveNote, UploadPreview, WebsiteImg } from './parts'
import { type PhotoUpload, removePhotoUpload, retryPhotoUpload, startPhotoUploads, usePhotoUploads } from './uploads'
import { useTextDraft } from './useTextDraft'

/** A photo card dragged by its handle (not files from the computer, which add photos). */
const DRAG_TYPE = 'application/x-skyarc-website-photo'

/**
 * The website's photo library: the gallery (in this order, new photos first) and the photos the pages and coach cards
 * choose from. Photos dropped anywhere on the tab, or chosen, are resized and uploaded in the background; each one's
 * caption and description save when the field is left.
 */
export function PhotosTab({ photos, content, loading }: { photos: WithId<WebsitePhoto>[]; content: WebsiteContent; loading: boolean }) {
  const { branchId, actor } = useBranch()
  const uploads = usePhotoUploads()
  const [album, setAlbum] = useState<WebsiteAlbum>('training')
  const [focusing, setFocusing] = useState<WithId<WebsitePhoto> | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const top = useRef<HTMLParagraphElement>(null)
  const { confirm, dialog } = useConfirm()
  useWindowDropGuard()

  function add(files: File[]) {
    const others = files.filter((f) => !isImageFile(f))
    const images = files.filter(isImageFile)
    if (others.length) toast.error(others.length === 1 ? `“${others[0].name}” isn’t a photo, so it wasn’t added.` : `${others.length} files aren’t photos, so they weren’t added.`)
    if (!images.length) return
    startPhotoUploads(branchId, actor, images, { album, photos })
    // New photos go first: bring them into view.
    requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }
  const drop = useFileDropZone({ canWrite: true, onFiles: (entries) => add(entries.map((e) => e.file)) })

  const pending = uploads.filter((u) => !photos.some((p) => p.id === u.id)).sort((a, b) => a.order - b.order)
  const hiddenCount = photos.filter((p) => p.hidden).length

  const move = (from: number, to: number) =>
    void movePhoto(branchId, actor, photos, from, to).catch((e: Error) => toast.error('The photo couldn’t be moved', { description: e.message }))

  async function toggleHidden(p: WithId<WebsitePhoto>) {
    const uses = photoUses(content, p.id)
    if (
      !p.hidden &&
      uses.length &&
      !(await confirm({
        title: 'Hide this photo?',
        description: `It’s used for ${joinList(uses)}. While it’s hidden, the website shows a placeholder there instead, and leaves it out of the gallery.`,
        confirmLabel: 'Hide photo',
      }))
    )
      return
    try {
      await updatePhoto(branchId, actor, p, { hidden: !p.hidden }, p.hidden ? `Showed ${photoName(p)} on the website again` : `Hid ${photoName(p)} from the website`, [
        { field: 'hidden', label: 'Hidden', from: p.hidden, to: !p.hidden },
      ])
      toast.success(p.hidden ? 'The photo is on the website again.' : 'The photo is hidden from the website.')
    } catch (e) {
      toast.error('It couldn’t be changed', { description: (e as Error).message })
    }
  }

  async function remove(p: WithId<WebsitePhoto>) {
    const uses = photoUses(content, p.id)
    const ok = await confirm({
      title: 'Delete this photo?',
      description: (
        <>
          It’s removed from the website and from this library, with its files. This can’t be undone.
          {uses.length ? (
            <span className="mt-2 block">
              It’s used for {joinList(uses)}: {uses.length === 1 ? 'that spot is' : 'those spots are'} left without a photo.
            </span>
          ) : null}
        </>
      ),
      confirmLabel: 'Delete photo',
      destructive: true,
    })
    if (!ok) return
    try {
      await deletePhoto(branchId, actor, p, content)
      toast.success('Photo deleted.')
    } catch (e) {
      toast.error('It couldn’t be deleted', { description: (e as Error).message })
    }
  }

  async function discard(u: PhotoUpload) {
    await removePhotoUpload(u.id)
    await forgetUnsavedPhoto(branchId, actor, u.id, content).catch(() => undefined)
  }

  return (
    <div className="relative space-y-4" {...drop.handlers}>
      {drop.dragOver ? <div className="pointer-events-none absolute -inset-2 z-30 rounded-2xl border-2 border-dashed border-brand/60 bg-brand/5" /> : null}
      <section
        aria-label="Add photos"
        data-testid="website-photo-drop"
        className={cn(
          'flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/30 p-3 transition-colors sm:flex-nowrap sm:pl-4',
          // While files are dragged over the tab, it stays in view at the top.
          drop.dragOver && 'sticky top-14 z-40 border-brand/70 bg-[color-mix(in_oklab,var(--brand)_6%,var(--card))] shadow-lg md:top-3',
        )}
      >
        <span className={cn('hidden size-10 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground sm:flex', drop.dragOver && 'border-brand/40 text-brand-text')}>
          <LuImagePlus className="size-5" />
        </span>
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-sm font-semibold">
            {drop.dragOver ? (
              'Drop the photos to add them'
            ) : (
              <>
                <span className="sm:hidden">Add photos</span>
                <span className="hidden sm:inline">
                  Drop photos here<span className="font-normal text-muted-foreground"> · one or several</span>
                </span>
              </>
            )}
          </p>
          <p className="text-[13px] leading-snug text-pretty text-muted-foreground">They’re resized for the website as they upload, and go first in the gallery.</p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Select value={album} onValueChange={(v) => setAlbum(v as WebsiteAlbum)}>
            <SelectTrigger aria-label="Album for new photos" className="min-w-0 flex-1 sm:w-44 sm:flex-none">
              <span className="text-muted-foreground">Album:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEBSITE_ALBUMS.map((a) => (
                <SelectItem key={a} value={a}>
                  {WEBSITE_ALBUM_LABELS[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => input.current?.click()}>
            <LuImagePlus /> Choose photos
          </Button>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          data-testid="website-photo-input"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            if (files.length) add(files)
          }}
        />
      </section>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-96 rounded-xl" />
          ))}
        </div>
      ) : photos.length + pending.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LuImages />
            </EmptyMedia>
            <EmptyTitle>No photos yet</EmptyTitle>
            <EmptyDescription>Photos added here make the website’s gallery, and the pages and coach cards choose theirs from them.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <p ref={top} className="scroll-mt-20 text-sm text-muted-foreground">
            {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
            {hiddenCount ? ` (${hiddenCount} hidden)` : ''}, in the gallery’s order. Move one with its arrows<span className="hidden md:inline">, or drag it by its handle</span>.
          </p>
          <div
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
            onDragEnd={() => {
              setDragging(null)
              setOver(null)
            }}
          >
            {pending.map((u) => (
              <UploadCard key={u.id} upload={u} onRemove={() => void discard(u)} />
            ))}
            {photos.map((p, i) => (
              <PhotoCard
                key={p.id}
                photo={p}
                index={i}
                count={photos.length}
                uses={photoUses(content, p.id)}
                dragging={dragging === p.id}
                over={over === i && dragging !== null && dragging !== p.id}
                onMove={(to) => move(i, to)}
                onFocus={() => setFocusing(p)}
                onToggleHidden={() => void toggleHidden(p)}
                onDelete={() => void remove(p)}
                onDragStart={() => setDragging(p.id)}
                onDragOverCard={() => setOver(i)}
                onDropOn={(id) => {
                  const from = photos.findIndex((x) => x.id === id)
                  setDragging(null)
                  setOver(null)
                  if (from >= 0 && from !== i) move(from, i)
                }}
              />
            ))}
          </div>
        </>
      )}
      {focusing ? <FocusDialog photo={photos.find((p) => p.id === focusing.id) ?? focusing} onClose={() => setFocusing(null)} /> : null}
      {dialog}
    </div>
  )
}

function UploadCard({ upload, onRemove }: { upload: PhotoUpload; onRemove: () => void }) {
  const failed = upload.stage === 'failed'
  return (
    <Card className="gap-0 overflow-hidden p-0" data-testid="website-photo-upload">
      <div className="aspect-[4/3] overflow-hidden bg-muted">
        <UploadPreview upload={upload} />
      </div>
      <div className="space-y-2 p-3">
        <p className="truncate text-sm font-medium">{upload.name}</p>
        {failed ? (
          <>
            <p className="text-sm text-destructive">{upload.error}</p>
            <div className="flex flex-wrap gap-2">
              {upload.canRetry ? (
                <Button size="sm" variant="outline" onClick={() => retryPhotoUpload(upload.id)}>
                  <LuRotateCw /> Retry
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={onRemove}>
                <LuX /> Remove
              </Button>
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {WEBSITE_ALBUM_LABELS[upload.album]} album · on the website as soon as it’s up
          </p>
        )}
      </div>
    </Card>
  )
}

function PhotoCard({
  photo,
  index,
  count,
  uses,
  dragging,
  over,
  onMove,
  onFocus,
  onToggleHidden,
  onDelete,
  onDragStart,
  onDragOverCard,
  onDropOn,
}: {
  photo: WithId<WebsitePhoto>
  index: number
  count: number
  uses: string[]
  dragging: boolean
  over: boolean
  onMove: (to: number) => void
  onFocus: () => void
  onToggleHidden: () => void
  onDelete: () => void
  onDragStart: () => void
  onDragOverCard: () => void
  onDropOn: (photoId: string) => void
}) {
  const { branchId, actor } = useBranch()
  const card = useRef<HTMLDivElement>(null)
  const caption = useTextDraft(photo.caption, (v) =>
    updatePhoto(branchId, actor, photo, { caption: v }, `Changed the caption of ${photoName(photo)}${v ? ` to “${v}”` : ' to nothing'}`, [
      { field: 'caption', label: 'Caption', from: photo.caption || null, to: v || null },
    ]),
  )
  const alt = useTextDraft(
    photo.alt,
    (v) => updatePhoto(branchId, actor, photo, { alt: v }, `Changed the description of ${photoName(photo)}`, [{ field: 'alt', label: 'Description', from: photo.alt || null, to: v || null }]),
    { multiline: true },
  )
  const ours = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes(DRAG_TYPE)

  return (
    <Card
      ref={card}
      className={cn('gap-0 overflow-hidden p-0 transition', dragging && 'opacity-40', over && 'ring-2 ring-brand/70')}
      data-testid="website-photo"
      onDragOver={(e) => {
        if (!ours(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onDragOverCard()
      }}
      onDrop={(e) => {
        if (!ours(e)) return
        e.preventDefault()
        onDropOn(e.dataTransfer.getData(DRAG_TYPE))
      }}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <WebsiteImg image={photo} focus={photo.focus} alt={photo.alt} className={cn(photo.hidden && 'opacity-60')} />
        {photo.hidden ? (
          <Badge variant="secondary" className="absolute top-2 left-2 bg-background/90 shadow-sm backdrop-blur-sm">
            <LuEyeOff /> Hidden
          </Badge>
        ) : null}
        <span
          role="button"
          tabIndex={-1}
          draggable
          aria-label="Drag to move"
          title="Drag to move"
          className="absolute top-2 right-2 hidden size-8 cursor-grab items-center justify-center rounded-md bg-background/90 text-muted-foreground shadow-sm backdrop-blur-sm hover:text-foreground active:cursor-grabbing md:flex"
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, photo.id)
            e.dataTransfer.effectAllowed = 'move'
            const r = card.current?.getBoundingClientRect()
            if (card.current && r) e.dataTransfer.setDragImage(card.current, e.clientX - r.left, e.clientY - r.top)
            onDragStart()
          }}
        >
          <LuGripVertical className="size-4" />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <FieldLabel htmlFor={`caption-${photo.id}`}>Caption</FieldLabel>
            <SaveNote state={caption.state} />
          </div>
          <Input id={`caption-${photo.id}`} maxLength={200} placeholder="A short title for the gallery" {...caption.props} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <FieldLabel htmlFor={`alt-${photo.id}`}>Description</FieldLabel>
            <SaveNote state={alt.state} />
          </div>
          <Textarea id={`alt-${photo.id}`} rows={2} maxLength={400} className="min-h-14 resize-none" placeholder="What the photo shows, for people who can’t see it" {...alt.props} />
        </div>
        <div className="mt-auto flex items-center gap-0.5">
          <Select value={photo.album} onValueChange={(v) => void setPhotoAlbum(branchId, actor, photo, v as WebsiteAlbum).catch((e: Error) => toast.error('It couldn’t be changed', { description: e.message }))}>
            <SelectTrigger size="sm" aria-label="Album" className="mr-auto w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEBSITE_ALBUMS.map((a) => (
                <SelectItem key={a} value={a}>
                  {WEBSITE_ALBUM_LABELS[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <IconAction icon={LuCrosshair} label="Where’s the subject?" onClick={onFocus} />
          <IconAction icon={photo.hidden ? LuEye : LuEyeOff} label={photo.hidden ? 'Show on the website' : 'Hide from the website'} onClick={onToggleHidden} />
          <MoveButtons index={index} count={count} onMove={onMove} grid />
          <IconAction icon={LuTrash2} label="Delete photo" danger onClick={onDelete} />
        </div>
        {uses.length ? (
          <p className={cn('flex items-start gap-1.5 text-xs', photo.hidden ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
            <LuMapPin className="mt-px size-3.5 shrink-0" />
            <span>
              {photo.hidden ? 'Hidden, so these show a placeholder: ' : 'Used for '}
              {uses.join(' · ')}
            </span>
          </p>
        ) : null}
      </div>
    </Card>
  )
}
