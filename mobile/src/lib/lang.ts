import { type Lang, pick } from "@shared/i18n";
import { createContext, useCallback, useContext } from "react";

/**
 * The language of the app's screens (docs/DECISIONS.md §36): Korean for a parent whose phone is set to Korean, or who
 * chose it (More → Language, remembered on this phone); the same on the screens before signing in. The staff's part and
 * a student's are English whatever was chosen (`EnglishOnly`, state/LangProvider.tsx). Each text sits next to its
 * English: `const t = useT()`, then `t("Home", "홈")`.
 */
export interface LangValue {
  lang: Lang;
  /** The parent's own choice, or null to follow the phone. */
  chosen: Lang | null;
  setLang: (lang: Lang) => void;
}

export const LangContext = createContext<LangValue | null>(null);

export function useLang(): Lang {
  return useContext(LangContext)?.lang ?? "en";
}

/** The switch's state: the language, the parent's own choice, and how to change it. */
export function useLangChoice(): LangValue {
  return useContext(LangContext) ?? { lang: "en", chosen: null, setLang: () => undefined };
}

/** `t(english, korean)`: the text in the screen's language. */
export function useT(): (en: string, ko: string) => string {
  const lang = useLang();
  return useCallback((en: string, ko: string) => pick(lang, en, ko), [lang]);
}
