import { LuInstagram, LuMail, LuMapPin, LuPhone } from 'react-icons/lu'
import { SkyArcLogo } from '@/components/app/SkyArcMark'
import { useSiteData } from '@/site/data'
import { ACADEMY, FOOTER, UI, keepWhole } from '@/site/kit/content'
import { A, useSite } from '@/site/kit/site'
import { useBooking } from '../booking-context'
import { T } from '../i18n'
import { Container } from './bits'
import { DIRECTIONS_URL, crmLang, instagramHandle } from './blocks'

const link = 'inline-flex min-h-9 items-center gap-1.5 text-[14.5px] text-ink/75 transition hover:text-ink focus-visible:underline focus-visible:outline-none'

export function Footer() {
  const { t, lang } = useSite()
  const { openBooking } = useBooking()
  const { contact, content } = useSiteData()
  return (
    <footer className="border-t border-line bg-[#f3f2ef]">
      <Container className="py-14 sm:py-16">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div className="max-w-sm">
            <SkyArcLogo tone="black" className="h-14" />
            <p className="accent mt-6 text-[26px] leading-tight text-ink">{t(FOOTER.tagline)}</p>
            <p className="mt-3 text-[14.5px] leading-relaxed text-stone">{t(FOOTER.text)}</p>
            {content.instagram ? (
              <a href={content.instagram} target="_blank" rel="noreferrer" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-ink/15 bg-white px-4 text-[14px] font-medium text-ink transition hover:border-ink/35">
                <LuInstagram className="size-4" aria-hidden="true" /> {instagramHandle(content.instagram)}
              </a>
            ) : null}
          </div>
          <div className="grid gap-10 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:gap-x-12">
            <nav aria-label={t(FOOTER.sections.explore)}>
              <h2 className="text-[12px] font-semibold tracking-[0.14em] text-stone uppercase">{t(FOOTER.sections.explore)}</h2>
              <ul className="mt-3 grid gap-0.5">
                {[
                  { to: 'programs', label: UI.programs },
                  { to: 'programs?section=tuition', label: UI.tuition },
                  { to: 'about', label: UI.about },
                  { to: 'about?section=coaches', label: UI.coaches },
                  { to: 'gallery', label: UI.gallery },
                  { to: 'news', label: UI.news },
                ].map((l) => (
                  <li key={l.to}>
                    <A to={l.to} className={link}>
                      {t(l.label)}
                    </A>
                  </li>
                ))}
              </ul>
            </nav>
            <nav aria-label={t(FOOTER.sections.families)}>
              <h2 className="text-[12px] font-semibold tracking-[0.14em] text-stone uppercase">{t(FOOTER.sections.families)}</h2>
              <ul className="mt-3 grid gap-0.5">
                <li>
                  <button type="button" onClick={() => openBooking()} className={link}>
                    {t(UI.trial)}
                  </button>
                </li>
                <li>
                  <A to="trial" className={link}>
                    {t(T.aboutTrials)}
                  </A>
                </li>
                <li>
                  <A to="portal" className={link}>
                    {t(UI.portal)}
                  </A>
                </li>
                <li>
                  <a href={ACADEMY.loginUrl} className={link}>
                    {t(UI.login)}
                  </a>
                </li>
                <li>
                  <A to="contact" className={link}>
                    {t(UI.contact)}
                  </A>
                </li>
              </ul>
            </nav>
            <div>
              <h2 className="text-[12px] font-semibold tracking-[0.14em] text-stone uppercase">{t(FOOTER.sections.visit)}</h2>
              <address className="mt-3 grid gap-2.5 text-[14.5px] text-ink/75 not-italic">
                <a href={DIRECTIONS_URL} target="_blank" rel="noreferrer" className="flex items-start gap-2 hover:text-ink">
                  <LuMapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span className="whitespace-nowrap">
                    {ACADEMY.street}
                    <br />
                    {ACADEMY.city}
                  </span>
                </a>
                {contact.email ? (
                  <a href={`mailto:${contact.email}`} className="flex items-center gap-2 hover:text-ink">
                    <LuMail className="size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 [overflow-wrap:anywhere]">{contact.email}</span>
                  </a>
                ) : null}
                {contact.phone ? (
                  <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-2 whitespace-nowrap hover:text-ink">
                    <LuPhone className="size-4 shrink-0" aria-hidden="true" />
                    {contact.phone}
                  </a>
                ) : null}
              </address>
              {content.hours.length ? (
                <dl className="mt-4 grid gap-1 text-[13px] sm:max-w-80" lang={crmLang}>
                  {content.hours.map((h) => (
                    <div key={h.id} className="flex justify-between gap-3">
                      <dt className="text-stone">{keepWhole(h.days)}</dt>
                      <dd className="text-right text-ink/80 tabular-nums">{keepWhole(h.time)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          </div>
        </div>
        <div className="mt-12 grid gap-3 border-t border-ink/10 pt-6 text-[12.5px] leading-relaxed text-stone">
          {lang !== 'en' ? <p>{t(FOOTER.languageNote)}</p> : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>{t(FOOTER.copyright)}</p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <a href={ACADEMY.privacyUrl} className="inline-flex min-h-9 items-center hover:text-ink">
                {t(FOOTER.privacy)}
              </a>
            </div>
          </div>
        </div>
      </Container>
    </footer>
  )
}
