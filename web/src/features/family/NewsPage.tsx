import { doc } from 'firebase/firestore'
import { useEffect, useMemo, useRef } from 'react'
import { LuArrowLeft, LuChevronRight, LuClock, LuDownload, LuFileText, LuMegaphone, LuPin, LuTag, LuUser } from 'react-icons/lu'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { type Announcement, type AnnouncementAttachment, type AnnouncementRead, isForFamilies } from '@shared/comms'
import { COL, branchColPath } from '@shared/paths'
import { formatInstant, todayKey } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { announcementRef, formatBytes, markRead } from '@/features/announcements/api'
import { HtmlContent } from '@/features/announcements/html'
import { db } from '@/lib/firebase'
import { useDoc } from '@/lib/firestore'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'
import { useFamily } from './data'
import { NotLinked } from './FamilyWidgets'
import { isPicture, useFamilyNews, useIsNewNews } from './news'
import { NewsMeta, NewsTitle } from './NewsWidgets'

/** Where a post was opened from, so its Back returns there (Home's card on phones, where News isn't a tab). */
type From = 'home' | 'news'

/**
 * Parent and Student → News: the academy's posts shown to families, pinned first and then newest, each marked "New"
 * until the person opens it. The sidebar has it on computers; on phones, Home's "From the academy" card leads here.
 */
export function FamilyNewsPage() {
  const { branch, timezone } = useBranch()
  const family = useFamily()
  const news = useFamilyNews()
  const isNew = useIsNewNews()
  const now = useNow()
  const today = todayKey(timezone, now)
  const base = `/${family.who}`

  if (family.notLinked) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <PageHeader title="News" />
        <NotLinked family={family} />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="News" description={`News and updates from ${branch.name}.`} className="mb-4" />
      {news.loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : news.data.length ? (
        <ul className="space-y-3" data-testid="family-news-list">
          {news.data.map((a) => (
            <li key={a.id}>
              <Link
                to={`${base}/news/${a.id}`}
                state={{ from: 'news' }}
                className="group flex items-start gap-4 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:p-5"
                data-testid="family-news-item"
              >
                <span className="hidden size-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-text sm:flex">
                  <LuMegaphone className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <NewsTitle a={a} isNew={isNew(a.id)} className="font-semibold" />
                  <NewsMeta a={a} timezone={timezone} today={today} className="mt-1.5" />
                  {a.contentText ? <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{a.contentText}</p> : null}
                </div>
                <LuChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty className="border bg-card py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LuMegaphone />
            </EmptyMedia>
            <EmptyTitle>No news yet</EmptyTitle>
            <EmptyDescription>When {branch.name} shares news, like a closed day or a match, it shows here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}

/**
 * One post, as families read it: its text, pictures and files (no comments: those stay with staff). The first opening
 * leaves the person's read receipt, so the post stops being new for them; an owner or admin previewing a family ("View
 * as") leaves nothing. A post that's gone, archived or not shown to families says so calmly.
 */
export function FamilyNewsPostPage() {
  const { announcementId = '' } = useParams()
  const { branch, branchId, actor, timezone, viewAs } = useBranch()
  const family = useFamily()
  const navigate = useNavigate()
  const location = useLocation()
  const base = `/${family.who}`
  const ref = useMemo(() => announcementRef(branchId, announcementId), [branchId, announcementId])
  const post = useDoc<Announcement>(ref)
  // Only while it's shown to families: an owner previewing could read any post.
  const a = post.data && isForFamilies(post.data) ? post.data : null
  const shown = !!a && !family.notLinked

  const readRef = useMemo(
    () => (shown && !viewAs ? doc(db, branchColPath(branchId, COL.announcements), announcementId, 'reads', actor.email) : null),
    [shown, viewAs, branchId, announcementId, actor.email],
  )
  const myRead = useDoc<AnnouncementRead>(readRef)
  const marked = useRef('')
  useEffect(() => {
    if (!readRef || myRead.loading || myRead.data || marked.current === announcementId) return
    marked.current = announcementId
    void markRead(branchId, actor, announcementId).catch(() => undefined)
  }, [readRef, myRead.loading, myRead.data, branchId, actor, announcementId])

  const title = a?.title
  useEffect(() => {
    if (!title) return
    const before = document.title
    document.title = `${title} | News`
    return () => {
      document.title = before
    }
  }, [title])

  const from = (location.state as { from?: From } | null)?.from
  const back = () => (from ? navigate(-1) : navigate(`${base}/news`))
  const backLabel = from === 'home' ? 'Home' : 'News'

  if (family.notLinked) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <PageHeader title="News" />
        <NotLinked family={family} />
      </div>
    )
  }

  if (post.loading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Skeleton className="h-7 w-20" />
        <div className="rounded-xl border bg-card p-5 sm:p-7">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="mt-4 h-7 w-3/4" />
          <Skeleton className="mt-3 h-4 w-56 max-w-full" />
          <Skeleton className="mt-7 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-2/3" />
        </div>
      </div>
    )
  }

  if (!a) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Empty className="border bg-card py-12" data-testid="family-news-unavailable">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LuMegaphone />
            </EmptyMedia>
            <EmptyTitle>This news isn’t available</EmptyTitle>
            <EmptyDescription>It may have been taken down, or it isn’t shared with families.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={back}>
              <LuArrowLeft /> {backLabel}
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={back}>
        <LuArrowLeft /> {backLabel}
      </Button>
      <article className="rounded-xl border bg-card p-5 sm:p-7" data-testid="family-news-post">
        <div className="flex flex-wrap items-center gap-2">
          {a.pinned ? (
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              <LuPin /> Pinned
            </Badge>
          ) : null}
          <Badge variant="secondary" className="max-w-full font-normal">
            <LuTag /> <span className="truncate">{a.category || 'General'}</span>
          </Badge>
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight break-words">{a.title}</h1>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <LuUser className="size-4 shrink-0" /> {a.authorName || branch.name}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LuClock className="size-4 shrink-0" /> {a.createdAt ? formatInstant(a.createdAt.toDate(), timezone, { dateStyle: 'medium', timeStyle: 'short' }) : 'Just now'}
          </span>
        </div>
        <Separator className="my-5" />
        <HtmlContent html={a.contentHtml} />
        {a.attachments?.length ? <Attachments files={a.attachments} /> : null}
      </article>
    </div>
  )
}

/** The post's attachments: pictures shown (each opens in full), other files to open or download. */
function Attachments({ files }: { files: AnnouncementAttachment[] }) {
  const pictures = files.filter(isPicture)
  const others = files.filter((f) => !isPicture(f))
  return (
    <section className="mt-6 space-y-2" aria-label="Attachments">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Attachments</h2>
      {pictures.length ? (
        <div className={cn('grid gap-3', pictures.length > 1 && 'sm:grid-cols-2')}>
          {pictures.map((f) => (
            <a key={f.path} href={f.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border transition-colors hover:bg-muted/40" data-testid="family-news-picture">
              <img src={f.url} alt={f.name} loading="lazy" className="max-h-80 w-full bg-muted/40 object-contain" />
              <span className="flex items-center gap-2 border-t px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="shrink-0 text-muted-foreground">{formatBytes(f.size)}</span>
              </span>
            </a>
          ))}
        </div>
      ) : null}
      {others.map((f) => (
        <a
          key={f.path}
          href={f.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
          data-testid="family-news-file"
        >
          <LuFileText className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{f.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(f.size)}</span>
          <LuDownload className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </a>
      ))}
    </section>
  )
}
