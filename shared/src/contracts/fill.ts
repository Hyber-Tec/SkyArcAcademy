import { SIGNER_RELATIONS, type SignerRelation } from './types'
import { type ContractDocument, type FamilyPart, PDF_PRINTABLE, familyFields, signerField } from './document'

/**
 * What a family fills in on the contract (docs/DECISIONS.md §33), checked the same way on the phone, the website and
 * the server: the option they choose, the boxes they check, their initials, the fields (the student's name and birth
 * date, their own name, phone and email), then their signature. One contract per child, each signed on its own (the
 * manager, 2026-11-04: "the parent should sign both contracts for each child").
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

/** One part's value checked: the clean value, or what to fix in the family's words. */
function checkPart(part: FamilyPart, raw: unknown): { value?: string | string[]; error?: string } {
  if (part.kind === 'choose') {
    const v = text(raw)
    if (!v) return { error: 'Choose one.' }
    return part.block.options.some((o) => o.id === v) ? { value: v } : { error: 'Choose one of these.' }
  }
  if (part.kind === 'check') {
    const list = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
    const known = part.block.options.map((o) => o.id)
    return { value: known.filter((id) => list.includes(id)) }
  }
  const v = text(raw)
  if (part.kind === 'initials') {
    if (!v) return { error: 'Type your initials.' }
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ. ]{1,8}$/.test(v) || !/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(v)) return { error: 'Type your initials in English letters.' }
    return { value: v.toUpperCase() }
  }
  if (!v) return { error: part.fill === 'date' ? 'Type the date as MM/DD/YYYY.' : 'Fill this in.' }
  if (v.length > 200) return { error: 'This is too long.' }
  const isName = part.fill === 'student' || part.fill === 'signer'
  if (!PDF_PRINTABLE.test(v)) return { error: isName ? 'Type the name in English letters.' : 'Type this in English letters.' }
  switch (part.fill) {
    case 'student':
    case 'signer':
      if (!NAME.test(v)) return { error: 'Type the name in English letters.' }
      if (v.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '').length < 2 || !v.includes(' ')) return { error: 'Type the first and last name.' }
      return { value: v }
    case 'date': {
      const d = readDate(v)
      return d ? { value: d } : { error: 'Type the date as MM/DD/YYYY.' }
    }
    case 'phone':
      return v.replace(/\D/g, '').length >= 7 && /^[0-9+()\-. ]+$/.test(v) ? { value: v } : { error: 'Type a phone number.' }
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? { value: v.toLowerCase() } : { error: 'Type an email address.' }
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
 * `SIGN_KEYS`, each in the family's words, in the contract's order.
 */
export function checkContractSigning(doc: ContractDocument, input: ContractSignInput): { ok: true; value: ContractSigning } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  const raw = input.values && typeof input.values === 'object' && !Array.isArray(input.values) ? (input.values as Record<string, unknown>) : {}
  const values: ContractValues = {}
  for (const part of familyFields(doc)) {
    const r = checkPart(part, raw[part.id])
    if (r.error) errors[part.id] = r.error
    else if (r.value !== undefined) values[part.id] = r.value
  }
  const named = signerField(doc)
  let name = ''
  if (named) name = typeof values[named.id] === 'string' ? (values[named.id] as string) : ''
  else {
    const r = checkPart({ kind: 'field', id: 'name', label: 'Your full name', fill: 'signer', section: '' }, input.name)
    if (r.error) errors[SIGN_KEYS.name] = r.error === 'Fill this in.' ? 'Type your first and last name.' : r.error
    else name = r.value as string
  }
  if (input.relation !== 'parent' && input.relation !== 'guardian') errors[SIGN_KEYS.relation] = 'Choose parent or legal guardian.'
  const signature = input.signature
  if (typeof signature !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(signature) || signature.length < 200) errors[SIGN_KEYS.signature] = 'Sign in the box with your finger or mouse.'
  else if (signature.length > SIGNATURE_MAX_CHARS) errors[SIGN_KEYS.signature] = 'The signature is too large. Clear it and sign again.'
  if (input.agree !== true) errors[SIGN_KEYS.agree] = 'Check the box to agree to sign electronically.'
  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, value: { values, name, relation: input.relation as SignerRelation, signature: signature as string } }
}

/** What's still to fill in, as the form lists it by the sign button: each part's label, in the contract's order. */
export function missingParts(doc: ContractDocument, errors: Record<string, string>): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = []
  for (const part of familyFields(doc)) if (errors[part.id]) out.push({ id: part.id, label: part.kind === 'field' ? `${part.label} (${part.section.toLowerCase()})` : part.label })
  const own: Record<SignPart, string> = { name: 'Your full name', relation: 'Parent or legal guardian', signature: 'Your signature', agree: 'Agreeing to sign electronically' }
  for (const k of Object.keys(own) as SignPart[]) if (errors[SIGN_KEYS[k]]) out.push({ id: SIGN_KEYS[k], label: own[k] })
  return out
}

/** A value as the contract shows it: an option's name and price, the checked options, a date as MM/DD/YYYY. */
export function shownValue(doc: ContractDocument, id: string, values: ContractValues): string {
  const v = values[id]
  for (const part of familyFields(doc)) {
    if (part.id !== id) continue
    if (part.kind === 'choose') return part.block.options.find((o) => o.id === v)?.title ?? ''
    if (part.kind === 'check') {
      const list = Array.isArray(v) ? v : []
      return part.block.options.filter((o) => list.includes(o.id)).map((o) => o.text).join('; ')
    }
    if (part.kind === 'field' && part.fill === 'date' && typeof v === 'string') return usDate(v)
    return typeof v === 'string' ? v : ''
  }
  return typeof v === 'string' ? v : ''
}

/**
 * What the office reads at a glance on a student's page (the PDF holds the rest): the option chosen and its price,
 * and what was checked (or "None").
 */
export function contractSummary(doc: ContractDocument, values: ContractValues): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = []
  for (const b of doc.blocks) {
    if (b.kind === 'choose') {
      const o = b.options.find((x) => x.id === values[b.id])
      out.push({ label: b.label, value: o?.title ?? '—' })
      if (b.priceLabel) out.push({ label: b.priceLabel, value: o?.price ?? '—' })
    } else if (b.kind === 'check') out.push({ label: b.label, value: shownValue(doc, b.id, values) || 'None' })
  }
  return out
}

/** "Parent", "Legal guardian": how the signer relates to the student, as the contract says it. */
export const RELATION_LABELS: Record<SignerRelation, string> = { parent: SIGNER_RELATIONS.parent, guardian: 'Legal guardian' }
