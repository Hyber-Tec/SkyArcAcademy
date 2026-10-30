import { doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { COL } from '@shared/paths'
import { composeReport, reportName } from '@shared/reports/compose'
import { evaluationsFingerprint, reportFacts } from '@shared/reports/facts'
import { templateNarrative } from '@shared/reports/template'
import { NARRATIVE_KEYS, NARRATIVE_LABELS, type NarrativeKey, type ReportNarrative, type ReportOptions, type ReportPreset, type SectionMeta } from '@shared/reports/types'
import type { DateKey } from '@shared/time'
import type { Branch, Student, WithId } from '@shared/types'
import { type Actor, addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef } from '@/lib/firestore'
import { loadComposeInputs } from './data'
import type { Report } from './model'

/**
 * Writes for progress reports. Admins make and edit drafts; admins and coaches share them; only admins stop sharing,
 * rename or delete (firestore.rules). Each write carries its audit entry in the same batch.
 */

const ref = (branchId: string, id: string) => branchDocRef(branchId, COL.progressReports, id)
const person = (actor: Actor) => ({ email: actor.email, name: actor.name, role: actor.role })

function audit(batch: ReturnType<typeof writeBatch>, branchId: string, actor: Actor, r: { id: string; studentId: string; studentName: string }, action: string, summary: string, changes: { field: string; label: string; from: string | null; to: string | null }[] = []) {
  addAudit(batch, branchId, actor, { action, category: 'reports', entityType: 'progressReport', entityId: r.id, summary, studentId: r.studentId, studentName: r.studentName, changes })
}

function firstLast(s: Pick<Student, 'firstName' | 'lastName' | 'name'>) {
  const parts = s.name.trim().split(/\s+/)
  return { firstName: s.firstName?.trim() || parts[0] || s.name, lastName: s.lastName?.trim() || parts.slice(1).join(' ') }
}

/** Composes a draft from the student's evaluations and classes in the period, and saves it. Returns its ID. */
export async function createReport(opts: {
  branchId: string
  branch: WithId<Branch>
  actor: Actor
  student: WithId<Student>
  period: { from: DateKey; to: DateKey; preset: ReportPreset }
}): Promise<string> {
  const { branchId, branch, actor, student, period } = opts
  const inputs = await loadComposeInputs(branchId, student.id, period.from, period.to)
  if (!inputs.evaluations.length) throw new Error('There are no scored evaluations in this period.')
  const composed = composeReport({
    academy: {
      name: branch.name,
      contact: { phone: branch.contact?.phone ?? '', email: branch.contact?.email ?? '', website: branch.contact?.website ?? '', address: branch.contact?.address ?? '' },
    },
    student: { id: student.id, name: student.name, ...firstLast(student), level: student.level ?? null, program: student.program ?? null },
    period,
    evaluations: inputs.evaluations,
    sessions: inputs.sessions,
    previous: inputs.previous,
    earlier: inputs.earlier,
    by: person(actor),
  })
  const id = doc(branchCol(branchId, COL.progressReports)).id
  const batch = writeBatch(db)
  batch.set(ref(branchId, id), { ...composed, generatedAt: serverTimestamp(), updatedAt: serverTimestamp(), sharedAt: null, firstViewedAt: null })
  audit(batch, branchId, actor, { id, studentId: student.id, studentName: student.name }, 'report.create', `Prepared ${student.name}'s ${reportName(composed)}`)
  await batch.commit()
  return id
}

/** Saves edited sections (drafts only); the sections touched become the staff's own. */
export async function saveNarrative(branchId: string, actor: Actor, r: Report, narrative: ReportNarrative, touched: NarrativeKey[]) {
  const sections: Partial<Record<NarrativeKey, SectionMeta>> = { ...(r.narrativeMeta?.sections ?? {}) }
  for (const k of touched) {
    const restored = JSON.stringify(narrative[k]) === JSON.stringify(r.narrativeOriginal?.[k])
    if (restored) delete sections[k]
    else sections[k] = { source: 'staff', editedBy: actor.name, editedAt: new Date().toISOString() }
  }
  const batch = writeBatch(db)
  batch.update(ref(branchId, r.id), { narrative, narrativeMeta: { ...(r.narrativeMeta ?? { source: 'template' }), sections }, updatedAt: serverTimestamp(), updatedBy: actor.email })
  audit(
    batch,
    branchId,
    actor,
    r,
    'report.edit',
    `Edited ${r.studentName}'s ${reportName(r)}`,
    touched.map((k) => ({ field: `narrative.${k}`, label: NARRATIVE_LABELS[k], from: null, to: 'edited' })),
  )
  await batch.commit()
}

/** Turns one part of the report on or off (drafts only). */
export async function setOption(branchId: string, actor: Actor, r: Report, key: keyof ReportOptions, value: boolean) {
  const batch = writeBatch(db)
  batch.update(ref(branchId, r.id), { [`options.${key}`]: value, updatedAt: serverTimestamp(), updatedBy: actor.email })
  await batch.commit()
}

/**
 * Recomputes the figures from the student's current evaluations and classes, keeping every section staff wrote:
 * only standard-text sections follow the new figures.
 */
export async function refreshFigures(branchId: string, actor: Actor, r: Report) {
  const inputs = await loadComposeInputs(branchId, r.studentId, r.startDate, r.endDate)
  if (!inputs.evaluations.length) throw new Error('There are no scored evaluations in this period any more.')
  const { facts, series } = reportFacts(inputs.evaluations, inputs.sessions, inputs.previous, inputs.earlier)
  const fresh = templateNarrative(facts, r.student.firstName, r.period.label)
  const edited = r.narrativeMeta?.sections ?? {}
  const narrative = Object.fromEntries(NARRATIVE_KEYS.map((k) => [k, edited[k]?.source === 'staff' ? r.narrative[k] : fresh[k]])) as unknown as ReportNarrative
  const batch = writeBatch(db)
  batch.update(ref(branchId, r.id), {
    facts,
    series,
    evaluationCount: series.length,
    source: { evaluationIds: series.map((s) => s.id), fingerprint: evaluationsFingerprint(inputs.evaluations) },
    narrative,
    narrativeOriginal: fresh,
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  })
  audit(batch, branchId, actor, r, 'report.refresh', `Updated the figures of ${r.studentName}'s ${reportName(r)} (${series.length} evaluations)`)
  await batch.commit()
}

/** Shares a draft with the family (admins and coaches). Cloud Functions tell the family, by email if asked. */
export async function shareReport(branchId: string, actor: Actor, r: Report, emailFamily: boolean) {
  const batch = writeBatch(db)
  batch.update(ref(branchId, r.id), {
    status: 'shared',
    sharedWithParents: true,
    sharedAt: serverTimestamp(),
    sharedBy: { ...person(actor), emailFamily },
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  })
  audit(batch, branchId, actor, r, 'report.share', `Shared ${r.studentName}'s ${reportName(r)} with the family${emailFamily ? ' and asked to email them' : ''}`)
  await batch.commit()
}

/** Back to a draft: the family no longer sees it (admins). */
export async function unshareReport(branchId: string, actor: Actor, r: Report) {
  const batch = writeBatch(db)
  batch.update(ref(branchId, r.id), { status: 'draft', sharedWithParents: false, updatedAt: serverTimestamp(), updatedBy: actor.email })
  audit(batch, branchId, actor, r, 'report.unshare', `Stopped sharing ${r.studentName}'s ${reportName(r)}`)
  await batch.commit()
}

export async function renameReport(branchId: string, actor: Actor, r: Report, name: string) {
  const customName = name.trim().slice(0, 120) || null
  const batch = writeBatch(db)
  batch.update(ref(branchId, r.id), { customName, updatedAt: serverTimestamp(), updatedBy: actor.email })
  audit(batch, branchId, actor, r, 'report.rename', `Renamed ${r.studentName}'s ${reportName(r)}`, [{ field: 'customName', label: 'Name', from: r.customName ?? null, to: customName }])
  await batch.commit()
}

export async function deleteReport(branchId: string, actor: Actor, r: Report) {
  const batch = writeBatch(db)
  batch.delete(ref(branchId, r.id))
  audit(batch, branchId, actor, r, 'report.delete', `Deleted ${r.studentName}'s ${reportName(r)}`)
  await batch.commit()
}
