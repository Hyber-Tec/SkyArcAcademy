import { type Lang, pick } from '../i18n'
import { SIGNER_RELATIONS, type SignerRelation } from './types'
import { type ContractDocument, type FamilyPart, PDF_PRINTABLE, academyChecks, dollarsText, familyFields, pricedChoice, replaceDollars, signerField } from './document'

/**
 * What a family fills in on the contract (docs/DECISIONS.md §33 and §34), checked the same way on the phone, the
 * website and the server: the option they choose, the boxes they check, their initials, the fields (the student's name
 * and birth date, their own name, phone and email), then their signature. One contract per child, each signed on its
 * own (the manager, 2026-11-04: "the parent should sign both contracts for each child"). The office sets the rest as
 * it sends the contract (the preset): the option it suggests, and the discounts, which only the office checks.
 */

/** By field ID: an option's ID (`choose`), the checked options' IDs (`check`), or the text (a date as YYYY-MM-DD). */
export type ContractValues = Record<string, string | string[]>

/** What the app knows before the family types: the student's name and birth date, and the signer's own details. */
export interface Prefill {
  studentName: string
  /** YYYY-MM-DD. */
  dob?: string | null
  signerName?: string
  phone?: string
  email?: string
}

/** "2015-03-09" → "03/09/2015", as the form shows a date. */
export function usDate(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  return m ? `${m[2]}/${m[3]}/${m[1]}` : dateKey
}

/** "03/09/2015" (or "3/9/2015", or "2015-03-09") → "2015-03-09"; null when it isn't a real date. */
export function readDate(text: string): string | null {
  const t = text.trim()
  const us = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t)
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  const [y, m, d] = us ? [Number(us[3]), Number(us[1]), Number(us[2])] : iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : [0, 0, 0]
  if (!y || y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return null
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  if (d > last) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** As a date is typed: digits only, with the slashes put in ("0309" → "03/09"). */
export function typingDate(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

/** The values the form starts with: the student's name, their birth date, the signer's name, phone and email. */
export function prefillValues(doc: ContractDocument, p: Prefill): ContractValues {
  const out: ContractValues = {}
  for (const f of familyFields(doc)) {
    if (f.kind !== 'field') continue
    if (f.fill === 'student' && p.studentName) out[f.id] = p.studentName
    else if (f.fill === 'signer' && p.signerName) out[f.id] = p.signerName
    else if (f.fill === 'phone' && p.phone) out[f.id] = p.phone
    else if (f.fill === 'email' && p.email) out[f.id] = p.email
    else if (f.fill === 'date' && /birth/i.test(f.label) && p.dob) out[f.id] = usDate(p.dob)
  }
  return out
}

/** The addresses the family typed in the contract's email fields, as signed: where the signer's copy goes (§35). */
export function emailsIn(doc: ContractDocument, values: ContractValues): string[] {
  const out = new Set<string>()
  for (const f of familyFields(doc)) {
    const v = values[f.id]
    if (f.kind === 'field' && f.fill === 'email' && typeof v === 'string' && v.includes('@')) out.add(v.trim().toLowerCase())
  }
  return [...out]
}

/**
 * What carries over to the next child's contract: what the signer typed about themselves (their name, phone, email,
 * initials), never the child's details or the options chosen for them.
 */
export function carriedValues(doc: ContractDocument, values: ContractValues): ContractValues {
  const out: ContractValues = {}
  for (const f of familyFields(doc)) {
    if (f.kind === 'initials' || (f.kind === 'field' && (f.fill === 'signer' || f.fill === 'phone' || f.fill === 'email'))) {
      if (typeof values[f.id] === 'string' && values[f.id]) out[f.id] = values[f.id]
    }
  }
  return out
}

const NAME = /^[A-Za-zÀ-ÖØ-öø-ÿ' .\-’]+$/
const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

/** One part's value checked: the clean value, or what to fix in the family's words (Korean for a parent reading it). */
function checkPart(part: FamilyPart, raw: unknown, lang: Lang = 'en'): { value?: string | string[]; error?: string } {
  const say = (en: string, ko: string) => pick(lang, en, ko)
  if (part.kind === 'choose') {
    const v = text(raw)
    if (!v) return { error: say('Choose one.', '하나를 골라 주세요.') }
    return part.block.options.some((o) => o.id === v) ? { value: v } : { error: say('Choose one of these.', '이 중에서 골라 주세요.') }
  }
  if (part.kind === 'check') {
    const list = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
    const known = part.block.options.map((o) => o.id)
    return { value: known.filter((id) => list.includes(id)) }
  }
  const v = text(raw)
  if (part.kind === 'initials') {
    if (!v) return { error: say('Type your initials.', '이니셜을 입력해 주세요.') }
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ. ]{1,8}$/.test(v) || !/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(v)) return { error: say('Type your initials in English letters.', '이니셜은 영문으로 입력해 주세요.') }
    return { value: v.toUpperCase() }
  }
  const dateError = say('Type the date as MM/DD/YYYY.', '날짜를 MM/DD/YYYY 형식으로 입력해 주세요.')
  if (!v) return { error: part.fill === 'date' ? dateError : say('Fill this in.', '이 칸을 채워 주세요.') }
  if (v.length > 200) return { error: say('This is too long.', '너무 길어요.') }
  const isName = part.fill === 'student' || part.fill === 'signer'
  const nameError = say('Type the name in English letters.', '이름은 영문으로 입력해 주세요.')
  if (!PDF_PRINTABLE.test(v)) return { error: isName ? nameError : say('Type this in English letters.', '영문으로 입력해 주세요.') }
  switch (part.fill) {
    case 'student':
    case 'signer':
      if (!NAME.test(v)) return { error: nameError }
      if (v.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '').length < 2 || !v.includes(' ')) return { error: say('Type the first and last name.', '이름과 성을 모두 입력해 주세요.') }
      return { value: v }
    case 'date': {
      const d = readDate(v)
      return d ? { value: d } : { error: dateError }
    }
    case 'phone':
      return v.replace(/\D/g, '').length >= 7 && /^[0-9+()\-. ]+$/.test(v) ? { value: v } : { error: say('Type a phone number.', '전화번호를 입력해 주세요.') }
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? { value: v.toLowerCase() } : { error: say('Type an email address.', '이메일 주소를 입력해 주세요.') }
    default:
      return { value: v }
  }
}

/**
 * Signing's own parts, beside the contract's fields: the name (when the contract has no "= signer" field), parent or
 * guardian, the signature and the agreement. Their errors' keys start with "@", which no field's ID has.
 */
export type SignPart = 'name' | 'relation' | 'signature' | 'agree'

export const SIGN_KEYS: Record<SignPart, string> = { name: '@name', relation: '@relation', signature: '@signature', agree: '@agree' }

export interface ContractSignInput {
  values?: unknown
  /** The signer's name, when the contract has no field for it. */
  name?: unknown
  relation?: unknown
  /** The drawn signature, a PNG data URL. */
  signature?: unknown
  agree?: unknown
}

export interface ContractSigning {
  values: ContractValues
  /** The signer's name: their "= signer" field, or `name`. */
  name: string
  relation: SignerRelation
  signature: string
}

/** The drawn signature's PNG, as a data URL: at most this many characters (about 1 MB). */
export const SIGNATURE_MAX_CHARS = 1_400_000

/**
 * The whole signing checked: every field the family fills, then the signature. Errors are keyed by field ID, or by
 * `SIGN_KEYS`, each in the family's words (Korean for a parent reading Korean), in the contract's order.
 */
export function checkContractSigning(doc: ContractDocument, input: ContractSignInput, lang: Lang = 'en'): { ok: true; value: ContractSigning } | { ok: false; errors: Record<string, string> } {
  const say = (en: string, ko: string) => pick(lang, en, ko)
  const errors: Record<string, string> = {}
  const raw = input.values && typeof input.values === 'object' && !Array.isArray(input.values) ? (input.values as Record<string, unknown>) : {}
  const values: ContractValues = {}
  for (const part of familyFields(doc)) {
    const r = checkPart(part, raw[part.id], lang)
    if (r.error) errors[part.id] = r.error
    else if (r.value !== undefined) values[part.id] = r.value
  }
  const named = signerField(doc)
  let name = ''
  if (named) name = typeof values[named.id] === 'string' ? (values[named.id] as string) : ''
  else {
    const r = checkPart({ kind: 'field', id: 'name', label: 'Your full name', fill: 'signer', section: '' }, input.name, lang)
    if (r.error) errors[SIGN_KEYS.name] = r.error === say('Fill this in.', '이 칸을 채워 주세요.') ? say('Type your first and last name.', '이름과 성을 영문으로 입력해 주세요.') : r.error
    else name = r.value as string
  }
  if (input.relation !== 'parent' && input.relation !== 'guardian') errors[SIGN_KEYS.relation] = say('Choose parent or legal guardian.', '부모인지 법정 보호자인지 골라 주세요.')
  const signature = input.signature
  if (typeof signature !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(signature) || signature.length < 200) errors[SIGN_KEYS.signature] = say('Sign in the box with your finger or mouse.', '칸 안에 손가락이나 마우스로 서명해 주세요.')
  else if (signature.length > SIGNATURE_MAX_CHARS) errors[SIGN_KEYS.signature] = say('The signature is too large. Clear it and sign again.', '서명이 너무 커요. 지우고 다시 서명해 주세요.')
  if (input.agree !== true) errors[SIGN_KEYS.agree] = say('Check the box to agree to sign electronically.', '전자 서명 동의에 체크해 주세요.')
  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, value: { values, name, relation: input.relation as SignerRelation, signature: signature as string } }
}

/** What's still to fill in, as the form lists it by the sign button: each part's label, in the contract's order. */
export function missingParts(doc: ContractDocument, errors: Record<string, string>, lang: Lang = 'en'): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = []
  for (const part of familyFields(doc)) {
    if (errors[part.id]) out.push({ id: part.id, label: part.kind === 'field' ? `${part.label} (${lang === 'ko' ? part.section : part.section.toLowerCase()})` : part.label })
  }
  const own: Record<SignPart, string> =
    lang === 'ko'
      ? { name: '이름 (영문)', relation: '부모 또는 법정 보호자', signature: '서명', agree: '전자 서명 동의' }
      : { name: 'Your full name', relation: 'Parent or legal guardian', signature: 'Your signature', agree: 'Agreeing to sign electronically' }
  for (const k of Object.keys(own) as SignPart[]) if (errors[SIGN_KEYS[k]]) out.push({ id: SIGN_KEYS[k], label: own[k] })
  return out
}

// ------------------------------------------------------------------ what the office sets, and the price

/**
 * What the office sets as it sends a student's contract, checked: the option it suggests (by the choice's ID: the
 * family may choose another, or '' for none) and the academy's boxes (by their IDs: the discounts, which the family
 * can't change). Anything else isn't part of it.
 */
export function checkPreset(doc: ContractDocument, raw: unknown): { ok: true; value: ContractValues } | { ok: false; error: string } {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const choice = pricedChoice(doc)
  const boxes = academyChecks(doc)
  const value: ContractValues = {}
  for (const [key, v] of Object.entries(input)) {
    if (choice && key === choice.id) {
      if (v === '' || v === null) continue
      if (typeof v !== 'string' || !choice.options.some((o) => o.id === v)) return { ok: false, error: 'Choose one of the contract’s options.' }
      value[key] = v
      continue
    }
    const box = boxes.find((b) => b.id === key)
    if (!box || !Array.isArray(v)) return { ok: false, error: 'That isn’t part of the contract.' }
    const ids = [...new Set(v)]
    if (!ids.every((id) => typeof id === 'string' && box.options.some((o) => o.id === id))) return { ok: false, error: `Choose from the contract’s ${box.label.toLowerCase()}.` }
    value[key] = box.options.map((o) => o.id).filter((id) => ids.includes(id))
  }
  return { ok: true, value }
}

/** What a signed contract holds: what the family filled in, with the office's boxes as the office checked them. */
export function withPreset(doc: ContractDocument, values: ContractValues, preset: ContractValues): ContractValues {
  const out: ContractValues = { ...values }
  for (const b of academyChecks(doc)) out[b.id] = Array.isArray(preset[b.id]) ? preset[b.id] : []
  return out
}

/** The values a family's form starts with, from what the office set: its suggestion chosen, its boxes checked. */
export function presetValues(doc: ContractDocument, preset: ContractValues): ContractValues {
  const choice = pricedChoice(doc)
  const suggested = choice && typeof preset[choice.id] === 'string' ? { [choice.id]: preset[choice.id] } : {}
  return withPreset(doc, suggested, preset)
}

/** What a family pays: the option chosen, its price, the discounts that apply to it, and the price after them. */
export interface Tuition {
  /** The choice's price label ("Monthly Tuition ($)"). */
  label: string
  optionId: string
  /** The option's own price, as written ("$495 / Month"), and its dollars. */
  price: string
  base: number
  /** The checked discounts that apply to this option (one may leave some options out). */
  discounts: { id: string; text: string; amount: number }[]
  /** The price after the discounts, never below nothing. */
  net: number
  /** The option's price with the dollars after the discounts ("$475 / Month"). */
  shown: string
}

/** The price after the discounts the office checked, for the option chosen; null when nothing with a price is chosen. */
export function tuitionOf(doc: ContractDocument, values: ContractValues): Tuition | null {
  const choice = pricedChoice(doc)
  const option = choice?.options.find((o) => o.id === values[choice.id])
  if (!choice || !option || option.amount === null) return null
  const discounts: Tuition['discounts'] = []
  for (const b of doc.blocks) {
    if (b.kind !== 'check') continue
    const checked = Array.isArray(values[b.id]) ? (values[b.id] as string[]) : []
    for (const o of b.options) if (o.amount !== null && checked.includes(o.id) && !o.except.includes(option.id)) discounts.push({ id: o.id, text: o.text, amount: o.amount })
  }
  const net = Math.max(0, option.amount - discounts.reduce((sum, d) => sum + d.amount, 0))
  const shown = discounts.length ? replaceDollars(option.price, net) : option.price
  return { label: choice.priceLabel, optionId: option.id, price: option.price, base: option.amount, discounts, net, shown }
}

/** "BEGINNER · FOUNDATION · 1 HR" → "BEGINNER" over "FOUNDATION · 1 HR": an option's name as a card shows it. */
export function optionHeading(title: string): { name: string; sub: string } {
  const [name, ...rest] = title.split(/\s+·\s+/)
  return { name: name ?? title, sub: rest.join(' · ') }
}

/**
 * Each option's price as a card shows it: its dollars after the discounts checked (each option's own: a discount may
 * leave it out), what it was before them, and the rest of its words ("$475", "$495", "/ Month").
 */
export function optionPrices(doc: ContractDocument, values: ContractValues): Map<string, { now: string; was: string | null; per: string }> {
  const out = new Map<string, { now: string; was: string | null; per: string }>()
  const choice = pricedChoice(doc)
  for (const o of choice?.options ?? []) {
    if (o.amount === null) {
      out.set(o.id, { now: o.price, was: null, per: '' })
      continue
    }
    const t = tuitionOf(doc, { ...values, [choice!.id]: o.id })
    const per = replaceDollars(o.price, 0).replace('$0', '').trim()
    out.set(o.id, { now: dollarsText(t?.net ?? o.amount), was: t && t.net !== o.amount ? dollarsText(o.amount) : null, per })
  }
  return out
}

/** Words compared as names: lower case, letters and digits only ("Sharp Shooter" and "Sharpshooter" are one). */
const nameKey = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '')

/**
 * The program to suggest as the office sends a student's contract: the one their last contract chose (by its ID), or
 * the one their level or program on their record names, by the program's name ("Beginner" → "BEGINNER · FOUNDATION")
 * or by its details (a level the program lists: "Marksman" → the one with "2 hrs / week · Marksman"), the first that
 * does; or none (''). The office changes it as it likes.
 */
export function suggestedOption(doc: ContractDocument, hints: readonly (string | null | undefined)[]): string {
  const options = pricedChoice(doc)?.options ?? []
  for (const hint of hints) {
    const h = nameKey(hint ?? '')
    if (!h) continue
    const found =
      options.find((o) => o.id === hint) ??
      options.find((o) => nameKey(optionHeading(o.title).name) === h) ??
      options.find((o) => nameKey(o.title).startsWith(h)) ??
      options.find((o) => o.lines.some((l) => l.split(/[·/,]/).some((word) => nameKey(word) === h)))
    if (found) return found.id
  }
  return ''
}

/**
 * "$475 / Month ($495, less $20 in discounts)", or "월 $475 (정가 $495에서 $20 할인)" in Korean (the Korean contract's
 * price words); the price as it is when nothing comes off.
 */
export function tuitionText(t: Tuition, lang: Lang = 'en'): string {
  if (!t.discounts.length) return t.shown
  if (lang === 'ko') return `${t.shown} (정가 ${dollarsText(t.base)}에서 ${dollarsText(t.base - t.net)} 할인)`
  return `${t.shown} (${dollarsText(t.base)}, less ${dollarsText(t.base - t.net)} in discount${t.discounts.length > 1 ? 's' : ''})`
}

/** A value as the contract shows it: an option's name, the checked options (the office's too), a date as MM/DD/YYYY. */
export function shownValue(doc: ContractDocument, id: string, values: ContractValues): string {
  const v = values[id]
  for (const b of doc.blocks) {
    if (b.kind === 'choose' && b.id === id) return b.options.find((o) => o.id === v)?.title ?? ''
    if (b.kind === 'check' && b.id === id) {
      const list = Array.isArray(v) ? v : []
      return b.options.filter((o) => list.includes(o.id)).map((o) => o.text).join('; ')
    }
  }
  for (const part of familyFields(doc)) if (part.id === id && part.kind === 'field' && part.fill === 'date' && typeof v === 'string') return usDate(v)
  return typeof v === 'string' ? v : ''
}

/**
 * What the office reads at a glance on a student's page (the PDF holds the rest): the option chosen and its price
 * after the discounts, and what was checked (or "None").
 */
export function contractSummary(doc: ContractDocument, values: ContractValues, lang: Lang = 'en'): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = []
  const tuition = tuitionOf(doc, values)
  for (const b of doc.blocks) {
    if (b.kind === 'choose') {
      const o = b.options.find((x) => x.id === values[b.id])
      out.push({ label: b.label, value: o?.title ?? '—' })
      if (b.priceLabel) out.push({ label: b.priceLabel, value: tuition && b === pricedChoice(doc) ? tuitionText(tuition, lang) : (o?.price ?? '—') })
    } else if (b.kind === 'check') out.push({ label: b.label, value: shownValue(doc, b.id, values) || pick(lang, 'None', '없음') })
  }
  return out
}

/** "Parent", "Legal guardian": how the signer relates to the student, as the contract says it. */
export const RELATION_LABELS: Record<SignerRelation, string> = { parent: SIGNER_RELATIONS.parent, guardian: 'Legal guardian' }

/** The same in the family's language: 부모, 법정 보호자. */
export const relationLabel = (relation: SignerRelation, lang: Lang = 'en'): string => (lang === 'ko' ? { parent: '부모', guardian: '법정 보호자' }[relation] : RELATION_LABELS[relation])
