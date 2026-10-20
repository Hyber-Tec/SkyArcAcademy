import DOMPurify from 'dompurify'
import { useEffect, useMemo, useRef, useState } from 'react'
import { LuArrowLeft, LuCheck, LuLink, LuLoaderCircle, LuPin } from 'react-icons/lu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { type SitePostFull, usePost, useSiteData } from '@/site/data'
import { ACADEMY, NEWS, type NewsCategory, UI } from '@/site/kit/content'
import { Reveal } from '@/site/kit/motion'
import { Photo } from '@/site/kit/Photo'
import { A, useSite } from '@/site/kit/site'
import { Container, btnOutline } from '../components/bits'
import { FinalCta, NewsCard, PageHero, crmLang, formatDate } from '../components/blocks'
import { T } from '../i18n'
import { NotFound } from './NotFound'

/** Twelve posts at first; more appear by themselves as the reader nears the end, twelve at a time (no button). */
const PAGE = 12
const CATEGORIES: NewsCategory[] = ['results', 'competitions', 'announcements', 'training']

export function News() {
  const { t, lang } = useSite()
  const { posts: all, ready } = useSiteData()
  const [cat, setCat] = useState<'all' | NewsCategory>('all')
  const [shown, setShown] = useState(PAGE)
  const list = useMemo(() => (cat === 'all' ? all : all.filter((p) => p.category === cat)), [all, cat])
  const visible = list.slice(0, shown)
  const more = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = more.current
    if (!el || shown >= list.length) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setShown((n) => n + PAGE), { rootMargin: '0px 0px 700px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [shown, list.length])
  // Only the categories that have posts, after "All".
  const cats: ('all' | NewsCategory)[] = ['all', ...CATEGORIES.filter((c) => all.some((p) => p.category === c))]
  return (
    <>
      <PageHero kicker={t(NEWS.eyebrow)} title={t(NEWS.title)} text={t(NEWS.text)}>
        {lang !== 'en' && all.length ? <p className="mt-6 text-[13.5px] text-stone">{t(NEWS.writtenNote)}</p> : null}
      </PageHero>
      <section className="py-14 sm:py-20" aria-label={t(UI.news)}>
        <Container>
          {ready && all.length === 0 ? (
            <p className="max-w-xl rounded-[26px] bg-warm px-6 py-8 text-[17px] leading-relaxed text-stone sm:px-8">{t(NEWS.empty)}</p>
          ) : (
            <Tabs
              value={cat}
              onValueChange={(v) => {
                setCat(v as 'all' | NewsCategory)
                setShown(PAGE)
              }}
            >
              {cats.length > 2 ? (
                <div className="no-scrollbar -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
                  <TabsList className="h-auto w-max gap-1 rounded-full border border-line bg-warm p-1.5 group-data-horizontal/tabs:h-auto">
                    {cats.map((c) => {
                      const n = c === 'all' ? all.length : all.filter((p) => p.category === c).length
                      return (
                        <TabsTrigger
                          key={c}
                          value={c}
                          className="h-auto min-h-11 rounded-full px-4 py-2 text-[14.5px] font-medium text-stone data-active:bg-white data-active:text-ink data-active:shadow-[0_1px_2px_rgb(10_10_10/0.08),0_0_0_1px_rgb(10_10_10/0.06)]"
                        >
                          {c === 'all' ? t(NEWS.all) : t(NEWS.categories[c])}
                          <span className="rounded-full bg-ink/[0.06] px-1.5 text-[11.5px] tabular-nums">{n}</span>
                        </TabsTrigger>
                      )
                    })}
                  </TabsList>
                </div>
              ) : null}
              <TabsContent value={cat} className="outline-none">
                <div className={cn('grid gap-5 md:grid-cols-2 lg:grid-cols-3', cats.length > 2 && 'mt-8')}>
                  {visible.map((p, i) => (
                    <Reveal key={p.id} delay={(i % 3) * 0.06} className={cn('h-full', i === 0 && cat === 'all' && 'md:col-span-2 lg:col-span-3')}>
                      <NewsCard post={p} large={i === 0 && cat === 'all'} className="h-full" />
                    </Reveal>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          )}

          {shown < list.length ? (
            <div ref={more} className="mt-10 flex items-center justify-center gap-2.5 text-[14px] text-stone" role="status">
              <LuLoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              {t(T.loadingMore)}
            </div>
          ) : null}
        </Container>
      </section>
      <FinalCta />
    </>
  )
}

/** The post's text, cleaned again before it's shown (the CRM cleans it when it's saved). */
function PostBody({ html }: { html: string }) {
  const clean = useMemo(() => DOMPurify.sanitize(html, { ADD_ATTR: ['target'], FORBID_TAGS: ['style', 'form', 'input', 'button'] }), [html])
  // Links to other sites open in a new tab.
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    for (const a of ref.current?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? []) {
      if (new URL(a.href, location.href).origin !== location.origin) {
        a.target = '_blank'
        a.rel = 'noreferrer'
      }
    }
  }, [clean])
  return <div ref={ref} lang={crmLang} className="post-body text-[17.5px] leading-[1.75] text-ink/85" dangerouslySetInnerHTML={{ __html: clean }} />
}

export function NewsPostPage({ slug }: { slug: string }) {
  const post = usePost(slug)
  if (post === 'missing') return <NotFound />
  if (post === null) return <PostLoading />
  return <PostView post={post} />
}

function PostLoading() {
  return (
    <div className="pt-10 pb-24 sm:pt-14" aria-busy="true">
      <Container className="max-w-[860px] space-y-5">
        <div className="h-5 w-32 animate-pulse rounded-full bg-warm-2" />
        <div className="h-12 w-4/5 animate-pulse rounded-2xl bg-warm-2" />
        <div className="h-5 w-3/5 animate-pulse rounded-full bg-warm-2" />
      </Container>
      <Container className="mt-10 max-w-[1080px]">
        <div className="aspect-[16/9] animate-pulse rounded-[30px] bg-warm-2" />
      </Container>
    </div>
  )
}

function PostView({ post }: { post: SitePostFull }) {
  const { t, lang } = useSite()
  const { posts } = useSiteData()
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    document.title = `${post.title} · ${ACADEMY.name}`
  }, [post.title])
  const more = posts.filter((p) => p.slug !== post.slug).slice(0, 3)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.href)
    } catch {
      // Older browsers: the address bar has it.
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }
  return (
    <>
      <article className="pt-10 pb-16 sm:pt-14 sm:pb-24">
        <Container className="max-w-[860px]">
          <A to="news" className="inline-flex min-h-11 items-center gap-2 text-[14.5px] font-medium text-stone transition hover:text-ink">
            <LuArrowLeft className="size-4" aria-hidden="true" /> {t(UI.allNews)}
          </A>
          <Reveal>
            <div className="mt-6 flex flex-wrap items-center gap-2 text-[13px]">
              <span className="rounded-full bg-warm-2 px-3 py-1 font-medium text-ink">{t(NEWS.categories[post.category])}</span>
              <time dateTime={new Date(post.publishedAt).toISOString()} className="text-stone">
                {formatDate(post.publishedAt, lang)}
              </time>
              {post.pinned ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-[12px] font-medium text-ink">
                  <LuPin className="size-3" aria-hidden="true" /> {t(T.pinned)}
                </span>
              ) : null}
            </div>
            <h1 lang={crmLang} className="mt-5 text-[36px] leading-[1.06] font-semibold tracking-[-0.035em] text-balance text-ink sm:text-[52px]">
              {post.title}
            </h1>
            {lang === 'ko' ? <p className="mt-4 rounded-xl bg-warm px-4 py-2.5 text-[13.5px] text-stone">{t(T.inEnglish)}</p> : null}
          </Reveal>
        </Container>
        {post.cover ? (
          <Container className="mt-10 max-w-[1080px]">
            <Reveal>
              <div className="mx-auto overflow-hidden rounded-[30px] bg-ink shadow-soft" style={{ aspectRatio: `${post.cover.width} / ${post.cover.height}`, maxHeight: '72vh' }}>
                <Photo photo={post.cover} alt="" sizes="(min-width: 1080px) 1080px, 100vw" priority className="size-full" />
              </div>
            </Reveal>
          </Container>
        ) : null}
        <Container className="mt-10 max-w-[860px]">
          <PostBody html={post.html} />
          <div className="mt-10 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-end">
            <button type="button" onClick={copy} className={cn(btnOutline, 'min-h-11 px-5 text-[14px]')} aria-live="polite">
              {copied ? <LuCheck className="size-4" aria-hidden="true" /> : <LuLink className="size-4" aria-hidden="true" />}
              {copied ? t(NEWS.copied) : t(T.copyLink)}
            </button>
          </div>
        </Container>
      </article>
      {more.length ? (
        <section className="bg-warm py-16 sm:py-20" aria-labelledby="more-news">
          <Container>
            <h2 id="more-news" className="text-[28px] font-semibold tracking-tight text-ink sm:text-[34px]">
              {t(NEWS.more)}
            </h2>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {more.map((p, i) => (
                <Reveal key={p.id} delay={i * 0.06} className="h-full">
                  <NewsCard post={p} className="h-full" />
                </Reveal>
              ))}
            </div>
          </Container>
        </section>
      ) : null}
    </>
  )
}
