import { useRef, useState } from 'react'
import { LuCheck, LuUpload } from 'react-icons/lu'
import { toast } from 'sonner'
import type { WithId } from '@shared/types'
import type { WebsitePhoto } from '@shared/website/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { isImageFile } from './images'
import { WebsiteImg } from './parts'

/**
 * Choosing a photo for a place or a coach card: one of the library's photos on show (a hidden one can't appear on the
 * website), or a new one, uploaded on the spot into the library.
 */
export function PhotoChooser({
  title,
  description,
  photos,
  current,
  onChoose,
  onUpload,
  onClose,
}: {
  title: string
  description: string
  photos: WithId<WebsitePhoto>[]
  current: string | null
  onChoose: (photo: WithId<WebsitePhoto>) => void
  onUpload: (file: File) => void
  onClose: () => void
}) {
  const visible = photos.filter((p) => !p.hidden)
  const [selected, setSelected] = useState<string | null>(current && visible.some((p) => p.id === current) ? current : null)
  const input = useRef<HTMLInputElement>(null)
  const chosen = visible.find((p) => p.id === selected) ?? null
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {visible.length ? (
          <div className="-mx-1 max-h-[min(55svh,32rem)] overflow-y-auto p-1">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4" role="listbox" aria-label="Photos">
              {visible.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={selected === p.id}
                  aria-label={p.caption || p.alt || 'Photo'}
                  onClick={() => setSelected(p.id)}
                  onDoubleClick={() => onChoose(p)}
                  className={cn(
                    'relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    selected === p.id && 'ring-2 ring-brand ring-offset-2 ring-offset-background',
                  )}
                >
                  <WebsiteImg image={p} focus={p.focus} alt="" />
                  {selected === p.id ? (
                    <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-brand-solid text-white shadow">
                      <LuCheck className="size-4" />
                    </span>
                  ) : null}
                  {p.caption ? (
                    <span className="absolute inset-x-0 bottom-0 truncate bg-linear-to-t from-black/70 to-transparent px-2 pt-5 pb-1.5 text-left text-xs text-white">{p.caption}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            {photos.length ? 'Every photo in the library is hidden. Upload a new one, or show one on the Photos tab.' : 'There are no photos in the library yet. Upload the first one.'}
          </div>
        )}
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={() => input.current?.click()}>
            <LuUpload /> Upload a new photo
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!chosen || chosen.id === current} onClick={() => chosen && onChoose(chosen)}>
              Use this photo
            </Button>
          </div>
        </DialogFooter>
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          data-testid="chooser-upload-input"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            if (!isImageFile(file)) toast.error(`“${file.name}” isn’t a photo.`)
            else onUpload(file)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
