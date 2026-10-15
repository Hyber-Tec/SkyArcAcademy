import { ACADEMY_NAME, APP_URL } from '../brand'
import { ROLE_LABELS, type Role } from '../roles'

/**
 * Why someone gets a sign-in email:
 * - `owner`: they were added as an owner.
 * - `promoted_owner`: an existing member became an owner.
 * - `added`: an owner or admin gave them access (or resent the email).
 * - `approved`: the academy approved their sign-up request.
 */
export type InviteKind = 'owner' | 'promoted_owner' | 'added' | 'approved'

export interface InviteEmailInput {
  kind: InviteKind
  to: string
  /** The person's name, if known. */
  name: string
  role: Role
  branchName: string
  /** The name of who gave the access, if known. */
  inviterName: string | null
  signInUrl: string
  appUrl?: string
}

export interface EmailContent {
  subject: string
  text: string
  html: string
}

const ROLE_BLURB: Record<Role, string> = {
  owner: 'You can manage everything there: the schedule, students, employees, payroll and who has access.',
  admin: 'You can run the schedule and manage students, employees and payroll.',
  coach: 'You can see your schedule, set your availability and read announcements.',
  parent: 'You can see your child’s classes.',
  student: 'You can see your classes.',
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a')

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function isGoogleMail(email: string) {
  return /@(gmail|googlemail)\.com$/i.test(email)
}

/** The words of an invite, shared by the HTML and plain-text versions. */
export function inviteCopy(i: InviteEmailInput) {
  const roleLabel = ROLE_LABELS[i.role].toLowerCase()
  const asRole = `${article(roleLabel)} ${roleLabel}`
  const who = i.inviterName ?? i.branchName
  const first = i.name.trim().split(/\s+/)[0] ?? ''
  const greeting = first ? `Hi ${first},` : 'Hi,'
  switch (i.kind) {
    case 'owner':
    case 'promoted_owner':
      return {
        subject: `You’re now an owner of ${i.branchName}`,
        title: `You’re now an owner of ${i.branchName}`,
        greeting,
        intro: `${who} made you an owner of ${i.branchName}. ${ROLE_BLURB.owner}`,
        button: `Sign in to ${i.branchName}`,
      }
    case 'approved':
      return {
        subject: `${i.branchName} approved your request`,
        title: `Welcome to ${i.branchName}`,
        greeting,
        intro: `${i.branchName} approved your request to join as ${asRole}. ${ROLE_BLURB[i.role]}`,
        button: `Sign in to ${i.branchName}`,
      }
    case 'added':
      return {
        subject: `You’ve been added to ${i.branchName}`,
        title: `Welcome to ${i.branchName}`,
        greeting,
        intro: `${i.inviterName ? `${i.inviterName} added you` : `You’ve been added`} to ${i.branchName} as ${asRole}. ${ROLE_BLURB[i.role]}`,
        button: `Sign in to ${i.branchName}`,
      }
  }
}

/** The email a person gets when they're given access to a branch. */
export function inviteEmail(i: InviteEmailInput): EmailContent {
  const appUrl = i.appUrl ?? APP_URL
  const c = inviteCopy(i)
  // Gmail addresses are Google accounts; any other address can be one, or get a password of its own.
  const steps = isGoogleMail(i.to)
    ? [`Choose “Continue with Google” and use ${i.to}.`]
    : [`If ${i.to} is a Google account, choose “Continue with Google”.`, `Otherwise choose “Create an account” and set a password for ${i.to}. We’ll email you a link to confirm the address.`]
  const giver = i.inviterName ?? i.branchName
  const why =
    i.kind === 'approved'
      ? `You’re getting this because you asked to join ${i.branchName} with ${i.to}.`
      : `You’re getting this because ${giver} gave ${i.to} access to ${i.branchName}. If you weren’t expecting it, you can ignore this email.`

  const text = [
    c.greeting,
    '',
    c.intro,
    '',
    'How to sign in:',
    `1. Open ${i.branchName}’s sign-in page: ${i.signInUrl}`,
    ...steps.map((line, n) => `${n + 2}. ${line}`),
    '',
    '—',
    why,
    `${ACADEMY_NAME} · ${appUrl}`,
  ].join('\n')

  const p = 'margin:0 0 16px;font-size:15px;line-height:24px;color:#3f3f46;'
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(c.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(c.intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td style="padding:0 4px 20px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;"><img src="${esc(appUrl)}/brand/skyarc-email.png" width="36" height="36" alt="" style="display:block;border:0;border-radius:9px;"></td>
<td style="vertical-align:middle;padding-left:10px;font-size:16px;font-weight:600;color:#18181b;">${esc(ACADEMY_NAME)}</td>
</tr></table>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;padding:32px;">
<h1 style="margin:0 0 20px;font-size:22px;line-height:30px;font-weight:600;color:#18181b;">${esc(c.title)}</h1>
<p style="${p}">${esc(c.greeting)}</p>
<p style="${p}">${esc(c.intro)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr>
<td style="border-radius:10px;background:#18181b;"><a href="${esc(i.signInUrl)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(c.button)}</a></td>
</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #f4f4f5;border-radius:12px;">
<tr><td style="padding:16px 18px;font-size:14px;line-height:22px;color:#3f3f46;">
<div style="font-weight:600;color:#18181b;margin-bottom:6px;">How to sign in</div>
<div>1. Open the sign-in page with the button above.</div>
${steps.map((line, n) => `<div>${n + 2}. ${esc(line).replace('“Continue with Google”', '<strong>Continue with Google</strong>').replace('“Create an account”', '<strong>Create an account</strong>')}</div>`).join('\n')}
</td></tr>
</table>
<p style="margin:20px 0 0;font-size:13px;line-height:20px;color:#71717a;">Button not working? Paste this link into your browser:<br><a href="${esc(i.signInUrl)}" style="color:#52525b;word-break:break-all;">${esc(i.signInUrl)}</a></p>
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:18px;color:#71717a;">
<p style="margin:0 0 8px;">${esc(why)}</p>
<p style="margin:0;">${esc(ACADEMY_NAME)} · <a href="${esc(appUrl)}" style="color:#71717a;">${esc(appUrl.replace(/^https?:\/\//, ''))}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  return { subject: c.subject, text, html }
}
