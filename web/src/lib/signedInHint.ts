/**
 * The public website's header says "Open the app" instead of "Log in" on a browser that's signed in to the app. The
 * website doesn't load Firebase, so the app leaves this note in the browser when someone signs in or out.
 */
export const SIGNED_IN_HINT = 'skyarc-signed-in'

export function noteSignedIn(signedIn: boolean) {
  try {
    if (signedIn) localStorage.setItem(SIGNED_IN_HINT, '1')
    else localStorage.removeItem(SIGNED_IN_HINT)
  } catch {
    // Private windows: the website just says "Log in".
  }
}

export function seemsSignedIn(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_HINT) === '1'
  } catch {
    return false
  }
}
