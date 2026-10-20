import { useRef, useState } from 'react'
import { toast } from 'sonner'
import type { WithId } from '@shared/types'
import type { WebsitePhoto } from '@shared/website/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { photoName, updatePhoto } from './api'
import { websiteImageUrl } from './images'
import { WebsiteImg } from './parts'

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))

/** "40% 60%" → { x: 40, y: 60 }; anything else is the middle. */
function parseFocus(focus: string | undefined): { x: number; y: number } {
  const m = /^\s*(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*$/.exec(focus ?? '')
  return m ? { x: clamp(Number(m[1])), y: clamp(Number(m[2])) } : { x: 50, y: 50 }
}

const CROPS = [
  { label: 'Wide', className: 'aspect-video' },
  { label: 'Square', className: 'aspect-square' },
  { label: 'Tall', className: 'aspect-[3/4]' },
]

const NUDGES: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

/**
 * Where a photo's subject is: the website crops photos to fit each spot, and keeps this point in view (it's saved as
 * a CSS object-position). A click or a tap sets it, dragging moves it, and the arrow keys nudge it.
 */
export function FocusDialog({ photo, onClose }: { photo: WithId<WebsitePhoto>; onClose: () => void }) {
  const { branchId, actor } = useBranch()
  const [point, setPoint] = useState(() => parseFocus(photo.focus))
  const [busy, setBusy] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  const pressed = useRef(false)
  const focus = `${point.x}% ${point.y}%`

  const pick = (e: React.PointerEvent) => {
    const r = frame.current?.getBoundingClientRect()
    if (!r || !r.width || !r.height) return
    setPoint({ x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) })
  }

  async function save() {
    setBusy(true)
    try {
      await updatePhoto(branchId, actor, photo, { focus }, `Set where the subject of ${photoName(photo)} is (${focus})`, [{ field: 'focus', label: 'Focus', from: photo.focus, to: focus }])
      toast.success('Saved. The website keeps that spot in view.')
      onClose()
    } catch (e) {
      toast.error('It couldn’t be saved', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Where’s the subject?</DialogTitle>
          <DialogDescription>Click or tap the photo where its subject is. The website crops photos to fit each spot, and keeps that point in view.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center rounded-lg bg-muted p-2">
          <div
            ref={frame}
            role="slider"
            tabIndex={0}
            aria-label="The photo’s subject"
            aria-valuetext={`${point.x}% across, ${point.y}% down`}
            aria-valuenow={point.x}
            className="relative cursor-crosshair touch-none rounded-sm outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
            onPointerDown={(e) => {
              pressed.current = true
              e.currentTarget.setPointerCapture(e.pointerId)
              pick(e)
            }}
            onPointerMove={(e) => pressed.current && pick(e)}
            onPointerUp={() => {
              pressed.current = false
            }}
            onPointerCancel={() => {
              pressed.current = false
            }}
            onKeyDown={(e) => {
              const d = NUDGES[e.key]
              if (!d) return
              e.preventDefault()
              const step = e.shiftKey ? 10 : 2
              setPoint((p) => ({ x: clamp(p.x + d[0] * step), y: clamp(p.y + d[1] * step) }))
            }}
          >
            <img
              src={websiteImageUrl(photo, 1280)}
              alt={photo.alt}
              draggable={false}
              className="block max-h-[min(50svh,26rem)] w-auto max-w-full rounded-sm"
              style={{ backgroundColor: photo.color || undefined, aspectRatio: `${photo.width} / ${photo.height}` }}
            />
            <span
              className="pointer-events-none absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.45)]"
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
            >
              <span className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
            </span>
          </div>
        </div>
        <div className="flex items-end justify-center gap-3" aria-label="How the website may crop it">
          {CROPS.map((c) => (
            <figure key={c.label}>
              <div className={`${c.className} h-20 overflow-hidden rounded-md border bg-muted`}>
                <WebsiteImg image={photo} focus={focus} />
              </div>
              <figcaption className="mt-1 text-center text-xs text-muted-foreground">{c.label}</figcaption>
            </figure>
          ))}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" disabled={busy || focus === '50% 50%'} onClick={() => setPoint({ x: 50, y: 50 })}>
            Back to the middle
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={busy || focus === photo.focus} onClick={() => void save()}>
              {busy ? <Spinner /> : null} Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
