/** The app's name, where it lives, who builds it, and the address its emails come from. */
export const PRODUCT_NAME = 'Sky Arc'
/** The academy's full name, for public pages and emails sent before its own document is read. */
export const ACADEMY_NAME = 'Sky Arc Sports Academy'
export const COMPANY_NAME = 'HyberTec LLC'
/**
 * The website: the address in every link and email, the academy's own domain (docs/DEPLOY.md, "Moving to
 * skyarcacademy.com"). Firebase's own address, skyarcacademy.web.app, serves the same site and keeps working: the phone
 * app 1.0 and 1.1 open it, and older emails link to it.
 */
export const APP_DOMAIN = 'skyarcacademy.com'
export const APP_URL = `https://${APP_DOMAIN}`

/** The phone app in the stores (the owner's listings), for a family who signed with a link: their contract is in it too. */
export const APP_STORE_URL = 'https://apps.apple.com/us/app/sky-arc-sports-academy/id6825479602'
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.skyarcacademy.app'
/** The academy's own address sends the app's email, through Gmail with its app password (docs/DECISIONS.md §40). */
export const SENDER_EMAIL = 'info@skyarcacademy.com'

/** The sign-in link; `email` pre-selects that Google account and fills in the email field. */
export function signInUrl(email?: string | null, base = APP_URL): string {
  return email ? `${base}/login?email=${encodeURIComponent(email)}` : `${base}/login`
}

/** The page where a signed-in coach or parent asks the academy for access. */
export function joinUrl(base = APP_URL): string {
  return `${base}/join`
}

/** Addresses that never get email (tests and examples). */
export function isReservedEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  return !domain || /(^|\.)(test|example|invalid|localhost)$/.test(domain) || /(^|\.)example\.(com|net|org)$/.test(domain)
}
