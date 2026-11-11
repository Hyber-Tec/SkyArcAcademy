import { animate, useInView, useMotionValue, useMotionValueEvent } from 'motion/react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import type { IconType } from 'react-icons'
import {
  LuArrowDown,
  LuArrowRight,
  LuBuilding2,
  LuCheck,
  LuCircleAlert,
  LuLoaderCircle,
  LuMail,
  LuMedal,
  LuRoute,
  LuSend,
  LuShieldCheck,
  LuUserRoundCheck,
  LuUsers,
} from 'react-icons/lu'
import { type WebsiteMessageInput, isEmailAddress } from '@shared/website/messages'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { usePlacePhoto, usePlaceShown, useSiteData } from '@/site/data'
import { APP, CONTACT, FRANCHISE, HOME, LEVELS, TRIAL, UI } from '@/site/kit/content'
import { EASE_OUT, Reveal, useReduced } from '@/site/kit/motion'
import { Photo } from '@/site/kit/Photo'
import { A, useSite } from '@/site/kit/site'
import { CallError, callFunction } from '@/site/rest'
import appHome from '../assets/app-home.webp'
import siusLogo from '../assets/sius.webp'
import { Container, SectionHead, btnInk, btnOutline, btnRed, linkArrow } from '../components/bits'
import { FramedPhoto, PageHero } from '../components/blocks'
import { Field, inputClass } from '../components/fields'
import { GroupTarget, LEVEL_FILL } from '../components/LevelPath'
import { PhoneShots } from '../components/PhoneShots'
import { StoreBadges } from '../components/StoreBadges'
import { T } from '../i18n'

/**
 * Franchise opportunity (the owner's idea, 2026-11-10): for people who'd like to open an academy on Sky Arc's model.
 * What the academy has built (the levels, Trial One, the coaches, SIUS scoring), told with the site's own pictures; the
 * system it runs on (the app, for families, coaches and the office); and a form whose message reaches the academy as
 * a website message ("Franchise opportunity" in Settings → Website → Messages, and by email). No prices, no terms
 * (docs/DECISIONS.md §44).
 */

/** The page has no photo spot of its own: it shows the one the academy chose for the top of About (its coaching). */
const HERO_PLACE = 'about.hero' as const

const cardTitle = 'mt-6 text-[21px] font-semibold tracking-tight'
const cardText = 'mt-2.5 text-[15px] leading-relaxed text-pretty'

function CardIcon({ icon: Icon, tone = 'ink' }: { icon: IconType; tone?: 'ink' | 'light' }) {
  return (
    <span className={cn('inline-flex size-12 shrink-0 items-center justify-center rounded-2xl', tone === 'light' ? 'bg-white/10 text-white' : 'bg-ink text-white')}>
      <Icon className="size-[22px]" aria-hidden="true" />
    </span>
  )
}

/* ------------------------------------------------------------------ the top */

/** The academy's photo, with the app's home screen in front of it: the program and the system, together. */
function HeroVisual() {
  const { t } = useSite()
  return (
    <div className="relative pb-8 sm:pb-10 lg:pr-10">
      <FramedPhoto place={HERO_PLACE} priority className="aspect-[4/3] lg:aspect-[5/4.3]" />
      <figure className="absolute right-3 bottom-0 w-[92px] rotate-[4deg] rounded-[24px] bg-ink p-[5px] shadow-float ring-1 ring-black/10 sm:right-6 sm:w-[132px] sm:rounded-[30px] sm:p-[6px] lg:right-0 lg:w-[150px]">
        <img src={appHome} alt={t(APP.shots[0])} width={600} height={1301} decoding="async" className="block h-auto w-full rounded-[19px] sm:rounded-[24px]" />
      </figure>
    </div>
  )
}

/* ------------------------------------------------------------------ the model */

/**
 * The four levels beside the site's shot group, which tightens through them while it's on screen (an illustration,
 * as on the homepage). With reduced motion it rests on the last level and every level shows.
 */
function PathVisual() {
  const { t } = useSite()
  const still = useReduced()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { amount: 0.5 })
  const last = LEVELS.length - 1
  const level = useMotionValue(still ? last : 0)
  const [active, setActive] = useState(still ? last : 0)
  useMotionValueEvent(level, 'change', (v) => setActive(Math.round(v)))
  useEffect(() => {
    if (still || !inView) return
    let run: ReturnType<typeof animate> | undefined
    const timer = window.setInterval(() => {
      const next = (Math.round(level.get()) + 1) % LEVELS.length
      run = animate(level, next, { duration: next === 0 ? 1.4 : 1.1, ease: EASE_OUT })
    }, 2600)
    return () => {
      window.clearInterval(timer)
      run?.stop()
    }
  }, [still, inView, level])
  return (
    <div ref={ref} className="mt-7 grid items-center gap-6 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:gap-8">
      <figure className="mx-auto w-full max-w-[15rem]">
        <div className="rounded-[22px] bg-warm p-3">
          <GroupTarget level={level} title={t(T.path.targetTitle)} />
        </div>
        <figcaption className="mt-2.5 text-center text-[12px] leading-snug text-balance text-stone">{t(HOME.path.illustration)}</figcaption>
      </figure>
      <ol className="grid gap-1.5">
        {LEVELS.map((lv, i) => {
          const on = still || i === active
          return (
            <li key={lv.id} className={cn('flex items-center gap-3 rounded-2xl px-3.5 py-3 transition-[background-color,opacity] duration-500', on ? 'bg-warm' : 'opacity-45')}>
              <span className="font-mono text-[12px] text-stone tabular-nums">{String(i + 1).padStart(2, '0')}</span>
              <span className="min-w-0 flex-1 text-[16px] font-semibold tracking-tight text-ink">{t(lv.name)}</span>
              <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium', LEVEL_FILL[i])}>{t(lv.stage)}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function Model() {
  const { t } = useSite()
  const m = FRANCHISE.model
  // How an athlete starts: Trial One, Trial Two, then a program (the homepage's steps, after the online request).
  const firstSteps = HOME.trial.steps.slice(1)
  return (
    <section className="py-20 sm:py-28" aria-labelledby="franchise-model">
      <Container>
        <SectionHead kicker={t(m.eyebrow)} title={<span id="franchise-model">{t(m.title)}</span>} text={t(m.text)} />
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          <Reveal className="h-full md:col-span-2 lg:col-span-4">
            <article className="flex h-full flex-col rounded-[28px] border border-line bg-white p-6 shadow-soft sm:p-8">
              <CardIcon icon={LuRoute} />
              <h3 className={cn(cardTitle, 'text-ink')}>{t(m.path.title)}</h3>
              <p className={cn(cardText, 'max-w-2xl text-stone')}>{t(m.path.text)}</p>
              <PathVisual />
              <A to="programs" className={cn(linkArrow, 'mt-auto self-start pt-5')}>
                {t(m.path.more)} <LuArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
              </A>
            </article>
          </Reveal>

          <Reveal delay={0.06} className="h-full lg:col-span-2">
            <article className="flex h-full flex-col rounded-[28px] bg-ink p-6 text-white sm:p-8">
              <CardIcon icon={LuShieldCheck} tone="light" />
              <h3 className={cardTitle}>{t(m.safety.title)}</h3>
              <p className={cn(cardText, 'text-white/65')}>{t(m.safety.text)}</p>
              <ol className="mt-7 grid">
                {firstSteps.map((s, i) => (
                  <li key={s.title} className="relative flex gap-4 pb-6 last:pb-0">
                    {i < firstSteps.length - 1 ? <span className="absolute top-10 bottom-1.5 left-4 w-px bg-white/15" aria-hidden="true" /> : null}
                    <span className={cn('relative inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold', i === 0 ? 'bg-red text-white' : 'border border-white/20 text-white/85')}>{i + 1}</span>
                    <div className="min-w-0 pt-1">
                      <p className="text-[16px] leading-tight font-semibold tracking-tight">{t(s.title)}</p>
                      <p className="mt-1 text-[14px] leading-relaxed text-white/60">{t(s.text)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </article>
          </Reveal>

          {/* Tablets: last and across the row, its logo beside the words; wide screens: beside the coaches, the logo on top. */}
          <Reveal delay={0.06} className="h-full md:order-1 md:col-span-2 lg:order-none lg:col-span-2">
            <article className="flex h-full flex-col rounded-[28px] border border-line bg-white p-6 shadow-soft sm:p-8 md:flex-row md:items-center md:gap-8 lg:flex-col lg:items-stretch lg:gap-0">
              <div className="flex items-center justify-center rounded-[22px] bg-warm px-8 py-7 md:order-last md:w-56 md:self-stretch lg:order-none lg:w-auto lg:self-auto">
                {/* SIUS's own logo, as on the homepage. */}
                <img src={siusLogo} alt="SIUS" width={400} height={275} className="h-16 w-auto sm:h-[72px]" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <h3 className={cn(cardTitle, 'text-ink md:mt-0 lg:mt-6')}>{t(m.scoring.title)}</h3>
                <p className={cn(cardText, 'text-stone')}>{t(m.scoring.text)}</p>
                <div className="mt-auto pt-5">
                  <p className="inline-flex items-center gap-2 rounded-full bg-warm-2 px-3 py-1.5 text-[13px] font-medium text-ink">
                    <span className="relative flex size-2" aria-hidden="true">
                      <span className="absolute inline-flex size-full rounded-full bg-dot/60 motion-safe:animate-ping" />
                      <span className="relative size-2 rounded-full bg-dot" />
                    </span>
                    {t(m.scoring.live)}
                  </p>
                </div>
              </div>
            </article>
          </Reveal>

          <Reveal delay={0.12} className="h-full lg:col-span-4">
            <article className="flex h-full flex-col rounded-[28px] bg-warm p-6 sm:p-8">
              <CardIcon icon={LuMedal} />
              <h3 className={cn(cardTitle, 'text-ink')}>{t(m.coaching.title)}</h3>
              <p className={cn(cardText, 'max-w-2xl text-stone')}>{t(m.coaching.text)}</p>
              <ul className="mt-6 flex flex-wrap gap-2">
                {m.coaching.credentials.map((c) => (
                  <li key={c} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13.5px] leading-snug font-medium text-ink shadow-[0_1px_2px_rgb(10_10_10/0.06)] ring-1 ring-ink/5">
                    <LuCheck className="size-3.5 shrink-0" aria-hidden="true" />
                    {t(c)}
                  </li>
                ))}
              </ul>
              <A to="about?section=coaches" className={cn(linkArrow, 'mt-auto self-start pt-5')}>
                {t(UI.meetCoaches)} <LuArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
              </A>
            </article>
          </Reveal>
        </div>
        <Glimpse />
      </Container>
    </section>
  )
}

/**
 * A few of the academy's own photos (its gallery, without the one at the top), so the model has its academy beside
 * it. Left out until the gallery has four to show.
 */
function Glimpse() {
  const { t } = useSite()
  const { photos } = useSiteData()
  const hero = usePlacePhoto(HERO_PLACE)
  const items = photos.filter((p) => p.id !== hero?.id).slice(0, 4)
  if (items.length < 4) return null
  return (
    <div className="mt-4">
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {items.map((g, i) => (
          <li key={g.id}>
            <Reveal delay={0.05 * i} className="relative aspect-[4/5] overflow-hidden rounded-[22px] bg-warm-2 sm:rounded-[24px] md:aspect-[4/4.4]">
              <Photo photo={g} alt={g.alt} sizes="(min-width: 768px) 290px, 50vw" className="size-full" />
              {g.caption ? (
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-4 pt-12 pb-3.5 text-[13.5px] leading-snug font-medium text-white">{g.caption}</span>
              ) : null}
            </Reveal>
          </li>
        ))}
      </ul>
      <Reveal className="mt-5 flex justify-end">
        <A to="gallery" className={linkArrow}>
          {t(UI.seeGallery)} <LuArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
        </A>
      </Reveal>
    </div>
  )
}

/* ------------------------------------------------------------------ the system */

const ROLE_ICONS = [LuUsers, LuUserRoundCheck, LuBuilding2]

function System() {
  const { t } = useSite()
  const s = FRANCHISE.system
  return (
    <section className="overflow-x-clip bg-warm-2/70 py-20 sm:py-28" aria-labelledby="franchise-system">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
          <div className="min-w-0">
            <SectionHead kicker={t(s.eyebrow)} title={<span id="franchise-system">{t(s.title)}</span>} text={t(s.text)} />
            <Reveal delay={0.1} className="mt-8">
              <StoreBadges height={44} />
            </Reveal>
          </div>
          <Reveal delay={0.1} className="min-w-0 pb-6">
            <PhoneShots />
          </Reveal>
        </div>
        <ul className="mt-16 grid gap-4 md:grid-cols-3">
          {s.roles.map((r, i) => {
            const Icon = ROLE_ICONS[i]
            return (
              <li key={r.title} className="h-full">
                <Reveal delay={0.06 * i} className="flex h-full flex-col rounded-[26px] border border-line bg-white p-6 shadow-soft sm:p-7">
                  <div className="flex items-center gap-3.5">
                    <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-ink text-white">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <h3 className="text-[21px] font-semibold tracking-tight text-ink">{t(r.title)}</h3>
                  </div>
                  {/* Two lines kept for it side by side, so the three lists start level. */}
                  <p className="mt-3.5 text-[15px] leading-relaxed text-stone md:min-h-[2lh]">{t(r.text)}</p>
                  <ul className="mt-5 grid gap-2.5 border-t border-line pt-5">
                    {r.items.map((x) => (
                      <li key={x} className="flex gap-2.5 text-[14.5px] leading-snug text-ink/85">
                        <span className="mt-0.5 inline-flex size-[18px] shrink-0 items-center justify-center rounded-full bg-ink text-white">
                          <LuCheck className="size-2.5" aria-hidden="true" />
                        </span>
                        {t(x)}
                      </li>
                    ))}
                  </ul>
                </Reveal>
              </li>
            )
          })}
        </ul>
      </Container>
    </section>
  )
}

/* ------------------------------------------------------------------ how it starts, and the form */

type Key = 'name' | 'email' | 'phone' | 'area' | 'message'

/** The inquiry: a website message with the topic "franchise", and the place they'd like to open at its top. */
function InquiryForm() {
  const { t } = useSite()
  const form = useRef<HTMLFormElement>(null)
  const [v, setV] = useState<Record<Key, string>>({ name: '', email: '', phone: '', area: '', message: '' })
  const [errors, setErrors] = useState<Partial<Record<Key, 'required' | 'email'>>>({})
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed' | 'limited'>('idle')
  // The field people never see: only bots fill it in.
  const [website, setWebsite] = useState('')
  const set = (k: Key) => (value: string) => {
    setV((s) => ({ ...s, [k]: value }))
    setErrors((e) => ({ ...e, [k]: undefined }))
    if (state === 'failed' || state === 'limited') setState('idle')
  }
  const err = (k: Key) => (errors[k] ? t(errors[k] === 'email' ? TRIAL.errors.email : TRIAL.errors.required) : null)
  const inv = (k: Key) => (errors[k] ? true : undefined)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (!v.name.trim()) next.name = 'required'
    if (!v.email.trim()) next.email = 'required'
    else if (!isEmailAddress(v.email)) next.email = 'email'
    if (!v.area.trim()) next.area = 'required'
    if (!v.message.trim()) next.message = 'required'
    setErrors(next)
    if (Object.keys(next).length) {
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setState('sending')
    const message = `Where: ${v.area.trim()}\n\n${v.message.trim()}`
    const input: WebsiteMessageInput = { kind: 'contact', name: v.name, email: v.email, phone: v.phone, topic: 'franchise', message, website }
    try {
      await callFunction('websiteMessage', input)
      setState('sent')
    } catch (e) {
      setState(e instanceof CallError && e.status === 'RESOURCE_EXHAUSTED' ? 'limited' : 'failed')
    }
  }
  useEffect(() => {
    if (state === 'sent') document.getElementById('franchise-result')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [state])

  if (state === 'sent') {
    return (
      <div id="franchise-result" className="flex h-full flex-col items-center justify-center rounded-[28px] bg-white p-8 text-center text-ink shadow-float sm:p-12" role="status" aria-live="polite">
        <span className="mx-auto inline-flex size-16 items-center justify-center rounded-full bg-ink text-white">
          <LuCheck className="size-7" strokeWidth={2.5} aria-hidden="true" />
        </span>
        <h3 className="mt-6 text-[30px] font-semibold tracking-tight text-ink">{t(FRANCHISE.sent.title)}</h3>
        <p className="mt-3 text-[16px] text-stone">
          {t(FRANCHISE.sent.text)} <span className="font-semibold [overflow-wrap:anywhere] text-ink">{v.email}</span>
        </p>
        <button
          type="button"
          onClick={() => {
            setV({ name: v.name, email: v.email, phone: v.phone, area: v.area, message: '' })
            setState('idle')
          }}
          className={cn(btnOutline, 'mt-8')}
        >
          {t(FRANCHISE.sent.again)}
        </button>
      </div>
    )
  }
  return (
    // Beside the steps (wide screens) the card is as tall as they are, and the message box takes the extra height.
    <form ref={form} onSubmit={submit} noValidate className="relative flex h-full flex-col rounded-[28px] bg-white p-6 text-ink shadow-float sm:p-9" data-testid="franchise-form">
      <div className="grid gap-5 sm:grid-cols-2 lg:flex-1 lg:grid-rows-[auto_auto_auto_1fr]">
        <Field id="f-name" label={t(FRANCHISE.fields.name)} error={err('name')} className="sm:col-span-2">
          <Input id="f-name" autoComplete="name" value={v.name} onChange={(e) => set('name')(e.target.value)} aria-invalid={inv('name')} className={inputClass} />
        </Field>
        <Field id="f-email" label={t(FRANCHISE.fields.email)} error={err('email')}>
          <Input id="f-email" type="email" inputMode="email" autoComplete="email" value={v.email} onChange={(e) => set('email')(e.target.value)} aria-invalid={inv('email')} className={inputClass} />
        </Field>
        <Field id="f-phone" label={t(FRANCHISE.fields.phone)}>
          <Input id="f-phone" type="tel" inputMode="tel" autoComplete="tel" value={v.phone} onChange={(e) => set('phone')(e.target.value)} className={inputClass} />
        </Field>
        <Field id="f-area" label={t(FRANCHISE.fields.area)} error={err('area')} className="sm:col-span-2">
          <Input id="f-area" autoComplete="address-level2" value={v.area} onChange={(e) => set('area')(e.target.value)} aria-invalid={inv('area')} className={inputClass} />
        </Field>
        <Field id="f-message" label={t(FRANCHISE.fields.message)} error={err('message')} className="sm:col-span-2 lg:flex lg:flex-col">
          <Textarea
            id="f-message"
            rows={5}
            value={v.message}
            placeholder={t(FRANCHISE.fields.messageHint)}
            onChange={(e) => set('message')(e.target.value)}
            aria-invalid={inv('message')}
            className="min-h-36 rounded-xl border-line bg-white px-3.5 py-3 text-[15px] md:text-[15px] focus-visible:border-ink focus-visible:ring-ink/10 aria-invalid:border-red-text lg:flex-1"
          />
        </Field>
      </div>
      {/* People never see this field; bots fill it in, and the server drops what they send. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="f-website">Website</label>
        <input id="f-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      {state === 'failed' || state === 'limited' ? (
        <p role="alert" className="mt-6 flex items-start gap-2 rounded-xl bg-red/5 px-3.5 py-2.5 text-[13.5px] font-medium text-red-text">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t(state === 'limited' ? T.sendLimited : T.sendFailed)}
        </p>
      ) : null}
      <div className="mt-8 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] leading-relaxed text-pretty text-stone">{t(CONTACT.delivered)}</p>
        <button type="submit" disabled={state === 'sending'} className={cn(btnInk, 'w-full shrink-0 disabled:opacity-50 sm:w-auto')}>
          {state === 'sending' ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <LuSend className="size-4" aria-hidden="true" />}
          {state === 'sending' ? t(FRANCHISE.sending) : t(FRANCHISE.send)}
        </button>
      </div>
    </form>
  )
}

function Start() {
  const { t } = useSite()
  const { contact } = useSiteData()
  const s = FRANCHISE.start
  return (
    // Focusable, so the hero's button leaves keyboard users here.
    <section id="start" tabIndex={-1} className="bg-ink py-20 text-white outline-none sm:py-28" aria-labelledby="franchise-start">
      <Container className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <div className="min-w-0">
          <SectionHead tone="light" kicker={t(s.eyebrow)} title={<span id="franchise-start">{t(s.title)}</span>} text={t(s.text)} />
          <ol className="mt-10 grid gap-3">
            {s.steps.map((x, i) => (
              <li key={x.title}>
                <Reveal delay={0.06 * i} className="flex gap-4 rounded-[22px] border border-white/10 bg-white/[0.04] p-5">
                  <span className={cn('inline-flex size-10 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold', i === 0 ? 'bg-red text-white' : 'bg-white/10 text-white')}>{i + 1}</span>
                  <div className="min-w-0 pt-0.5">
                    <h3 className="text-[18px] leading-tight font-semibold tracking-tight">{t(x.title)}</h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-white/65">{t(x.text)}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
          {contact.email ? (
            <Reveal className="mt-8">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-white/70">
                <LuMail className="size-4 shrink-0" aria-hidden="true" />
                {t(s.email)}
                <a href={`mailto:${contact.email}`} className="font-semibold [overflow-wrap:anywhere] text-white underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">
                  {contact.email}
                </a>
              </p>
            </Reveal>
          ) : null}
          <p className="mt-8 border-t border-white/10 pt-5 text-[13px] leading-relaxed text-white/50">{t(FRANCHISE.note)}</p>
        </div>
        <Reveal delay={0.08} className="h-full min-w-0">
          <InquiryForm />
        </Reveal>
      </Container>
    </section>
  )
}

export function Franchise() {
  const { t } = useSite()
  const still = useReduced()
  // Without the academy's photo, the words stand alone (the site's rule for a spot with nothing in it).
  const photo = usePlaceShown(HERO_PLACE)
  // Down to the form, as the Trial page's buttons go to a part of it (a "#start" link would be taken for Back).
  const toStart = () => {
    const el = document.getElementById('start')
    if (!el) return
    el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' })
    el.focus({ preventScroll: true })
  }
  return (
    <>
      <PageHero kicker={t(FRANCHISE.eyebrow)} title={t(FRANCHISE.title)} text={t(FRANCHISE.text)} aside={photo ? <HeroVisual /> : undefined}>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={toStart} className={cn(btnRed, 'min-h-[52px] px-7')}>
            {t(FRANCHISE.cta)} <LuArrowDown className="size-4" aria-hidden="true" />
          </button>
          <A to="programs" className={cn(btnOutline, 'min-h-[52px] px-7')}>
            {t(UI.explorePrograms)}
          </A>
        </div>
      </PageHero>
      <Model />
      <System />
      <Start />
    </>
  )
}
