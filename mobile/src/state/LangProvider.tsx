import AsyncStorage from "@react-native-async-storage/async-storage";
import { type Lang, isLang, langOf } from "@shared/i18n";
import { useLocales } from "expo-localization";
import { type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { LangContext } from "@/lib/lang";

const KEY = "skyarc.lang";

/** The screens' language for everything inside: the parent's choice, or the phone's (lib/lang.ts). */
export function LangProvider({ children }: { children: ReactNode }) {
  const locales = useLocales();
  const device = langOf(locales.map((l) => l.languageTag));
  const [chosen, setChosen] = useState<Lang | null>(null);
  useEffect(() => {
    void AsyncStorage.getItem(KEY).then((v) => isLang(v) && setChosen(v)).catch(() => undefined);
  }, []);
  const setLang = useCallback((next: Lang) => {
    setChosen(next);
    void AsyncStorage.setItem(KEY, next).catch(() => undefined);
  }, []);
  const lang = chosen ?? device;
  const value = useMemo(() => ({ lang, chosen, setLang }), [lang, chosen, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

/** A part of the app in English whatever the parent chose: the staff's tabs and a student's. */
export function EnglishOnly({ children }: { children: ReactNode }) {
  const outer = useContext(LangContext);
  const value = useMemo(() => ({ lang: "en" as const, chosen: outer?.chosen ?? null, setLang: outer?.setLang ?? (() => undefined) }), [outer]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}
