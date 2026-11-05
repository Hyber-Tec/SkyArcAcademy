import { LuLanguages } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { useLang } from '@/lib/lang'

/**
 * Above the contract, for a parent reading Korean (docs/DECISIONS.md §36): the translation is there to help, the
 * English counts, and the English is a tap away; or, for a version not translated yet, why it's in English.
 */
export function ContractLanguageNote({ translated, original, onOriginal }: { translated: boolean; original: boolean; onOriginal: (original: boolean) => void }) {
  if (useLang() !== 'ko') return null
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-3 text-sm shadow-sm" data-testid="contract-language-note">
      <LuLanguages className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="min-w-0 flex-1 text-muted-foreground">
        {translated ? '이 번역은 이해를 돕기 위한 것이며, 계약의 효력은 영어 원문을 따릅니다.' : '아직 한국어 번역이 없어서 계약서를 영어 원문으로 보여 드려요.'}
      </p>
      {translated ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onOriginal(!original)} data-testid="contract-language-toggle">
          {original ? '한국어로 보기' : '영어 원문 보기'}
        </Button>
      ) : null}
    </div>
  )
}
