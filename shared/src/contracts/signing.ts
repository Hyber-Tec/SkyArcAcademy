import { APP_URL } from '../brand'
import { cleanFileName } from '../drive/files'
import { dateKeyOf, formatDateKey, formatInstantTime } from '../time'
import type { WithId } from '../types'
import { type ContractLink, SIGNER_RELATIONS, type SignerRelation } from './types'

/**
 * The signing link and what the signer sends, checked the same way in the browser and on the server
 * (functions/src/contracts.ts), and the words of the signature page the server adds to the contract.
 */

/** A link's token: 32 random bytes, base64url (43 characters). Anything else isn't one of ours. */
export function isContractToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{40,64}$/.test(token)
}

/** The page where a family reads and signs: `/sign/{token}` on the website. */
export function signUrl(token: string, base = APP_URL): string {
  return `${base}/sign/${token}`
}

/** "Mia Larkin enrollment contract 2026-10-28.pdf": the signed copy's name in the Drive. */
export function contractFileName(studentName: string, dateKey: string): string {
  const who = cleanFileName(studentName).slice(0, 120) || 'Student'
  return `${who} enrollment contract ${dateKey}.pdf`
}

const ms = (t: unknown): number => (t as { toMillis?: () => number } | null)?.toMillis?.() ?? 0

export type LinkState = 'sent' | 'expired' | 'signed' | 'canceled'

/** Where a link stands: waiting for a signature (until it expires), signed, or canceled. */
export function linkState(link: Pick<ContractLink, 'status' | 'expiresAt'>, nowMs: number): LinkState {
  if (link.status === 'signed' || link.status === 'canceled') return link.status
  return ms(link.expiresAt) > nowMs ? 'sent' : 'expired'
}

export interface StudentContract {
  /** The newest link that wasn't canceled: none, waiting, expired or signed. */
  state: 'none' | Exclude<LinkState, 'canceled'>
  link: WithId<ContractLink> | null
  /** The newest signed one (it may be older than a link sent since). */
  lastSigned: WithId<ContractLink> | null
}

/** A student's contract, as their page shows it, from their links. */
export function studentContract(links: readonly WithId<ContractLink>[], nowMs: number): StudentContract {
  const newest = [...links].sort((a, b) => ms(b.createdAt) - ms(a.createdAt) || (a.id < b.id ? -1 : 1))
  const link = newest.find((l) => l.status !== 'canceled') ?? null
  const lastSigned = newest.find((l) => l.status === 'signed') ?? null
  return { state: link ? (linkState(link, nowMs) as StudentContract['state']) : 'none', link, lastSigned }
}

// ------------------------------------------------------------- signing

export type SigningField = 'name' | 'relation' | 'signature' | 'agree'

export interface SigningInput {
  name?: unknown
  relation?: unknown
  signature?: unknown
  agree?: unknown
}

export interface Signing {
  name: string
  relation: SignerRelation
  /** A PNG, as a data URL. */
  signature: string
}

/** The drawn signature's PNG, as a data URL: at most this many characters (about 1 MB). */
export const SIGNATURE_MAX_CHARS = 1_400_000

/**
 * Names the signature page can print: letters with their accents, spaces, hyphens, apostrophes and periods. The page's
 * font has no other alphabets yet (English only for now, CLAUDE.md), so other letters are asked for in English.
 */
const PRINTABLE_NAME = /^[A-Za-zÀ-ÖØ-öø-ÿ' .\-’]+$/

export function cleanSignerName(name: unknown): string {
  return typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, 100) : ''
}

/** What the signer sends, checked: each problem said for its field, in the signer's words. */
export function checkSigning(input: SigningInput): { ok: true; value: Signing } | { ok: false; errors: Partial<Record<SigningField, string>> } {
  const errors: Partial<Record<SigningField, string>> = {}
  const name = cleanSignerName(input.name)
  if (name && !PRINTABLE_NAME.test(name)) errors.name = 'Type your name in English letters.'
  else if (name.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '').length < 2 || !name.includes(' ')) errors.name = 'Type your first and last name.'
  const relation = input.relation
  if (relation !== 'parent' && relation !== 'guardian') errors.relation = 'Choose parent or guardian.'
  const signature = input.signature
  if (typeof signature !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(signature) || signature.length < 200) errors.signature = 'Sign in the box with your finger or mouse.'
  else if (signature.length > SIGNATURE_MAX_CHARS) errors.signature = 'The signature is too large. Clear it and sign again.'
  if (input.agree !== true) errors.agree = 'Check the box to agree to sign electronically.'
  if (Object.keys(errors).length) return { ok: false, errors }
  return { ok: true, value: { name, relation: relation as SignerRelation, signature: signature as string } }
}

// ------------------------------------------------------------- the signature page

export interface SignatureFactsInput {
  academyName: string
  studentName: string
  signerName: string
  relation: SignerRelation
  signedAtMs: number
  /** The academy's time zone: the date and time are the academy's. */
  timezone: string
  ip: string
  userAgent: string
  token: string
  templateName: string
  templateSha256: string
}

/** The zone's short name at that moment ("EDT"). */
function zoneName(instantMs: number, timezone: string): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'short', hour: 'numeric' }).formatToParts(instantMs).find((p) => p.type === 'timeZoneName')
  return part?.value ?? timezone
}

/** "October 28, 2026 at 3:41 PM EDT", in the academy's time zone. */
export function signedOnText(instantMs: number, timezone: string): string {
  return `${formatDateKey(dateKeyOf(instantMs, timezone), 'long')} at ${formatInstantTime(instantMs, timezone)} ${zoneName(instantMs, timezone)}`
}

/** What the signature page records, line by line. */
export function signatureFacts(i: SignatureFactsInput): { label: string; value: string }[] {
  return [
    { label: 'Academy', value: i.academyName },
    { label: 'Student', value: i.studentName },
    { label: 'Signed by', value: `${i.signerName} (${SIGNER_RELATIONS[i.relation].toLowerCase()})` },
    { label: 'Signed on', value: signedOnText(i.signedAtMs, i.timezone) },
    { label: 'IP address', value: i.ip || 'Unknown' },
    { label: 'Browser', value: i.userAgent || 'Unknown' },
    { label: 'Signing link', value: i.token },
    { label: 'Contract signed', value: i.templateName },
    { label: 'Its SHA-256', value: i.templateSha256 },
  ]
}

/** The sentence above the facts: how it was signed. */
export function signatureStatement(i: Pick<SignatureFactsInput, 'signerName' | 'studentName' | 'academyName'>): string {
  return `${i.signerName} read this enrollment contract for ${i.studentName} with ${i.academyName}, typed their name, checked “I agree to sign this contract electronically” and drew the signature below.`
}
