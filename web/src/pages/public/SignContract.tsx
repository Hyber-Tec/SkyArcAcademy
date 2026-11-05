import { httpsCallable } from 'firebase/functions'
import { useEffect, useMemo, useState } from 'react'
import { LuCircleCheck, LuDownload, LuMail, LuPhone, LuRotateCw, LuSmartphone } from 'react-icons/lu'
import { useParams, useSearchParams } from 'react-router'
import { APP_STORE_URL, PLAY_STORE_URL } from '@shared/brand'
import { pricedChoice } from '@shared/contracts/document'
import { type ContractValues, prefillValues, presetValues } from '@shared/contracts/fill'
import type { ContractLinkSignedResult, ContractSignRequest, ShownSigner } from '@shared/contracts/types'
import { type Lang, dateText } from '@shared/i18n'
import { formatPhone } from '@shared/people'
import { dateKeyOf, formatInstant } from '@shared/time'
import { CompanyFooter } from '@/components/app/CompanyFooter'
import { LangSwitch } from '@/components/app/LangSwitch'
import { SkyArcLogo } from '@/components/app/SkyArcMark'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useContractRead } from '@/features/contracts/contractLang'
import { ContractLanguageNote } from '@/features/contracts/ContractLanguageNote'
import { type SignOutcome, ContractSigning } from '@/features/contracts/ContractSigning'
import { pdfBytes, savePdf } from '@/features/contracts/pdf'
import { functions } from '@/lib/firebase'
import { useLang, useT } from '@/lib/lang'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'

/**
 * /sign/{token}: where a parent or guardian fills in and signs the academy's enrollment contract (docs/DECISIONS.md
 * §23, F4, §33 and §34), from its QR code at the front desk or the email the office sent. No account and no app: it
 * works on any phone's browser. The contract reads as a page with its parts to fill in (the student's name is filled in
 * already, the program the office suggested is chosen and its discounts checked), then parent or guardian, a signature
 * drawn with a finger or a mouse and the agreement to sign electronically. The server builds the signed PDF
 * (functions/src/contracts.ts); they're asked whether to download their copy (it works for a few days), and pointed to
 * the app, where it stays. A contract signed or withdrawn says so, with how to reach the academy.
 */

interface Academy {
  name: string
  email: string
  phone: string
  /** The academy's time zone: every date here is the academy's. */
  timezone: string
}

type Loaded =
  | {
      state: 'ready'
      academy: Academy
      firstName: string
      studentName: string
      /** `ko`: the academy's Korean translation of this version, when it has one (docs/DECISIONS.md §36). */
      contract: { title: string; text: string; version: number; ko?: string | null }
      preset: ContractValues
      academySigner: ShownSigner | null
      /** Whether signing emails the signer their copy (every academy but the demo one). */
      emailsCopy?: boolean
    }
  | { state: 'signed'; academy: Academy; firstName: string; signedAt: number; signerName: string; copyUntil: number; copy?: { name: string; data: string } }
  | { state: 'canceled'; academy: Academy; firstName: string }
  | { state: 'invalid'; academy: Academy }

const getContract = httpsCallable<{ token: string; copy?: boolean }, Loaded>(functions, 'getContractForSigning')
const sign = httpsCallable<{ token: string } & ContractSignRequest, ContractLinkSignedResult>(functions, 'signContract')

/** "November 27, 2026" or "2026년 11월 27일", in the academy's time zone. */
const longDate = (ms: number, academy: Academy, lang: Lang = 'en') =>
  lang === 'ko'
    ? dateText(dateKeyOf(ms, academy.timezone || 'America/New_York'), 'long', 'ko')
    : formatInstant(ms, academy.timezone || 'America/New_York', { month: 'long', day: 'numeric', year: 'numeric' })

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-svh bg-muted/40 px-4 py-8 sm:py-12">
      <div className={cn('mx-auto w-full space-y-5', wide ? 'max-w-3xl' : 'max-w-md')}>{children}</div>
      <div className="mt-8 flex justify-center">
        <LangSwitch />
      </div>
      <CompanyFooter className="mt-3 text-center" />
    </div>
  )
}

/** The logo, centered over a card's content (CLAUDE.md, "Brand and logos"). */
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border bg-card p-6 shadow-sm sm:p-8', className)}>
      <div className="mb-6 flex justify-center">
        <SkyArcLogo className="h-16" />
      </div>
      {children}
    </div>
  )
}

function Contact({ academy, lead }: { academy: Academy; lead: string }) {
  if (!academy.phone && !academy.email) return null
  return (
    <div className="mt-5 space-y-2 rounded-xl bg-muted/50 p-4 text-sm">
      <p className="text-muted-foreground">{lead}</p>
      <p className="font-medium">{academy.name}</p>
      <div className="flex flex-col gap-1.5">
        {academy.phone ? (
          <a href={`tel:${academy.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-2 font-medium underline-offset-2 hover:underline">
            <LuPhone className="size-4" aria-hidden /> {formatPhone(academy.phone)}
          </a>
        ) : null}
        {academy.email ? (
          <a href={`mailto:${academy.email}`} className="inline-flex items-center gap-2 font-medium break-all underline-offset-2 hover:underline">
            <LuMail className="size-4 shrink-0" aria-hidden /> {academy.email}
          </a>
        ) : null}
      </div>
    </div>
  )
}

function Notice({ title, children, academy, lead }: { title: string; children: React.ReactNode; academy: Academy | null; lead?: string }) {
  const t = useT()
  return (
    <Shell>
      <Card>
        <h1 className="text-xl font-semibold tracking-tight text-balance">{title}</h1>
        <div className="mt-2 space-y-3 text-sm text-muted-foreground">{children}</div>
        {academy ? <Contact academy={academy} lead={lead ?? t('Questions? Contact the academy:', '궁금한 점은 아카데미에 문의해 주세요.')} /> : null}
      </Card>
    </Shell>
  )
}

/** Their signed copy, fetched through the link (for a few days after signing). */
function CopyButton({ token, until, academy }: { token: string; until: number; academy: Academy }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const now = useNow()
  const lang = useLang()
  const t = useT()
  if (now > until) return null
  const download = async () => {
    setBusy(true)
    setFailed(false)
    try {
      const r = (await getContract({ token, copy: true })).data
      if (r.state === 'signed' && r.copy) savePdf(pdfBytes(r.copy.data), r.copy.name)
      else setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2">
      <Button className="w-full" onClick={() => void download()} disabled={busy}>
        {busy ? <Spinner /> : <LuDownload />} {t('Download your signed copy', '서명한 계약서 다운로드')}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        {failed ? t('The download didn’t work. Please try again.', '다운로드하지 못했어요. 다시 시도해 주세요.') : t(`This download works until ${longDate(until, academy)}.`, `${longDate(until, academy, lang)}까지 다운로드할 수 있어요.`)}
      </p>
    </div>
  )
}

/** The academy's app, where a family signed in with the email they gave the academy finds the signed contract too. */
function GetTheApp() {
  const t = useT()
  return (
    <div className="mt-5 space-y-3 rounded-xl border p-4 text-sm" data-testid="get-the-app">
      <p className="flex items-start gap-2 font-medium">
        <LuSmartphone className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('Get the app', '앱 받기')}
      </p>
      <p className="text-muted-foreground">
        {t(
          'Sign in with the email you gave the academy to see classes and scores. Your signed contract is there too.',
          '아카데미에 등록한 이메일로 로그인하면 수업과 점수를 볼 수 있어요. 서명한 계약서도 앱에 있어요.',
        )}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href={APP_STORE_URL} target="_blank" rel="noreferrer">
            App Store
          </a>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer">
            Google Play
          </a>
        </Button>
      </div>
    </div>
  )
}

/** Opened from the phone app (`?from=app`, its in-app browser): once signed, back to the app rather than to the stores. */
function BackToApp() {
  const t = useT()
  return (
    <div className="mt-5 flex items-start gap-2 rounded-xl border p-4 text-sm" data-testid="back-to-app">
      <LuSmartphone className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="text-muted-foreground">{t('You can close this page now: the app opens by itself.', '이제 이 화면을 닫으면 앱이 바로 열려요.')}</p>
    </div>
  )
}

export function SignContractPage() {
  const { token = '' } = useParams()
  const [searchParams] = useSearchParams()
  const fromApp = searchParams.get('from') === 'app'
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [failure, setFailure] = useState<'busy' | 'network' | null>(null)
  const [signed, setSigned] = useState<Signed | null>(null)
  const [attempt, setAttempt] = useState(0)
  const lang = useLang()
  const t = useT()

  useEffect(() => {
    document.title = lang === 'ko' ? '등록 계약서' : 'Enrollment contract'
  }, [lang])

  useEffect(() => {
    let alive = true
    getContract({ token })
      .then((r) => alive && setLoaded(r.data))
      .catch((e: { code?: string }) => alive && setFailure(e?.code === 'functions/resource-exhausted' ? 'busy' : 'network'))
    return () => {
      alive = false
    }
  }, [token, attempt])

  if (signed && loaded && loaded.state === 'ready') {
    return (
      <Shell>
        <Card>
          <div className="flex flex-col items-center text-center">
            <LuCircleCheck className="size-10 text-emerald-600" aria-hidden />
            <h1 className="mt-3 text-xl font-semibold tracking-tight">{t(`Thank you, ${signed.name.split(' ')[0]}`, `${signed.name.split(' ')[0]}님, 감사합니다`)}</h1>
            <p className="mt-2 text-sm text-muted-foreground" data-testid="signed-copy-note">
              {lang === 'ko' ? (
                <>
                  {loaded.firstName} 학생의 등록 계약서에 서명했어요. 아카데미가 계약서를 보관해요.{' '}
                  {signed.emailedTo.length ? (
                    <>
                      내 사본은 <span className="font-medium [overflow-wrap:anywhere] text-foreground">{signed.emailedTo.join(', ')}</span> 주소로 보냈어요. 지금 다운로드할까요?
                    </>
                  ) : (
                    '내 사본도 다운로드할까요?'
                  )}
                </>
              ) : (
                <>
                  {loaded.firstName}’s enrollment contract is signed, and the academy has its copy.{' '}
                  {signed.emailedTo.length ? (
                    <>
                      We’ve emailed yours to <span className="font-medium [overflow-wrap:anywhere] text-foreground">{signed.emailedTo.join(', ')}</span>. Would you like to download it too?
                    </>
                  ) : (
                    'Would you like to download yours?'
                  )}
                </>
              )}
            </p>
          </div>
          <div className="mt-6">
            <CopyButton token={token} until={signed.copyUntil} academy={loaded.academy} />
          </div>
          {fromApp ? <BackToApp /> : <GetTheApp />}
          <Contact academy={loaded.academy} lead={t('Questions? Contact the academy:', '궁금한 점은 아카데미에 문의해 주세요.')} />
        </Card>
      </Shell>
    )
  }
  if (failure) {
    return (
      <Notice title={failure === 'busy' ? t('Too many tries just now', '시도가 너무 많았어요') : t('The contract didn’t load', '계약서를 불러오지 못했어요')} academy={null}>
        <p>{failure === 'busy' ? t('Please wait a few minutes, then try again.', '몇 분 뒤에 다시 시도해 주세요.') : t('Check your connection, then try again.', '인터넷 연결을 확인하고 다시 시도해 주세요.')}</p>
        <Button
          variant="outline"
          onClick={() => {
            setFailure(null)
            setAttempt((n) => n + 1)
          }}
        >
          <LuRotateCw /> {t('Try again', '다시 시도')}
        </Button>
      </Notice>
    )
  }
  if (!loaded) {
    return (
      <Shell>
        <Card>
          <div className="flex flex-col items-center gap-3 py-6 text-sm text-muted-foreground">
            <Spinner className="size-6" />
            {t('Opening the contract…', '계약서를 여는 중…')}
          </div>
        </Card>
      </Shell>
    )
  }
  switch (loaded.state) {
    case 'invalid':
      return (
        <Notice title={t('This link doesn’t work', '열 수 없는 링크예요')} academy={loaded.academy} lead={t('Contact the academy:', '아카데미 연락처')}>
          <p>{t('Check that you opened the whole link from the message. If it still doesn’t work, ask the academy for a new one.', '메시지의 링크 전체를 열었는지 확인해 주세요. 그래도 안 되면 아카데미에 새 링크를 요청해 주세요.')}</p>
        </Notice>
      )
    case 'canceled':
      return (
        <Notice title={t('This contract was withdrawn', '철회된 계약서예요')} academy={loaded.academy} lead={t('Contact the academy:', '아카데미 연락처')}>
          <p>
            {t(
              `The academy withdrew this enrollment contract for ${loaded.firstName}, so it can’t be signed any more. If they changed it, they’ll send you the new one.`,
              `아카데미가 ${loaded.firstName} 학생의 등록 계약서를 철회해서 더 이상 서명할 수 없어요. 계약서가 바뀌었다면 새 계약서를 보내 드려요.`,
            )}
          </p>
        </Notice>
      )
    case 'signed':
      return (
        <Notice title={t('This contract is already signed', '이미 서명한 계약서예요')} academy={loaded.academy}>
          <p>
            {t(
              `${loaded.signerName || 'Someone'} signed ${loaded.firstName}’s enrollment contract on ${longDate(loaded.signedAt, loaded.academy)}. A contract is signed only once.`,
              `${longDate(loaded.signedAt, loaded.academy, 'ko')}에 ${loaded.signerName ? `${loaded.signerName}님이` : '보호자가'} ${loaded.firstName} 학생의 등록 계약서에 서명했어요. 계약서는 한 번만 서명할 수 있어요.`,
            )}
          </p>
          <CopyButton token={token} until={loaded.copyUntil} academy={loaded.academy} />
        </Notice>
      )
    default:
      return <SignForm token={token} loaded={loaded} onSigned={setSigned} />
  }
}

/** Signed here: the signer's name, until when the link downloads the copy, and where it was emailed. */
type Signed = { name: string; copyUntil: number; emailedTo: string[] }

function SignForm({ token, loaded, onSigned }: { token: string; loaded: Extract<Loaded, { state: 'ready' }>; onSigned: (s: Signed) => void }) {
  const now = useNow()
  const lang = useLang()
  const t = useT()
  // The family reads `read.doc` (Korean when translated); the values follow the English, which has the same IDs.
  const read = useContractRead(lang, loaded.contract.text, loaded.contract.ko)
  const doc = read.en
  const initial = useMemo(() => ({ ...prefillValues(doc, { studentName: loaded.studentName }), ...presetValues(doc, loaded.preset ?? {}) }), [doc, loaded.studentName, loaded.preset])
  const choice = pricedChoice(doc)
  const suggested = choice && typeof loaded.preset?.[choice.id] === 'string' ? (loaded.preset[choice.id] as string) : null

  async function onSign(request: ContractSignRequest): Promise<SignOutcome> {
    try {
      const r = (await sign({ token, ...request })).data
      onSigned({ name: request.name ?? '', copyUntil: r.copyUntil, emailedTo: r.emailedTo ?? [] })
      window.scrollTo({ top: 0 })
    } catch (err) {
      const f = err as { code?: string; details?: { errors?: Record<string, string>; state?: string } }
      if (f.details?.errors) return { errors: f.details.errors }
      if (f.code === 'functions/failed-precondition' || f.code === 'functions/not-found')
        return { problem: t('This contract can’t be signed any more. Reload the page to see why.', '이 계약서는 이제 서명할 수 없어요. 페이지를 새로고침하면 이유를 볼 수 있어요.') }
      if (f.code === 'functions/resource-exhausted') return { problem: t('Too many tries just now. Please wait a few minutes, then sign again.', '시도가 너무 많았어요. 몇 분 뒤에 다시 서명해 주세요.') }
      return { problem: t('The contract couldn’t be signed just now. Check your connection and try again.', '지금은 계약서에 서명하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.') }
    }
  }

  return (
    <Shell wide>
      <Card>
        <h1 className="text-center text-2xl font-semibold tracking-tight text-balance">{t(`Enrollment contract for ${loaded.firstName}`, `${loaded.firstName} 학생 등록 계약서`)}</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {t(
            `${loaded.academy.name} sent you this contract. Please read it, check the program, fill it in and sign at the bottom of this page. It takes a few minutes.`,
            `${loaded.academy.name}에서 이 계약서를 보냈어요. 계약서를 읽고 프로그램을 확인한 뒤, 빈칸을 채우고 이 페이지 맨 아래에 서명해 주세요. 몇 분이면 끝나요.`,
          )}
        </p>
      </Card>

      <ContractLanguageNote translated={read.translated} original={read.original} onOriginal={read.setOriginal} />

      <ContractSigning
        doc={read.doc}
        studentFirst={loaded.firstName}
        initial={initial}
        today={dateKeyOf(now, loaded.academy.timezone || 'America/New_York')}
        onSign={onSign}
        suggested={suggested}
        academySigner={loaded.academySigner}
        note={
          lang === 'ko' ? (
            <>
              서명하면 입력한 내용과 서명이 담긴 계약서 PDF가 만들어져요. 이름, 날짜와 시간, 인터넷 주소(IP), 브라우저를 기록한 페이지도 함께 들어가요.{' '}
              {read.translated ? '영어 원문 뒤에는 읽은 한국어 번역도 들어가요. ' : ''}
              아카데미가 보관하고, {loaded.emailsCopy ? '내 사본은 위에 적은 이메일 주소로 받고 다운로드할 수도 있어요.' : '내 사본은 다운로드할 수 있어요.'}
            </>
          ) : (
            <>
              Signing makes a PDF of this contract as you filled it in, with your signature and a page recording your name, the date and time, your internet address and your browser. The academy keeps it,{' '}
              {loaded.emailsCopy ? 'and you get your copy by email, at the address you give above, and can download it.' : 'and you can download your copy.'}
            </>
          )
        }
      />

      <Contact academy={loaded.academy} lead={t('Questions about the contract? Contact the academy:', '계약서가 궁금하면 아카데미에 문의해 주세요.')} />
    </Shell>
  )
}
