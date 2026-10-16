/**
 * Each deploy replaces the site's files, and page files get new names. A tab opened before the deploy still asks for
 * the old names, so opening another page fails. Reloading picks up the new build. Only one automatic reload is
 * allowed in a short window, so a page that keeps failing (a lost connection, a broken build) shows an error instead
 * of reloading forever.
 */

const KEY = 'skyarc:reloaded-at'
const WINDOW_MS = 30_000
let reloadStarted = false

const messageOf = (error: unknown) => (error instanceof Error ? error.message : typeof error === 'string' ? error : '')

/** A page's files couldn't be loaded (the browsers word it differently). */
export function isStaleBuildError(error: unknown): boolean {
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i.test(
    messageOf(error),
  )
}

/**
 * Reloads the page. The file that failed is fetched again first, past the browser's cache: build files are cached for
 * a year, and so is a "not found" for one, which would otherwise outlive the file coming back. Chrome and Firefox name
 * the file in the error; Safari doesn't.
 */
export async function reloadPage(error?: unknown): Promise<void> {
  const url = /https?:\/\/\S+?\.(?:js|css)\b/.exec(messageOf(error))?.[0]
  if (url) await fetch(url, { cache: 'reload' }).catch(() => undefined)
  window.location.reload()
}

/** Reloads for the new build unless it just did; true while a reload is under way. */
export function reloadForNewBuild(error?: unknown): boolean {
  if (reloadStarted) return true
  try {
    const last = Number(sessionStorage.getItem(KEY)) || 0
    if (Date.now() - last < WINDOW_MS) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    // Without storage there's no guard against a reload loop: leave it to the person.
    return false
  }
  reloadStarted = true
  void reloadPage(error)
  return true
}
