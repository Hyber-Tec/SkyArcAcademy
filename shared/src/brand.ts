/** Who makes Hyber CRM, where it lives, and the address its emails come from. */
export const PRODUCT_NAME = 'Hyber CRM'
export const COMPANY_NAME = 'HyberTec LLC'
/** The website (owner, 2026-10-01): the only address in links and emails. */
export const APP_DOMAIN = 'hybercrm.com'
export const APP_URL = `https://${APP_DOMAIN}`
export const SENDER_EMAIL = 'hybertecofficial@gmail.com'

/** The sign-in link; `email` pre-selects that Google account and fills in the email field. */
export function signInUrl(email?: string | null, base = APP_URL): string {
  return email ? `${base}/login?email=${encodeURIComponent(email)}` : `${base}/login`
}

/** The page where a signed-in coach or parent asks the academy for access. */
export function joinUrl(base = APP_URL): string {
  return `${base}/join`
}

/** Addresses that never get email (tests, examples, and Demo Academy's logins on demo.hybercrm.com). */
export function isReservedEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  return (
    !domain ||
    /(^|\.)(test|example|invalid|localhost)$/.test(domain) ||
    /(^|\.)example\.(com|net|org)$/.test(domain) ||
    domain === `demo.${APP_DOMAIN}`
  )
}
