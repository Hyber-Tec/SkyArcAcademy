import { motion, useInView } from 'motion/react'
import { useMemo, useRef, useState } from 'react'
import { LuActivity, LuArrowRight, LuAward, LuClock, LuLayers, LuLogIn, LuMedal, LuQuote, LuRoute, LuShieldCheck, LuShirt, LuTarget, LuUserRound, LuUserRoundCheck, LuWrench } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { useSiteData } from '@/site/data'
import { ACADEMY, HOME, TRIAL, UI, l } from '@/site/kit/content'
import { Lightbox } from '@/site/kit/Lightbox'
import { EASE_OUT, Reveal, useReduced } from '@/site/kit/motion'
import { Photo, PlacePhoto } from '@/site/kit/Photo'
import { A, useSite } from '@/site/kit/site'
import { TestimonialsColumns } from '@/site/kit/ui'
import { useIntroReady } from '../intro-context'
import { useBooking } from '../booking-context'
import { BookButton, Container, SectionHead, btnInk, btnOutline, linkArrow, mins } from '../components/bits'
import { CoachCard, FaqList, FinalCta, NewsCard, VisitUs, crmLang } from '../components/blocks'
import { LevelPath } from '../components/LevelPath'
import { ReportShowcase } from '../components/ReportShowcase'
import siusLogo from '../assets/sius.webp'
import { T } from '../i18n'

const FACT_ICONS = [LuTarget, LuLayers, LuUserRound, LuActivity]

const HERO_PHOTO = l('Photo needed: athletes on the range', '사진 필요: 사대 위의 선수들')

/** The hero's card: how every athlete starts, and the way to ask for a first time. */
function NextTrialCard({ className }: { className?: string }) {
  const { t, lang } = useSite()
  const { openBooking } = useBooking()
  return (
    <button
      type="button"
      onClick={() => openBooking()}
      aria-haspopup="dialog"
      className={cn('group w-full rounded-[22px] bg-white/96 p-4 text-left shadow-float ring-1 ring-black/5 backdrop-blur transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ink/40 focus-visible:outline-none sm:p-5', className)}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[11.5px] font-semibold tracking-[0.13em] text-stone uppercase">
          <span className="relative flex size-2" aria-hidden="true">
            <span className="absolute inline-flex size-full rounded-full bg-dot/60 motion-safe:animate-ping" />
            <span className="relative size-2 rounded-full bg-dot" />
          </span>
          {t(T.heroCardLabel)}
        </span>
        {TRIAL.kinds.one.minutes ? (
          <span className="rounded-full bg-warm-2 px-2 py-0.5 text-[11.5px] font-medium text-ink tabular-nums">{mins(TRIAL.kinds.one.minutes, lang)}</span>
        ) : null}
      </span>
      <span className="mt-2.5 block text-[20px] leading-tight font-semibold tracking-tight text-balance text-ink sm:text-[22px]">{t(T.heroCardTitle)}</span>
      <span className="mt-1 block text-[13px] leading-snug text-stone">{t(TRIAL.kinds.one.summary)}</span>
      <span className="mt-3.5 flex items-center justify-between border-t border-line pt-3 text-[14px] font-semibold text-ink">
        {t(T.heroCardCta)}
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-red text-white transition group-hover:translate-x-0.5" aria-hidden="true">
          <LuArrowRight className="size-4" />
        </span>
      </span>
    </button>
  )
}

function Hero() {
  const { t } = useSite()
  const ready = useIntroReady()
  const reduce = useReduced()
  const rise = (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 22 },
          animate: ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 22 },
          transition: { duration: 0.8, delay: 0.08 + i * 0.08, ease: EASE_OUT },
        }
  return (
    <section className="relative overflow-hidden" aria-labelledby="hero-title">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[85%] bg-gradient-to-b from-warm via-warm/60 to-white" aria-hidden="true" />
      <Container className="grid gap-10 pt-8 pb-16 sm:pt-12 lg:grid-cols-[1.02fr_1fr] lg:grid-rows-[1fr_auto] lg:gap-x-14 lg:gap-y-10 lg:pt-14 lg:pb-24">
        <div className="lg:col-start-1 lg:row-start-1 lg:self-end">
          <motion.p {...rise(0)} className="inline-flex items-center gap-2.5 rounded-full border border-ink/10 bg-white px-3.5 py-1.5 text-[13px] font-medium text-ink/80 shadow-[0_1px_2px_rgb(10_10_10/0.05)]">
            <span className="size-1.5 rounded-full bg-dot" aria-hidden="true" />
            {t(HOME.hero.eyebrow)}
          </motion.p>
          <h1 id="hero-title" className="mt-6 text-[clamp(3.2rem,7.6vw,6.2rem)] leading-[0.94] font-semibold tracking-[-0.045em] text-ink">
            <motion.span {...rise(1)} className="block">
              {t(HOME.hero.title[0])}
            </motion.span>{' '}
            <motion.span {...rise(2)} className="accent accent-hero block pt-1 font-normal">
              {t(HOME.hero.title[1])}
            </motion.span>
          </h1>
          <motion.p {...rise(3)} className="mt-6 max-w-[34rem] text-[17.5px] leading-relaxed text-stone sm:text-[19px]">
            {t(HOME.hero.lead)}
          </motion.p>
          <motion.div {...rise(4)} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <BookButton className="min-h-[52px] px-7" />
            <A to="programs" className={cn(btnOutline, 'min-h-[52px] px-7')}>
              {t(UI.explorePrograms)}
            </A>
          </motion.div>
        </div>

        <motion.div
          className="relative lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center"
          initial={reduce ? false : { opacity: 0, scale: 0.97, y: 16 }}
          animate={ready ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.97, y: 16 }}
          transition={{ duration: 1, delay: 0.15, ease: EASE_OUT }}
        >
          <div className="relative aspect-[4/4.5] overflow-hidden rounded-[28px] bg-warm-2 shadow-lift sm:aspect-[5/4.6] sm:rounded-[32px] lg:aspect-[5/5.5]">
            <PlacePhoto place="home.hero" label={HERO_PHOTO} sizes="(min-width: 1024px) 620px, 100vw" priority className="size-full" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/25 to-transparent" aria-hidden="true" />
            <p className="absolute top-3.5 left-3.5 inline-flex max-w-[calc(100%-1.75rem)] items-center gap-2 rounded-2xl bg-white/95 py-2 pr-4 pl-2.5 text-[12.5px] leading-tight font-semibold text-ink shadow-soft backdrop-blur sm:top-5 sm:left-5 sm:rounded-full">
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                <LuMedal className="size-3.5" aria-hidden="true" />
              </span>
              <span>{t(T.heroCoaches)}</span>
            </p>
          </div>
          <motion.div
            className="relative z-10 -mt-12 px-3 sm:absolute sm:right-6 sm:-bottom-10 sm:mt-0 sm:w-[300px] sm:px-0 lg:-bottom-12 xl:-right-6"
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
            transition={{ duration: 0.8, delay: 0.55, ease: EASE_OUT }}
          >
            <NextTrialCard />
          </motion.div>
        </motion.div>
        <motion.dl {...rise(5)} className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4 lg:col-start-1 lg:row-start-2 lg:self-start">
          {HOME.facts.map((f, i) => {
            const Icon = FACT_ICONS[i]
            return (
              <div key={f.value} className="flex flex-col gap-1 bg-white px-4 py-4">
                <dt className="sr-only">{t(f.label)}</dt>
                {f.logo ? (
                  // The official logo, as SIUS makes it, as tall as an icon and a figure together.
                  <dd className="h-12">
                    <img src={siusLogo} alt={f.value} width={400} height={275} className="h-full w-auto" />
                  </dd>
                ) : (
                  <>
                    <Icon className="size-[18px] text-ink" aria-hidden="true" />
                    <dd className="mt-1.5 text-[20px] leading-none font-semibold tracking-tight text-ink">{f.value}</dd>
                  </>
                )}
                <dd className="text-[12.5px] leading-snug text-stone">{t(f.label)}</dd>
              </div>
            )
          })}
        </motion.dl>
      </Container>
    </section>
  )
}

const PILLAR_ICONS = [LuShieldCheck, LuUserRoundCheck, LuRoute, LuAward]

function Pillars() {
  const { t } = useSite()
  return (
    <section className="bg-warm py-20 sm:py-28" aria-labelledby="why-title">
      <Container className="grid gap-12 lg:grid-cols-[0.9fr_1.4fr] lg:gap-16">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <SectionHead kicker={t(T.whyKicker)} title={<span id="why-title">{t(T.whyTitle)}</span>} text={t(T.whyText)} />
          <Reveal delay={0.1} className="mt-8">
            <A to="about" className={linkArrow}>
              {t(UI.about)} <LuArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
            </A>
          </Reveal>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {T.pillars.map((p, i) => {
            const Icon = PILLAR_ICONS[i]
            return (
              <Reveal key={p.title.en} delay={i * 0.07} className="h-full">
                <article className="flex h-full flex-col rounded-[26px] bg-white p-6 shadow-soft sm:p-7">
                  <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-ink text-white">
                    <Icon className="size-[22px]" aria-hidden="true" />
                  </span>
                  <h3 className="mt-6 text-[21px] font-semibold tracking-tight text-ink">{t(p.title)}</h3>
                  <p className="mt-2.5 text-[15px] leading-relaxed text-stone">{t(p.text)}</p>
                </article>
              </Reveal>
            )
          })}
        </div>
      </Container>
    </section>
  )
}

function Programs() {
  const { t } = useSite()
  return (
    <section className="py-20 sm:py-28" aria-labelledby="programs-title">
      <Container>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <SectionHead kicker={t(T.programsKicker)} title={<span id="programs-title">{t(T.programsTitle)}</span>} text={t(HOME.path.text)} />
          <Reveal className="shrink-0">
            <A to="programs" className={btnOutline}>
              {t(T.allPrograms)} <LuArrowRight className="size-4" aria-hidden="true" />
            </A>
          </Reveal>
        </div>
        <LevelPath />
        <Reveal className="mt-10 flex flex-col gap-3 rounded-[22px] border border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="flex items-center gap-3 text-[15px] text-ink">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-warm-2">
              <LuClock className="size-4" aria-hidden="true" />
            </span>
            {t(HOME.path.evaluations)}
          </p>
          <A to="programs?section=tuition" className={cn(linkArrow, 'shrink-0')}>
            {t(T.tuitionLink)} <LuArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
          </A>
        </Reveal>
      </Container>
    </section>
  )
}

function Portal() {
  const { t } = useSite()
  return (
    <ReportShowcase
      className="overflow-x-clip bg-warm-2/70 pt-20 sm:pt-28"
      header={
        <Container>
          <SectionHead align="center" kicker={t(T.portalKicker)} title={<span id="portal-title">{t(HOME.report.title)}</span>} text={t(HOME.report.text)} />
        </Container>
      }
      footer={
        <Container className="pt-16 pb-20 sm:pt-20 sm:pb-28">
          <Reveal className="flex flex-col items-center gap-5 text-center">
            <p className="max-w-xl text-[15.5px] leading-relaxed text-stone">{t(T.portalAlso)}</p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href={ACADEMY.loginUrl} className={btnInk}>
                <LuLogIn className="size-4" aria-hidden="true" /> {t(UI.parentLogin)}
              </a>
              <A to="portal" className={linkArrow}>
                {t(T.portalMore)} <LuArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
              </A>
            </div>
          </Reveal>
        </Container>
      }
    />
  )
}

function Coaches() {
  const { t } = useSite()
  const { content } = useSiteData()
  if (content.team.length === 0) return null
  return (
    <section className="py-20 sm:py-28" aria-labelledby="coaches-title">
      <Container>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <SectionHead kicker={t(T.coachesKicker)} title={<span id="coaches-title">{t(HOME.coaches.title)}</span>} text={t(HOME.coaches.text)} />
          <Reveal className="shrink-0">
            <A to="about?section=coaches" className={btnOutline}>
              {t(UI.meetCoaches)} <LuArrowRight className="size-4" aria-hidden="true" />
            </A>
          </Reveal>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {content.team.slice(0, 4).map((p, i) => (
            <CoachCard key={p.id} person={p} index={i} />
          ))}
        </div>
      </Container>
    </section>
  )
}

const BRING_ICONS = [LuClock, LuShirt, LuWrench]

function Trials() {
  const { t, lang } = useSite()
  const reduce = useReduced()
  const ref = useRef<HTMLOListElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.4 })
  return (
    <section className="bg-warm py-20 sm:py-28" aria-labelledby="trials-title">
      <Container>
        <SectionHead kicker={t(T.trialsKicker)} title={<span id="trials-title">{t(HOME.trial.title)}</span>} text={t(HOME.trial.text)} />
        <ol ref={ref} className="relative mt-12 grid gap-7 sm:mt-14 sm:grid-cols-2 sm:gap-8 lg:grid-cols-4 lg:gap-6">
          <motion.span
            aria-hidden="true"
            className="step-line absolute top-6 right-[12.5%] left-[12.5%] hidden h-px bg-ink/20 lg:block"
            initial={reduce ? false : { scaleX: 0 }}
            animate={inView ? { scaleX: 1 } : undefined}
            transition={{ duration: 1.2, ease: EASE_OUT }}
          />
          {HOME.trial.steps.map((s, i) => (
            <li key={s.title.en} className={cn('relative', i < 3 && 'max-sm:before:absolute max-sm:before:top-14 max-sm:before:-bottom-7 max-sm:before:left-6 max-sm:before:w-px max-sm:before:bg-ink/15')}>
              <Reveal delay={0.15 + i * 0.12} className="flex gap-5 sm:flex-col sm:gap-0 lg:items-center lg:text-center">
                <span className={cn('relative z-10 inline-flex size-12 shrink-0 items-center justify-center rounded-full text-[16px] font-semibold ring-8 ring-warm', i === 0 ? 'bg-red text-white' : 'border border-ink/15 bg-white text-ink')}>{i + 1}</span>
                <div className="pt-2.5 sm:pt-0">
                  <h3 className="text-[19px] font-semibold tracking-tight text-ink sm:mt-5">{t(s.title)}</h3>
                  <p className="mt-1.5 max-w-[17rem] text-[15px] leading-relaxed text-stone sm:mt-2 lg:mx-auto">{t(s.text)}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
        <div className="mt-14 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
          <Reveal className="h-full">
            <div className="h-full rounded-[26px] bg-white p-6 shadow-soft sm:p-8">
              <h3 className="text-[19px] font-semibold text-ink">{t(HOME.trial.bringTitle)}</h3>
              <ul className="mt-5 grid gap-4 sm:grid-cols-3">
                {HOME.trial.bring.map((b, i) => {
                  const Icon = BRING_ICONS[i]
                  return (
                    <li key={b.en} className="flex gap-3 sm:flex-col">
                      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-warm">
                        <Icon className="size-[18px] text-ink" aria-hidden="true" />
                      </span>
                      <span className="text-[15px] leading-snug text-ink">{t(b)}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={0.08} className="h-full">
            <div className="relative flex h-full flex-col justify-between gap-8 overflow-hidden rounded-[26px] bg-ink p-6 text-white sm:p-8">
              <div>
                <p className="text-[12px] font-semibold tracking-[0.14em] text-white/55 uppercase">{t(TRIAL.kinds.one.name)}</p>
                <p className="mt-3 text-[24px] leading-tight font-semibold tracking-tight">{t(TRIAL.kinds.one.summary)}</p>
                <p className="mt-2 text-[15px] text-white/65">
                  {TRIAL.kinds.one.minutes ? `${mins(TRIAL.kinds.one.minutes, lang)} · ` : ''}
                  {t(T.noShooting)}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <BookButton />
                <A to="trial" className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full px-4 text-[15px] font-semibold text-white/85 transition hover:text-white">
                  {t(T.aboutTrials)} <LuArrowRight className="size-4" aria-hidden="true" />
                </A>
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  )
}

function Quote({ quote, who, sample, lang }: { quote: string; who: string; sample: boolean; lang?: string }) {
  const { t } = useSite()
  return (
    <figure className="rounded-[24px] border border-line bg-white p-6 shadow-soft" lang={lang}>
      <div className="flex items-center justify-between gap-3">
        <LuQuote className="size-5 text-red" aria-hidden="true" />
        {sample ? <span className="rounded-full bg-warm-2 px-2 py-0.5 text-[10.5px] font-semibold tracking-[0.12em] text-stone uppercase">{t(UI.sample)}</span> : null}
      </div>
      <blockquote className="accent mt-4 text-[20px] leading-snug text-ink">“{quote}”</blockquote>
      <figcaption className="mt-5 flex items-center gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-warm-2" aria-hidden="true">
          <LuUserRound className="size-4 text-ink/70" />
        </span>
        <span className="text-[13.5px] leading-snug text-stone">{who}</span>
      </figcaption>
    </figure>
  )
}

/** Families' words from the Website page; until there are any, sample quotes marked "Sample". */
function Testimonials() {
  const { t } = useSite()
  const { ready, content } = useSiteData()
  if (!ready) return null
  const real = content.testimonials.filter((q) => q.quote.trim())
  const cards = real.length
    ? real.map((q) => <Quote key={q.id} quote={q.quote} who={q.who} sample={false} lang={crmLang} />)
    : T.reviews.map((q) => <Quote key={q.quote.en} quote={t(q.quote)} who={t(q.who)} sample />)
  return (
    <section className="py-20 sm:py-28" aria-labelledby="testimonials-title">
      <Container>
        <SectionHead align="center" kicker={t(T.testimonialsKicker)} title={<span id="testimonials-title">{t(HOME.testimonials.title)}</span>} text={t(T.testimonialsText)} />
        <Reveal className="mt-12">
          <TestimonialsColumns items={cards} />
        </Reveal>
      </Container>
    </section>
  )
}

function News() {
  const { t } = useSite()
  const { posts: all } = useSiteData()
  const posts = useMemo(() => [...all].sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 3), [all])
  if (posts.length === 0) return null
  return (
    <section className="bg-warm py-20 sm:py-28" aria-labelledby="news-title">
      <Container>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <SectionHead kicker={t(T.newsKicker)} title={<span id="news-title">{t(HOME.news.title)}</span>} text={t(HOME.news.text)} />
          <Reveal className="shrink-0">
            <A to="news" className={btnOutline}>
              {t(UI.allNews)} <LuArrowRight className="size-4" aria-hidden="true" />
            </A>
          </Reveal>
        </div>
        <div className={cn('mt-12 grid gap-5', posts.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 lg:max-w-[820px]')}>
          {posts.map((p, i) => (
            <Reveal key={p.id} delay={i * 0.07} className="h-full">
              <NewsCard post={p} className="h-full" />
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  )
}

/** The first photos of the gallery, the first one large. */
function GalleryMosaic() {
  const { t } = useSite()
  const [open, setOpen] = useState<number | null>(null)
  const { photos } = useSiteData()
  const items = photos.slice(0, 5)
  if (items.length === 0) return null
  return (
    <section className="py-20 sm:py-28" aria-labelledby="gallery-title">
      <Container>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <SectionHead kicker={t(T.galleryKicker)} title={<span id="gallery-title">{t(HOME.gallery.title)}</span>} text={t(HOME.gallery.text)} />
          <Reveal className="shrink-0">
            <A to="gallery" className={btnOutline}>
              {t(UI.seeGallery)} <LuArrowRight className="size-4" aria-hidden="true" />
            </A>
          </Reveal>
        </div>
        <Reveal className="mt-12 grid auto-rows-[150px] grid-cols-2 gap-3 sm:auto-rows-[190px] lg:auto-rows-[220px] lg:grid-cols-4">
          {items.map((g, i) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setOpen(i)}
              aria-label={g.caption || g.alt || t(UI.gallery)}
              className={cn(
                'group relative overflow-hidden rounded-[22px] bg-warm-2 focus-visible:ring-2 focus-visible:ring-ink/40 focus-visible:ring-offset-2 focus-visible:outline-none',
                i === 0 && 'col-span-2 row-span-2',
                // A short gallery still fills its rows.
                items.length === 2 && i === 1 && 'col-span-2 row-span-2 lg:col-span-2',
                items.length === 4 && i === 3 && 'col-span-2 lg:col-span-1',
              )}
            >
              <Photo photo={g} alt={g.alt} sizes={i === 0 ? '(min-width: 1024px) 620px, 100vw' : '(min-width: 1024px) 310px, 50vw'} className="size-full transition duration-700 ease-out group-hover:scale-[1.05]" />
              {g.caption ? (
                <span lang={crmLang} className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-3.5 pt-10 text-left text-[13.5px] font-medium text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 max-lg:opacity-100">
                  {g.caption}
                </span>
              ) : null}
            </button>
          ))}
        </Reveal>
        <Lightbox items={items.map((g) => ({ photo: g, title: g.caption, alt: g.alt }))} index={open} onIndex={setOpen} closeLabel={t(UI.close)} prevLabel={t(UI.previous)} nextLabel={t(UI.next)} />
      </Container>
    </section>
  )
}

function Faq() {
  const { t } = useSite()
  return (
    <section className="bg-warm py-20 sm:py-28" aria-labelledby="faq-title">
      <Container>
        <SectionHead kicker={t(T.faqKicker)} title={<span id="faq-title">{t(HOME.faq.title)}</span>} />
        <Reveal className="mt-10">
          <FaqList />
        </Reveal>
        <Reveal className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px] text-stone">
          <span>{t(T.moreQuestions)}</span>
          <A to="contact" className={linkArrow}>
            {t(UI.contact)} <LuArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
          </A>
        </Reveal>
      </Container>
    </section>
  )
}

export function Home() {
  return (
    <>
      <Hero />
      <Pillars />
      <Programs />
      <Portal />
      <Coaches />
      <Trials />
      <Testimonials />
      <News />
      <GalleryMosaic />
      <Faq />
      <VisitUs />
      <FinalCta />
    </>
  )
}

