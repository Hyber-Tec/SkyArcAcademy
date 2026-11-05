import { doc, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useMemo } from 'react'
import {
  ACADEMY_SIGNER_ID,
  type AcademySigner,
  CONTRACT_TOKEN_DOC,
  type ContractLink,
  type ContractLinkToken,
  type ContractPdf,
  type ContractPrefillResult,
  type ContractSendRequest,
  type ContractSendResult,
  type ContractSignRequest,
  type ContractSignedResult,
  type ContractTemplate,
  type SignedContract,
} from '@shared/contracts/types'
import type { ContractValues } from '@shared/contracts/fill'
import type { DriveActor } from '@shared/drive/types'
import { COL, ROOT } from '@shared/paths'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { type Actor, addAudit } from '@/lib/audit'
import { db, functions } from '@/lib/firebase'
import { branchCol, branchDocRef, useDoc, useQuery } from '@/lib/firestore'
import { pdfBytes } from './pdf'

/**
 * The enrollment contract on the website (docs/DECISIONS.md §23, F4, §31, §33 and §34): the academy's contract (its
 * versions; the office changes only the prices, on the server), the contracts the office sends from a student's page,
 * each student's signed one, and the academy's signature. The server sends the contracts, changes the prices, makes the
 * samples and files each signed PDF in the student's Contracts folder in the Drive (functions/src/contracts.ts);
 * withdrawing a contract, marking one signed on paper and setting the academy's signature are written here, each with
 * its audit entry.
 */

const actorOf = (a: Actor): DriveActor => ({ uid: a.uid, email: a.email, name: a.name })

const sendCall = httpsCallable<ContractSendRequest, ContractSendResult>(functions, 'sendContract')

/** A student's contract sent to their family, with what the office set (it withdraws one still waiting). */
export async function sendContract(request: ContractSendRequest): Promise<ContractSendResult> {
  return (await sendCall(request)).data
}

const emailCall = httpsCallable<{ branchId: string; linkId: string }, Pick<ContractSendResult, 'emailed' | 'emailedTo'>>(functions, 'emailContract')

/** A contract still waiting, emailed to the family (again). */
export async function emailContract(branchId: string, linkId: string) {
  return (await emailCall({ branchId, linkId })).data
}

/** Withdraws a contract still waiting: the family can't sign it any more (in the app, or with its link). */
export async function withdrawContract(branchId: string, actor: Actor, link: WithId<ContractLink>) {
  const batch = writeBatch(db)
  batch.update(branchDocRef(branchId, COL.contractLinks, link.id), { status: 'canceled', canceledAt: serverTimestamp(), canceledBy: actorOf(actor) })
  addAudit(batch, branchId, actor, {
    action: 'contract.cancel',
    category: 'contracts',
    entityType: 'contractLink',
    entityId: link.id,
    summary: `Withdrew ${link.studentName}’s enrollment contract, sent but not signed`,
    studentId: link.studentId,
    studentName: link.studentName,
  })
  await batch.commit()
}

const pricesCall = httpsCallable<{ branchId: string; prices: Record<string, number> }, { version: number; changed: number }>(functions, 'setContractPrices')

/** New prices for the contract's programs (dollars by option ID): a new version, for the contracts sent from now on. */
export async function setContractPrices(branchId: string, prices: Record<string, number>) {
  return (await pricesCall({ branchId, prices })).data
}

const previewCall = httpsCallable<{ branchId: string; studentName?: string; preset?: ContractValues } & Partial<ContractSignRequest>, ContractPdf>(functions, 'previewContract')

/**
 * A sample PDF of the current contract, exactly as signing would make it but marked as a sample, and filed nowhere,
 * with what the office would set (`preset`) and what was filled in, if anything.
 */
export async function previewContract(input: { branchId: string; studentName?: string; preset?: ContractValues } & Partial<ContractSignRequest>): Promise<{ name: string; bytes: Uint8Array }> {
  const { name, data } = (await previewCall(input)).data
  return { name, bytes: pdfBytes(data) }
}

const versionOf = (t: WithId<ContractTemplate>) => (typeof t.version === 'number' ? t.version : 0)

/** Every version of the contract, the newest first, and the current one. */
export function useContractTemplates() {
  const { branchId } = useBranch()
  const q = useMemo(() => query(branchCol(branchId, COL.contractTemplates)), [branchId])
  const state = useQuery<ContractTemplate>(q, `contract-templates-${branchId}`)
  const data = useMemo(() => [...state.data].sort((a, b) => versionOf(b) - versionOf(a)), [state.data])
  return { ...state, data, current: data.find((t) => t.current) ?? null }
}

/** One version of the contract (the one a contract was sent with). */
export function useContractTemplate(templateId: string | null) {
  const { branchId } = useBranch()
  return useDoc<ContractTemplate>(templateId ? branchDocRef(branchId, COL.contractTemplates, templateId) : null)
}

/** A student's contracts sent (owners and admins). */
export function useStudentContractLinks(studentId: string) {
  const { branchId, isAdmin } = useBranch()
  const q = useMemo(() => (isAdmin ? query(branchCol(branchId, COL.contractLinks), where('studentId', '==', studentId)) : null), [branchId, isAdmin, studentId])
  return useQuery<ContractLink>(q, `contract-links-${branchId}-${studentId}`)
}

/** Every contract sent (owners and admins), for the list of who has signed. */
export function useContractLinks() {
  const { branchId, isAdmin } = useBranch()
  const q = useMemo(() => (isAdmin ? query(branchCol(branchId, COL.contractLinks)) : null), [branchId, isAdmin])
  return useQuery<ContractLink>(q, `contract-links-${branchId}`)
}

/** A contract's link's token (owners and admins): its QR code, and the link to copy. */
export function useContractToken(linkId: string | null) {
  const { branchId, isAdmin } = useBranch()
  return useDoc<ContractLinkToken>(isAdmin && linkId ? doc(db, ROOT.branches, branchId, COL.contractLinks, linkId, 'private', CONTRACT_TOKEN_DOC) : null)
}

// ------------------------------------------------------------------ the academy's signature

/** The academy's signature on file, put on every contract a family signs (any member reads it). */
export function useAcademySigner() {
  const { branchId } = useBranch()
  return useDoc<AcademySigner>(branchDocRef(branchId, COL.contractSigner, ACADEMY_SIGNER_ID))
}

/** Sets the academy's signature (who signs for it, and the signature, a PNG, or none for their name typed), with its audit entry. */
export async function saveAcademySigner(branchId: string, actor: Actor, input: { name: string; title: string; image: string | null }) {
  const batch = writeBatch(db)
  batch.set(branchDocRef(branchId, COL.contractSigner, ACADEMY_SIGNER_ID), { name: input.name.trim(), title: input.title.trim(), image: input.image, updatedAt: serverTimestamp(), updatedBy: actorOf(actor) })
  addAudit(batch, branchId, actor, {
    action: 'contract.signer',
    category: 'contracts',
    entityType: 'contractSigner',
    entityId: ACADEMY_SIGNER_ID,
    summary: `Set the academy’s signature on the enrollment contract: ${[input.name.trim(), input.title.trim()].filter(Boolean).join(', ')}${input.image ? '' : ' (the name typed)'}`,
  })
  await batch.commit()
}

/** Removes the academy's signature: the contracts signed from then on leave the academy's line blank. */
export async function removeAcademySigner(branchId: string, actor: Actor) {
  const batch = writeBatch(db)
  batch.delete(branchDocRef(branchId, COL.contractSigner, ACADEMY_SIGNER_ID))
  addAudit(batch, branchId, actor, {
    action: 'contract.signer',
    category: 'contracts',
    entityType: 'contractSigner',
    entityId: ACADEMY_SIGNER_ID,
    summary: 'Removed the academy’s signature from the enrollment contract: its line is left blank from now on',
  })
  await batch.commit()
}

// ------------------------------------------------------------------ signed contracts

/** A student's signed contract (owners and admins, and the student's family). */
export function useSignedContract(studentId: string) {
  const { branchId } = useBranch()
  return useDoc<SignedContract>(branchDocRef(branchId, COL.signedContracts, studentId))
}

/** Every student's signed contract (owners and admins). */
export function useSignedContracts() {
  const { branchId, isAdmin } = useBranch()
  const q = useMemo(() => (isAdmin ? query(branchCol(branchId, COL.signedContracts)) : null), [branchId, isAdmin])
  return useQuery<SignedContract>(q, `signed-contracts-${branchId}`)
}

/**
 * Owners and admins: a student's contract was signed on paper (a family who can't sign on a phone), kept in their
 * Contracts folder in the Drive. `note` says when or where ("Signed at the front desk").
 */
export async function markSignedOnPaper(branchId: string, actor: Actor, student: { id: string; name: string }, note: string) {
  const batch = writeBatch(db)
  const data: Omit<SignedContract, 'signedAt'> & { signedAt: ReturnType<typeof serverTimestamp> } = {
    studentId: student.id,
    studentName: student.name,
    via: 'paper',
    signedAt: serverTimestamp(),
    signerName: '',
    relation: null,
    signerEmail: null,
    templateId: null,
    templateName: null,
    fileId: null,
    fileName: null,
    linkId: null,
    markedBy: actorOf(actor),
    note: note.trim().slice(0, 500),
  }
  batch.set(branchDocRef(branchId, COL.signedContracts, student.id), data)
  addAudit(batch, branchId, actor, {
    action: 'contract.paper',
    category: 'contracts',
    entityType: 'signedContract',
    entityId: student.id,
    summary: `Marked ${student.name}’s enrollment contract signed on paper${data.note ? ` (${data.note})` : ''}`,
    studentId: student.id,
    studentName: student.name,
  })
  await batch.commit()
}

const prefillCall = httpsCallable<{ branchId: string }, ContractPrefillResult>(functions, 'contractPrefill')

/** What a parent's contract starts with: their children's names and birth dates, and their own details on the records. */
export async function contractPrefill(branchId: string): Promise<ContractPrefillResult> {
  return (await prefillCall({ branchId })).data
}

const signCall = httpsCallable<{ branchId: string; studentId: string; linkId: string; where: 'website' } & ContractSignRequest, ContractSignedResult>(functions, 'signContractSignedIn')

/** A parent signed in signs the contract the office sent for one of their children, as they filled it in. */
export async function signSignedIn(branchId: string, studentId: string, linkId: string, request: ContractSignRequest) {
  return (await signCall({ branchId, studentId, linkId, where: 'website', ...request })).data
}

const copyCall = httpsCallable<{ branchId: string; studentId: string }, { name: string; data: string }>(functions, 'getMySignedContract')

/** The family's own signed copy, as its bytes and name. */
export async function mySignedCopy(branchId: string, studentId: string): Promise<{ name: string; bytes: Uint8Array }> {
  const { name, data } = (await copyCall({ branchId, studentId })).data
  return { name, bytes: pdfBytes(data) }
}
