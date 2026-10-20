import { useEffect, useMemo, useRef, useState } from 'react'
import { LuImages, LuLoaderCircle } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { type SitePhoto, useSiteData } from '@/site/data'
import { GALLERY, type GalleryCategory, UI } from '@/site/kit/content'
import { Lightbox } from '@/site/kit/Lightbox'
import { Reveal } from '@/site/kit/motion'
import { Photo, Placeholder } from '@/site/kit/Photo'
import { useSite } from '@/site/kit/site'
import { Container } from '../components/bits'
import { FinalCta, PageHero, crmLang } from '../components/blocks'
import { T } from '../i18n'

type Album = 'all' | GalleryCategory

/** How many photos show at first; more appear as the reader nears the end. */
const PAGE = 24
/** While the gallery is this short, marked spots show the photos still to come. */
const SHORT = 12

/** Albums (a card per album with its cover and count) above the chosen album's photos; a photo opens full screen. */
export function Gallery() {
  const { t, lang, query } = useSite()
  const { photos, ready } = useSiteData()
  const wanted = new URLSearchParams(query).get('album') as Album | null
  const [album, setAlbum] = useState<Album>(wanted && GALLERY.categories.some((c) => c.id === wanted) ? wanted : 'all')
  const [open, setOpen] = useState<number | null>(null)
  const [shown, setShown] = useState(PAGE)
  const items = useMemo(() => (album === 'all' ? photos : photos.filter((g) => g.album === album)), [album, photos])
  const count = (id: Album) => (id === 'all' ? photos.length : photos.filter((g) => g.album === id).length)
  const cover = (id: Album): SitePhoto | undefined => (id === 'all' ? photos[0] : photos.find((g) => g.album === id))
  const albums = GALLERY.categories.filter((c) => c.id === 'all' || count(c.id) > 0)
  const albumLabel = GALLERY.categories.find((c) => c.id === album)?.label ?? GALLERY.categories[0].label
  const visible = items.slice(0, shown)
  const more = items.length > visible.length
  const todo = album === 'all' && ready && photos.length < SHORT ? GALLERY.todo.slice(0, Math.max(0, SHORT - photos.length)) : []

  // More photos as the reader nears the end of the list (no button to press).
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el || !more) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setShown((n) => n + PAGE), { rootMargin: '0px 0px 900px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [more, shown])

  const pick = (id: Album) => {
    setAlbum(id)
    setShown(PAGE)
  }

  return (
    <>
      <PageHero kicker={t(GALLERY.eyebrow)} title={t(GALLERY.title)} text={t(GALLERY.text)} />

      <section className="py-16 sm:py-20" aria-labelledby="albums-title">
        <Container>
          {albums.length > 1 ? (
            <>
              <h2 id="albums-title" className="text-[13px] font-semibold tracking-[0.14em] text-stone uppercase">
                {t(T.albums)}
              </h2>
              <div className="no-scrollbar -mx-5 mt-4 flex snap-x gap-3 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5" role="group" aria-label={t(T.albums)}>
                {albums.map((c) => {
                  const g = cover(c.id)
                  const on = c.id === album
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => pick(c.id)}
                      className={cn(
                        'group relative w-[62vw] max-w-[260px] shrink-0 snap-start overflow-hidden rounded-[22px] text-left transition focus-visible:ring-2 focus-visible:ring-ink/40 focus-visible:ring-offset-2 focus-visible:outline-none sm:w-auto sm:max-w-none',
                        on ? 'ring-2 ring-ink ring-offset-2' : 'opacity-90 hover:opacity-100',
                      )}
                    >
                      <div className="aspect-[4/3] overflow-hidden bg-warm-2">{g ? <Photo photo={g} alt="" sizes="260px" className="size-full transition duration-700 group-hover:scale-[1.05]" /> : null}</div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" aria-hidden="true" />
                      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3.5 text-white">
                        <span className="text-[15.5px] font-semibold">{c.id === 'all' ? t(T.allPhotos) : t(c.label)}</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[12px] font-medium backdrop-blur">
                          <LuImages className="size-3" aria-hidden="true" />
                          {count(c.id)}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          ) : (
            <h2 id="albums-title" className="sr-only">
              {t(T.allPhotos)}
            </h2>
          )}

          <div className={cn('flex items-baseline justify-between gap-4 border-b border-line pb-4', albums.length > 1 && 'mt-12')}>
            <h2 className="text-[26px] font-semibold tracking-tight text-ink sm:text-[30px]">{album === 'all' ? t(T.allPhotos) : t(albumLabel)}</h2>
            {items.length ? (
              <span className="text-[14px] text-stone">
                {items.length} {lang === 'ko' ? t(T.photos) : items.length === 1 ? 'photo' : t(T.photos)}
              </span>
            ) : null}
          </div>
          {ready && photos.length === 0 ? <p className="mt-6 text-[16px] text-stone">{t(GALLERY.empty)}</p> : null}

          <div className="mt-6 columns-1 gap-3 sm:columns-2 lg:columns-3 [&>*]:mb-3">
            {visible.map((g, i) => (
              <Reveal key={g.id} delay={(i % 3) * 0.05} className="break-inside-avoid">
                <button type="button" onClick={() => setOpen(i)} className="group relative block w-full overflow-hidden rounded-[22px] bg-warm-2 text-left focus-visible:ring-2 focus-visible:ring-ink/40 focus-visible:ring-offset-2 focus-visible:outline-none" aria-label={g.caption || g.alt || t(UI.gallery)}>
                  <Photo photo={g} alt={g.alt} sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw" className="h-auto w-full transition duration-700 ease-out group-hover:scale-[1.03]" />
                  <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/60 to-transparent p-4 pt-12 text-white">
                    <span className="text-[15px] font-medium" lang={crmLang}>
                      {g.caption}
                    </span>
                    <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-0.5 text-[11.5px] backdrop-blur">{t(GALLERY.categories.find((c) => c.id === g.album)?.label ?? GALLERY.categories[0].label)}</span>
                  </span>
                </button>
              </Reveal>
            ))}
            {todo.map((label, i) => (
              <Reveal key={label.en} delay={(i % 3) * 0.05} className="break-inside-avoid">
                <Placeholder label={label} className={cn('w-full rounded-[22px] border-ink/20 bg-warm text-stone', i % 2 ? 'aspect-[4/5]' : 'aspect-[4/3]')} />
              </Reveal>
            ))}
          </div>
          {more ? (
            <div ref={sentinel} role="status" className="flex items-center justify-center gap-2 py-8 text-[14px] text-stone">
              <LuLoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              {t(T.loadingPhotos)}
            </div>
          ) : null}
          <Lightbox
            items={items.map((g) => ({ photo: g, title: g.caption, alt: g.alt, meta: t(GALLERY.categories.find((c) => c.id === g.album)?.label ?? UI.gallery) }))}
            index={open}
            onIndex={(i) => {
              // Stepping past the photos shown shows them too.
              if (i !== null && i >= shown) setShown(i + 1)
              setOpen(i)
            }}
            closeLabel={t(UI.close)}
            prevLabel={t(UI.previous)}
            nextLabel={t(UI.next)}
          />
        </Container>
      </section>
      <FinalCta />
    </>
  )
}
