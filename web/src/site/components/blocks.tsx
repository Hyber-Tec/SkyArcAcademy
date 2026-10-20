import { type ReactNode, useState } from 'react'
import { LuArrowRight, LuCheck, LuInstagram, LuMail, LuMapPin, LuNavigation, LuPhone, LuPin } from 'react-icons/lu'
import { weekdayIn, weekdaysOf } from '@shared/website/hours'
import type { WebsitePlace, WebsiteTeamMember } from '@shared/website/types'
import { SkyArcReticle } from '@/components/app/SkyArcMark'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { type SitePost, usePhotoById, usePlacePhoto, useSiteData } from '@/site/data'
import { ACADEMY, FAQ, type FaqItem, HOME, type L, type Lang, NEWS, TEAM_PHOTO_TODO, UI, keepWhole } from '@/site/kit/content'
import { Reveal } from '@/site/kit/motion'
import { Photo, PlacePhoto, Placeholder } from '@/site/kit/Photo'
import { A, useSite } from '@/site/kit/site'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/site/kit/ui'
import { T } from '../i18n'
import { BookButton, Container, Kicker } from './bits'

/** The academy's time zone, for dates and "today" (Settings → Academy has the same). */
export const ACADEMY_TZ = 'America/New_York'

export function formatDate(ms: number, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'ko' ? 'ko-KR' : 'en-US', { timeZone: ACADEMY_TZ, year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(ms))
}

/** The academy's words from the CRM are in English: say so to screen readers and translators on Korean pages. */
export const crmLang = 'en'

/** "@arc_10.9" from "https://www.instagram.com/arc_10.9/". */
export function instagramHandle(url: string): string {
  const name = url.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '')
  return name ? `@${name}` : url
}

/* ------------------------------------------------------------------ news */

/** A post without a photo: the white reticle on black, as a branded cover. */
export function BrandCover({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn('relative flex size-full items-end overflow-hidden bg-ink p-5', className)}>
      <SkyArcReticle className="absolute -top-[22%] -right-[12%] h-[140%] w-auto opacity-[0.16]" />
      <span className="relative inline-flex items-center gap-2 text-[13px] font-medium tracking-[0.14em] text-white/70 uppercase">
        <span className="size-1.5 rounded-full bg-dot" aria-hidden="true" />
        {label}
      </span>
    </div>
  )
}

export function NewsCard({ post, className, large = false }: { post: SitePost; className?: string; large?: boolean }) {
  const { t, lang, href } = useSite()
  return (
    <article className={cn('group relative flex flex-col overflow-hidden rounded-[26px] border border-line bg-white shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-lift', large && 'lg:flex-row', className)}>
      <div className={cn('relative shrink-0 overflow-hidden bg-ink', large ? 'aspect-[16/9] lg:aspect-auto lg:min-h-[380px] lg:w-[58%]' : 'aspect-[16/10]')}>
        {post.cover ? (
          <Photo photo={post.cover} alt="" sizes={large ? '(min-width: 1024px) 760px, 100vw' : '(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw'} className="size-full transition duration-700 ease-out group-hover:scale-[1.04]" />
        ) : (
          <BrandCover label={t(NEWS.categories[post.category])} />
        )}
        {post.pinned ? (
          <div className="absolute top-3 left-3 flex gap-1.5">
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-white/95 px-2.5 text-[11px] font-semibold text-ink">
              <LuPin className="size-3" aria-hidden="true" />
              {t(T.pinned)}
            </span>
          </div>
        ) : null}
      </div>
      <div className={cn('flex flex-1 flex-col p-5 sm:p-6', large && 'lg:justify-center lg:p-10')}>
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="rounded-full bg-warm-2 px-2.5 py-1 font-medium text-ink">{t(NEWS.categories[post.category])}</span>
          <time className="text-stone" dateTime={new Date(post.publishedAt).toISOString()}>
            {formatDate(post.publishedAt, lang)}
          </time>
        </div>
        <h3 lang={crmLang} className={cn('mt-3 font-semibold tracking-tight text-ink', large ? 'text-[24px] leading-tight sm:text-[28px]' : 'text-[19px] leading-snug')}>
          <a href={href(`news/${post.slug}`)} className="after:absolute after:inset-0 after:rounded-[26px] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ink/30">
            {post.title}
          </a>
        </h3>
        <p lang={crmLang} className="mt-2 line-clamp-3 text-[14.5px] leading-relaxed text-stone">
          {post.excerpt}
        </p>
        <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-[14px] font-semibold text-ink">
          {t(UI.readMore)} <LuArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </div>
    </article>
  )
}

/* ------------------------------------------------------------------ coaches */

/** A coach's portrait from the Website page, or a marked placeholder until the academy sends one. */
export function CoachPortrait({ person, className, compact = false }: { person: WebsiteTeamMember; className?: string; compact?: boolean }) {
  const photo = usePhotoById(person.photoId)
  if (photo) {
    return (
      <div className={cn('overflow-hidden bg-warm-2', className)}>
        <Photo photo={photo} alt={person.name} sizes={compact ? '96px' : '(min-width: 1024px) 300px, 50vw'} className="size-full" />
      </div>
    )
  }
  return <Placeholder kind="person" compact={compact} label={TEAM_PHOTO_TODO} className={cn('border-ink/15 bg-warm text-stone', compact && 'p-2', className)} />
}

/** What a coach focuses on ("Safety · Athlete development"), a chip each, so no phrase breaks across lines. */
export function FocusChips({ focus, className }: { focus: string; className?: string }) {
  const parts = focus
    .split(/\s*[·•|]\s*/)
    .map((x) => x.trim())
    .filter(Boolean)
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} lang={crmLang}>
      {parts.map((x) => (
        <li key={x} className="rounded-full bg-warm-2 px-2.5 py-1 text-[12.5px] leading-snug font-medium whitespace-nowrap text-ink/80">
          {x}
        </li>
      ))}
    </ul>
  )
}

export function CoachCard({ person, index = 0 }: { person: WebsiteTeamMember; index?: number }) {
  const { t } = useSite()
  const [open, setOpen] = useState(false)
  return (
    <Reveal delay={index * 0.06} className="h-full">
      {/* Phones: the portrait beside the words; wider screens: above them. */}
      <article className="flex h-full gap-4 rounded-[26px] border border-line bg-white p-2.5 shadow-soft sm:flex-col sm:gap-0">
        <CoachPortrait person={person} compact className="aspect-[4/5] w-28 shrink-0 self-start rounded-[20px] sm:w-auto sm:self-stretch" />
        <div className="flex min-w-0 flex-1 flex-col py-1 pr-1 sm:px-3 sm:pt-4 sm:pb-3" lang={crmLang}>
          <h3 className="text-[19px] font-semibold tracking-tight text-ink sm:text-[21px]">{person.name}</h3>
          <p className="mt-0.5 text-[14px] text-balance text-stone sm:min-h-[2lh]">{person.role}</p>
          <ul className="mt-3 space-y-2 text-[13.5px] leading-snug text-ink/80 sm:mt-4">
            {person.credentials.slice(0, 2).map((c) => (
              <li key={c} className="flex gap-2">
                <LuCheck className="mt-0.5 size-3.5 shrink-0 text-ink" aria-hidden="true" />
                {keepWhole(c)}
              </li>
            ))}
          </ul>
          {person.credentials.length > 2 || person.focus ? (
            <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="mt-auto inline-flex min-h-11 items-center gap-1.5 self-start pt-2 text-[14px] font-semibold text-ink underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none sm:pt-3">
              {t(T.readMore)} <LuArrowRight className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </article>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto rounded-[26px] p-0 sm:max-w-lg">
          <div className="flex items-center gap-4 border-b border-line p-6 pr-14">
            <CoachPortrait person={person} compact className="size-16 shrink-0 rounded-2xl [&>span:last-child]:hidden" />
            <div lang={crmLang}>
              <DialogTitle className="text-[22px] font-semibold tracking-tight text-ink">{person.name}</DialogTitle>
              <DialogDescription className="text-[14px] text-stone">{person.role}</DialogDescription>
            </div>
          </div>
          <div className="p-6 pt-5">
            {person.focus ? <FocusChips focus={person.focus} /> : null}
            <h4 className="mt-5 text-[12px] font-semibold tracking-[0.14em] text-stone uppercase">{t(T.allCredentials)}</h4>
            <ul className="mt-3 space-y-2.5 text-[14.5px] leading-snug text-ink" lang={crmLang}>
              {person.credentials.map((c) => (
                <li key={c} className="flex gap-2.5">
                  <LuCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {keepWhole(c)}
                </li>
              ))}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
    </Reveal>
  )
}

/* ------------------------------------------------------------------ FAQ */

/** "Monday 4:30–8 PM · Tuesday 5–8 PM · …", from the hours the Website page sets. */
function hoursSentence(lines: { days: string; time: string; note: string }[]): string {
  return keepWhole(lines.map((h) => `${h.days} ${h.time}${h.note ? ` (${h.note})` : ''}`).join(' · '))
}

export function FaqList({ items = FAQ, columns = 2, className }: { items?: FaqItem[]; columns?: 1 | 2; className?: string }) {
  const { t } = useSite()
  const { content } = useSiteData()
  const half = Math.ceil(items.length / 2)
  const groups = columns === 2 ? [items.slice(0, half), items.slice(half)] : [items]
  return (
    <div className={cn('grid gap-x-10', columns === 2 && 'lg:grid-cols-2', className)}>
      {groups.map((g, gi) => (
        <Accordion key={gi} type="single" collapsible className="w-full">
          {g.map((f, i) => (
            <AccordionItem key={f.q.en} value={`${gi}-${i}`} className="border-ink/10">
              <AccordionTrigger className="min-h-14 py-5 text-[16.5px] font-semibold text-ink hover:no-underline [&>svg]:size-5 [&>svg]:text-ink">{t(f.q)}</AccordionTrigger>
              <AccordionContent className="pr-8 text-[15px] leading-relaxed text-stone">
                {f.hours && content.hours.length ? <p lang={crmLang}>{hoursSentence(content.hours)}</p> : <p>{t(f.a)}</p>}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ hours and visit */

/** The hours the Website page sets, with today marked (in the academy's time zone). */
export function HoursTable({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { lang } = useSite()
  const { content } = useSiteData()
  const today = weekdayIn(ACADEMY_TZ)
  if (content.hours.length === 0) return null
  return (
    <dl className={cn('divide-y divide-line', className)} lang={crmLang}>
      {content.hours.map((h) => (
        <div key={h.id} className={cn('flex items-baseline justify-between gap-4', compact ? 'py-2' : 'py-3')}>
          <dt className="flex items-center gap-2 text-[14.5px] text-ink">
            {keepWhole(h.days)}
            {weekdaysOf(h.days).includes(today) ? (
              <span lang={lang} className="rounded-full bg-ink px-2 py-0.5 text-[10.5px] font-semibold tracking-wide text-white uppercase">
                {lang === 'ko' ? '오늘' : 'Today'}
              </span>
            ) : null}
          </dt>
          <dd className="text-right">
            <span className="text-[14.5px] font-medium text-ink tabular-nums">{keepWhole(h.time)}</span>
            {h.note ? <span className="block text-[12.5px] text-balance text-stone">{h.note}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** The academy's address, email, Instagram and phone (Settings → Academy and the Website page); missing ones left out. */
export function ContactLines({ className, iconClass = 'size-5' }: { className?: string; iconClass?: string }) {
  const { contact, content } = useSiteData()
  return (
    <address className={cn('grid gap-3 text-[15px] text-ink not-italic', className)}>
      <span className="flex items-start gap-3">
        <LuMapPin className={cn('mt-0.5 shrink-0', iconClass)} aria-hidden="true" />
        <span className="whitespace-nowrap">
          {ACADEMY.street}
          <br />
          {ACADEMY.city}
        </span>
      </span>
      {contact.email ? (
        <a href={`mailto:${contact.email}`} className="flex items-center gap-3 hover:underline">
          <LuMail className={cn('shrink-0', iconClass)} aria-hidden="true" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{contact.email}</span>
        </a>
      ) : null}
      {content.instagram ? (
        <a href={content.instagram} target="_blank" rel="noreferrer" className="flex items-center gap-3 hover:underline">
          <LuInstagram className={cn('shrink-0', iconClass)} aria-hidden="true" />
          {instagramHandle(content.instagram)}
        </a>
      ) : null}
      {contact.phone ? (
        <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-3 hover:underline">
          <LuPhone className={cn('shrink-0', iconClass)} aria-hidden="true" />
          {contact.phone}
        </a>
      ) : null}
    </address>
  )
}

export function VisitUs({ id }: { id?: string }) {
  const { t } = useSite()
  const { content } = useSiteData()
  return (
    <section id={id} className="py-20 sm:py-24" aria-labelledby="visit-title">
      <Container>
        <div className="grid items-stretch gap-6 lg:grid-cols-[1fr_1.05fr]">
          <Reveal className="flex flex-col rounded-[30px] border border-line bg-white p-6 shadow-soft sm:p-9">
            <Kicker>{t(T.visitKicker)}</Kicker>
            <h2 id="visit-title" className="mt-4 text-[32px] leading-tight font-semibold tracking-[-0.03em] text-ink sm:text-[40px]">
              {t(T.visitTitle)}
            </h2>
            <p className="mt-3 text-[16px] leading-relaxed text-stone">{t(T.visitText)}</p>
            <ContactLines className="mt-7" />
            {content.hours.length ? (
              <div className="mt-8 rounded-2xl bg-warm px-5 py-2">
                <HoursTable compact />
              </div>
            ) : null}
          </Reveal>
          <Reveal delay={0.1} className="min-h-[380px] lg:min-h-0">
            <MapEmbed className="size-full min-h-[380px]" />
          </Reveal>
        </div>
      </Container>
    </section>
  )
}

/* ------------------------------------------------------------------ the map */

/**
 * Google Maps, pointed at the building's address (the academy shares it with the learning center downstairs, so the
 * address is what finds it; our label says Sky Arc). The keyless embed needs no API key.
 */
const MAP_ADDRESS = `${ACADEMY.street}, ${ACADEMY.city}`
const MAP_EMBED = `https://maps.google.com/maps?q=${encodeURIComponent(MAP_ADDRESS)}&t=m&z=16&ie=UTF8&iwloc=&output=embed`
export const DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(MAP_ADDRESS)}`

export function MapEmbed({ className }: { className?: string }) {
  const { t } = useSite()
  return (
    <div className={cn('flex flex-col overflow-hidden rounded-[30px] border border-line bg-white shadow-soft', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <span className="size-2 shrink-0 rounded-full bg-dot" aria-hidden="true" />
            {ACADEMY.name}
          </p>
          <p className="mt-0.5 pl-4 text-[13.5px] text-stone">
            <span className="whitespace-nowrap">{ACADEMY.street},</span> <span className="whitespace-nowrap">{ACADEMY.city}</span>
          </p>
        </div>
        <a
          href={DIRECTIONS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-semibold text-white transition hover:bg-ink/85 focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <LuNavigation className="size-4" aria-hidden="true" /> {t(UI.directions)}
        </a>
      </div>
      <div className="relative mx-3 mb-3 min-h-[300px] flex-1 overflow-hidden rounded-[16px] border border-line bg-warm-2">
        <iframe title={t(T.mapTitle)} src={MAP_EMBED} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen className="absolute inset-0 size-full border-0" />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ the closing call */

/**
 * The closing call at the end of every page, on black: the photo the academy chose for the closing banner melts into
 * the black (from the left on wide screens, above the words on phones), or the white reticle without one.
 */
export function FinalCta() {
  const { t } = useSite()
  const photo = usePlacePhoto('cta')
  return (
    <section className="relative isolate overflow-hidden bg-ink text-white" aria-labelledby="final-title">
      {photo ? (
        <div className="final-photo pointer-events-none absolute inset-x-0 top-0 -z-10 h-[300px] sm:h-[400px] lg:inset-y-0 lg:right-0 lg:left-auto lg:h-auto lg:w-[68%] xl:w-[58%]" aria-hidden="true">
          <Photo photo={photo} alt="" sizes="(min-width: 1280px) 58vw, (min-width: 1024px) 68vw, 100vw" className="size-full" />
        </div>
      ) : (
        <SkyArcReticle className="pointer-events-none absolute -top-24 -right-24 size-[440px] opacity-[0.07] sm:-right-10 sm:size-[560px]" />
      )}
      <Container className={cn('relative pb-20 sm:pb-28', photo ? 'pt-[230px] sm:pt-[320px] lg:pt-28' : 'pt-20 sm:pt-28')}>
        <div className="max-w-2xl">
          <Kicker tone="light">{t(HOME.final.eyebrow)}</Kicker>
          <h2 id="final-title" className="mt-5 text-[40px] leading-[1.02] font-semibold tracking-[-0.035em] text-balance sm:text-[60px]">
            {t(HOME.final.title)}
          </h2>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-white/70 sm:text-[18px]">{t(HOME.final.text)}</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <BookButton />
            <A to="contact" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/25 px-6 text-[15px] font-semibold text-white transition hover:border-white/60 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none">
              {t(UI.contact)} <LuArrowRight className="size-4" aria-hidden="true" />
            </A>
          </div>
        </div>
      </Container>
    </section>
  )
}

/** The photo the academy chose for a spot, in a rounded frame (page heroes). */
export function FramedPhoto({ place, label, className, sizes = '(min-width: 1024px) 560px, 100vw', priority, focus }: { place: WebsitePlace; label: L; className?: string; sizes?: string; priority?: boolean; focus?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-[30px] bg-warm-2 shadow-soft', className)}>
      <PlacePhoto place={place} label={label} sizes={sizes} priority={priority} focus={focus} className="size-full" />
    </div>
  )
}

/** The top of an inner page: kicker, title, text, and the page's photo when it has a spot for one. */
export function PageHero({
  kicker,
  title,
  text,
  photo,
  photoLabel,
  focus,
  children,
  aside,
}: {
  kicker: string
  title: string
  text: string
  photo?: WebsitePlace
  photoLabel?: L
  focus?: string
  children?: ReactNode
  aside?: ReactNode
}) {
  return (
    <section className="relative overflow-hidden bg-warm" aria-labelledby="page-title">
      <Container className={cn('grid items-center gap-10 py-14 sm:py-20', (photo || aside) && 'lg:grid-cols-[1.08fr_1fr] lg:gap-14 lg:py-24')}>
        <Reveal>
          <Kicker>{kicker}</Kicker>
          <h1 id="page-title" className="mt-5 text-[42px] leading-[1] font-semibold tracking-[-0.04em] text-balance text-ink sm:text-[56px] lg:text-[64px]">
            {title}
          </h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-pretty text-stone sm:text-[19px]">{text}</p>
          {children}
        </Reveal>
        {photo ? (
          <Reveal delay={0.1}>
            <FramedPhoto place={photo} label={photoLabel ?? UI.photoNeeded} priority focus={focus} className="aspect-[4/3] lg:aspect-[5/4.3]" />
          </Reveal>
        ) : aside ? (
          <Reveal delay={0.1}>{aside}</Reveal>
        ) : null}
      </Container>
    </section>
  )
}
