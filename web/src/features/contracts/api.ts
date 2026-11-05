import { query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useMemo } from 'react'
import {
  CONTRACT_DRAFT_ID,
  type ContractDraft,
  type ContractLink,
  type ContractPdf,
  type ContractPrefillResult,
  type ContractPreviewUse,
  type ContractSignRequest,
  type ContractSignedResult,
  type ContractTemplate,
  type SignedContract,
} from '@shared/contracts/types'
import type { DriveActor } from '@shared/drive/types'
import { COL } from '@shared/paths'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { type Actor, addAudit } from '@/lib/audit'
import { db, functions } from '@/lib/firebase'
import { branchCol, branchDocRef, useDoc, useQuery } from '@/lib/firestore'
import { pdfBytes } from './pdf'

/**
 * The enrollment contract on the website (docs/DECISIONS.md §23, F4, §31 and §33): the academy's contract (written in
 * Settings → Enrollment contract, saved as a draft, then published by the server), the signing links sent from a
 * student's page, and each student's signed one. The server publishes the contract, makes the samples, makes and
 * emails the links, and files each signed PDF in the student's Contracts folder in the Drive
 * (functions/src/contracts.ts); saving the draft, canceling a link and marking one signed on paper (or removing it)
 * are written here, each with its audit entry.
 */

const actorOf = (a: Actor): DriveActor => ({ uid: a.uid, email: a.email, name: a.name })

export interface SendResult {
  linkId: string
  url: string
  expiresAt: number | null
  /** Whether the email went: sent, the sending isn't set up, it failed, the demo academy (it never emails), or a test address. */
  emailed: 'sent' | 'not_configured' | 'failed' | 'demo' | 'test_address' | null
}

const sendCall = httpsCallable<{ branchId: string; studentId?: string; linkId?: string; email?: string | null }, SendResult>(functions, 'sendContractLink')

/** A new signing link for a student (canceling one still waiting), emailed to `email` when one is chosen. */
export async function makeLink(branchId: string, studentId: string, email: string | null): Promise<SendResult> {
  return (await sendCall({ branchId, studentId, email })).data
}

/** A waiting link emailed (again) to an address on the student's record. */
export async function emailLink(branchId: string, linkId: string, email: string): Promise<SendResult> {
  return (await sendCall({ branchId, linkId, email })).data
}

/** Stops a waiting link: the family can't sign with it any more. */
export async function cancelLink(branchId: string, actor: Actor, link: WithId<ContractLink>) {
  const batch = writeBatch(db)
  batch.update(branchDocRef(branchId, COL.contractLinks, link.id), { status: 'canceled', canceledAt: serverTimestamp(), canceledBy: actorOf(actor) })
  addAudit(batch, branchId, actor, {
    action: 'contract.cancel',
    category: 'contracts',
    entityType: 'contractLink',
    entityId: link.id,
    summary: `Canceled the link to sign ${link.studentName}’s enrollment contract`,
    studentId: link.studentId,
    studentName: link.studentName,
  })
  await batch.commit()
}

/** The contract as the office is writing it, before it's published (owners and admins), or null when there's none. */
export function useContractDraft() {
  const { branchId, isAdmin } = useBranch()
  return useDoc<ContractDraft>(isAdmin ? branchDocRef(branchId, COL.contractTemplates, CONTRACT_DRAFT_ID) : null)
}

/** Saves the contract's text as the draft (it isn't what families sign until it's published), with its audit entry. */
export async function saveDraft(branchId: string, actor: Actor, text: string) {
  const batch = writeBatch(db)
  batch.set(branchDocRef(branchId, COL.contractTemplates, CONTRACT_DRAFT_ID), { text, updatedAt: serverTimestamp(), updatedBy: actorOf(actor) })
  addAudit(batch, branchId, actor, {
    action: 'contract.draft',
    category: 'contracts',
    entityType: 'contractTemplate',
    entityId: CONTRACT_DRAFT_ID,
    summary: 'Saved a draft of the enrollment contract',
  })
  await batch.commit()
}

const publishCall = httpsCallable<{ branchId: string }, { id: string; version: number }>(functions, 'publishContract')

/** The saved draft becomes the contract families sign (the server checks it, numbers it and keeps the earlier one). */
export async function publishContract(branchId: string) {
  return (await publishCall({ branchId })).data
}

const previewCall = httpsCallable<{ branchId: string; use: ContractPreviewUse; text?: string; studentName?: string } & Partial<ContractSignRequest>, ContractPdf>(functions, 'previewContract')

/**
 * A sample PDF, exactly as signing would make it but marked as a sample, and filed nowhere: the draft (or `text` as
 * typed), or the published one, filled in with what was typed in the preview, if anything.
 */
export async function previewContract(input: { branchId: string; use: ContractPreviewUse; text?: string; studentName?: string } & Partial<ContractSignRequest>): Promise<{ name: string; bytes: Uint8Array }> {
  const { name, data } = (await previewCall(input)).data
  return { name, bytes: pdfBytes(data) }
}

const versionOf = (t: WithId<ContractTemplate>) => (typeof t.version === 'number' ? t.version : 0)

/** Every published version of the contract, the newest first (owners and admins), and the current one. */
export function useContractTemplates() {
  const { branchId, isAdmin } = useBranch()
  const q = useMemo(() => (isAdmin ? query(branchCol(branchId, COL.contractTemplates)) : null), [branchId, isAdmin])
  const state = useQuery<ContractTemplate>(q, `contract-templates-${branchId}`)
  const data = useMemo(() => state.data.filter((t) => t.id !== CONTRACT_DRAFT_ID).sort((a, b) => versionOf(b) - versionOf(a)), [state.data])
  return { ...state, data, current: data.find((t) => t.current) ?? null }
}

/** A student's signing links (owners and admins). */
export function useStudentContractLinks(studentId: string) {
  const { branchId, isAdmin } = useBranch()
  const q = useMemo(() => (isAdmin ? query(branchCol(branchId, COL.contractLinks), where('studentId', '==', studentId)) : null), [branchId, isAdmin, studentId])
  return useQuery<ContractLink>(q, `contract-links-${branchId}-${studentId}`)
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
 * Owners and admins: a student's contract was signed on paper: the family isn't asked to sign it in the app. `note`
 * says when or where ("Signed at the front desk").
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

/** Owners and admins: the family is asked to sign the contract again (in the app, before using it). The signed copy stays in the Drive. */
export async function askToSignAgain(branchId: string, actor: Actor, signed: WithId<SignedContract>) {
  const batch = writeBatch(db)
  batch.delete(branchDocRef(branchId, COL.signedContracts, signed.id))
  addAudit(batch, branchId, actor, {
    action: 'contract.unsigned',
    category: 'contracts',
    entityType: 'signedContract',
    entityId: signed.id,
    summary: `Asked ${signed.studentName}’s family to sign the enrollment contract again`,
    studentId: signed.id,
    studentName: signed.studentName,
  })
  await batch.commit()
}

const prefillCall = httpsCallable<{ branchId: string }, ContractPrefillResult>(functions, 'contractPrefill')

/** What a parent's contract starts with: their children's names and birth dates, and their own details on the records. */
export async function contractPrefill(branchId: string): Promise<ContractPrefillResult> {
  return (await prefillCall({ branchId })).data
}

const signCall = httpsCallable<{ branchId: string; studentId: string; where: 'website' } & ContractSignRequest, ContractSignedResult>(functions, 'signContractSignedIn')

/** A parent signed in signs the current contract for one of their children, as they filled it in (functions/src/contracts.ts). */
export async function signSignedIn(branchId: string, studentId: string, request: ContractSignRequest) {
  return (await signCall({ branchId, studentId, where: 'website', ...request })).data
}

const copyCall = httpsCallable<{ branchId: string; studentId: string }, { name: string; data: string }>(functions, 'getMySignedContract')

/** The family's own signed copy, as its bytes and name. */
export async function mySignedCopy(branchId: string, studentId: string): Promise<{ name: string; bytes: Uint8Array }> {
  const { name, data } = (await copyCall({ branchId, studentId })).data
  return { name, bytes: pdfBytes(data) }
}
