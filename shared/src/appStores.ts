import { APP_STORE_URL, APP_URL, PLAY_STORE_URL } from './brand'

/**
 * The app's page on the website, which shows both stores; with `?go` (the address on the academy's printed sign), a
 * phone goes straight to its own store. (`/app` is the signed-in app's own home.)
 */
export const APP_PAGE_URL = `${APP_URL}/get-app`
export const APP_SIGN_URL = `${APP_PAGE_URL}?go`

export type PhoneKind = 'ios' | 'android' | 'other'

/** Which phone a browser is on: an iPhone or iPad (an iPad says it's a Mac, with a touch screen), Android, or neither. */
export function phoneKind(userAgent: string, maxTouchPoints = 0): PhoneKind {
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(userAgent)) return 'android'
  return 'other'
}

/** The store a phone gets the app from (null on a computer: it reads the page). */
export const storeFor = (kind: PhoneKind): string | null => (kind === 'ios' ? APP_STORE_URL : kind === 'android' ? PLAY_STORE_URL : null)
