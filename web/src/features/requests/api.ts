import { httpsCallable } from 'firebase/functions'
import type { ClassRequestKind } from '@shared/schedule/requests'
import { functions } from '@/lib/firebase'

/**
 * Families cancel and ask for classes, and the office answers, through the server (functions/src/requests.ts): it
 * checks each step with the shared rules, writes it with its audit entry and tells whoever needs to know.
 */

const cancel = httpsCallable<{ branchId: string; sessionId: string; via: 'web' }, { ok: true }>(functions, 'cancelClass')
const ask = httpsCallable<
  { branchId: string; studentId: string; kind: ClassRequestKind; classId: string; forSessionId: string | null; message: string },
  { requestId: string }
>(functions, 'requestClass')
const withdraw = httpsCallable<{ branchId: string; requestId: string }, { ok: true }>(functions, 'withdrawClassRequest')
const decide = httpsCallable<{ branchId: string; requestId: string; decision: 'approve' | 'reject'; note: string; via: 'web' }, { ok: true; sessionId: string | null }>(
  functions,
  'decideClassRequest',
)

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

export async function decideRequest(branchId: string, requestId: string, decision: 'approve' | 'reject', note = ''): Promise<string | null> {
  return (await decide({ branchId, requestId, decision, note, via: 'web' })).data.sessionId
}
