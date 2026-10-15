// The language switch. The choice is saved under the same key the app will read, so a parent who picks Korean here
// sees Korean after logging in.
const LANG_KEY = 'skyarc.lang'

document.getElementById('lang-toggle')?.addEventListener('click', () => {
  const next = document.documentElement.lang === 'ko' ? 'en' : 'ko'
  document.documentElement.lang = next
  try {
    localStorage.setItem(LANG_KEY, next)
  } catch {
    // Storage can be off (private browsing); the choice then lasts for this page only.
  }
})
