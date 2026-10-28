import { type WriteBatch, doc, serverTimestamp } from 'firebase/firestore'
import { COL, DOC } from '@shared/paths'
import { hourlyRate, rateRecord } from '@shared/pay/rates'
import type { Compensation, Staff } from '@shared/types'
import { type Actor, addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol } from '@/lib/firestore'

export function compensationRef(branchId: string, staffId: string) {
  return doc(db, branchCol(branchId, COL.staff).path, staffId, 'private', DOC.compensation)
}

/**
 * Adds an employee's new hourly rate (with its history and audit entry) to a batch. Everyone has one rate
 * (docs/DECISIONS.md §23, K1), saved in both of `rates` until the phone app's update.
 */
export function writeCompensation(
  batch: WriteBatch,
  branchId: string,
  actor: Actor,
  staff: { id: string; name: string; role: Staff['role'] },
  before: Compensation | null,
  rate: number,
  effectiveFrom: string,
) {
  const rates = rateRecord(rate)
  const history = [...(before?.history ?? []), { effectiveFrom, rates, setAt: new Date().toISOString(), setBy: actor.email }]
  batch.set(compensationRef(branchId, staff.id), {
    rates,
    history,
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  })
  const was = before ? hourlyRate(before.rates) : null
  addAudit(batch, branchId, actor, {
    action: 'pay.rates',
    category: 'pay',
    entityType: 'staff',
    entityId: staff.id,
    summary: before ? `Changed the hourly rate for ${staff.name}` : `Set the hourly rate for ${staff.name}`,
    coachId: staff.id,
    coachName: staff.name,
    changes: was !== rate ? [{ field: 'rate', label: 'Hourly rate', from: was, to: rate }] : [],
  })
}
