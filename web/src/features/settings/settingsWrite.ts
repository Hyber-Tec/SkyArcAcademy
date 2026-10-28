import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { publicProfileFor } from '@shared/branchFactory'
import { COL, DOC, ROOT } from '@shared/paths'
import type { BusinessRules } from '@shared/settings/businessRules'
import { DEFAULT_SETTINGS, type BranchSettings } from '@shared/settings/defaults'
import { type SettingsOverrides, getPath, setPath, unsetPath } from '@shared/settings/resolve'
import type { AuditChange, Branch, BranchContact } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { type AuditInput, addAudit, auditData } from '@/lib/audit'
import { db } from '@/lib/firebase'
import type { FieldDef } from './schema'

/**
 * Writing what a Settings page changed: the academy document (its settings, stored as overrides of the defaults only, or
 * its profile) with an audit entry in the same batch, and the public profile the website reads; and, for owners only,
 * the academy rules (the seats a class has), which the security rules keep to a write of their own.
 */

export function useBranchWriter() {
  const { branchId, actor, branch } = useBranch()
  return async (patch: Partial<Branch>, audit: AuditInput) => {
    const batch = writeBatch(db)
    batch.update(doc(db, ROOT.branches, branchId), { ...patch, updatedAt: serverTimestamp(), updatedBy: actor.email })
    const next = { ...branch, ...patch }
    batch.set(doc(db, ROOT.branches, branchId, COL.public, DOC.publicProfile), publicProfileFor(next))
    addAudit(batch, branchId, actor, audit)
    await batch.commit()
  }
}

export function useRulesWriter() {
  const { branchId, actor } = useBranch()
  return async (next: BusinessRules, summary: string, changes: AuditChange[]) => {
    const batch = writeBatch(db)
    batch.update(doc(db, ROOT.branches, branchId), { businessRules: next, updatedAt: serverTimestamp(), updatedBy: actor.email })
    batch.set(
      doc(collection(db, ROOT.branches, branchId, COL.auditLog)),
      auditData(actor, { action: 'branch.rules', category: 'settings', entityType: 'branch', entityId: branchId, summary, changes }),
    )
    await batch.commit()
  }
}

export function cleanValue(f: FieldDef, v: unknown): unknown {
  if (f.kind === 'list' && Array.isArray(v)) return v.map((s) => String(s).trim()).filter(Boolean)
  return v
}

export function display(v: unknown): string | number | boolean | null {
  if (v === undefined || v === null) return null
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  if (Array.isArray(v)) return v.join(', ')
  return JSON.stringify(v)
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * The academy's stored overrides with these fields set from the draft: a value back at the standard setup is removed,
 * so only what the academy changed is kept. With the audit's changes.
 */
export function overridesFor(fields: FieldDef[], draft: BranchSettings, saved: BranchSettings, stored: SettingsOverrides): { overrides: SettingsOverrides; changes: AuditChange[] } {
  let overrides = stored
  const changes: AuditChange[] = []
  for (const f of fields) {
    const next = cleanValue(f, getPath(draft, f.path))
    const prev = getPath(saved, f.path)
    if (!same(next, prev)) changes.push({ field: f.path, label: f.label, from: display(prev), to: display(next) })
    overrides = same(next, getPath(DEFAULT_SETTINGS, f.path)) ? unsetPath(overrides, f.path) : setPath(overrides, f.path, next)
  }
  return { overrides, changes }
}

/** The academy's profile, as its page edits it. */
export interface ProfileDraft {
  name: string
  shortName: string
  timezone: string
  contact: BranchContact
}

const NO_CONTACT: BranchContact = { email: '', phone: '', address: '', website: '' }

export const profileOf = (b: Pick<Branch, 'name' | 'shortName' | 'timezone' | 'contact'>): ProfileDraft => ({
  name: b.name,
  shortName: b.shortName,
  timezone: b.timezone,
  contact: { ...NO_CONTACT, ...(b.contact ?? {}) },
})

const PROFILE_LABELS: [keyof Omit<ProfileDraft, 'contact'> | `contact.${keyof BranchContact}`, string][] = [
  ['name', 'Name'],
  ['shortName', 'Short name'],
  ['timezone', 'Time zone'],
  ['contact.email', 'Email'],
  ['contact.phone', 'Phone'],
  ['contact.website', 'Website'],
  ['contact.address', 'Address'],
]

const profileValue = (p: ProfileDraft, key: string): string => (key.startsWith('contact.') ? (p.contact[key.slice(8) as keyof BranchContact] ?? '') : String(p[key as keyof ProfileDraft] ?? ''))

/** What changed in the profile, for the save bar and the audit entry. */
export function profileChanges(saved: ProfileDraft, draft: ProfileDraft): AuditChange[] {
  return PROFILE_LABELS.filter(([k]) => profileValue(saved, k).trim() !== profileValue(draft, k).trim()).map(([k, label]) => ({ field: k, label, from: profileValue(saved, k), to: profileValue(draft, k).trim() }))
}

/** The academy document's fields for a profile draft (the name required; the short name falls back to it). */
export function profilePatch(p: ProfileDraft): Partial<Branch> {
  const name = p.name.trim()
  const trimmed = Object.fromEntries(Object.entries(p.contact).map(([k, v]) => [k, (v ?? '').trim()])) as unknown as BranchContact
  return { name, shortName: p.shortName.trim() || name, timezone: p.timezone, contact: trimmed }
}
