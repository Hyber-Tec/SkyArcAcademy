import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useEffect, useMemo, useRef } from 'react'
import { LuArrowLeft, LuArrowRight, LuCalendarDays, LuCheck, LuCircleAlert, LuLoaderCircle, LuMapPin, LuSend, LuShieldCheck, LuX } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useSiteData } from '@/site/data'
import { ACADEMY, HOME, type L, TRIAL, l } from '@/site/kit/content'
import { EASE_OUT, useReduced } from '@/site/kit/motion'
import { useSite } from '@/site/kit/site'
import { T } from '../i18n'
import type { ErrorCode, Step, Wizard, WizardForm } from '../wizard-state'
import { crmLang } from './blocks'
import { ChoiceCards, Field, Segmented, inputClass, selectTriggerClass } from './fields'

/**
 * Requesting Trial One: the days that suit the family, the athlete and the parent, a last look, then it's sent to the
 * academy (the CRM's Website page, and an email to the office). The same screens run in the trial drawer (any "Book a
 * trial" button) and on the trial page.
 */
const errorText = (code: ErrorCode | undefined): L | null =>
  code ? (code === 'email' ? TRIAL.errors.email : code === 'consent' ? TRIAL.errors.consent : code === 'days' ? T.daysError : TRIAL.errors.required) : null

/** Weekdays to offer when the Website page has no hours yet (the office reads the English). */
const WEEKDAYS: L[] = [
  l('Monday', '월요일'),
  l('Tuesday', '화요일'),
  l('Wednesday', '수요일'),
  l('Thursday', '목요일'),
  l('Friday', '금요일'),
  l('Saturday', '토요일'),
  l('Sunday', '일요일'),
]

/** The day choices: the hours the website shows, or the weekdays. `value` is what the office reads. */
function useDayOptions(): { value: string; label: string; detail: string | null; note: string | null }[] {
  const { t } = useSite()
  const { content } = useSiteData()
  return useMemo(
    () =>
      content.hours.length
        ? content.hours.map((h) => ({ value: `${h.days} · ${h.time}`, label: h.days, detail: h.time, note: h.note || null }))
        : WEEKDAYS.map((d) => ({ value: d.en, label: t(d), detail: null, note: null })),
    [content.hours, t],
  )
}

export function TrialWizard({ wizard, variant, onClose, title }: { wizard: Wizard; variant: 'drawer' | 'card'; onClose?: () => void; title?: string }) {
  const { t, lang } = useSite()
  const { state, dispatch } = wizard
  const reduce = useReduced()
  const body = useRef<HTMLDivElement>(null)
  const steps: Step[] = ['time', 'details', 'review']
  const stepLabels: Record<Step, L> = { time: T.stepTime, details: T.stepDetails, review: T.stepReview, done: T.done }
  const index = state.step === 'done' ? steps.length : steps.indexOf(state.step)

  // Each step starts at its top.
  useEffect(() => {
    body.current?.scrollTo({ top: 0 })
  }, [state.step])

  const go = (step: Step) => dispatch({ type: 'step', step })
  const focusError = () => requestAnimationFrame(() => body.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  const next = () => {
    if (state.step === 'time') {
      if (wizard.checkDays()) go('details')
      return
    }
    if (state.step === 'details') {
      if (wizard.checkDetails()) go('review')
      else focusError()
      return
    }
    if (state.step === 'review') void wizard.send()
  }
  const back = () => {
    if (state.step === 'details') go('time')
    if (state.step === 'review') go('details')
  }

  const kindInfo = TRIAL.kinds.one
  const heading = title ?? t(T.wizardTitle)
  const drawer = variant === 'drawer'

  return (
    <div className={cn('flex min-h-0 min-w-0 flex-col', drawer ? 'h-full' : 'rounded-[28px] border border-line bg-white shadow-soft')}>
      {/* Header: what's being requested, and where in the steps */}
      <div className={cn('shrink-0 border-b border-line px-5 pt-5 pb-4 sm:px-7', drawer && 'pt-6')}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[12px] font-medium tracking-[0.14em] text-stone uppercase">{t(kindInfo.name)}</p>
            <h2 className="mt-1 text-[22px] leading-tight font-semibold tracking-tight text-ink">{state.step === 'done' ? t(T.sentTitle) : heading}</h2>
            <p className="mt-1 text-[13.5px] text-stone">{t(kindInfo.summary)}</p>
          </div>
          {onClose ? (
            <button type="button" onClick={onClose} aria-label={t(T.close)} className="-mt-1 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-stone transition hover:bg-warm hover:text-ink focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:outline-none">
              <LuX className="size-5" />
            </button>
          ) : null}
        </div>
        {state.step !== 'done' ? (
          <ol className="mt-4 flex items-center gap-2" aria-label={t(T.step)}>
            {steps.map((s, i) => (
              <li key={s} className="flex flex-1 flex-col gap-1.5" aria-current={i === index ? 'step' : undefined}>
                <span className={cn('h-1 rounded-full transition-colors duration-500', i <= index ? 'bg-ink' : 'bg-line')} />
                <span className={cn('text-[12px] font-medium', i === index ? 'text-ink' : 'text-stone')}>
                  {i + 1}. {t(stepLabels[s])}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      {/* Body */}
      <div ref={body} className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7', !drawer && 'max-h-none')}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={state.step}
            initial={reduce ? false : { opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: -10 }}
            transition={{ duration: 0.26, ease: EASE_OUT }}
          >
            {state.step === 'time' ? <DaysStep wizard={wizard} /> : null}
            {state.step === 'details' ? <DetailsStep wizard={wizard} /> : null}
            {state.step === 'review' ? <ReviewStep wizard={wizard} go={go} /> : null}
            {state.step === 'done' ? <DoneStep wizard={wizard} /> : null}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer: the step's buttons */}
      <div className={cn('shrink-0 border-t border-line bg-white px-5 py-4 sm:px-7', drawer ? 'pb-[max(1rem,env(safe-area-inset-bottom))]' : 'rounded-b-[28px]')}>
        {state.step === 'done' ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" className="h-12 rounded-full px-5 text-[15px]" onClick={() => dispatch({ type: 'reset', language: lang, keepParent: true })}>
              {t(T.another)}
            </Button>
            {onClose ? (
              <Button type="button" className="h-12 rounded-full bg-ink px-7 text-[15px] text-white hover:bg-ink/85" onClick={onClose}>
                {t(T.done)}
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            {state.step === 'review' && state.sendError ? (
              <p role="alert" className="mb-3 flex items-start gap-2 rounded-xl bg-red/5 px-3.5 py-2.5 text-[13.5px] font-medium text-red-text">
                <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {t(state.sendError === 'limited' ? T.sendLimited : T.sendFailed)}
              </p>
            ) : null}
            <div className="flex items-center gap-3">
              {state.step !== 'time' ? (
                <Button type="button" variant="ghost" onClick={back} className="h-12 rounded-full px-4 text-[15px]">
                  <LuArrowLeft className="size-4" /> {t(TRIAL.buttons.back)}
                </Button>
              ) : (
                <div className="min-w-0 flex-1 text-[13.5px] leading-snug" aria-live="polite">
                  {state.days.length ? (
                    <>
                      <span className="block text-stone">{t(T.daysChosen)}</span>
                      <span className="block truncate font-semibold text-ink" lang={crmLang}>
                        {state.days.map((d) => d.split(' · ')[0]).join(', ')}
                      </span>
                    </>
                  ) : (
                    <span className={cn(state.errors.days ? 'font-medium text-red-text' : 'text-stone')}>{t(state.errors.days ? T.daysError : T.daysNone)}</span>
                  )}
                </div>
              )}
              <Button
                type="button"
                onClick={next}
                disabled={state.submitting}
                className={cn('ml-auto h-12 rounded-full px-6 text-[15px] font-semibold text-white disabled:opacity-40', state.step === 'review' ? 'bg-red hover:bg-red-deep' : 'bg-ink hover:bg-ink/85')}
              >
                {state.submitting ? (
                  <>
                    <LuLoaderCircle className="size-4 animate-spin" /> {t(T.sending)}
                  </>
                ) : state.step === 'review' ? (
                  <>
                    {t(T.send)} <LuSend className="size-4" />
                  </>
                ) : (
                  <>
                    {t(TRIAL.buttons.continue)} <LuArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ step 1: the days */

function DaysStep({ wizard }: { wizard: Wizard }) {
  const { t } = useSite()
  const { state, dispatch } = wizard
  const options = useDayOptions()
  const { content } = useSiteData()
  return (
    <section aria-labelledby="wiz-days" className="space-y-4">
      <div>
        <h3 id="wiz-days" className="text-[15px] font-semibold text-ink">
          {t(T.daysTitle)}
        </h3>
        <p className="mt-1 text-[13.5px] leading-relaxed text-stone">{t(T.daysHint)}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-labelledby="wiz-days" lang={content.hours.length ? crmLang : undefined}>
        {options.map((o) => {
          const on = state.days.includes(o.value)
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => dispatch({ type: 'day', day: o.value })}
              className={cn(
                'relative flex min-h-[60px] flex-col items-start justify-center rounded-2xl border px-4 py-2.5 pr-10 text-left transition focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:outline-none',
                on ? 'border-ink bg-white shadow-[0_0_0_1px_#0a0a0a]' : 'border-line bg-white hover:border-ink/40',
                state.errors.days && !on && 'border-red-text/50',
              )}
            >
              <span className="text-[15.5px] font-semibold text-ink">{o.label}</span>
              {o.detail ? <span className="text-[13px] text-stone tabular-nums">{o.detail}</span> : null}
              {o.note ? <span className="text-[12px] text-stone/90">{o.note}</span> : null}
              <span
                className={cn('absolute top-1/2 right-3.5 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-full border transition', on ? 'border-ink bg-ink text-white' : 'border-ink/25 bg-white text-transparent')}
                aria-hidden="true"
              >
                <LuCheck className="size-3" />
              </span>
            </button>
          )
        })}
      </div>
      {state.errors.days ? (
        <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-red-text" role="alert">
          <LuCircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {t(T.daysError)}
        </p>
      ) : null}
    </section>
  )
}

/* ------------------------------------------------------------------ step 2: the details */

function DetailsStep({ wizard }: { wizard: Wizard }) {
  const { t } = useSite()
  const { state, dispatch } = wizard
  const f = state.form
  const err = (k: keyof WizardForm) => {
    const e = errorText(state.errors[k])
    return e ? t(e) : null
  }
  const set = (key: keyof WizardForm) => (value: string | boolean) => dispatch({ type: 'field', key, value })
  const inv = (k: keyof WizardForm) => (state.errors[k] ? true : undefined)
  return (
    <div className="space-y-7">
      <fieldset className="space-y-4">
        <legend className="mb-1 text-[15px] font-semibold text-ink">{t(T.athlete)}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="wiz-first" label={t(TRIAL.fields.firstName)} error={err('firstName')}>
            <Input id="wiz-first" autoComplete="off" value={f.firstName} onChange={(e) => set('firstName')(e.target.value)} aria-invalid={inv('firstName')} aria-describedby={inv('firstName') && 'wiz-first-error'} className={inputClass} />
          </Field>
          <Field id="wiz-last" label={t(TRIAL.fields.lastName)} error={err('lastName')}>
            <Input id="wiz-last" autoComplete="off" value={f.lastName} onChange={(e) => set('lastName')(e.target.value)} aria-invalid={inv('lastName')} aria-describedby={inv('lastName') && 'wiz-last-error'} className={inputClass} />
          </Field>
        </div>
        <Field id="wiz-grade" label={t(TRIAL.fields.grade)} error={err('grade')} className="sm:max-w-[50%] sm:pr-2">
          <Select value={f.grade} onValueChange={set('grade')}>
            <SelectTrigger id="wiz-grade" aria-invalid={inv('grade')} className={selectTriggerClass}>
              <SelectValue placeholder={t(TRIAL.fields.grade)} />
            </SelectTrigger>
            <SelectContent position="popper" className="z-[95] max-h-72">
              {TRIAL.grades.map((g) => (
                <SelectItem key={g.id} value={g.id} className="min-h-10 text-[15px]">
                  {t(g.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid gap-1.5">
          <span id="wiz-exp" className="text-[13px] font-medium text-ink">
            {t(TRIAL.fields.experience)}
          </span>
          <ChoiceCards label={t(TRIAL.fields.experience)} value={f.experience} onChange={set('experience')} invalid={!!state.errors.experience} options={TRIAL.experience.map((x) => ({ value: x.id, label: t(x.label) }))} />
          {err('experience') ? <p className="text-[12.5px] font-medium text-red-text">{err('experience')}</p> : null}
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-1 text-[15px] font-semibold text-ink">{t(T.parent)}</legend>
        <Field id="wiz-parent" label={t(TRIAL.fields.parentName)} error={err('parentName')}>
          <Input id="wiz-parent" autoComplete="name" value={f.parentName} onChange={(e) => set('parentName')(e.target.value)} aria-invalid={inv('parentName')} className={inputClass} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="wiz-email" label={t(TRIAL.fields.email)} error={err('email')}>
            <Input id="wiz-email" type="email" inputMode="email" autoComplete="email" value={f.email} onChange={(e) => set('email')(e.target.value)} aria-invalid={inv('email')} className={inputClass} />
          </Field>
          <Field id="wiz-phone" label={t(TRIAL.fields.phone)} error={err('phone')}>
            <Input id="wiz-phone" type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={(e) => set('phone')(e.target.value)} aria-invalid={inv('phone')} className={inputClass} />
          </Field>
        </div>
        <div className="grid gap-1.5">
          <span className="text-[13px] font-medium text-ink">{t(TRIAL.fields.language)}</span>
          <Segmented
            label={t(TRIAL.fields.language)}
            value={f.language}
            onChange={(v) => set('language')(v)}
            options={[
              { value: 'en', label: 'English' },
              { value: 'ko', label: '한국어' },
            ]}
            className="w-full sm:w-72"
          />
        </div>
        <Field id="wiz-notes" label={t(TRIAL.fields.notes)}>
          <Textarea id="wiz-notes" value={f.notes} onChange={(e) => set('notes')(e.target.value)} rows={3} maxLength={4000} className="min-h-24 rounded-xl border-line bg-white px-3.5 py-3 text-[15px] md:text-[15px] focus-visible:border-ink focus-visible:ring-ink/10" />
        </Field>
        {/* People never see this field; bots fill it in, and the server drops what they send. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor="wiz-website">Website</label>
          <input id="wiz-website" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set('website')(e.target.value)} />
        </div>
        <Consent wizard={wizard} />
      </fieldset>
    </div>
  )
}

function Consent({ wizard }: { wizard: Wizard }) {
  const { t } = useSite()
  const { state, dispatch } = wizard
  return (
    <div className="grid gap-1.5">
      <label htmlFor="wiz-consent" className={cn('flex cursor-pointer items-start gap-3 rounded-xl border bg-warm/60 px-4 py-3.5', state.errors.consent ? 'border-red-text/60' : 'border-line')}>
        <Checkbox
          id="wiz-consent"
          checked={state.form.consent}
          onCheckedChange={(v) => dispatch({ type: 'field', key: 'consent', value: v === true })}
          aria-invalid={state.errors.consent ? true : undefined}
          className="mt-0.5 size-5 rounded-[6px] border-ink/35 data-checked:border-ink data-checked:bg-ink"
        />
        <span className="text-[14px] leading-snug text-ink">
          <ConsentText />
        </span>
      </label>
      {state.errors.consent ? <p className="text-[12.5px] font-medium text-red-text">{t(TRIAL.errors.consent)}</p> : null}
    </div>
  )
}

/** "I agree to the privacy policy." with "privacy policy" as the link to it. */
function ConsentText() {
  const { t } = useSite()
  const text = t(TRIAL.fields.consent)
  const link = t(TRIAL.fields.privacy)
  const at = text.toLowerCase().indexOf(link.toLowerCase())
  const a = (label: string) => (
    <a href={ACADEMY.privacyUrl} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4" onClick={(e) => e.stopPropagation()}>
      {label}
    </a>
  )
  if (at < 0)
    return (
      <>
        {text} {a(link)}
      </>
    )
  return (
    <>
      {text.slice(0, at)}
      {a(text.slice(at, at + link.length))}
      {text.slice(at + link.length)}
    </>
  )
}

/* ------------------------------------------------------------------ step 3: review */

function Row({ label, children, onEdit }: { label: string; children: ReactNode; onEdit?: () => void }) {
  const { t } = useSite()
  return (
    <div className="flex items-start gap-4 border-b border-line py-3.5 last:border-b-0">
      <dt className="w-24 shrink-0 pt-px text-[13px] text-stone">{label}</dt>
      <dd className="min-w-0 flex-1 text-[14.5px] leading-snug text-ink">{children}</dd>
      {onEdit ? (
        <button type="button" onClick={onEdit} className="-my-2 inline-flex min-h-10 shrink-0 items-center px-1 text-[13px] font-medium text-ink underline-offset-4 hover:underline">
          {t(T.edit)}
        </button>
      ) : null}
    </div>
  )
}

function ReviewStep({ wizard, go }: { wizard: Wizard; go: (s: Step) => void }) {
  const { t } = useSite()
  const { state } = wizard
  const f = state.form
  const grade = TRIAL.grades.find((g) => g.id === f.grade)
  const exp = TRIAL.experience.find((x) => x.id === f.experience)
  return (
    <div className="space-y-6">
      <dl className="rounded-2xl border border-line px-4 sm:px-5">
        <Row label={t(T.when)} onEdit={() => go('time')}>
          <ul className="space-y-0.5" lang={crmLang}>
            {state.days.map((d) => (
              <li key={d} className="font-semibold">
                {d}
              </li>
            ))}
          </ul>
        </Row>
        <Row label={t(T.where)}>
          {ACADEMY.street}
          <br />
          {ACADEMY.city}
        </Row>
        <Row label={t(T.athlete)} onEdit={() => go('details')}>
          <span className="font-semibold">
            {f.firstName} {f.lastName}
          </span>
          <br />
          <span className="text-stone">
            {grade ? t(grade.label) : ''}
            {exp ? ` · ${t(exp.label)}` : ''}
          </span>
        </Row>
        <Row label={t(T.parent)} onEdit={() => go('details')}>
          <span className="font-semibold">{f.parentName}</span>
          <br />
          <span className="[overflow-wrap:anywhere] text-stone">{f.email}</span>
          <br />
          <span className="text-stone">
            {f.phone} · {t(T.reply)}: {f.language === 'ko' ? '한국어' : 'English'}
          </span>
        </Row>
        {f.notes.trim() ? (
          <Row label={t(T.notesLabel)} onEdit={() => go('details')}>
            <span className="whitespace-pre-line">{f.notes.trim()}</span>
          </Row>
        ) : null}
      </dl>

      <div className="rounded-2xl bg-warm p-4 sm:p-5">
        <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
          <LuShieldCheck className="size-4" aria-hidden="true" />
          {t(HOME.trial.bringTitle)}
        </p>
        <ul className="mt-2.5 space-y-1.5 text-[13.5px] text-ink/80">
          <li className="flex gap-2">
            <LuCheck className="mt-0.5 size-3.5 shrink-0 text-ink" aria-hidden="true" /> {t(T.noShooting)}
          </li>
          {HOME.trial.bring.map((b) => (
            <li key={b.en} className="flex gap-2">
              <LuCheck className="mt-0.5 size-3.5 shrink-0 text-ink" aria-hidden="true" /> {t(b)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ done */

function DoneStep({ wizard }: { wizard: Wizard }) {
  const { t } = useSite()
  const reduce = useReduced()
  const { state } = wizard
  return (
    <div className="space-y-6 pb-2" aria-live="polite">
      <div className="flex flex-col items-center pt-2 text-center">
        <motion.span
          initial={reduce ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="relative inline-flex size-16 items-center justify-center rounded-full bg-ink text-white"
        >
          <LuCheck className="size-7" strokeWidth={2.5} />
          <span className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full border-2 border-white bg-dot" aria-hidden="true" />
        </motion.span>
        <p className="mt-4 text-[15px] text-stone">
          {t(T.sentText)} <span className="inline-block font-semibold [overflow-wrap:anywhere] text-ink">{state.sentTo}</span>
        </p>
      </div>

      <div className="rounded-2xl border border-line">
        <div className="space-y-2 px-4 py-4 sm:px-5">
          <p className="flex items-center gap-2 text-[16px] font-semibold text-ink">
            <LuCalendarDays className="size-4" aria-hidden="true" /> {t(TRIAL.kinds.one.name)}
          </p>
          <ul className="space-y-0.5 pl-6 text-[14px] text-stone" lang={crmLang}>
            {state.days.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          <p className="flex items-center gap-2 text-[14px] text-stone">
            <LuMapPin className="size-4" aria-hidden="true" /> {ACADEMY.street}, {ACADEMY.city}
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-warm p-4 sm:p-5">
        <p className="text-[14px] font-semibold text-ink">{t(TRIAL.done.nextTitle)}</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink/80">{t(T.sentNext)}</p>
      </div>
    </div>
  )
}
