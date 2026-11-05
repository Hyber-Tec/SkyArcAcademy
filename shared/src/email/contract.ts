import { ACADEMY_NAME, APP_URL } from '../brand'
import type { EmailContent } from './invite'
import { emailLogo } from './logo'

/**
 * The email the office can send with a contract (its switch, off at first: docs/DECISIONS.md §34): a parent reads and
 * signs a student's enrollment contract with its link, or in the app.
 */
export interface ContractEmailInput {
  to: string
  academyName: string
  studentFirstName: string
  /** The signing page (`/sign/{token}`). */
  url: string
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
    until: `It’s also waiting in ${i.academyName}’s app, if you sign in with this email. Once it’s signed, you can download your copy.`,
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

/**
 * The signer's copy (docs/DECISIONS.md §35, the owner: "let's follow the law"): the contract as signed, attached as a
 * PDF, emailed to each signer as they sign, so they keep it, with where else it is and how to get it on paper.
 */
export interface SignedCopyEmailInput {
  to: string
  academyName: string
  studentFirstName: string
  /** As signed. */
  signerName: string
  /** The PDF attached. */
  fileName: string
  academyEmail?: string
  academyPhone?: string
  appUrl?: string
}

/** The words, shared by the HTML and plain-text versions. */
export function signedCopyWords(i: SignedCopyEmailInput) {
  const first = i.signerName.trim().split(/\s+/)[0] || i.signerName
  const contact = [i.academyPhone, i.academyEmail].filter(Boolean).join(' or ')
  return {
    subject: `Your signed copy of ${i.studentFirstName}’s enrollment contract`,
    title: `${i.studentFirstName}’s enrollment contract is signed`,
    intro: `Thank you, ${first}. Your copy of ${i.studentFirstName}’s enrollment contract with ${i.academyName}, as you signed it, is attached: ${i.fileName}. Please keep it for your records.`,
    where: `It’s also in ${i.academyName}’s app (More → Enrollment contracts) and on its website (Profile → Account) when you sign in with an email the academy has for you.`,
    paper: `Would you like a paper copy? Ask the academy${contact ? `: ${contact}` : ''}.`,
    why: `You’re getting this because you signed this contract with ${i.academyName}.`,
  }
}

export function signedCopyEmail(i: SignedCopyEmailInput): EmailContent {
  const appUrl = i.appUrl ?? APP_URL
  const c = signedCopyWords(i)
  const text = [c.title, '', c.intro, '', c.where, '', c.paper, '', '—', c.why, `${ACADEMY_NAME} · ${appUrl}`].join('\n')

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
<p style="${p}">${esc(c.where)}</p>
<p style="margin:0;font-size:14px;line-height:22px;color:#3f3f46;">${esc(c.paper)}</p>
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
