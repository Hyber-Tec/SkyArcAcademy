import { useCallback, useReducer } from 'react'
import { type WebsiteMessageInput, checkWebsiteMessage, isEmailAddress } from '@shared/website/messages'
import type { Lang } from '@/site/kit/content'
import { CallError, callFunction } from './rest'

/**
 * The trial request's state, kept outside its screens so the drawer remembers a half-filled request when it's closed
 * and reopened (and the trial page has its own). Booking a time online opens once the academy approves the privacy
 * policy (docs/DECISIONS.md §6, Q15): until then the family says which days suit them, and the office emails back.
 * Errors are codes; the screens word them in the page's language.
 */
export type Step = 'time' | 'details' | 'review' | 'done'
export type ErrorCode = 'required' | 'email' | 'consent' | 'days'

export interface WizardForm {
  firstName: string
  lastName: string
  grade: string
  experience: string
  parentName: string
  email: string
  phone: string
  language: Lang
  notes: string
  consent: boolean
  /** The field people never see; only bots fill it in. */
  website: string
}

export interface WizardState {
  step: Step
  /** The days that suit the family, as the site shows them ("Monday · 4:30–8 PM"). */
  days: string[]
  form: WizardForm
  errors: Partial<Record<keyof WizardForm | 'days', ErrorCode>>
  submitting: boolean
  /** Why the last send failed, if it did. */
  sendError: 'failed' | 'limited' | null
  /** Where the office will reply, once sent. */
  sentTo: string | null
}

const emptyForm = (language: Lang): WizardForm => ({
  firstName: '',
  lastName: '',
  grade: '',
  experience: '',
  parentName: '',
  email: '',
  phone: '',
  language,
  notes: '',
  consent: false,
  website: '',
})

type Action =
  | { type: 'day'; day: string }
  | { type: 'field'; key: keyof WizardForm; value: string | boolean }
  | { type: 'step'; step: Step }
  | { type: 'errors'; errors: WizardState['errors'] }
  | { type: 'submitting'; on: boolean }
  | { type: 'sent'; to: string }
  | { type: 'failed'; why: 'failed' | 'limited' }
  | { type: 'reset'; language: Lang; keepParent?: boolean }

function reducer(s: WizardState, a: Action): WizardState {
  switch (a.type) {
    case 'day': {
      const days = s.days.includes(a.day) ? s.days.filter((d) => d !== a.day) : [...s.days, a.day]
      const errors = { ...s.errors }
      delete errors.days
      return { ...s, days, errors }
    }
    case 'field': {
      const errors = { ...s.errors }
      delete errors[a.key]
      return { ...s, form: { ...s.form, [a.key]: a.value }, errors, sendError: null }
    }
    case 'step':
      return { ...s, step: a.step, sendError: null }
    case 'errors':
      return { ...s, errors: a.errors }
    case 'submitting':
      return { ...s, submitting: a.on, sendError: a.on ? null : s.sendError }
    case 'sent':
      return { ...s, submitting: false, sentTo: a.to, step: 'done' }
    case 'failed':
      return { ...s, submitting: false, sendError: a.why }
    case 'reset': {
      const parent = a.keepParent ? { parentName: s.form.parentName, email: s.form.email, phone: s.form.phone } : {}
      return { ...initial(a.language), form: { ...emptyForm(a.language), ...parent } }
    }
  }
}

function initial(language: Lang): WizardState {
  return { step: 'time', days: [], form: emptyForm(language), errors: {}, submitting: false, sendError: null, sentTo: null }
}

export function useWizard(language: Lang) {
  const [state, dispatch] = useReducer(reducer, language, initial)

  /** The days step's check. */
  const checkDays = useCallback((): boolean => {
    if (state.days.length) return true
    dispatch({ type: 'errors', errors: { days: 'days' } })
    return false
  }, [state.days])

  /** The details step's checks; returns whether it's complete. */
  const checkDetails = useCallback((): boolean => {
    const f = state.form
    const errors: WizardState['errors'] = {}
    if (!f.firstName.trim()) errors.firstName = 'required'
    if (!f.lastName.trim()) errors.lastName = 'required'
    if (!f.grade) errors.grade = 'required'
    if (!f.experience) errors.experience = 'required'
    if (!f.parentName.trim()) errors.parentName = 'required'
    if (!f.phone.trim()) errors.phone = 'required'
    if (!f.email.trim()) errors.email = 'required'
    else if (!isEmailAddress(f.email)) errors.email = 'email'
    if (!f.consent) errors.consent = 'consent'
    dispatch({ type: 'errors', errors })
    return Object.keys(errors).length === 0
  }, [state.form])

  const send = useCallback(async () => {
    const f = state.form
    const input: WebsiteMessageInput = {
      kind: 'trial',
      lang: f.language,
      name: f.parentName,
      email: f.email,
      phone: f.phone,
      message: f.notes,
      athlete: { firstName: f.firstName, lastName: f.lastName, grade: f.grade, experience: f.experience },
      days: state.days,
      consent: f.consent,
      website: f.website,
    }
    const checked = checkWebsiteMessage(input)
    if (!checked.ok) {
      dispatch({ type: 'step', step: checked.errors.days ? 'time' : 'details' })
      return
    }
    dispatch({ type: 'submitting', on: true })
    try {
      await callFunction('websiteMessage', input)
      dispatch({ type: 'sent', to: checked.value.email })
    } catch (e) {
      dispatch({ type: 'failed', why: e instanceof CallError && e.status === 'RESOURCE_EXHAUSTED' ? 'limited' : 'failed' })
    }
  }, [state.form, state.days])

  return { state, dispatch, checkDays, checkDetails, send }
}

export type Wizard = ReturnType<typeof useWizard>
