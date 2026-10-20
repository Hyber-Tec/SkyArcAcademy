import { type FormEvent, useEffect, useRef, useState } from 'react'
import { LuArrowUpRight, LuCheck, LuCircleAlert, LuInstagram, LuLoaderCircle, LuMail, LuMapPin, LuPhone, LuSend } from 'react-icons/lu'
import { type WebsiteMessageInput, isEmailAddress } from '@shared/website/messages'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useSiteData } from '@/site/data'
import { ACADEMY, CONTACT, type Lang, TRIAL, UI, l } from '@/site/kit/content'
import { Reveal } from '@/site/kit/motion'
import { useSite } from '@/site/kit/site'
import { CallError, callFunction } from '@/site/rest'
import { BookButton, Container, TodoNote, btnInk, btnOutline } from '../components/bits'
import { DIRECTIONS_URL, HoursTable, MapEmbed, PageHero, instagramHandle } from '../components/blocks'
import { Field, Segmented, inputClass, selectTriggerClass } from '../components/fields'
import { T } from '../i18n'

type Key = 'name' | 'email' | 'phone' | 'student' | 'topic' | 'message'

const PHONE_TODO = l('Placeholder: the academy’s phone number', '임시: 아카데미 전화번호')
const EMAIL_TODO = l('Placeholder: the academy’s email', '임시: 아카데미 이메일')

export function Contact() {
  const { t, lang, query } = useSite()
  const wanted = new URLSearchParams(query).get('topic')
  const form = useRef<HTMLFormElement>(null)
  const [v, setV] = useState<Record<Key, string>>({ name: '', email: '', phone: '', student: '', topic: CONTACT.topics.some((x) => x.id === wanted) ? (wanted as string) : '', message: '' })
  const [reply, setReply] = useState<Lang>(lang)
  const [errors, setErrors] = useState<Partial<Record<Key, 'required' | 'email'>>>({})
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed' | 'limited'>('idle')
  // The field people never see: only bots fill it in.
  const [website, setWebsite] = useState('')
  const { ready, contact, content } = useSiteData()
  const set = (k: Key) => (value: string) => {
    setV((s) => ({ ...s, [k]: value }))
    setErrors((e) => ({ ...e, [k]: undefined }))
    if (state === 'failed' || state === 'limited') setState('idle')
  }
  const err = (k: Key) => (errors[k] ? t(errors[k] === 'email' ? TRIAL.errors.email : TRIAL.errors.required) : null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (!v.name.trim()) next.name = 'required'
    if (!v.email.trim()) next.email = 'required'
    else if (!isEmailAddress(v.email)) next.email = 'email'
    if (!v.topic) next.topic = 'required'
    if (!v.message.trim()) next.message = 'required'
    setErrors(next)
    if (Object.keys(next).length) {
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setState('sending')
    const input: WebsiteMessageInput = { kind: 'contact', lang: reply, name: v.name, email: v.email, phone: v.phone, topic: v.topic, student: v.student, message: v.message, website }
    try {
      await callFunction('websiteMessage', input)
      setState('sent')
    } catch (e) {
      setState(e instanceof CallError && e.status === 'RESOURCE_EXHAUSTED' ? 'limited' : 'failed')
    }
  }
  const inv = (k: Key) => (errors[k] ? true : undefined)
  useEffect(() => {
    if (state === 'sent') document.getElementById('contact-result')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [state])

  return (
    <>
      <PageHero kicker={t(CONTACT.eyebrow)} title={t(CONTACT.title)} text={t(CONTACT.text)} />
      <section className="py-14 sm:py-20" aria-label={t(UI.contact)}>
        <Container className="grid items-start gap-6 lg:grid-cols-[1.35fr_1fr] lg:gap-10">
          <Reveal>
            {state === 'sent' ? (
              <div id="contact-result" className="rounded-[28px] border border-line bg-white p-8 text-center shadow-soft sm:p-12" role="status" aria-live="polite">
                <span className="mx-auto inline-flex size-16 items-center justify-center rounded-full bg-ink text-white">
                  <LuCheck className="size-7" strokeWidth={2.5} aria-hidden="true" />
                </span>
                <h2 className="mt-6 text-[30px] font-semibold tracking-tight text-ink">{t(CONTACT.sent.title)}</h2>
                <p className="mt-3 text-[16px] text-stone">
                  {t(CONTACT.sent.text)} <span className="font-semibold break-all text-ink">{v.email}</span>
                </p>
                <p className="mt-1 text-[14px] text-stone">{t(CONTACT.response)}</p>
                <button
                  type="button"
                  onClick={() => {
                    setV({ name: v.name, email: v.email, phone: v.phone, student: '', topic: '', message: '' })
                    setState('idle')
                  }}
                  className={cn(btnOutline, 'mt-8')}
                >
                  {t(CONTACT.sent.again)}
                </button>
              </div>
            ) : (
              <form ref={form} onSubmit={submit} noValidate className="relative rounded-[28px] border border-line bg-white p-6 shadow-soft sm:p-9">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id="c-name" label={t(CONTACT.fields.name)} error={err('name')} className="sm:col-span-2">
                    <Input id="c-name" autoComplete="name" value={v.name} onChange={(e) => set('name')(e.target.value)} aria-invalid={inv('name')} className={inputClass} />
                  </Field>
                  <Field id="c-email" label={t(CONTACT.fields.email)} error={err('email')}>
                    <Input id="c-email" type="email" inputMode="email" autoComplete="email" value={v.email} onChange={(e) => set('email')(e.target.value)} aria-invalid={inv('email')} className={inputClass} />
                  </Field>
                  <Field id="c-phone" label={t(CONTACT.fields.phone)}>
                    <Input id="c-phone" type="tel" inputMode="tel" autoComplete="tel" value={v.phone} onChange={(e) => set('phone')(e.target.value)} className={inputClass} />
                  </Field>
                  <Field id="c-student" label={t(CONTACT.fields.student)}>
                    <Input id="c-student" value={v.student} onChange={(e) => set('student')(e.target.value)} className={inputClass} />
                  </Field>
                  <Field id="c-topic" label={t(CONTACT.fields.topic)} error={err('topic')}>
                    <Select value={v.topic} onValueChange={set('topic')}>
                      <SelectTrigger id="c-topic" aria-invalid={inv('topic')} className={selectTriggerClass}>
                        <SelectValue placeholder={t(CONTACT.fields.topic)} />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {CONTACT.topics.map((x) => (
                          <SelectItem key={x.id} value={x.id} className="min-h-10 text-[15px]">
                            {t(x.label)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field id="c-message" label={t(CONTACT.fields.message)} error={err('message')} className="sm:col-span-2">
                    <Textarea
                      id="c-message"
                      rows={5}
                      value={v.message}
                      onChange={(e) => set('message')(e.target.value)}
                      aria-invalid={inv('message')}
                      className="min-h-36 rounded-xl border-line bg-white px-3.5 py-3 text-[15px] md:text-[15px] focus-visible:border-ink focus-visible:ring-ink/10 aria-invalid:border-red-text"
                    />
                  </Field>
                  <div className="grid gap-1.5 sm:col-span-2">
                    <span className="text-[13px] font-medium text-ink">{t(CONTACT.fields.language)}</span>
                    <Segmented
                      label={t(CONTACT.fields.language)}
                      value={reply}
                      onChange={setReply}
                      options={[
                        { value: 'en', label: 'English' },
                        { value: 'ko', label: '한국어' },
                      ]}
                      className="w-full sm:w-72"
                    />
                  </div>
                </div>
                {/* People never see this field; bots fill it in, and the server drops what they send. */}
                <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                  <label htmlFor="c-website">Website</label>
                  <input id="c-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </div>
                {state === 'failed' || state === 'limited' ? (
                  <p role="alert" className="mt-6 flex items-start gap-2 rounded-xl bg-red/5 px-3.5 py-2.5 text-[13.5px] font-medium text-red-text">
                    <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {t(state === 'limited' ? T.sendLimited : T.sendFailed)}
                  </p>
                ) : null}
                <div className="mt-8 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[13px] leading-relaxed text-stone">{t(CONTACT.delivered)}</p>
                  <button type="submit" disabled={state === 'sending'} className={cn(btnInk, 'shrink-0 disabled:opacity-50')}>
                    {state === 'sending' ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <LuSend className="size-4" aria-hidden="true" />}
                    {state === 'sending' ? t(CONTACT.sending) : t(CONTACT.send)}
                  </button>
                </div>
              </form>
            )}
          </Reveal>

          <Reveal delay={0.08} className="lg:sticky lg:top-28">
            <aside className="rounded-[28px] bg-warm p-6 sm:p-8" aria-labelledby="contact-side">
              <h2 id="contact-side" className="text-[20px] font-semibold tracking-tight text-ink">
                {t(T.contactSide)}
              </h2>
              <address className="mt-5 grid gap-3.5 text-[15px] text-ink not-italic">
                {contact.email ? (
                  <a href={`mailto:${contact.email}`} className="flex items-center gap-3 break-all hover:underline">
                    <LuMail className="size-5 shrink-0" aria-hidden="true" /> {contact.email}
                  </a>
                ) : ready ? (
                  <span className="flex items-center gap-3">
                    <LuMail className="size-5 shrink-0" aria-hidden="true" />
                    <TodoNote className="py-1.5">{t(EMAIL_TODO)}</TodoNote>
                  </span>
                ) : null}
                <a href={DIRECTIONS_URL} target="_blank" rel="noreferrer" className="flex items-start gap-3 hover:underline">
                  <LuMapPin className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                  <span>
                    {ACADEMY.street}
                    <br />
                    {ACADEMY.city}
                    <span className="mt-1 flex items-center gap-1 text-[13.5px] font-medium">
                      {t(UI.directions)} <LuArrowUpRight className="size-3.5" aria-hidden="true" />
                    </span>
                  </span>
                </a>
                {content.instagram ? (
                  <a href={content.instagram} target="_blank" rel="noreferrer" className="flex items-center gap-3 hover:underline">
                    <LuInstagram className="size-5 shrink-0" aria-hidden="true" /> {instagramHandle(content.instagram)}
                  </a>
                ) : null}
                {contact.phone ? (
                  <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-3 hover:underline">
                    <LuPhone className="size-5 shrink-0" aria-hidden="true" /> {contact.phone}
                  </a>
                ) : ready ? (
                  <span className="flex items-center gap-3">
                    <LuPhone className="size-5 shrink-0" aria-hidden="true" />
                    <TodoNote className="py-1.5">{t(PHONE_TODO)}</TodoNote>
                  </span>
                ) : null}
              </address>
              {content.hours.length ? (
                <div className="mt-6 rounded-2xl bg-white px-5 py-2">
                  <HoursTable compact />
                </div>
              ) : null}
              <p className="mt-5 text-[13.5px] text-stone">{t(CONTACT.response)}</p>
              <div className="mt-6 border-t border-ink/10 pt-6">
                <p className="text-[15px] font-medium text-ink">{t(T.bookDirect)}</p>
                <BookButton className="mt-4 w-full sm:w-auto" />
              </div>
            </aside>
          </Reveal>
        </Container>
      </section>
      <section className="pb-20 sm:pb-24" aria-labelledby="find-us">
        <Container>
          <h2 id="find-us" className="sr-only">
            {t(T.findUs)}
          </h2>
          <Reveal>
            <MapEmbed className="h-[420px] sm:h-[480px]" />
          </Reveal>
        </Container>
      </section>
    </>
  )
}
