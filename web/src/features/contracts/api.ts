import { doc, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { ref as storageRef, uploadBytes } from 'firebase/storage'
import { useMemo } from 'react'
import { PAGE_IMAGES_MAX, PAGE_IMAGE_WIDTH, templatePagePath } from '@shared/contracts/gate'
import type { Signing } from '@shared/contracts/signing'
import { CONTRACT_MAX_BYTES, type ContractLink, type ContractTemplate, type SignedContract } from '@shared/contracts/types'
import type { DriveActor } from '@shared/drive/types'
import { COL } from '@shared/paths'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { type Actor, addAudit } from '@/lib/audit'
import { db, functions, storage } from '@/lib/firebase'
import { branchCol, branchDocRef, useDoc, useQuery } from '@/lib/firestore'
import { pdfjs } from '@/lib/pdfjs'

/**
 * The enrollment contract on the website (docs/DECISIONS.md §23, F4, and §31): the academy's blank contract (Settings
 * → Enrollment contract), the signing links sent from a student's page, and each student's signed one. The signed
 * copies go in each student's Contracts folder in the Drive, which the server makes with the first one
 * (functions/src/contracts.ts), as it makes and emails the links and records a signature; uploading the contract,
 * canceling a link and marking one signed on paper (or removing it) are written here, each with its audit entry.
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
 * The contract's pages as JPEG pictures (`PAGE_IMAGE_WIDTH` wide, the first `PAGE_IMAGES_MAX`), for the phone app,
 * which can't draw a PDF on Android. Null when the browser can't draw them: the app then offers the PDF itself.
 */
async function pagePictures(file: File): Promise<Blob[] | null> {
  const lib = await pdfjs()
  const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isOffscreenCanvasSupported: false, verbosity: 0 })
  try {
    const pdf = await task.promise
    const out: Blob[] = []
    for (let n = 1; n <= Math.min(pdf.numPages, PAGE_IMAGES_MAX); n++) {
      const page = await pdf.getPage(n)
      const viewport = page.getViewport({ scale: PAGE_IMAGE_WIDTH / page.getViewport({ scale: 1 }).width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      await page.render({ canvas, viewport, background: '#ffffff' }).promise
      page.cleanup()
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
      if (!blob) return null
      out.push(blob)
    }
    return out
  } catch {
    return null
  } finally {
    await task.destroy().catch(() => undefined)
  }
}

/**
 * Uploads the academy's blank contract: the PDF and its pages' pictures go to Storage, then its record (the new
 * current one) and the one it replaces (kept, for the contracts already signed and the links already sent), with the
 * audit entry.
 */
export async function uploadTemplate(branchId: string, actor: Actor, file: File, read: { pages: number; sha256: string }, replacing: WithId<ContractTemplate> | null) {
  const ref = doc(branchCol(branchId, COL.contractTemplates))
  const path = `branches/${branchId}/contracts/templates/${ref.id}.pdf`
  await uploadBytes(storageRef(storage, path), file, { contentType: 'application/pdf' })
  const pictures = await pagePictures(file)
  if (pictures) await Promise.all(pictures.map((blob, i) => uploadBytes(storageRef(storage, templatePagePath(branchId, ref.id, i + 1)), blob, { contentType: 'image/jpeg' })))
  const by = actorOf(actor)
  const name = file.name.replace(/[/\\]+/g, '-').trim().slice(0, 200) || 'Enrollment contract.pdf'
  const batch = writeBatch(db)
  batch.set(ref, { name, size: file.size, pages: read.pages, sha256: read.sha256, path, pageImages: pictures?.length ?? 0, current: true, uploadedAt: serverTimestamp(), uploadedBy: by })
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
 * Owners and admins: a student's contract was signed on paper (or before the app): the family isn't asked to sign it
 * in the app. `note` says when or where ("Signed in September").
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

const signCall = httpsCallable<Signing & { branchId: string; studentIds: string[]; agree: true; where: 'website' }, { signed: { studentId: string; fileName: string }[]; already: string[] }>(
  functions,
  'signContractSignedIn',
)

/** A parent signed in signs the current contract for their children (functions/src/contracts.ts). */
export async function signSignedIn(branchId: string, studentIds: string[], signing: Signing) {
  return (await signCall({ branchId, studentIds, ...signing, agree: true, where: 'website' })).data
}

const copyCall = httpsCallable<{ branchId: string; studentId: string }, { name: string; data: string }>(functions, 'getMySignedContract')

/** The family's own signed copy, as its bytes and name. */
export async function mySignedCopy(branchId: string, studentId: string): Promise<{ name: string; bytes: Uint8Array }> {
  const { name, data } = (await copyCall({ branchId, studentId })).data
  const bin = atob(data)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { name, bytes }
}
