import type { DriveActor } from '../drive/types'
import type { TimestampLike } from '../types'

/**
 * The enrollment contract (docs/DECISIONS.md §23, F4 and F5, and §31): a parent signs it in the app or on the website,
 * signed in, before using it; or the office sends a link (from the student's page), which anyone signs on a phone with
 * no account. Either way they read the academy's contract, type their name, draw their signature and sign; the server
 * builds the signed PDF (the contract's pages, then a signature page) and files it in the student's Contracts folder,
 * which only owners and admins see. The blank contract's current upload and each student's `SignedContract` are the
 * family's to read too; the rest is owners' and admins' only (firestore.rules).
 */

/**
 * `branches/{b}/contractTemplates/{id}`: one upload of the academy's blank contract (Settings → Enrollment contract).
 * The newest is `current`; earlier ones stay, as each link names the one it was sent with. The PDF is at `path`.
 */
export interface ContractTemplate {
  /** Its name on the computer it came from. */
  name: string
  size: number
  pages: number
  /** The SHA-256 of its bytes (hex), as the browser read them; the signature page prints the server's own. */
  sha256: string
  /** `branches/{b}/contracts/templates/{id}.pdf` in Storage. */
  path: string
  /**
   * How many of its pages the website saved as pictures when it was uploaded (`templatePagePath`), for the phone app
   * to show (it can't draw a PDF on Android). Missing on uploads from before: the app then offers the PDF itself.
   */
  pageImages?: number
  current: boolean
  uploadedAt: TimestampLike | null
  uploadedBy: DriveActor
  replacedAt?: TimestampLike | null
  replacedBy?: DriveActor | null
}

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
  /** The SHA-256 (hex) of the blank contract they signed. */
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
/** The biggest blank contract the academy can upload (it's sent to the family's phone). */
export const CONTRACT_MAX_BYTES = 10 * 1024 * 1024
