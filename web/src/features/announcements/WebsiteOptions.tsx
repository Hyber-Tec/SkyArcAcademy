import { useMemo, useRef } from 'react'
import { LuImageUp, LuTriangleAlert, LuX } from 'react-icons/lu'
import { toast } from 'sonner'
import { postSlug } from '@shared/website/posts'
import { type AnnouncementWebsite, WEBSITE_NEWS_CATEGORIES, WEBSITE_NEWS_LABELS, type WebsiteNewsCategory } from '@shared/website/types'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { isImageFile } from '@/features/website/images'
import { WebsiteImg } from '@/features/website/parts'
import type { CoverUpload } from './cover'

/** The pictures placed in the post's text (their addresses), to pick a cover from. */
function picturesIn(html: string): string[] {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  const srcs = [...doc.querySelectorAll('img')].map((img) => img.getAttribute('src') ?? '').filter((src) => /^https?:\/\//.test(src))
  return [...new Set(srcs)].slice(0, 8)
}

/** The editor's "On the website" options: the News category, the cover picture and the post's address on the site. */
export function WebsiteOptions({
  value,
  onChange,
  title,
  announcementId,
  html,
  cover,
}: {
  value: AnnouncementWebsite
  onChange: (patch: Partial<AnnouncementWebsite>) => void
  title: string
  announcementId: string
  html: string
  cover: CoverUpload
}) {
  const input = useRef<HTMLInputElement>(null)
  const pictures = useMemo(() => picturesIn(html), [html])
  const slug = value.slug || postSlug(title, announcementId)
  const working = cover.working
  const has = !!working || !!value.cover

  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-3" data-testid="website-options">
      <Field className="gap-1.5">
        <FieldLabel htmlFor="ann-web-category">News category</FieldLabel>
        <Select value={value.category} onValueChange={(v) => onChange({ category: v as WebsiteNewsCategory })}>
          <SelectTrigger id="ann-web-category" className="w-full bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WEBSITE_NEWS_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {WEBSITE_NEWS_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="space-y-2">
        <div className="text-sm font-medium">Cover picture</div>
        {working ? (
          <div className="relative aspect-video overflow-hidden rounded-md border bg-muted">
            <img src={working.preview} alt="" className="size-full object-cover opacity-70" />
            <div className="absolute inset-x-0 bottom-0 bg-background/85 px-2.5 py-1.5 text-xs backdrop-blur-sm">
              {working.error ? (
                <span className="flex items-start gap-1.5 font-medium text-destructive">
                  <LuTriangleAlert className="mt-px size-3.5 shrink-0" /> {working.error}
                </span>
              ) : (
                <>
                  <span className="flex items-center gap-1.5 font-medium">
                    <Spinner className="size-3.5" /> {working.progress ? `Uploading ${Math.round(working.progress * 100)}%` : 'Preparing…'}
                  </span>
                  <Progress value={Math.max(4, working.progress * 100)} className="mt-1 h-1" />
                </>
              )}
            </div>
          </div>
        ) : value.cover ? (
          <div className="aspect-video overflow-hidden rounded-md border bg-muted" data-testid="website-cover">
            <WebsiteImg image={value.cover} alt="The cover picture" />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Optional: shown at the top of the post and on its card on the website.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" className="bg-background" onClick={() => input.current?.click()}>
            <LuImageUp /> {has ? 'Replace' : 'Upload a picture'}
          </Button>
          {has ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                cover.cancel()
                onChange({ cover: null })
              }}
            >
              <LuX /> Remove
            </Button>
          ) : null}
        </div>
        {pictures.length ? (
          <div>
            <div className="text-xs text-muted-foreground">Or use a picture from the post:</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {pictures.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  aria-label={`Use picture ${i + 1} from the post as the cover`}
                  className="size-12 overflow-hidden rounded-md border bg-muted outline-none hover:ring-2 hover:ring-ring/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                  onClick={() => cover.start(src)}
                >
                  <img src={src} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          data-testid="website-cover-input"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            if (!isImageFile(file)) toast.error(`“${file.name}” isn’t a picture.`)
            else cover.start(file)
          }}
        />
      </div>

      <p className="text-xs [overflow-wrap:anywhere] text-muted-foreground">
        Its address: /news/{slug}
        {value.slug ? null : ' (it stays the same if the title changes later)'}
      </p>
    </div>
  )
}
