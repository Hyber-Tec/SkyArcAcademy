import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { db, LIGHT } from './app'
import { sendNotifications } from './notify'
import { familyOf, noticesFor } from './recipients'
import { COL, ROOT } from '@shared/paths'
import { scoreAddedNotice } from '@shared/schedule/familyNotices'
import type { Evaluation } from '@shared/shooting/evaluation'
import { addDays, todayKey } from '@shared/time'
import type { Branch } from '@shared/types'

/** How recent a score must be for its family to hear of it: older ones are the past being filled in, not news. */
const NEWS_DAYS = 7

/**
 * A new score (a SIUS result, a paper card): the student's family hears of it ("every time I upload something: hey,
 * there's been a new file", the manager, 2026-10-27), with their "New scores" switch.
 */
export const onScoreCreated = onDocumentCreated({ document: `${ROOT.branches}/{branchId}/${COL.evaluations}/{evaluationId}`, ...LIGHT }, async (event) => {
  const e = event.data?.data() as Evaluation | undefined
  const { branchId, evaluationId } = event.params
  if (!e?.studentId) return
  const branch = (await db.doc(`${ROOT.branches}/${branchId}`).get()).data() as Branch | undefined
  if (branch?.status !== 'active' || e.dateKey < addDays(todayKey(branch.timezone || 'America/New_York'), -NEWS_DAYS)) return
  const family = await familyOf(branchId, e.studentId)
  const notice = scoreAddedNotice(e)
  await sendNotifications(
    branchId,
    noticesFor(family, notice, (p) => `${p.role === 'student' ? 'student' : 'parent'}/scores?score=${evaluationId}`, { evaluationId, dateKey: e.dateKey }),
    `score-${evaluationId}`,
  )
})
