import type { DriveActor } from '../drive/types'
import type { TimestampLike } from '../types'
import type { ContractValues } from './fill'

/**
 * The enrollment contract (docs/DECISIONS.md §23, F4 and F5, §31 and §33): the academy's own contract, written once in
 * Settings → Enrollment contract as text with its fields marked (shared/src/contracts/document.ts), and published. A
 * parent fills it in and signs it in the app or on the website, signed in, before using it, one contract per child; or
 * the office sends a link (from the student's page), which anyone signs on a phone with no account. The server builds
 * the signed PDF (the contract as filled in, the signature, then a page recording the signing) and files it in the
 * student's Contracts folder, which only owners and admins see. The published contract and each student's
 * `SignedContract` are the family's to read too; the rest is owners' and admins' only (firestore.rules).
 */

/**
 * `branches/{b}/contractTemplates/{id}`: one published version of the academy's contract (the server publishes the
 * draft, `publishContract`). The newest is `current`; earlier ones stay, as each link and signature names its own.
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

/** `branches/{b}/contractTemplates/draft`: the contract as the office is writing it (owners and admins only). */
export interface ContractDraft {
  text: string
  updatedAt: TimestampLike | null
  updatedBy: DriveActor
}

/** The draft's document ID, beside the published versions. */
export const CONTRACT_DRAFT_ID = 'draft'

/** "Enrollment Agreement (version 2)": a published contract, as links and signatures name it. */
export const templateLabel = (t: Pick<ContractTemplate, 'title' | 'version'>): string => `${t.title || 'Enrollment contract'} (version ${t.version})`

/** The longest contract text the office can keep (it's sent to every family's phone). */
export const CONTRACT_TEXT_MAX = 200_000

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
 * `branches/{b}/contractLinks/{id}`: a signing link for one student, made on the server (`sendContractLink`), its ID the
 * SHA-256 of its token. It works for `CONTRACT_LINK_DAYS`, for one signature; admins can cancel it while it waits.
 */
export interface ContractLink {
  studentId: string
  studentName: string
  /** The contract it was sent with (a newer upload doesn't change a link already sent). */
  templateId: string
  templateName: string
  /** The secret in the address (`/sign/{token}`): owners and admins copy it again from here. */
  token: string
  status: ContractLinkStatus
  createdAt: TimestampLike | null
  createdBy: DriveActor
  expiresAt: TimestampLike
  /** The addresses it was emailed to, and when last. */
  emailedTo: string[]
  emailedAt: TimestampLike | null
  signedAt: TimestampLike | null
  signer: ContractSigner | null
  /** The signed PDF in the Drive (the Contracts folder). */
  fileId: string | null
  fileName: string | null
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

/** How long a signing link works. */
export const CONTRACT_LINK_DAYS = 30
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
 * - `signContractSignedIn` (a parent signed in, one child at a time): `{ branchId, studentId, where, device? }` and a
 *   `ContractSignRequest` → `ContractSignedResult`.
 * - `contractPrefill` (a parent signed in): `{ branchId }` → `ContractPrefillResult`.
 * - `getContractForSigning` (anyone with a link): `{ token, copy? }` → its state; when it's ready to sign, the contract
 *   (`{ title, text, version }`) and the student's name.
 * - `signContract` (anyone with a link): `{ token }` and a `ContractSignRequest` → `{ ok, fileName, copyUntil }`.
 * - `previewContract` (owners and admins): `{ branchId, use, text?, studentName? }` and any of a `ContractSignRequest`
 *   → `ContractPdf`, a sample marked so (nothing is filed): the draft, the published one, or `text` as typed.
 * - `publishContract` (owners and admins): `{ branchId }` → `{ id, version }`: the draft becomes the current contract.
 */
export interface ContractSignedResult {
  /** False when the other parent signed it meanwhile: nothing more was filed. */
  signed: boolean
  fileName: string | null
}

/** A PDF sent back by a function: its name and bytes (base64). */
export interface ContractPdf {
  name: string
  data: string
}

/** Which contract a preview shows: the draft being written, or the one families sign now. */
export type ContractPreviewUse = 'draft' | 'current'
