import { createContext, use, useCallback } from 'react'
import { type Lang, isLang, langOf, pick } from '@shared/i18n'

/**
 * The language of the website's pages (docs/DECISIONS.md §36): Korean for a parent whose browser prefers it, or who
 * chose it (the switch, remembered per browser); the same on the pages before signing in and on a contract's link. The
 * staff's and the students' portals are English whatever was chosen (`EnglishOnly`, LangProvider.tsx). Each text sits
 * next to its English: `const t = useT()`, then `t('Home', '홈')`.
 */
export interface LangValue {
  lang: Lang
  /** The parent's own choice, or null to follow the browser. */
  chosen: Lang | null
  setLang: (lang: Lang) => void
}

export const LangContext = createContext<LangValue | null>(null)

const STORAGE_KEY = 'skyarc:lang'

export function storedLang(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isLang(v) ? v : null
  } catch {
    return null
  }
}

export function storeLang(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* storage unavailable: it lasts until the page reloads */
  }
}

export const browserLang = (): Lang => (typeof navigator === 'undefined' ? 'en' : langOf(navigator.languages?.length ? navigator.languages : [navigator.language]))

export function useLang(): Lang {
  return use(LangContext)?.lang ?? 'en'
}

/** The switch's state: the language, the parent's own choice, and how to change it. */
export function useLangChoice(): LangValue {
  return use(LangContext) ?? { lang: 'en', chosen: null, setLang: () => undefined }
}

/** `t(english, korean)`: the text in the page's language. */
export function useT(): (en: string, ko: string) => string {
  const lang = useLang()
  return useCallback((en: string, ko: string) => pick(lang, en, ko), [lang])
}
