import { type FormEvent, useEffect, useRef, useState } from 'react'
import { LuCheck, LuCircleAlert, LuCrosshair, LuGraduationCap, LuLoaderCircle, LuSend, LuShieldCheck, LuSmartphone, LuTarget } from 'react-icons/lu'
import { type WebsiteMessageInput, isEmailAddress } from '@shared/website/messages'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { FRANCHISE, TRIAL } from '@/site/kit/content'
import { Reveal } from '@/site/kit/motion'
import { useSite } from '@/site/kit/site'
import { CallError, callFunction } from '@/site/rest'
import { Container, btnInk, btnOutline } from '../components/bits'
import { PageHero } from '../components/blocks'
import { Field, inputClass } from '../components/fields'
import { T } from '../i18n'

type Key = 'name' | 'email' | 'phone' | 'area' | 'message'

const ICONS = [LuTarget, LuShieldCheck, LuGraduationCap, LuCrosshair, LuSmartphone]

/**
 * Franchise opportunity (the owner's idea, 2026-11-10): for people who'd like to open an academy on Sky Arc's model.
 * What the academy has built, in the words the rest of the site uses, and a form whose message reaches the academy as
 * a website message ("Franchise opportunity" in Settings → Website → Messages, and by email). No prices.
 */
export function Franchise() {
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

  return (
    <>
      <PageHero kicker={t(FRANCHISE.eyebrow)} title={t(FRANCHISE.title)} text={t(FRANCHISE.text)} />

      <section className="py-14 sm:py-20" aria-labelledby="franchise-built">
        <Container>
          <Reveal>
            <h2 id="franchise-built" className="text-[28px] font-semibold tracking-tight text-ink sm:text-[34px]">
              {t(FRANCHISE.builtTitle)}
            </h2>
          </Reveal>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FRANCHISE.built.map((b, i) => {
              const Icon = ICONS[i % ICONS.length]
              return (
                // The last (the app, the longest) takes two columns, so the rows end even.
                <li key={b.title} className={cn('h-full', i === FRANCHISE.built.length - 1 && 'sm:col-span-2')}>
                  <Reveal delay={0.04 * i} className="h-full rounded-[24px] border border-line bg-white p-6 shadow-soft">
                    <span className="inline-flex size-11 items-center justify-center rounded-full bg-ink text-white">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-4 text-[18px] font-semibold tracking-tight text-ink">{t(b.title)}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-pretty text-stone">{t(b.text)}</p>
                  </Reveal>
                </li>
              )
            })}
          </ul>
        </Container>
      </section>

      <section className="pb-20 sm:pb-24" aria-labelledby="franchise-start">
        <Container className="grid gap-6 lg:grid-cols-[1fr_1.35fr] lg:gap-10">
          <Reveal className="h-full">
            <aside className="h-full rounded-[28px] bg-warm p-6 sm:p-8">
              <h2 id="franchise-start" className="text-[24px] font-semibold tracking-tight text-ink">
                {t(FRANCHISE.stepsTitle)}
              </h2>
              <ol className="mt-5 grid gap-4">
                {FRANCHISE.steps.map((s, i) => (
                  <li key={s} className="flex items-start gap-3 text-[16px] leading-relaxed text-ink">
                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-[14px] font-semibold text-white tabular-nums">{i + 1}</span>
                    <span className="pt-0.5">{t(s)}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-8 border-t border-ink/10 pt-5 text-[13px] leading-relaxed text-stone">{t(FRANCHISE.note)}</p>
            </aside>
          </Reveal>

          <Reveal delay={0.08} className="h-full">
            {state === 'sent' ? (
              <div id="franchise-result" className="flex h-full flex-col items-center justify-center rounded-[28px] border border-line bg-white p-8 text-center shadow-soft sm:p-12" role="status" aria-live="polite">
                <span className="mx-auto inline-flex size-16 items-center justify-center rounded-full bg-ink text-white">
                  <LuCheck className="size-7" strokeWidth={2.5} aria-hidden="true" />
                </span>
                <h2 className="mt-6 text-[30px] font-semibold tracking-tight text-ink">{t(FRANCHISE.sent.title)}</h2>
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
            ) : (
              <form ref={form} onSubmit={submit} noValidate className="relative h-full rounded-[28px] border border-line bg-white p-6 shadow-soft sm:p-9" data-testid="franchise-form">
                <div className="grid gap-5 sm:grid-cols-2">
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
                  <Field id="f-message" label={t(FRANCHISE.fields.message)} error={err('message')} className="sm:col-span-2">
                    <Textarea
                      id="f-message"
                      rows={5}
                      value={v.message}
                      placeholder={t(FRANCHISE.fields.messageHint)}
                      onChange={(e) => set('message')(e.target.value)}
                      aria-invalid={inv('message')}
                      className="min-h-36 rounded-xl border-line bg-white px-3.5 py-3 text-[15px] md:text-[15px] focus-visible:border-ink focus-visible:ring-ink/10 aria-invalid:border-red-text"
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
                <div className="mt-8 flex justify-end border-t border-line pt-6">
                  <button type="submit" disabled={state === 'sending'} className={cn(btnInk, 'w-full shrink-0 disabled:opacity-50 sm:w-auto')}>
                    {state === 'sending' ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <LuSend className="size-4" aria-hidden="true" />}
                    {state === 'sending' ? t(FRANCHISE.sending) : t(FRANCHISE.send)}
                  </button>
                </div>
              </form>
            )}
          </Reveal>
        </Container>
      </section>
    </>
  )
}
