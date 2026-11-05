import { Fragment } from 'react'
import { LANGS, LANG_NAMES } from '@shared/i18n'
import { useLangChoice } from '@/lib/lang'
import { cn } from '@/lib/utils'

/**
 * English · 한국어: the page's language, each name in its own language (docs/DECISIONS.md §36). On the pages before
 * signing in, a contract's link, the contracts a parent signs before the portal opens, and a parent's Profile;
 * remembered in this browser.
 */
export function LangSwitch({ className }: { className?: string }) {
  const { lang, setLang } = useLangChoice()
  return (
    <div className={cn('inline-flex items-center gap-2 text-sm', className)} role="group" aria-label="Language · 언어" data-testid="lang-switch">
      {LANGS.map((l, i) => (
        <Fragment key={l}>
          {i ? (
            <span aria-hidden className="text-muted-foreground/60">
              ·
            </span>
          ) : null}
          <button
            type="button"
            lang={l}
            aria-pressed={lang === l}
            onClick={() => setLang(l)}
            className={cn('rounded-sm underline-offset-4', lang === l ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground hover:underline')}
            data-testid={`lang-${l}`}
          >
            {LANG_NAMES[l]}
          </button>
        </Fragment>
      ))}
    </div>
  )
}
