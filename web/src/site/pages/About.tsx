import { LuCheck, LuCompass, LuHeartHandshake, LuShieldCheck, LuSprout, LuTarget, LuUsers } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { useSiteData } from '@/site/data'
import { ABOUT, keepWhole, l } from '@/site/kit/content'
import { Reveal } from '@/site/kit/motion'
import { PlacePhoto } from '@/site/kit/Photo'
import { useSite } from '@/site/kit/site'
import { BookButton, Container, SectionHead } from '../components/bits'
import { CoachPortrait, FinalCta, FocusChips, PageHero, VisitUs, crmLang } from '../components/blocks'

const STORY_PHOTO = l('Photo needed: an athlete in focus', '사진 필요: 집중하는 선수')
const HERO_PHOTO = l('Photo needed: coaching on the range', '사진 필요: 사대에서의 코칭')

const VALUE_ICONS = [LuShieldCheck, LuTarget, LuSprout, LuUsers]

function Mission() {
  const { t } = useSite()
  return (
    <section className="py-20 sm:py-28" aria-labelledby="mission-title">
      <Container className="grid items-center gap-12 lg:grid-cols-[1.08fr_1fr] lg:gap-14">
        <div>
          <SectionHead kicker={t(ABOUT.mission.eyebrow)} title={<span id="mission-title">{t(ABOUT.mission.title)}</span>} />
          <div className="mt-6 space-y-5">
            {ABOUT.mission.paragraphs.map((p, i) => (
              <Reveal key={p.en} delay={0.05 + i * 0.05}>
                <p className={cn('text-[16.5px] leading-[1.75] text-pretty', i === 0 ? 'text-ink' : 'text-stone')}>{t(p)}</p>
              </Reveal>
            ))}
          </div>
        </div>
        <Reveal delay={0.1} className="relative">
          <div className="aspect-[4/4.6] overflow-hidden rounded-[30px] bg-warm-2 shadow-lift">
            <PlacePhoto place="about.story" label={STORY_PHOTO} sizes="(min-width: 1024px) 520px, 100vw" className="size-full" />
          </div>
          <div className="absolute -bottom-6 left-6 right-6 rounded-[22px] bg-white p-5 shadow-float sm:left-auto sm:-right-4 sm:w-72">
            <p className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.14em] text-stone uppercase">
              <span className="size-1.5 rounded-full bg-dot" aria-hidden="true" />
              {t(ABOUT.mission.eyebrow)}
            </p>
            <p className="mt-2 text-[19px] leading-snug font-semibold tracking-tight text-ink">{t(ABOUT.promiseLine.title)}</p>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}

function Quote() {
  const { t } = useSite()
  return (
    <section className="bg-warm py-20 sm:py-28" aria-label={t(ABOUT.quote)}>
      <Container className="max-w-[1000px]">
        <Reveal>
          <span className="block text-center font-serif text-[88px] leading-none text-dot" aria-hidden="true">
            “
          </span>
          <blockquote className="accent -mt-6 text-center text-[34px] leading-[1.15] text-balance text-ink sm:text-[48px]">{t(ABOUT.quote)}</blockquote>
        </Reveal>
        <Reveal delay={0.1} className="mx-auto mt-12 max-w-2xl rounded-[26px] bg-white p-7 text-center shadow-soft sm:p-9">
          <h2 className="text-[24px] font-semibold tracking-tight text-ink sm:text-[28px]">{t(ABOUT.promiseLine.title)}</h2>
          <p className="mt-3 text-[16px] leading-relaxed text-stone">{t(ABOUT.promiseLine.text)}</p>
        </Reveal>
      </Container>
    </section>
  )
}

function Values() {
  const { t } = useSite()
  return (
    <section className="py-20 sm:py-28" aria-labelledby="values-title">
      <Container>
        <SectionHead title={<span id="values-title">{t(ABOUT.valuesTitle)}</span>} text={t(ABOUT.valuesText)} />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ABOUT.values.map((v, i) => {
            const Icon = VALUE_ICONS[i]
            return (
              <Reveal key={v.title.en} delay={i * 0.06} className="h-full">
                <article className="flex h-full flex-col rounded-[26px] border border-line bg-white p-6 shadow-soft sm:p-7">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-warm">
                      <Icon className="size-5 text-ink" aria-hidden="true" />
                    </span>
                    <span className="font-mono text-[12.5px] text-stone">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <h3 className="mt-6 text-[22px] font-semibold tracking-tight text-ink">{t(v.title)}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-stone">{t(v.text)}</p>
                </article>
              </Reveal>
            )
          })}
        </div>
        <Reveal className="mt-6 grid gap-x-4 rounded-[22px] border border-line bg-warm sm:grid-cols-2 lg:grid-cols-4">
          {ABOUT.principles.map((p, i) => (
            <div
              key={p.title.en}
              className={cn(
                'relative py-4 pr-5 pl-6 sm:pl-7',
                // Dividers: between the rows on phones, and in the middle of the gaps between columns.
                i > 0 && 'max-sm:border-t max-sm:border-line',
                i % 2 === 1 && 'sm:max-lg:before:absolute sm:max-lg:before:inset-y-4 sm:max-lg:before:-left-2 sm:max-lg:before:w-px sm:max-lg:before:bg-line',
                i > 0 && 'lg:before:absolute lg:before:inset-y-4 lg:before:-left-2 lg:before:w-px lg:before:bg-line',
              )}
            >
              <p className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
                <LuCheck className="size-4" aria-hidden="true" />
                {t(p.title)}
              </p>
              <p className="mt-1 text-[13.5px] leading-snug text-stone">{t(p.text)}</p>
            </div>
          ))}
        </Reveal>
      </Container>
    </section>
  )
}

function Approach() {
  const { t } = useSite()
  const icons = [LuCompass, LuTarget, LuHeartHandshake]
  return (
    <section className="bg-ink py-20 text-white sm:py-28" aria-labelledby="approach-title">
      <Container className="grid gap-12 lg:grid-cols-[0.9fr_1.3fr] lg:gap-16">
        <SectionHead tone="light" kicker={t(ABOUT.approach.eyebrow)} title={<span id="approach-title">{t(ABOUT.approach.title)}</span>} text={t(ABOUT.approach.text)} />
        <ol className="grid gap-3">
          {ABOUT.approach.items.map((a, i) => {
            const Icon = icons[i]
            return (
              <li key={a.title.en}>
                <Reveal delay={i * 0.08} className="flex gap-5 rounded-[24px] border border-white/10 bg-white/[0.04] p-6">
                  <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-mono text-[12px] text-white/50">{String(i + 1).padStart(2, '0')}</p>
                    <h3 className="mt-1 text-[21px] font-semibold tracking-tight">{t(a.title)}</h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-white/65">{t(a.text)}</p>
                  </div>
                </Reveal>
              </li>
            )
          })}
        </ol>
      </Container>
    </section>
  )
}

function Promise() {
  const { t } = useSite()
  return (
    <section className="py-20 sm:py-28" aria-labelledby="promise-title">
      <Container>
        <SectionHead kicker={t(ABOUT.promise.eyebrow)} title={<span id="promise-title">{t(ABOUT.promise.title)}</span>} />
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {ABOUT.promise.items.map((p, i) => (
            <Reveal key={p.title.en} delay={i * 0.07} className="h-full">
              <article className="h-full rounded-[26px] bg-warm p-7">
                <span className="inline-flex size-9 items-center justify-center rounded-full bg-ink text-[14px] font-semibold text-white">{i + 1}</span>
                <h3 className="mt-5 text-[21px] font-semibold tracking-tight text-ink">{t(p.title)}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-stone">{t(p.text)}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  )
}

function Team() {
  const { t } = useSite()
  const { content } = useSiteData()
  if (content.team.length === 0) return null
  return (
    <section id="coaches" className="bg-warm py-20 sm:py-28" aria-labelledby="team-title">
      <Container>
        <SectionHead kicker={t(ABOUT.team.eyebrow)} title={<span id="team-title">{t(ABOUT.team.title)}</span>} text={t(ABOUT.team.text)} />
        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          {content.team.map((p, i) => {
            const credentials = (
              <ul className="space-y-2">
                {p.credentials.map((c) => (
                  <li key={c} className="flex gap-2.5 text-[14px] leading-snug text-ink/85">
                    <LuCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    {keepWhole(c)}
                  </li>
                ))}
              </ul>
            )
            return (
              <Reveal key={p.id} delay={(i % 2) * 0.07} className="h-full">
                <article className="h-full rounded-[28px] bg-white p-4 shadow-soft sm:p-5" lang={crmLang}>
                  <div className="flex items-start gap-4 sm:gap-6">
                    <CoachPortrait person={p} compact className="aspect-[4/5] w-28 shrink-0 rounded-[20px] sm:w-44" />
                    <div className="min-w-0 flex-1 pt-1">
                      <h3 className="text-[24px] leading-tight font-semibold tracking-tight text-ink">{p.name}</h3>
                      <p className="mt-0.5 text-[14.5px] text-balance text-stone">{p.role}</p>
                      {p.focus ? <FocusChips focus={p.focus} className="mt-3" /> : null}
                      <div className="mt-4 hidden sm:block">{credentials}</div>
                    </div>
                  </div>
                  <div className="mt-4 border-t border-line pt-4 sm:hidden">{credentials}</div>
                </article>
              </Reveal>
            )
          })}
        </div>
      </Container>
    </section>
  )
}

export function About() {
  const { t } = useSite()
  return (
    <>
      <PageHero kicker={t(ABOUT.eyebrow)} title={t(ABOUT.title)} text={t(ABOUT.text)} photo="about.hero" photoLabel={HERO_PHOTO}>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <BookButton />
        </div>
      </PageHero>
      <Mission />
      <Quote />
      <Values />
      <Approach />
      <Promise />
      <Team />
      <VisitUs />
      <FinalCta />
    </>
  )
}

