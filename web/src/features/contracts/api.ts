import { doc, getDoc, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { ref as storageRef, uploadBytes } from 'firebase/storage'
import { useMemo } from 'react'
import { CONTRACT_MAX_BYTES, type ContractLink, type ContractTemplate } from '@shared/contracts/types'
import { CONTRACTS_FOLDER_ID, CONTRACTS_FOLDER_NAME, type DriveActor } from '@shared/drive/types'
import { COL } from '@shared/paths'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { type Actor, addAudit } from '@/lib/audit'
import { db, functions, storage } from '@/lib/firebase'
import { branchCol, branchDocRef, useQuery } from '@/lib/firestore'
import { pdfjs } from '@/lib/pdfjs'

/**
 * The enrollment contract on the website (docs/DECISIONS.md §23, F4): the academy's blank contract (Settings →
 * Enrollment contract), the signing links sent from a student's page, and the Drive's Contracts folder where the signed
 * copies go. Links are made and emailed on the server (functions/src/contracts.ts); uploading the contract and
 * canceling a link are written here, each with its audit entry.
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

/** What the browser reads from a PDF before it's uploaded: its pages and its SHA-256. Throws, in plain words, when it isn't one. */
export async function readContractPdf(file: File): Promise<{ pages: number; sha256: string }> {
  if (file.type && file.type !== 'application/pdf') throw new Error('Choose a PDF.')
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new Error('Choose a PDF.')
  if (file.size > CONTRACT_MAX_BYTES) throw new Error('The PDF is over 10 MB. Save a smaller copy and try again.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice())
  const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  const lib = await pdfjs()
  const task = lib.getDocument({ data: bytes, isOffscreenCanvasSupported: false, verbosity: 0 })
  try {
    const doc = await task.promise
    return { pages: doc.numPages, sha256 }
  } catch (e) {
    if ((e as { name?: string })?.name === 'PasswordException') throw new Error('This PDF has a password. Save it without one, then upload it again.')
    throw new Error('This file can’t be read as a PDF.')
  } finally {
    await task.destroy().catch(() => undefined)
  }
}

/**
 * Uploads the academy's blank contract: the PDF goes to Storage, then its record (the new current one) and the one it
 * replaces (kept, for the contracts already signed and the links already sent), with the audit entry.
 */
export async function uploadTemplate(branchId: string, actor: Actor, file: File, read: { pages: number; sha256: string }, replacing: WithId<ContractTemplate> | null) {
  const ref = doc(branchCol(branchId, COL.contractTemplates))
  const path = `branches/${branchId}/contracts/templates/${ref.id}.pdf`
  await uploadBytes(storageRef(storage, path), file, { contentType: 'application/pdf' })
  const by = actorOf(actor)
  const name = file.name.replace(/[/\\]+/g, '-').trim().slice(0, 200) || 'Enrollment contract.pdf'
  const batch = writeBatch(db)
  batch.set(ref, { name, size: file.size, pages: read.pages, sha256: read.sha256, path, current: true, uploadedAt: serverTimestamp(), uploadedBy: by })
  if (replacing) batch.update(branchDocRef(branchId, COL.contractTemplates, replacing.id), { current: false, replacedAt: serverTimestamp(), replacedBy: by })
  addAudit(batch, branchId, actor, {
    action: 'contract.template',
    category: 'contracts',
    entityType: 'contractTemplate',
    entityId: ref.id,
    summary: replacing ? `Uploaded a new enrollment contract (“${name}”), replacing “${replacing.name}”` : `Uploaded the enrollment contract (“${name}”)`,
  })
  await batch.commit()
}

/**
 * The Drive's Contracts folder (F5): made the first time an admin opens the contract's settings (or by the first
 * signature), at the top, only owners and admins see it.
 */
export async function ensureContractsFolder(branchId: string, actor: Actor) {
  const ref = branchDocRef(branchId, COL.driveFolders, CONTRACTS_FOLDER_ID)
  if ((await getDoc(ref)).exists()) return
  const batch = writeBatch(db)
  batch.set(ref, { name: CONTRACTS_FOLDER_NAME, parentId: null, studentId: null, access: 'admins', createdAt: serverTimestamp(), createdBy: actorOf(actor) })
  addAudit(batch, branchId, actor, {
    action: 'drive.folder_create',
    category: 'drive',
    entityType: 'driveFolder',
    entityId: CONTRACTS_FOLDER_ID,
    summary: `Made the folder “${CONTRACTS_FOLDER_NAME}” for signed enrollment contracts (owners and admins only)`,
  })
  await batch.commit()
}

const uploadedMs = (t: WithId<ContractTemplate>) => t.uploadedAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER

/** Every upload of the blank contract, the newest first (owners and admins). */
export function useContractTemplates() {
  const { branchId, isAdmin } = useBranch()
  const q = useMemo(() => (isAdmin ? query(branchCol(branchId, COL.contractTemplates)) : null), [branchId, isAdmin])
  const state = useQuery<ContractTemplate>(q, `contract-templates-${branchId}`)
  const data = useMemo(() => [...state.data].sort((a, b) => uploadedMs(b) - uploadedMs(a)), [state.data])
  return { ...state, data, current: data.find((t) => t.current) ?? null }
}

/** A student's signing links (owners and admins). */
export function useStudentContractLinks(studentId: string) {
  const { branchId, isAdmin } = useBranch()
  const q = useMemo(() => (isAdmin ? query(branchCol(branchId, COL.contractLinks), where('studentId', '==', studentId)) : null), [branchId, isAdmin, studentId])
  return useQuery<ContractLink>(q, `contract-links-${branchId}-${studentId}`)
}
