import { httpsCallable } from 'firebase/functions'
import type { ClassRequestKind } from '@shared/schedule/requests'
import { functions } from '@/lib/firebase'

/**
 * Families cancel and ask for classes, and the office answers, through the server (functions/src/requests.ts): it
 * checks each step with the shared rules, writes it with its audit entry and tells whoever needs to know.
 */

export type OfficeDecision = 'approve' | 'reject' | 'offer'
export type OfferAnswer = 'accept' | 'another'

const cancel = httpsCallable<{ branchId: string; sessionId: string; via: 'web' }, { ok: true }>(functions, 'cancelClass')
const ask = httpsCallable<
  { branchId: string; studentId: string; kind: ClassRequestKind; classId: string; forSessionId: string | null; message: string },
  { requestId: string }
>(functions, 'requestClass')
const withdraw = httpsCallable<{ branchId: string; requestId: string }, { ok: true }>(functions, 'withdrawClassRequest')
const decide = httpsCallable<
  { branchId: string; requestId: string; decision: OfficeDecision; note: string; classId: string | null; via: 'web' },
  { ok: true; sessionId: string | null }
>(functions, 'decideClassRequest')
const answer = httpsCallable<
  { branchId: string; requestId: string; answer: OfferAnswer; classId: string | null; message: string; via: 'web' },
  { ok: true; sessionId: string | null }
>(functions, 'answerClassOffer')

/** The server's own words when it says no ("That class is full now…"), else a plain fallback. */
export function requestError(e: unknown, fallback: string): string {
  const msg = (e as { message?: string } | null)?.message ?? ''
  return msg && !/^internal$/i.test(msg) && !/^(functions\/)/.test(msg) ? msg : fallback
}

export async function cancelClass(branchId: string, sessionId: string): Promise<void> {
  await cancel({ branchId, sessionId, via: 'web' })
}

export async function requestClass(input: { branchId: string; studentId: string; kind: ClassRequestKind; classId: string; forSessionId: string | null; message: string }): Promise<string> {
  return (await ask(input)).data.requestId
}

export async function withdrawRequest(branchId: string, requestId: string): Promise<void> {
  await withdraw({ branchId, requestId })
}

/**
 * The office answers: approve (books the class asked for; `classId` is the one the office saw, so a request the family
 * changed since isn't booked unseen), decline with a note, or suggest `classId` instead with a note.
 */
export async function decideRequest(branchId: string, requestId: string, decision: OfficeDecision, opts: { note?: string; classId?: string | null } = {}): Promise<string | null> {
  return (await decide({ branchId, requestId, decision, note: opts.note ?? '', classId: opts.classId ?? null, via: 'web' })).data.sessionId
}

/**
 * The family answers a class suggested: accept it (`classId`, the class they saw suggested), or ask for `classId`
 * instead, with a message.
 */
export async function answerOffer(branchId: string, requestId: string, reply: OfferAnswer, opts: { classId: string; message?: string }): Promise<string | null> {
  return (await answer({ branchId, requestId, answer: reply, classId: opts.classId, message: opts.message ?? '', via: 'web' })).data.sessionId
}
