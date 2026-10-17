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

/** The build a page runs: its entry script, which gets a new name with every deploy ("/assets/app-1a2b3c.js"). */
function entryOf(doc: Document): string | null {
  return doc.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src') ?? null
}

let newBuildSeen = false

/** Whether the site now serves a newer build than this tab runs (asked of the network, past every cache). */
async function newBuildDeployed(): Promise<boolean> {
  const mine = entryOf(document)
  if (!mine) return false
  try {
    const res = await fetch('/app', { cache: 'no-store', credentials: 'same-origin' })
    if (!res.ok) return false
    const theirs = entryOf(new DOMParser().parseFromString(await res.text(), 'text/html'))
    return !!theirs && theirs !== mine
  } catch {
    // Offline, or the request was blocked: ask again later.
    return false
  }
}

/**
 * A tab or an installed app left open keeps running the build it opened with: pages it has already shown come from
 * the browser's cache, so nothing fails and nothing tells it a deploy happened. When the app comes back to the screen
 * (and every 15 minutes while it's in view), it asks whether a newer build is out and, if so, offers to reload
 * (`onNewBuild`). It never reloads by itself, so an upload or an edit in progress isn't cut off.
 */
export function watchForNewBuild(onNewBuild: () => void): void {
  let lastAsked = Date.now()
  const ask = () => {
    if (newBuildSeen || document.visibilityState !== 'visible' || Date.now() - lastAsked < 60_000) return
    lastAsked = Date.now()
    void newBuildDeployed().then((fresh) => {
      if (!fresh || newBuildSeen) return
      newBuildSeen = true
      onNewBuild()
    })
  }
  document.addEventListener('visibilitychange', ask)
  window.addEventListener('focus', ask)
  window.setInterval(ask, 15 * 60_000)
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
