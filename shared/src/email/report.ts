import { ACADEMY_NAME, APP_URL } from '../brand'
import type { EmailContent } from './invite'

/** The email a parent (or the student) gets when the academy shares a progress report. */
export interface ReportEmailInput {
  to: string
  /** The recipient's name, if known. */
  name: string
  studentFirstName: string
  academyName: string
  /** "September 2026". */
  periodLabel: string
  evaluations: number
  /** Average per 10 shots, whole numbers; null without scores. */
  average: number | null
  /** The sign-in link that opens the report. */
  url: string
  /** The student's own account rather than a parent's. */
  forStudent: boolean
  appUrl?: string
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const one = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/** The words, shared by the HTML and plain-text versions. */
export function reportCopy(i: ReportEmailInput) {
  const first = i.name.trim().split(/\s+/)[0] ?? ''
  const whose = i.forStudent ? 'your' : `${i.studentFirstName}’s`
  const results = i.evaluations
    ? ` It covers ${i.evaluations} scored ${i.evaluations === 1 ? 'evaluation' : 'evaluations'}${i.average !== null ? `, averaging ${one(i.average)} per 10 shots` : ''}.`
    : ''
  return {
    subject: i.forStudent ? `Your ${i.periodLabel} progress report` : `${i.studentFirstName}’s ${i.periodLabel} progress report`,
    title: i.forStudent ? 'Your progress report is ready' : `${i.studentFirstName}’s progress report is ready`,
    greeting: first ? `Hi ${first},` : 'Hi,',
    intro: `${i.academyName} shared ${whose} progress report for ${i.periodLabel}.${results}`,
    button: 'Read the report',
    why: i.forStudent
      ? `You’re getting this because your account at ${i.academyName} is linked to your student record.`
      : `You’re getting this because your account at ${i.academyName} is linked to ${i.studentFirstName}.`,
  }
}

export function reportEmail(i: ReportEmailInput): EmailContent {
  const appUrl = i.appUrl ?? APP_URL
  const c = reportCopy(i)
  const text = [
    c.greeting,
    '',
    c.intro,
    '',
    `Sign in to read it: ${i.url}`,
    `Use ${i.to} to sign in.`,
    '',
    '—',
    c.why,
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
<td style="vertical-align:middle;padding-left:10px;font-size:16px;font-weight:600;color:#18181b;">${esc(i.academyName)}</td>
</tr></table>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;padding:32px;">
<h1 style="margin:0 0 20px;font-size:22px;line-height:30px;font-weight:600;color:#18181b;">${esc(c.title)}</h1>
<p style="${p}">${esc(c.greeting)}</p>
<p style="${p}">${esc(c.intro)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr>
<td style="border-radius:10px;background:#18181b;"><a href="${esc(i.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(c.button)}</a></td>
</tr></table>
<p style="margin:0;font-size:14px;line-height:22px;color:#3f3f46;">Sign in with <strong>${esc(i.to)}</strong> to see it.</p>
<p style="margin:20px 0 0;font-size:13px;line-height:20px;color:#71717a;">Button not working? Paste this link into your browser:<br><a href="${esc(i.url)}" style="color:#52525b;word-break:break-all;">${esc(i.url)}</a></p>
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:18px;color:#71717a;">
<p style="margin:0 0 8px;">${esc(c.why)}</p>
<p style="margin:0;">${esc(ACADEMY_NAME)} · <a href="${esc(appUrl)}" style="color:#71717a;">${esc(appUrl.replace(/^https?:\/\//, ''))}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
  return { subject: c.subject, text, html }
}

/** The sign-in link that lands on a report. */
export function reportSignInUrl(reportId: string, email: string, base = APP_URL): string {
  return `${base}/login?next=${encodeURIComponent(`/report/${reportId}`)}&email=${encodeURIComponent(email)}`
}
