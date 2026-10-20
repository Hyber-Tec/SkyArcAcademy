import { ACADEMY_NAME, APP_URL } from '../brand'
import { CONTACT_TOPIC_LABELS, type CleanMessage, type ContactTopic, TRIAL_EXPERIENCE_LABELS, type TrialExperience } from '../website/messages'
import type { EmailContent } from './invite'
import { emailLogo } from './logo'

/**
 * The email the office gets when a family sends a trial request or a question from the website. Replying answers the
 * family (the email's Reply-To is theirs); the CRM's Website page keeps every message too.
 */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const grade = (g: string) => (g === 'other' ? 'Other grade' : `Grade ${g}`)

/** The message as label–value lines, shared by the email's HTML and text and the CRM notification. */
export function websiteMessageLines(m: CleanMessage): { label: string; value: string }[] {
  const lines: { label: string; value: string }[] = []
  if (m.kind === 'trial' && m.athlete) {
    lines.push({ label: 'Athlete', value: `${m.athlete.firstName} ${m.athlete.lastName}` })
    lines.push({ label: 'Grade', value: grade(m.athlete.grade) })
    lines.push({ label: 'Experience', value: TRIAL_EXPERIENCE_LABELS[m.athlete.experience as TrialExperience] ?? m.athlete.experience })
    lines.push({ label: 'Days that suit them', value: m.days.join('\n') })
  } else {
    lines.push({ label: 'About', value: CONTACT_TOPIC_LABELS[m.topic as ContactTopic] ?? m.topic })
  }
  lines.push({ label: m.kind === 'trial' ? 'Parent or guardian' : 'From', value: m.name })
  lines.push({ label: 'Email', value: m.email })
  if (m.phone) lines.push({ label: 'Phone', value: m.phone })
  lines.push({ label: 'Reply in', value: m.lang === 'ko' ? 'Korean' : 'English' })
  if (m.message) lines.push({ label: m.kind === 'trial' ? 'Notes' : 'Message', value: m.message })
  return lines
}

/** "Trial request: Sam Doe" / "Question from Pat Doe". */
export function websiteMessageTitle(m: CleanMessage): string {
  return m.kind === 'trial' && m.athlete ? `Trial request: ${m.athlete.firstName} ${m.athlete.lastName}` : `Question from ${m.name}`
}

export function websiteMessageEmail(m: CleanMessage, academyName = ACADEMY_NAME, appUrl = APP_URL): EmailContent {
  const title = websiteMessageTitle(m)
  const intro = m.kind === 'trial' ? `${m.name} asked for Trial One on the website. Reply to this email to answer them.` : `${m.name} sent a question from the website. Reply to this email to answer them.`
  const lines = websiteMessageLines(m)
  const inbox = `${appUrl}/admin/website/messages`
  const text = [intro, '', ...lines.map((l) => `${l.label}: ${l.value.includes('\n') ? `\n${l.value}` : l.value}`), '', `All messages: ${inbox}`, '', '—', `${academyName} · ${appUrl}`].join('\n')

  const rows = lines
    .map(
      (l) =>
        `<tr><td style="padding:8px 12px 8px 0;vertical-align:top;font-size:13px;line-height:20px;color:#71717a;white-space:nowrap;">${esc(l.label)}</td><td style="padding:8px 0;vertical-align:top;font-size:15px;line-height:22px;color:#18181b;">${esc(l.value).replace(/\n/g, '<br>')}</td></tr>`,
    )
    .join('')
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;padding:32px;">
${emailLogo(appUrl)}
<h1 style="margin:0 0 12px;font-size:22px;line-height:30px;font-weight:600;color:#18181b;">${esc(title)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:24px;color:#3f3f46;">${esc(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4e4e7;">${rows}</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0;"><tr>
<td style="border-radius:10px;background:#18181b;"><a href="mailto:${esc(m.email)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Reply to ${esc(m.name)}</a></td>
</tr></table>
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:18px;color:#71717a;">
<p style="margin:0 0 8px;">Sent from the website's ${m.kind === 'trial' ? 'trial' : 'contact'} form. Every message is also on the CRM's Website page: <a href="${esc(inbox)}" style="color:#71717a;">${esc(inbox.replace(/^https?:\/\//, ''))}</a></p>
<p style="margin:0;">${esc(academyName)} · <a href="${esc(appUrl)}" style="color:#71717a;">${esc(appUrl.replace(/^https?:\/\//, ''))}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
  return { subject: `${title} (website)`, text, html }
}
