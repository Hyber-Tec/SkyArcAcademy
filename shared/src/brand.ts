/** The app's name, where it lives, who builds it, and the address its emails come from. */
export const PRODUCT_NAME = 'Sky Arc'
/** The academy's full name, for public pages and emails sent before its own document is read. */
export const ACADEMY_NAME = 'Sky Arc Sports Academy'
export const COMPANY_NAME = 'HyberTec LLC'
/** The website: the only address in links and emails, until the academy's own domain points at it. */
export const APP_DOMAIN = 'skyarcacademy.web.app'
export const APP_URL = `https://${APP_DOMAIN}`
/** HyberTec's Gmail sends for now; whether the academy gets an address of its own is an open question (docs/DECISIONS.md). */
export const SENDER_EMAIL = 'hybertecofficial@gmail.com'

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
