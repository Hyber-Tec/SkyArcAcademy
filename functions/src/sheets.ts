import { applicationDefault } from 'firebase-admin/app'
import { logger } from 'firebase-functions/v2'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { db, LIGHT } from './app'
import { COL, ROOT } from '@shared/paths'
import { readSheetText } from '@shared/scores/sheet'
import type { Member } from '@shared/types'

/** Photos are shrunk on the device first; a PDF is sent as it is. */
const MAX_BASE64 = 8 * 1024 * 1024

/**
 * Reads a match's results sheet from its photo or PDF with Google's text reader (Cloud Vision, in the academy's own
 * Google project), and returns what it found (shared/src/scores/sheet.ts) for the staff to check before saving
 * (the manager's second meeting, docs/DECISIONS.md §23). Nothing is stored: the sheet's file is filed in the Drive by the
 * website when the result is saved.
 */
export const readResultsSheet = onCall({ timeoutSeconds: 60, memory: '512MiB', ...LIGHT }, async (req) => {
  const branchId = typeof req.data?.branchId === 'string' ? req.data.branchId : ''
  const content = typeof req.data?.content === 'string' ? req.data.content : ''
  const pdf = req.data?.mime === 'application/pdf'
  if (!branchId || branchId.includes('/') || !content) throw new HttpsError('invalid-argument', 'Choose a photo or a PDF of the results sheet.')
  if (content.length > MAX_BASE64) throw new HttpsError('invalid-argument', 'That file is too large to read. Try a photo.')
  const auth = req.auth
  if (!auth || typeof auth.token.email !== 'string' || auth.token.email_verified !== true) throw new HttpsError('unauthenticated', 'Sign in first.')
  const member = (await db.doc(`${ROOT.branches}/${branchId}/${COL.members}/${auth.token.email.toLowerCase()}`).get()).data() as Member | undefined
  if (!member || member.status !== 'active' || !['owner', 'admin', 'coach'].includes(member.role)) throw new HttpsError('permission-denied', 'Only the academy’s staff add results.')

  const { access_token } = await applicationDefault().getAccessToken()
  const feature = [{ type: 'DOCUMENT_TEXT_DETECTION' }]
  const url = pdf ? 'https://vision.googleapis.com/v1/files:annotate' : 'https://vision.googleapis.com/v1/images:annotate'
  const body = pdf
    ? { requests: [{ inputConfig: { content, mimeType: 'application/pdf' }, features: feature, pages: [1, 2] }] }
    : { requests: [{ image: { content }, features: feature }] }
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    logger.error('The text reader failed', { status: res.status, detail: detail.slice(0, 500) })
    throw new HttpsError('unavailable', res.status === 403 ? 'Reading sheets isn’t switched on yet. Type the numbers instead.' : 'The sheet couldn’t be read just now. Type the numbers instead.')
  }
  const out = (await res.json()) as {
    responses?: { fullTextAnnotation?: { text?: string }; responses?: { fullTextAnnotation?: { text?: string } }[]; error?: { message?: string } }[]
  }
  const first = out.responses?.[0]
  const text = pdf ? (first?.responses ?? []).map((r) => r.fullTextAnnotation?.text ?? '').join('\n') : (first?.fullTextAnnotation?.text ?? '')
  if (first?.error?.message) logger.warn('The text reader said', { message: first.error.message })
  return { reading: readSheetText(text), found: text.trim().length > 0 }
})
