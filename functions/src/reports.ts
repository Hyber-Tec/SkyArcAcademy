import { FieldValue, type Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { isReservedEmail } from '@shared/brand'
import { reportEmail, reportSignInUrl } from '@shared/email/report'
import { COL, ROOT } from '@shared/paths'
import type { ProgressReportDoc } from '@shared/reports/types'
import type { Branch, Member } from '@shared/types'
import { db, LIGHT } from './app'
import { gmailAppPassword, sendMail } from './email'
import { sendNotifications } from './notify'

const REPORT = 'branches/{branchId}/progressReports/{reportId}'

/**
 * A report shared with the family (an admin or a coach set it to shared in the app): every active parent account
 * linked to the student, and the student's own account, gets an inbox item, and an email with a sign-in link when the
 * person who shared it asked for one. What happened is written back on the report (`notify`), which admins see.
 */
export const onProgressReportWritten = onDocumentUpdated({ document: REPORT, secrets: [gmailAppPassword], timeoutSeconds: 120, ...LIGHT }, async (event) => {
  const { branchId, reportId } = event.params
  const before = event.data?.before.data() as ProgressReportDoc | undefined
  const after = event.data?.after.data() as ProgressReportDoc | undefined
  if (!before || !after || before.sharedWithParents || !after.sharedWithParents) return

  const members = db.collection(`${ROOT.branches}/${branchId}/${COL.members}`)
  const [parents, own, branchSnap] = await Promise.all([
    members.where('studentIds', 'array-contains', after.studentId).get(),
    members.where('studentId', '==', after.studentId).get(),
    db.doc(`${ROOT.branches}/${branchId}`).get(),
  ])
  const branch = branchSnap.data() as Branch | undefined
  const recipients = [...parents.docs, ...own.docs]
    .map((d) => ({ key: d.id, member: d.data() as Member }))
    .filter((r, i, all) => r.member.status === 'active' && (r.member.role === 'parent' || r.member.role === 'student') && all.findIndex((x) => x.key === r.key) === i)
  const first = after.student?.firstName || after.studentName
  const sharedMs = (after.sharedAt as Timestamp | null)?.toMillis?.() ?? Date.now()

  await sendNotifications(
    branchId,
    recipients.map((r) => ({
      recipientKey: r.key,
      type: 'report_shared' as const,
      title: r.member.role === 'student' ? 'Your progress report is ready' : `${first}’s progress report is ready`,
      body: `${after.period.label} progress report${branch?.name ? ` from ${branch.name}` : ''}.`,
      link: `report/${reportId}`,
      refs: { reportId },
    })),
    `report-${reportId}-${sharedMs}`,
  )

  let notify: NonNullable<ProgressReportDoc['notify']> = { status: 'skipped', at: FieldValue.serverTimestamp(), recipients: [], error: null }
  const emailable = recipients.filter((r) => !isReservedEmail(r.key))
  if (after.sharedBy?.emailFamily !== false && emailable.length && branch) {
    const results = []
    for (const r of emailable) {
      const mail = reportEmail({
        to: r.key,
        name: r.member.displayName ?? '',
        studentFirstName: first,
        academyName: branch.name,
        periodLabel: after.period.label,
        evaluations: after.evaluationCount ?? 0,
        average: after.facts?.average ?? null,
        url: reportSignInUrl(reportId, r.key),
        forStudent: r.member.role === 'student',
      })
      results.push(await sendMail({ to: r.key, ...mail, fromName: branch.name, replyTo: branch.contact?.email || null }))
    }
    const failed = results.find((x) => x.status === 'failed')
    notify = {
      status: results.some((x) => x.status === 'not_configured') ? 'not_configured' : failed ? 'failed' : 'sent',
      at: FieldValue.serverTimestamp(),
      recipients: emailable.map((r) => r.key),
      error: failed && failed.status === 'failed' ? failed.error : null,
    }
  }
  await event.data!.after.ref.update({ notify }).catch((e) => logger.warn('Could not record who was told about a report', { branchId, reportId, error: String(e) }))
})

/** A family member's first opening of a shared report shows as "Viewed" to staff. */
export const onReportViewed = onDocumentCreated({ document: `${REPORT}/views/{viewerKey}`, ...LIGHT }, async (event) => {
  const { branchId, reportId } = event.params
  const ref = db.doc(`${ROOT.branches}/${branchId}/${COL.progressReports}/${reportId}`)
  await db.runTransaction(async (tx) => {
    const r = await tx.get(ref)
    if (r.exists && !r.data()!.firstViewedAt) tx.update(ref, { firstViewedAt: FieldValue.serverTimestamp() })
  })
})
