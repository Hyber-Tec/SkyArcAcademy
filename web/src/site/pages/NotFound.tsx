import { useEffect } from 'react'
import { LuArrowLeft } from 'react-icons/lu'
import { ACADEMY, NOT_FOUND, TITLES, UI } from '@/site/kit/content'
import { SkyArcMark } from '@/components/app/SkyArcMark'
import { A, useSite } from '@/site/kit/site'
import { BookButton, Container, btnOutline } from '../components/bits'
import { T } from '../i18n'

export function NotFound() {
  const { t, lang } = useSite()
  useEffect(() => {
    document.title = `${TITLES['404'][lang]} · ${ACADEMY.name}`
  }, [lang])
  return (
    <section className="relative overflow-hidden bg-warm" aria-labelledby="nf-title">
      <Container className="grid min-h-[68vh] items-center gap-10 py-20 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="font-mono text-[13px] tracking-[0.16em] text-stone uppercase">{t(T.notFoundKicker)}</p>
          <h1 id="nf-title" className="mt-4 text-[44px] leading-[1.02] font-semibold tracking-[-0.035em] text-ink sm:text-[64px]">
            {t(NOT_FOUND.title)}
          </h1>
          <p className="mt-4 max-w-md text-[17px] leading-relaxed text-stone">{t(NOT_FOUND.text)}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <A to="" className={btnOutline}>
              <LuArrowLeft className="size-4" aria-hidden="true" /> {t(UI.backHome)}
            </A>
            <BookButton />
          </div>
        </div>
        <div className="flex justify-center" aria-hidden="true">
          <div className="academy-grid relative flex size-[min(78vw,420px)] items-center justify-center overflow-hidden rounded-full border border-ink/10">
            <span className="absolute size-[66%] rounded-full border border-ink/10" />
            <span className="absolute size-[34%] rounded-full border border-ink/10" />
            <SkyArcMark className="relative size-28 rounded-[26%] shadow-float sm:size-32" />
          </div>
        </div>
      </Container>
    </section>
  )
}
