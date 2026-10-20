import { LuCalendarDays, LuChartLine, LuLogIn, LuNewspaper, LuTarget } from 'react-icons/lu'
import { ACADEMY, HOME, PORTAL } from '@/site/kit/content'
import { Reveal } from '@/site/kit/motion'
import { useSite } from '@/site/kit/site'
import { BookButton, Container, Kicker, SectionHead, btnInk } from '../components/bits'
import { ReportShowcase } from '../components/ReportShowcase'
import { T } from '../i18n'

const ICONS = [LuCalendarDays, LuTarget, LuChartLine, LuNewspaper]

export function Portal() {
  const { t } = useSite()
  return (
    <>
      <section className="relative overflow-hidden bg-warm" aria-labelledby="page-title">
        <Container className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1fr_1.05fr] lg:py-24">
          <Reveal className="min-w-0">
            <Kicker>{t(PORTAL.eyebrow)}</Kicker>
            <h1 id="page-title" className="mt-5 text-[44px] leading-[1] font-semibold tracking-[-0.04em] text-ink sm:text-[60px]">
              {t(PORTAL.title)}
            </h1>
            <p className="mt-5 max-w-lg text-[17.5px] leading-relaxed text-stone sm:text-[19px]">{t(PORTAL.text)}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href={ACADEMY.loginUrl} className={btnInk}>
                <LuLogIn className="size-4" aria-hidden="true" /> {t(PORTAL.cta)}
              </a>
            </div>
            <p className="mt-5 max-w-md text-[14px] leading-relaxed text-stone">{t(PORTAL.invite)}</p>
          </Reveal>
          <ul className="grid min-w-0 gap-3 sm:grid-cols-2">
            {PORTAL.features.map((f, i) => {
              const Icon = ICONS[i]
              return (
                <li key={f.title.en} className="h-full">
                  <Reveal delay={0.08 + i * 0.06} className="flex h-full flex-col rounded-[26px] border border-line bg-white p-6 shadow-soft">
                    <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-ink text-white">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <h2 className="mt-5 text-[20px] font-semibold tracking-tight text-ink">{t(f.title)}</h2>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-stone">{t(f.text)}</p>
                  </Reveal>
                </li>
              )
            })}
          </ul>
        </Container>
      </section>

      <ReportShowcase
        className="overflow-x-clip pt-20 sm:pt-24"
        header={
          <Container>
            <SectionHead align="center" kicker={t(T.portalPreview)} title={t(HOME.report.title)} text={t(HOME.report.text)} />
          </Container>
        }
        footer={<div className="h-16 sm:h-20" />}
      />

      <section className="pb-20 sm:pb-24" aria-labelledby="new-title">
        <Container>
          <Reveal className="flex flex-col items-start gap-6 rounded-[30px] bg-ink p-8 text-white sm:p-12 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <h2 id="new-title" className="text-[30px] leading-tight font-semibold tracking-tight sm:text-[38px]">
                {t(T.portalNew)}
              </h2>
              <p className="mt-3 text-[16.5px] leading-relaxed text-white/70">{t(T.portalNewText)}</p>
            </div>
            <BookButton className="shrink-0" />
          </Reveal>
        </Container>
      </section>
    </>
  )
}
