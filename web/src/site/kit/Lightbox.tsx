import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useRef } from 'react'
import { LuChevronLeft, LuChevronRight, LuX } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import type { WebsiteImage } from '@shared/website/types'
import { Photo } from './Photo'

/**
 * A full-screen photo viewer on Radix Dialog (shadcn's base): arrows and the keyboard step through the photos, a swipe
 * does on phones, Escape or the close button leaves, and focus returns where it was.
 */
export interface LightboxItem {
  photo: WebsiteImage & { id?: string }
  title: string
  alt: string
  meta?: string
}

export function Lightbox({
  items,
  index,
  onIndex,
  className,
  closeLabel = 'Close',
  prevLabel = 'Previous photo',
  nextLabel = 'Next photo',
}: {
  items: LightboxItem[]
  index: number | null
  onIndex: (i: number | null) => void
  className?: string
  closeLabel?: string
  prevLabel?: string
  nextLabel?: string
}) {
  const open = index !== null
  const item = open ? items[index] : null
  const startX = useRef<number | null>(null)
  const step = (d: number) => {
    if (index === null) return
    onIndex((index + d + items.length) % items.length)
  }
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1)
      if (e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onIndex(null)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-black/92 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn('fixed inset-0 z-[91] flex flex-col text-white outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0', className)}
          onPointerDown={(e) => {
            startX.current = e.clientX
          }}
          onPointerUp={(e) => {
            if (startX.current === null) return
            const dx = e.clientX - startX.current
            startX.current = null
            if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1)
          }}
        >
          <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm sm:px-6">
            <span className="font-mono text-xs tracking-widest text-white/60 tabular-nums">
              {index !== null ? `${String(index + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}` : ''}
            </span>
            <DialogPrimitive.Close className="inline-flex size-10 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none" aria-label={closeLabel}>
              <LuX className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-16">
            {item ? <Photo key={item.photo.folder} photo={item.photo} alt={item.alt} sizes="100vw" priority className="max-h-full w-auto max-w-full animate-in object-contain fade-in-0 zoom-in-95 duration-300" style={{ background: 'none' }} /> : null}
            {items.length > 1 ? (
              <>
                <button type="button" onClick={() => step(-1)} aria-label={prevLabel} className="absolute top-1/2 left-2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm sm:size-11 sm:bg-white/10 text-white transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none">
                  <LuChevronLeft className="size-5" />
                </button>
                <button type="button" onClick={() => step(1)} aria-label={nextLabel} className="absolute top-1/2 right-2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm sm:size-11 sm:bg-white/10 text-white transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none">
                  <LuChevronRight className="size-5" />
                </button>
              </>
            ) : null}
          </div>
          <div className="px-4 pt-3 pb-6 text-center sm:px-6">
            <DialogPrimitive.Title className="text-base font-medium" lang="en">
              {item?.title || item?.alt}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mx-auto mt-1 max-w-xl text-sm text-white/60">
              {item?.meta ?? (item?.title ? item.alt : '')}
            </DialogPrimitive.Description>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
