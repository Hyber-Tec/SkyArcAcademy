import type { DriveActor } from '../drive/types'
import type { TimestampLike } from '../types'

/**
 * The enrollment contract (docs/DECISIONS.md §23, F4 and F5): the office sends a family a link (from the student's
 * page); they read the academy's contract on any phone, type their name, draw their signature and sign, with no account
 * or app. The server builds the signed PDF (the contract's pages, then a signature page) and files it in the Drive's
 * Contracts folder, which only owners and admins see. Everything here is owners' and admins' only (firestore.rules).
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
  current: boolean
  uploadedAt: TimestampLike | null
  uploadedBy: DriveActor
  replacedAt?: TimestampLike | null
  replacedBy?: DriveActor | null
}

export type ContractLinkStatus = 'sent' | 'signed' | 'canceled'

export type SignerRelation = 'parent' | 'guardian'

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

/** How long a signing link works. */
export const CONTRACT_LINK_DAYS = 30
/** How long after signing the link still downloads the signed copy. */
export const SIGNED_COPY_DAYS = 7
/** The biggest blank contract the academy can upload (it's sent to the family's phone). */
export const CONTRACT_MAX_BYTES = 10 * 1024 * 1024
