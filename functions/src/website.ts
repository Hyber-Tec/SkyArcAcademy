import { createHash } from 'node:crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions/v2'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { ACADEMY_ID } from '@shared/academy'
import { ACADEMY_NAME, isReservedEmail } from '@shared/brand'
import type { Announcement } from '@shared/comms'
import { websiteMessageEmail, websiteMessageLines, websiteMessageTitle } from '@shared/email/websiteMessage'
import { COL, DOC, ROOT } from '@shared/paths'
import type { BranchPublicProfile, Member } from '@shared/types'
import { type WebsiteMessageInput, checkWebsiteMessage, isBotMessage } from '@shared/website/messages'
import { postExcerpt } from '@shared/website/posts'
import type { WebsitePost } from '@shared/website/types'
import { db, LIGHT } from './app'
import { gmailAppPassword, sendMail } from './email'
import { sendNotifications } from './notify'

// ------------------------------------------------------------------ messages

/** How many messages one sender may send: per device (its network address) and per email, each hour; and a day's cap. */
const LIMITS = { perAddress: 5, perEmail: 3, perDay: 200 }
const HOUR = 3_600_000

/** The sender's network address, never stored as is: a hash keys their count. */
function senderKey(kind: 'ip' | 'email', value: string): string {
  return `${kind}-${createHash('sha256').update(`${ACADEMY_ID}:${value}`).digest('hex').slice(0, 32)}`
}

function addressOf(raw: { headers: Record<string, string | string[] | undefined>; ip?: string }): string {
  const forwarded = raw.headers['x-forwarded-for']
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
  return first || raw.ip || 'unknown'
}

/** Counts this message against the sender's limits; false when one is used up. */
async function withinLimits(address: string, email: string): Promise<boolean> {
  const base = `${ROOT.branches}/${ACADEMY_ID}/${COL.websiteLimits}`
  const now = Date.now()
  const day = new Date(now).toISOString().slice(0, 10)
  const refs = [
    { ref: db.doc(`${base}/${senderKey('ip', address)}`), max: LIMITS.perAddress, window: HOUR },
    { ref: db.doc(`${base}/${senderKey('email', email)}`), max: LIMITS.perEmail, window: HOUR },
    { ref: db.doc(`${base}/day-${day}`), max: LIMITS.perDay, window: 24 * HOUR },
  ]
  return db.runTransaction(async (tx) => {
    const snaps = await Promise.all(refs.map((r) => tx.get(r.ref)))
    const recent = snaps.map((s, i) => ((s.data()?.times as number[] | undefined) ?? []).filter((t) => t > now - refs[i].window))
    if (recent.some((times, i) => times.length >= refs[i].max)) return false
    refs.forEach((r, i) => tx.set(r.ref, { times: [...recent[i], now], expiresAt: Timestamp.fromMillis(now + r.window) }))
    return true
  })
}

/**
 * A trial request or a question from the website (web/src/site): anyone may call it, so it checks the form again,
 * drops what bots send (a field people never see), and limits how often one sender can send. The message is kept for
 * the CRM's Website page, owners and admins get a notification, and the office an email they can reply to: the
 * academy's email from Settings → Academy, or the owners' and admins' own until that's set.
 */
export const websiteMessage = onCall({ secrets: [gmailAppPassword], timeoutSeconds: 60, ...LIGHT }, async (req) => {
  const input = (req.data ?? {}) as WebsiteMessageInput
  if (isBotMessage(input)) return { ok: true }
  const checked = checkWebsiteMessage(input)
  if (!checked.ok) throw new HttpsError('invalid-argument', 'Some fields need another look.', { errors: checked.errors })
  const m = checked.value

  if (!(await withinLimits(addressOf(req.rawRequest), m.email))) {
    throw new HttpsError('resource-exhausted', 'Too many messages just now. Please try again later.')
  }

  const branch = `${ROOT.branches}/${ACADEMY_ID}`
  const ref = db.collection(`${branch}/${COL.websiteMessages}`).doc()
  await ref.set({ ...m, status: 'new', createdAt: FieldValue.serverTimestamp(), doneAt: null, doneBy: null })

  const [staff, profileSnap] = await Promise.all([
    db.collection(`${branch}/${COL.members}`).where('role', 'in', ['owner', 'admin']).get(),
    db.doc(`${branch}/${COL.public}/${DOC.publicProfile}`).get(),
  ])
  const office = staff.docs.filter((d) => (d.data() as Member).status === 'active').map((d) => d.id)
  const lines = websiteMessageLines(m)
  const summary =
    m.kind === 'trial'
      ? `${lines.find((l) => l.label === 'Grade')?.value ?? ''} · ${m.days.length} ${m.days.length === 1 ? 'day' : 'days'} that suit them · ${m.name}`
      : `${lines.find((l) => l.label === 'About')?.value ?? ''} · ${m.message.slice(0, 120)}`
  try {
    await sendNotifications(
      ACADEMY_ID,
      office.map((key) => ({
        recipientKey: key,
        type: 'website_message' as const,
        title: websiteMessageTitle(m),
        body: summary,
        link: 'admin/website/messages',
        refs: { messageId: ref.id },
      })),
      `site-${ref.id}`,
    )
  } catch (e) {
    logger.error('Website message: notifying the office failed', { id: ref.id, error: String(e) })
  }

  const profile = profileSnap.data() as BranchPublicProfile | undefined
  const academyEmail = profile?.contact?.email?.trim()
  const to = (academyEmail ? [academyEmail] : office).filter((e) => !isReservedEmail(e))
  const mail = websiteMessageEmail(m, profile?.name?.trim() || ACADEMY_NAME)
  for (const address of to) {
    const result = await sendMail({ to: address, subject: mail.subject, html: mail.html, text: mail.text, fromName: `${profile?.name?.trim() || ACADEMY_NAME} website`, replyTo: m.email })
    if (result.status !== 'sent') logger.warn('Website message: the email to the office was not sent', { id: ref.id, status: result.status })
  }
  return { ok: true }
})

// ------------------------------------------------------------------ news

const RELEVANT: (keyof Announcement)[] = ['title', 'contentHtml', 'website', 'archived', 'pinned']

/**
 * Keeps the website's copy of an announcement shown "On the website" (`websitePosts/{id}`, which anyone can read): the
 * title, text, category, cover, pin and dates, never its author, audience, comments or attachments. Switching it off,
 * archiving it or deleting it takes it off the website. Called by onAnnouncementWritten.
 */
export async function syncWebsitePost(branchId: string, id: string, before: Announcement | undefined, after: Announcement | undefined) {
  const ref = db.doc(`${ROOT.branches}/${branchId}/${COL.websitePosts}/${id}`)
  const on = !!after && after.website?.on === true && !after.archived && !!after.website.slug
  if (!on) {
    if (before?.website?.on) await ref.delete()
    if (!after) {
      try {
        await getStorage().bucket().deleteFiles({ prefix: `branches/${branchId}/website/posts/${id}/` })
      } catch (e) {
        logger.warn('Could not delete the website copy’s files', { branchId, id, error: String(e) })
      }
    }
    return
  }
  // Read counts and comment counts change the post too: only what the website shows matters.
  const existing = await ref.get()
  if (existing.exists && before && RELEVANT.every((k) => JSON.stringify(before[k] ?? null) === JSON.stringify(after[k] ?? null))) return
  const firstTime = !existing.exists
  const created = after.createdAt as unknown as Timestamp | null | undefined
  const copy: Omit<WebsitePost, 'publishedAt' | 'updatedAt'> & { publishedAt?: Timestamp; updatedAt: FieldValue } = {
    slug: after.website!.slug,
    title: after.title,
    html: after.contentHtml,
    excerpt: postExcerpt(after.contentHtml),
    category: after.website!.category,
    cover: after.website!.cover ?? null,
    pinned: after.pinned === true,
    updatedAt: FieldValue.serverTimestamp(),
  }
  // The date the website shows: when the post went on it (a post written for the website keeps its own date).
  if (firstTime) copy.publishedAt = !before && created ? created : Timestamp.now()
  await ref.set(copy, { merge: true })
}
