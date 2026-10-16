import { ACADEMY_NAME } from '../brand'

/** The PNG copy of the full logo (`scripts/brand-icons.ts`): email apps don't show SVG. Drawn at 3× on white. */
export const EMAIL_LOGO = { path: '/brand/skyarc-logo-email.png', width: 168, height: 81 }

/**
 * Sky Arc's full logo at the top of an email's white card. It sits on white of its own, so it stays readable when an
 * email app darkens the message; the alt text names the academy when images are blocked.
 */
export function emailLogo(appUrl: string): string {
  const src = `${appUrl}${EMAIL_LOGO.path}`.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  return `<img src="${src}" width="${EMAIL_LOGO.width}" height="${EMAIL_LOGO.height}" alt="${ACADEMY_NAME}" style="display:block;border:0;margin:0 0 28px;">`
}
