import type { ReactNode } from 'react'
import { LangContext, type LangValue } from '@/lib/lang'

const ENGLISH: LangValue = { lang: 'en', chosen: null, setLang: () => undefined }

/**
 * The app's sample report on the site, in English on the Korean pages too: its text is the made-up athlete's English
 * report, and the notes beside it find their places by its English headings (ReportShowcase, ReportPreview).
 */
export function EnglishApp({ children }: { children: ReactNode }) {
  return <LangContext value={ENGLISH}>{children}</LangContext>
}
