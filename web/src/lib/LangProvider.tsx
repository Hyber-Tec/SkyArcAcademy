import { type ReactNode, use, useCallback, useEffect, useMemo, useState } from 'react'
import { type Lang, isLang } from '@shared/i18n'
import { LangContext, browserLang, storeLang, storedLang } from './lang'

/**
 * A language the address asks for (`?lang=ko`): the phone app opens a contract's page in the language its parent reads
 * the app in. It becomes this browser's choice.
 */
function askedLang(): Lang | null {
  try {
    const v = new URLSearchParams(window.location.search).get('lang')
    if (!isLang(v)) return null
    storeLang(v)
    return v
  } catch {
    return null
  }
}

/** The page's language for everything inside: the parent's choice, or the browser's (lib/lang.ts). */
export function LangProvider({ children }: { children: ReactNode }) {
  const [chosen, setChosen] = useState<Lang | null>(() => askedLang() ?? storedLang())
  const lang = chosen ?? browserLang()
  const setLang = useCallback((next: Lang) => {
    setChosen(next)
    storeLang(next)
  }, [])
  useHtmlLang(lang)
  const value = useMemo(() => ({ lang, chosen, setLang }), [lang, chosen, setLang])
  return <LangContext value={value}>{children}</LangContext>
}

/** A part of the site in English whatever the parent chose: the staff's and the students' portals. */
export function EnglishOnly({ children }: { children: ReactNode }) {
  const outer = use(LangContext)
  useHtmlLang('en')
  const value = useMemo(() => ({ lang: 'en' as const, chosen: outer?.chosen ?? null, setLang: outer?.setLang ?? (() => undefined) }), [outer])
  return <LangContext value={value}>{children}</LangContext>
}

/** `<html lang>` for screen readers and fonts, while this part is shown. */
function useHtmlLang(lang: Lang) {
  useEffect(() => {
    const before = document.documentElement.lang
    document.documentElement.lang = lang
    return () => {
      document.documentElement.lang = before
    }
  }, [lang])
}
