import { useEffect, useState } from 'react'
import { LuBell, LuCalendarDays, LuChartLine, LuTarget } from 'react-icons/lu'
import { APP_SIGN_URL } from '@shared/appStores'
import { cn } from '@/lib/utils'
import { APP } from '@/site/kit/content'
import { Reveal } from '@/site/kit/motion'
import { useSite } from '@/site/kit/site'
import { Container, Kicker } from '../components/bits'
import { PhoneShots } from '../components/PhoneShots'
import { StoreBadges } from '../components/StoreBadges'

const ICONS = [LuCalendarDays, LuTarget, LuChartLine, LuBell]
/** The app sign's link as a QR code, for someone reading this page on a computer: their phone goes to its store. */
function SignQr({ className }: { className?: string }) {
  const { t } = useSite()
  const [data, setData] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void import('qrcode').then(({ toDataURL }) => toDataURL(APP_SIGN_URL, { width: 360, margin: 1, errorCorrectionLevel: 'M' }).then((d) => live && setData(d)))
    return () => {
      live = false
    }
  }, [])
  return (
    <div className={cn('items-center gap-4 rounded-[22px] border border-line bg-white p-4 shadow-soft', className)}>
      {data ? <img src={data} alt="" width={96} height={96} className="size-24 shrink-0" /> : <span className="size-24 shrink-0 rounded-lg bg-warm" />}
      <p className="max-w-44 text-[14.5px] leading-snug text-stone">{t(APP.scan)}</p>
    </div>
  )
}

/** The phone app's page (`/get-app`): what it does, the two stores, and three of its screens. */
export function GetApp() {
  const { t } = useSite()
  return (
    <>
      <section className="relative overflow-hidden bg-warm" aria-labelledby="page-title">
        <Container className="grid items-center gap-14 py-14 sm:py-20 lg:grid-cols-[1fr_1fr] lg:py-24">
          <Reveal className="min-w-0">
            <Kicker>{t(APP.kicker)}</Kicker>
            <h1 id="page-title" className="mt-5 text-[44px] leading-[1] font-semibold tracking-[-0.04em] text-ink sm:text-[60px]">
              {t(APP.title)}
            </h1>
            <p className="mt-5 max-w-lg text-[17.5px] leading-relaxed text-stone sm:text-[19px]">{t(APP.text)}</p>
            <StoreBadges height={52} className="mt-8" />
            <p className="mt-5 max-w-md text-[14px] leading-relaxed text-stone">{t(APP.free)}</p>
            <SignQr className="mt-8 hidden w-fit lg:flex" />
          </Reveal>
          <Reveal delay={0.1} className="min-w-0 pb-6">
            <PhoneShots />
          </Reveal>
        </Container>
      </section>

      <section className="py-20 sm:py-24" aria-label={t(APP.kicker)}>
        <Container>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {APP.features.map((f, i) => {
              const Icon = ICONS[i]
              return (
                <li key={f.title} className="h-full">
                  <Reveal delay={0.06 * i} className="flex h-full flex-col rounded-[26px] border border-line bg-white p-6 shadow-soft">
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
          <Reveal className="mt-14 flex flex-col items-center gap-5 text-center">
            <StoreBadges height={48} className="justify-center" />
            <p lang="en" className="max-w-3xl text-[12px] leading-relaxed text-stone/80">
              {t(APP.credit)}
            </p>
          </Reveal>
        </Container>
      </section>
    </>
  )
}
