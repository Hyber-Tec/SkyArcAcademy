import { LuArrowRight, LuCheck, LuClock, LuShieldCheck, LuTicket } from 'react-icons/lu'
import { FAQ, HOME, TRIAL } from '@/site/kit/content'
import { Reveal } from '@/site/kit/motion'
import { A, useSite } from '@/site/kit/site'
import { Container, Kicker, SectionHead, TodoNote, mins } from '../components/bits'
import { FaqList, PageHero, VisitUs } from '../components/blocks'
import { TrialWizard } from '../components/TrialWizard'
import { T } from '../i18n'
import { useWizard } from '../wizard-state'

/** Trial Two follows Trial One: the office books it with the family (the link by email comes with booking online). */
function TrialTwo() {
  const { t } = useSite()
  return (
    <section id="trial-two" className="bg-ink py-20 text-white sm:py-24" aria-labelledby="trial-two-title">
      <Container className="grid items-center gap-10 lg:grid-cols-[0.95fr_1.2fr] lg:gap-14">
        <div>
          <Kicker tone="light">{t(TRIAL.kinds.two.name)}</Kicker>
          <h2 id="trial-two-title" className="mt-4 text-[34px] leading-tight font-semibold tracking-[-0.03em] sm:text-[44px]">
            {t(TRIAL.two.title)}
          </h2>
          <p className="mt-4 text-[16.5px] leading-relaxed text-white/70">{t(TRIAL.two.text)}</p>
          <ol className="mt-8 space-y-4">
            {TRIAL.two.items.map((it, i) => (
              <li key={it.title.en} className="flex gap-4">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 font-mono text-[13px]">{String(i + 1).padStart(2, '0')}</span>
                <span>
                  <span className="block text-[17px] font-semibold">{t(it.title)}</span>
                  <span className="mt-1 block text-[15px] leading-relaxed text-white/65">{t(it.text)}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="min-w-0 rounded-[28px] bg-white p-6 text-ink shadow-soft sm:p-8">
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-warm">
            <LuTicket className="size-5 text-ink" aria-hidden="true" />
          </span>
          <h3 className="mt-5 text-[24px] font-semibold tracking-tight">{t(TRIAL.trialTwo.title)}</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-stone">{t(T.trialTwoText)}</p>
          <A to="contact?topic=trial" className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-[15px] font-semibold text-white transition hover:bg-ink/85 focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:outline-none">
            {t(T.trialTwoCta)} <LuArrowRight className="size-4" aria-hidden="true" />
          </A>
        </div>
      </Container>
    </section>
  )
}

export function Trial() {
  const { t, lang } = useSite()
  const wizard = useWizard(lang)
  const facts = [
    ...(TRIAL.kinds.one.minutes ? [{ icon: LuClock, text: mins(TRIAL.kinds.one.minutes, lang) }] : []),
    { icon: LuShieldCheck, text: t(T.noShooting) },
    { icon: LuCheck, text: t(T.arriveEarly) },
  ]
  const trialFaq = [FAQ[1], FAQ[2], FAQ[3]]
  return (
    <>
      <PageHero kicker={t(TRIAL.eyebrow)} title={t(TRIAL.title)} text={t(TRIAL.text)}>
        <ul className="mt-7 flex flex-wrap gap-2">
          {facts.map((f) => (
            <li key={f.text} className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-3.5 py-2 text-[13.5px] font-medium text-ink">
              <f.icon className="size-4" aria-hidden="true" /> {f.text}
            </li>
          ))}
        </ul>
      </PageHero>

      <section className="py-14 sm:py-20" aria-label={t(T.wizardTitle)}>
        <Container className="grid items-start gap-8 lg:grid-cols-[1.2fr_1fr] lg:gap-12">
          <Reveal className="min-w-0 lg:sticky lg:top-28">
            <TrialWizard wizard={wizard} variant="card" />
          </Reveal>
          <div className="min-w-0 space-y-4">
            <Reveal>
              <div className="rounded-[26px] bg-warm p-6 sm:p-8">
                <p className="text-[12px] font-semibold tracking-[0.14em] text-stone uppercase">{t(T.trialPageCovers)}</p>
                <h2 className="mt-2 text-[24px] font-semibold tracking-tight text-ink">{t(TRIAL.covers.title)}</h2>
                <ul className="mt-5 space-y-4">
                  {TRIAL.covers.items.map((c, i) => (
                    <li key={c.title.en} className="flex gap-4">
                      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[12px] text-white">{String(i + 1).padStart(2, '0')}</span>
                      <span>
                        <span className="block text-[16px] font-semibold text-ink">{t(c.title)}</span>
                        <span className="mt-0.5 block text-[14.5px] leading-relaxed text-stone">{t(c.text)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={0.05}>
              <button type="button" onClick={() => document.getElementById('trial-two')?.scrollIntoView({ behavior: 'smooth' })} className="group flex w-full items-center justify-between gap-4 rounded-[26px] border border-line bg-white p-6 text-left shadow-soft transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:outline-none sm:p-7">
                <span>
                  <span className="block text-[12px] font-semibold tracking-[0.14em] text-stone uppercase">{t(T.trialPageThen)}</span>
                  <span className="mt-1.5 block text-[18px] font-semibold text-ink">{t(TRIAL.kinds.two.summary)}</span>
                </span>
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-warm text-ink transition group-hover:translate-x-0.5" aria-hidden="true">
                  <LuArrowRight className="size-4" />
                </span>
              </button>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="rounded-[26px] border border-line bg-white p-6 sm:p-7">
                <h2 className="text-[18px] font-semibold text-ink">{t(HOME.trial.bringTitle)}</h2>
                <ul className="mt-4 space-y-2.5">
                  {HOME.trial.bring.map((b) => (
                    <li key={b.en} className="flex gap-2.5 text-[15px] text-ink/85">
                      <LuCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {t(b)}
                    </li>
                  ))}
                </ul>
                <TodoNote className="mt-5">{t(HOME.trial.todo)}</TodoNote>
              </div>
            </Reveal>
          </div>
        </Container>
      </section>

      <TrialTwo />

      <section className="py-20 sm:py-24" aria-labelledby="trial-faq">
        <Container className="grid gap-10 lg:grid-cols-[0.8fr_1.3fr] lg:gap-16">
          <SectionHead kicker={t(T.faqKicker)} title={<span id="trial-faq">{t(T.trialQuestions)}</span>} />
          <FaqList items={trialFaq} columns={1} />
        </Container>
      </section>
      <VisitUs />
    </>
  )
}
