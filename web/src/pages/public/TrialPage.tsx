import { FullPageMessage } from '@/components/app/FullPage'

type Lang = 'en' | 'ko'

/** As on the homepage: `?lang=`, then the saved choice (`skyarc.lang`), then the browser's language. */
function pageLang(): Lang {
  try {
    const asked = new URLSearchParams(location.search).get('lang')
    if (asked === 'ko' || asked === 'en') return asked
    const saved = localStorage.getItem('skyarc.lang')
    if (saved === 'ko' || saved === 'en') return saved
  } catch {
    // Storage can be blocked; the browser's language still decides.
  }
  return /^ko\b/i.test(navigator.language) ? 'ko' : 'en'
}

const COPY: Record<Lang, { title: string; text: string; home: string }> = {
  en: {
    title: 'Book a trial',
    text: 'Online trial booking opens soon. Until then, please contact the academy through skyarcacademy.com.',
    home: 'Home',
  },
  ko: {
    title: '체험 수업 예약',
    text: '온라인 체험 수업 예약은 곧 열립니다. 그때까지는 skyarcacademy.com을 통해 아카데미에 문의해 주세요.',
    home: '홈으로',
  },
}

/** The homepage's "Book a trial" link, until trial booking is built: where to ask in the meantime. */
export function TrialPage() {
  const lang = pageLang()
  const c = COPY[lang]
  return (
    <div lang={lang}>
      <FullPageMessage
        title={c.title}
        description={c.text}
        actions={[
          { label: c.home, to: '/', variant: 'outline' },
          { label: 'skyarcacademy.com', to: 'https://skyarcacademy.com' },
        ]}
      />
    </div>
  )
}
