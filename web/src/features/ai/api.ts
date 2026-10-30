import { Timestamp, collection, doc, limit, orderBy, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useMemo } from 'react'
import { type ResolvedAiConfig, resolveAiConfig } from '@shared/ai/config'
import { AI_COL, AI_DOC } from '@shared/ai/paths'
import type { ReportText } from '@shared/ai/reportText'
import type { AiSettingsInput } from '@shared/ai/settings'
import type { AiChangeDoc, AiConfigDoc, AiProvider, AiPublicDoc, AiUsageDoc, SuperAdminDoc, ThinkingLevel } from '@shared/ai/types'
import { useAuth } from '@/auth/AuthProvider'
import { db, functions } from '@/lib/firebase'
import { useDoc, useQuery } from '@/lib/firestore'

/**
 * The AI on the website (docs/DECISIONS.md §26). Super admins read the config, the log of requests, the change history
 * and who the super admins are (firestore.rules); every change goes through Cloud Functions (functions/src/ai), which
 * write the history. The academy's pages read only `aiConfig/public` (which features are on) and ask the functions for
 * a draft.
 */

/** Whether the signed-in person is a super admin (they may read their own superAdmins document, whoever they are). */
export function useIsSuperAdmin(): { isSuperAdmin: boolean; loading: boolean } {
  const { email } = useAuth()
  const ref = useMemo(() => (email ? doc(db, AI_COL.superAdmins, email) : null), [email])
  const { data, loading } = useDoc<SuperAdminDoc>(ref)
  return { isSuperAdmin: !!data, loading }
}

/** Which AI features are set up and on, for every signed-in person. */
export function useAiPublic(): AiPublicDoc | null {
  const ref = useMemo(() => doc(db, AI_COL.aiConfig, AI_DOC.public), [])
  return useDoc<AiPublicDoc>(ref).data
}

/** The AI config with its defaults (super admins). */
export function useAiConfig(): { config: ResolvedAiConfig; loading: boolean; error: Error | null } {
  const ref = useMemo(() => doc(db, AI_COL.aiConfig, AI_DOC.config), [])
  const { data, loading, error } = useDoc<AiConfigDoc>(ref)
  const config = useMemo(() => resolveAiConfig(data), [data])
  return { config, loading, error }
}

/** The most requests a range loads, for its totals and its list. */
export const USAGE_MAX = 5000

/** The requests logged between two instants, newest first (super admins). */
export function useAiUsage(fromMs: number, toMs: number) {
  const q = useMemo(
    () => query(collection(db, AI_COL.aiUsage), where('at', '>=', Timestamp.fromMillis(fromMs)), where('at', '<', Timestamp.fromMillis(toMs)), orderBy('at', 'desc'), limit(USAGE_MAX)),
    [fromMs, toMs],
  )
  return useQuery<AiUsageDoc>(q, `ai-usage-${fromMs}-${toMs}`, { keepPrevious: true })
}

export function useAiChanges(count: number) {
  const q = useMemo(() => query(collection(db, AI_COL.aiChanges), orderBy('at', 'desc'), limit(count)), [count])
  return useQuery<AiChangeDoc>(q, `ai-changes-${count}`, { keepPrevious: true })
}

export function useSuperAdmins() {
  const q = useMemo(() => query(collection(db, AI_COL.superAdmins)), [])
  return useQuery<SuperAdminDoc>(q, 'super-admins')
}

// --------------------------------------------------------------- callables

const saveKeyCall = httpsCallable<{ provider: AiProvider; key: string }, { ok: true; keyLast4: string }>(functions, 'aiSaveKey')
const removeKeyCall = httpsCallable<{ provider: AiProvider }, { ok: true }>(functions, 'aiRemoveKey')
const saveSettingsCall = httpsCallable<AiSettingsInput, { ok: true; changes: number }>(functions, 'aiSaveSettings')
const superAdminCall = httpsCallable<{ email: string; on: boolean }, { ok: true }>(functions, 'aiSetSuperAdmin')
const testCall = httpsCallable<{ provider: AiProvider; model: string; thinking: ThinkingLevel | null }, AiTestResult>(functions, 'aiTest', { timeout: 150_000 })
const draftCall = httpsCallable<{ branchId: string; reportId: string }, { narrative: ReportText; check: string[] }>(functions, 'draftReportText', { timeout: 150_000 })

export type AiTestResult =
  | { ok: true; ms: number; inputTokens: number; outputTokens: number; thinkingTokens: number; costUsd: number; priced: boolean; text: string }
  | { ok: false; error: string; ms: number }

export const saveAiKey = async (provider: AiProvider, key: string) => (await saveKeyCall({ provider, key })).data
export const removeAiKey = async (provider: AiProvider) => (await removeKeyCall({ provider })).data
export const saveAiSettings = async (input: AiSettingsInput) => (await saveSettingsCall(input)).data
export const setSuperAdmin = async (email: string, on: boolean) => (await superAdminCall({ email, on })).data
export const testAiModel = async (provider: AiProvider, model: string, thinking: ThinkingLevel | null) => (await testCall({ provider, model, thinking })).data
export const draftReportText = async (branchId: string, reportId: string) => (await draftCall({ branchId, reportId })).data

/** A callable's error in the server's own words (without Firebase's prefix). */
export function callError(e: unknown, fallback = 'Try again.'): string {
  const m = (e as { message?: string })?.message
  return m ? m.replace(/^Firebase: /, '').replace(/ \((functions|firestore)\/[a-z-]+\)\.?$/, '') : fallback
}

/** A callable refused for a limit (the month's spending, or the person's hour): its message is the one to show. */
export function isLimitError(e: unknown): boolean {
  return (e as { code?: string })?.code === 'functions/resource-exhausted'
}
