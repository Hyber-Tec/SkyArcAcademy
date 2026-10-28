import { ACADEMY_NAME, APP_URL } from '../brand'
import type { EmailContent } from './invite'
import { emailLogo } from './logo'

/** The email with a signing link: a parent reads and signs a student's enrollment contract (docs/DECISIONS.md §23, F4). */
export interface ContractEmailInput {
  to: string
  academyName: string
  studentFirstName: string
  /** The signing page (`/sign/{token}`). */
  url: string
  /** "November 27, 2026": the last day the link works, in the academy's time zone. */
  expiresOn: string
  appUrl?: string
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** The words, shared by the HTML and plain-text versions. */
export function contractCopy(i: ContractEmailInput) {
  return {
    subject: `Please sign ${i.studentFirstName}’s enrollment contract`,
    title: `${i.studentFirstName}’s enrollment contract`,
    intro: `${i.academyName} sent you ${i.studentFirstName}’s enrollment contract to read and sign. It takes a few minutes on your phone or computer, and you don’t need an account or an app.`,
    button: 'Read and sign',
    until: `The link works until ${i.expiresOn}, for one signature. You’ll get a copy of the signed contract to keep.`,
    why: `You’re getting this because ${i.academyName} has this address as a contact for ${i.studentFirstName}.`,
  }
}

export function contractEmail(i: ContractEmailInput): EmailContent {
  const appUrl = i.appUrl ?? APP_URL
  const c = contractCopy(i)
  const text = [c.title, '', c.intro, '', `Read and sign: ${i.url}`, '', c.until, '', '—', c.why, `${ACADEMY_NAME} · ${appUrl}`].join('\n')

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
<tr><td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;padding:32px;">
${emailLogo(appUrl)}
<h1 style="margin:0 0 20px;font-size:22px;line-height:30px;font-weight:600;color:#18181b;">${esc(c.title)}</h1>
<p style="${p}">${esc(c.intro)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr>
<td style="border-radius:10px;background:#18181b;"><a href="${esc(i.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(c.button)}</a></td>
</tr></table>
<p style="margin:0;font-size:14px;line-height:22px;color:#3f3f46;">${esc(c.until)}</p>
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
