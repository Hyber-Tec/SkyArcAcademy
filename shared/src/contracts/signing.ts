import { APP_URL } from '../brand'
import { cleanFileName } from '../drive/files'
import { dateKeyOf, formatDateKey, formatInstantTime } from '../time'
import type { WithId } from '../types'
import { RELATION_LABELS } from './fill'
import type { ContractLink, SignerRelation } from './types'

/**
 * The signing link, and the words of the page the server adds to a signed contract to record the signing
 * (functions/src/contracts.ts). What the signer sends is checked in shared/src/contracts/fill.ts.
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
  /** How it was signed: with a signing link (its token), or by a parent signed in to the app or the website. */
  how: { link: string } | { account: string; where: 'app' | 'website' }
  /** The contract's title and version ("Enrollment Agreement (version 1)"). */
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
    { label: 'Signed by', value: `${i.signerName} (${RELATION_LABELS[i.relation].toLowerCase()})` },
    { label: 'Signed on', value: signedOnText(i.signedAtMs, i.timezone) },
    { label: 'IP address', value: i.ip || 'Unknown' },
    { label: 'link' in i.how || i.how.where === 'website' ? 'Browser' : 'Device', value: i.userAgent || 'Unknown' },
    'link' in i.how ? { label: 'Signing link', value: i.how.link } : { label: 'Account', value: `${i.how.account} (signed in ${i.how.where === 'app' ? 'to the app' : 'on the website'})` },
    { label: 'Contract signed', value: i.templateName },
    { label: 'Its text’s SHA-256', value: i.templateSha256 },
  ]
}

/** The sentence above the facts: how it was signed. */
export function signatureStatement(i: Pick<SignatureFactsInput, 'signerName' | 'studentName' | 'academyName'>): string {
  return `${i.signerName} read this enrollment contract for ${i.studentName} with ${i.academyName}, filled it in, typed their name, checked “I agree to sign this contract electronically” and drew the signature on it.`
}
