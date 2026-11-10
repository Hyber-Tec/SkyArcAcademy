import type { DriveActor } from '../drive/types'
import type { TimestampLike } from '../types'
import type { ContractValues, Prefill } from './fill'

/**
 * The enrollment contract (docs/DECISIONS.md §23, F4 and F5, §31, §33 and §34): the academy's own contract, as text
 * with its fields marked (shared/src/contracts/document.ts), put in the database by scripts/contract.ts; the office
 * changes only its prices (`setContractPrices`). The office sends it to a student's family (`sendContract`, from the
 * student's page on the website or the phone): the program it suggests and the discounts, which only the office
 * checks. A parent then fills it in and signs it, signed in to the app or the website, or with the contract's link (a
 * QR code at the front desk, or an email), on any phone with no account. The server builds the signed PDF (the contract
 * as filled in, the family's signature and the academy's, then a page recording the signing) and files it in the
 * student's Contracts folder, which only owners and admins see. The contracts sent to a family, the versions and each
 * student's `SignedContract` are the family's to read too; the rest is owners' and admins' only (firestore.rules).
 */

/**
 * `branches/{b}/contractTemplates/{id}`: one version of the academy's contract (scripts/contract.ts adds one, and so
 * does each change of prices). The newest is `current`; earlier ones stay, as each contract sent and signed names its own.
 */
export interface ContractTemplate {
  /** Its title, from its text. */
  title: string
  /** Its words and fields (shared/src/contracts/document.ts). */
  text: string
  /** The SHA-256 of `text` (UTF-8, hex): the signature page records it. */
  sha256: string
  /** 1 for the first one published, then 2, 3… */
  version: number
  current: boolean
  publishedAt: TimestampLike | null
  publishedBy: DriveActor
  replacedAt?: TimestampLike | null
  replacedBy?: DriveActor | null
}

/** "Enrollment Agreement (version 2)": a published contract, as links and signatures name it. */
export const templateLabel = (t: Pick<ContractTemplate, 'title' | 'version'>): string => `${t.title || 'Enrollment contract'} (version ${t.version})`

/** The longest contract text the app keeps (it's sent to every family's phone). */
export const CONTRACT_TEXT_MAX = 200_000

/** The highest price the office can give a program. */
export const CONTRACT_PRICE_MAX = 100_000

/**
 * `branches/{b}/contractSigner/academy`: the academy's signature, which the server puts on every contract a family signs
 * from then on (the owner, 2026-11-05: "autofill"): who signs for the academy and the signature, a PNG (an SVG the
 * office uploads is drawn as one first), or, until there's one, their name typed (§35). Owners and admins set it in
 * Settings; the family sees it on the contract.
 */
export interface AcademySigner {
  name: string
  /** Their title ("Director"), or ''. */
  title: string
  /** A PNG data URL, dark ink on transparent; none: the name is typed on the academy's line instead. */
  image: string | null
  updatedAt: TimestampLike | null
  updatedBy: DriveActor
}

/** The academy's signature as a contract shows it: who signs, and the image, or none for the name typed. */
export type ShownSigner = Pick<AcademySigner, 'name' | 'title' | 'image'>

export const ACADEMY_SIGNER_ID = 'academy'

/** The signature image's longest data URL (about 300 KB). */
export const ACADEMY_SIGNATURE_MAX_CHARS = 400_000

export type ContractLinkStatus = 'sent' | 'signed' | 'canceled'

export type SignerRelation = 'parent' | 'guardian'

/** How a student's contract came to be signed: by a parent signed in (the app or the website), a link, or on paper. */
export type SignedVia = 'app' | 'web' | 'link' | 'paper'

export const SIGNED_VIA_LABELS: Record<SignedVia, string> = { app: 'in the app', web: 'on the website', link: 'by link', paper: 'on paper' }

export const SIGNER_RELATIONS: Record<SignerRelation, string> = { parent: 'Parent', guardian: 'Guardian' }

/** Who signed, as the signature page records it. */
export interface ContractSigner {
  /** As they typed it. */
  name: string
  relation: SignerRelation
  /** The network address and browser they signed from. */
  ip: string
  userAgent: string
  /** The SHA-256 (hex) of the contract's text they signed. */
  templateSha256: string
}

/**
 * `branches/{b}/contractLinks/{id}`: a contract the office sent a student's family (`sendContract`), its ID the SHA-256
 * of its link's token. It waits until a parent signs it (in the app, on the website or with the link, once) or the
 * office withdraws it, as sending another for the student does. The family reads theirs; the token itself is in
 * `contractLinks/{id}/private/token` (`ContractLinkToken`), owners' and admins' only.
 */
export interface ContractLink {
  studentId: string
  studentName: string
  /** The version it was sent with: a later change of prices doesn't change a contract already sent. */
  templateId: string
  templateName: string
  /** What the office set (shared/src/contracts/fill.ts, `checkPreset`): the option it suggests, and the discounts. */
  preset: ContractValues
  status: ContractLinkStatus
  createdAt: TimestampLike | null
  createdBy: DriveActor
  /** The addresses it was emailed to, and when last. */
  emailedTo: string[]
  emailedAt: TimestampLike | null
  signedAt: TimestampLike | null
  signer: ContractSigner | null
  /** The signed PDF in the Drive (the Contracts folder). */
  fileId: string | null
  fileName: string | null
  /** Where the signer's copy was emailed as it was signed (§35), and when: none from the demo academy or for test addresses. */
  copyEmailedTo?: string[]
  /**
   * Sent for a family's request from the academy's sign (§39): its ID, what the family typed there, which fills in the
   * form (they can change it), and their email, which stays as they typed it (the copy goes there).
   */
  requestId?: string | null
  prefill?: Prefill | null
  lockedEmail?: string | null
  copyEmailedAt?: TimestampLike | null
  canceledAt: TimestampLike | null
  canceledBy: DriveActor | null
}

/**
 * `branches/{b}/signedContracts/{studentId}`: the student's enrollment contract is signed (the newest signature), and
 * how. The server writes it as a contract is signed (in the app, on the website or by link); owners and admins mark one
 * signed on paper, and remove it to ask the family to sign again. The family reads their own: until each of their
 * students has one, the app asks them to sign (`contractGate`).
 */
export interface SignedContract {
  studentId: string
  studentName: string
  via: SignedVia
  signedAt: TimestampLike | null
  /** As the signer typed it (signed in or by link), or as the office wrote it (on paper: may be empty). */
  signerName: string
  relation: SignerRelation | null
  /** The account that signed, when a parent signed in. */
  signerEmail: string | null
  templateId: string | null
  templateName: string | null
  /** What the family filled in (shared/src/contracts/fill.ts), by field ID: none on paper. */
  values?: ContractValues
  /** The signed copy in the student's Contracts folder in the Drive (none for one on paper, unless the office adds it there). */
  fileId: string | null
  fileName: string | null
  /** The signing link, for one signed by link. */
  linkId: string | null
  /** Who marked one signed on paper, and what they noted ("Signed in September"). */
  markedBy: DriveActor | null
  note: string
}

/** `contractLinks/{id}/private/token`: the secret in a contract's link (`/sign/{token}`), for the QR code and to copy again. */
export interface ContractLinkToken {
  token: string
}

export const CONTRACT_TOKEN_DOC = 'token'

/** How long after signing the link still downloads the signed copy. */
export const SIGNED_COPY_DAYS = 7

// ------------------------------------------------------------------ what the functions take and give

/** What a signer sends with the contract (functions/src/contracts.ts checks it with shared/src/contracts/fill.ts). */
export interface ContractSignRequest {
  values: ContractValues
  /** The signer's name, when the contract has no "= signer" field. */
  name?: string
  relation: SignerRelation | ''
  /** The drawn signature, a PNG data URL. */
  signature: string
  agree: boolean
}

/** What the family's form starts with (`contractPrefill`): their students, and the signer's details on the records. */
export interface ContractPrefillResult {
  students: { id: string; name: string; dob: string | null }[]
  signer: { name: string; phone: string; email: string }
}

/**
 * The functions (functions/src/contracts.ts), as the phone app and the website call them. A field problem comes back
 * as an `invalid-argument` error whose details are `{ errors }`, keyed as `checkContractSigning`'s are.
 *
 * - `sendContract` (owners and admins): `ContractSendRequest` → `ContractSendResult`.
 * - `emailContract` (owners and admins): `{ branchId, linkId }` → `{ emailed, emailedTo }`: a contract still waiting,
 *   emailed to the family again.
 * - `setContractPrices` (owners and admins): `{ branchId, prices }` (dollars by option ID) → `{ version }`.
 * - `signContractSignedIn` (a parent signed in, one child at a time): `{ branchId, studentId, linkId, where, device? }`
 *   and a `ContractSignRequest` → `ContractSignedResult`.
 * - `contractPrefill` (a parent signed in): `{ branchId }` → `ContractPrefillResult`.
 * - `contractLinkForFamily` (a parent signed in to the phone app): `{ branchId, studentId }` → `{ path, linkId }`, the
 *   page of their child's contract still waiting (`/sign/{token}`), which the app opens on the website to sign it.
 * - `getContractForSigning` (anyone with a link): `{ token, copy? }` → its state; when it's ready to sign, the contract
 *   (`{ title, text, version }`), what the office set, the academy's signature and the student's name.
 * - `signContract` (anyone with a link): `{ token }` and a `ContractSignRequest` → `ContractLinkSignedResult`.
 * - `previewContract` (owners and admins): `{ branchId, studentName?, preset? }` and any of a `ContractSignRequest` →
 *   `ContractPdf`, a sample of the current contract marked so (nothing is filed).
 */
export interface ContractSendRequest {
  branchId: string
  studentId: string
  preset: ContractValues
  /** Email the family the link too (the office's switch, off at first). */
  email: boolean
  /** A family's request from the academy's sign (§39): they get it on their phone and by email, filled in from it. */
  requestId?: string
}

/**
 * `branches/{b}/contractRequests/{id}`: a family asking for a child's enrollment contract from the academy's sign (its
 * QR code opens `/contract`, docs/DECISIONS.md §39), one per child: what they typed, which the office checks before
 * sending the contract from it (`sendContract` with `requestId`: the program, the discounts, as always), and which
 * fills in the contract. Their page waits on it by a token only they have (`tokenHash`, its SHA-256); once it's sent,
 * `private/link` holds the contract's link token, for their page. Owners and admins read it; only the server writes.
 */
export interface ContractRequest {
  studentFirstName: string
  studentLastName: string
  /** YYYY-MM-DD, or null when they left it out. */
  studentDob: string | null
  parentName: string
  email: string
  phone: string
  status: ContractRequestStatus
  createdAt: TimestampLike | null
  /** The student the academy's records suggest: their parent's email and their name (null: a new family, or no match). */
  matchedStudentId: string | null
  matchedStudentName: string | null
  tokenHash: string
  /** Once sent: the student it was sent for, the contract, and who sent it. */
  studentId: string | null
  linkId: string | null
  sentAt: TimestampLike | null
  sentBy: DriveActor | null
  closedAt: TimestampLike | null
  closedBy: DriveActor | null
}

export type ContractRequestStatus = 'waiting' | 'sent' | 'closed'

/** `contractRequests/{id}/private/link`: the contract's link token, once sent (server only). */
export const CONTRACT_REQUEST_LINK_DOC = 'link'

/** What `requestContract` answers: each child's request and the token their page waits with. */
export interface ContractRequestResult {
  requests: { id: string; token: string; firstName: string }[]
}

/** A request as the family's page sees it (`contractRequestStatus`). */
export type ContractRequestState =
  | { state: 'waiting'; firstName: string }
  | { state: 'ready'; firstName: string; path: string }
  | { state: 'signed'; firstName: string }
  | { state: 'closed'; firstName: string }
  | { state: 'unknown' }

export interface ContractSendResult {
  linkId: string
  /** The link to sign it (`/sign/{token}`), for the QR code. */
  url: string
  /** The parents told in the app (by name). */
  told: string[]
  /** Whether the email went: sent, not asked, the sending isn't set up, it failed, the demo academy (it never emails), test addresses only, or no address. */
  emailed: 'sent' | 'off' | 'not_configured' | 'failed' | 'demo' | 'test_address' | 'no_address'
  /** The addresses it went to. */
  emailedTo: string[]
}

export interface ContractSignedResult {
  /** False when the other parent signed it meanwhile: nothing more was filed. */
  signed: boolean
  fileName: string | null
  /** Where the signer's copy was emailed (§35): the address they typed and the account's; none from the demo academy. */
  emailedTo: string[]
}

/** Signed with the link: the copy's name, until when the link downloads it, and where it was emailed. */
export interface ContractLinkSignedResult {
  ok: true
  fileName: string | null
  copyUntil: number
  emailedTo: string[]
}

/** A PDF sent back by a function: its name and bytes (base64). */
export interface ContractPdf {
  name: string
  data: string
}
