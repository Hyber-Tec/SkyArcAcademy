import { type ResultKind, RESULT_KINDS, RESULT_KIND_LABELS, kindOf } from '@shared/shooting/evaluation'
import type { Evaluation } from '@shared/shooting/evaluation'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

/**
 * Practice, Competition or Evaluation on every result (the manager's second meeting, docs/DECISIONS.md §23): picked when
 * a result is added or corrected, shown on it, and used to filter scores, graphs and reports.
 */
export function ResultKindPicker({ value, onChange, disabled = false }: { value: ResultKind; onChange: (k: ResultKind) => void; disabled?: boolean }) {
  return (
    <ToggleGroup type="single" variant="outline" size="sm" value={value} onValueChange={(v) => v && onChange(v as ResultKind)} aria-label="What it was" disabled={disabled} className="w-full sm:w-auto">
      {RESULT_KINDS.map((k) => (
        <ToggleGroupItem key={k} value={k} className="flex-1 px-3">
          {RESULT_KIND_LABELS[k]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

const CHIP: Record<Exclude<ResultKind, 'practice'>, string> = {
  competition: 'bg-violet-100 text-violet-900 dark:bg-violet-950/70 dark:text-violet-200',
  evaluation: 'bg-amber-100 text-amber-900 dark:bg-amber-950/70 dark:text-amber-200',
}

/** A competition's or an evaluation's chip; practice, the usual, has none. */
export function ResultKindChip({ e, className }: { e: Pick<Evaluation, 'kind'>; className?: string }) {
  const kind = kindOf(e)
  if (kind === 'practice') return null
  return <span className={cn('inline-flex h-4 shrink-0 items-center rounded px-1.5 text-[10px] font-semibold', CHIP[kind], className)}>{RESULT_KIND_LABELS[kind]}</span>
}

/** A filter over results: everything, or one kind; shown only when results of more than one kind exist. */
export function ResultKindFilter({ list, value, onChange }: { list: readonly Pick<Evaluation, 'kind'>[]; value: ResultKind | 'all'; onChange: (k: ResultKind | 'all') => void }) {
  const counts = new Map<ResultKind, number>()
  for (const e of list) counts.set(kindOf(e), (counts.get(kindOf(e)) ?? 0) + 1)
  if (counts.size < 2) return null
  const chip = (k: ResultKind | 'all', label: string, n: number) => (
    <button
      key={k}
      type="button"
      aria-pressed={value === k}
      onClick={() => onChange(k)}
      className={cn('h-7 rounded-full border px-3 text-xs font-medium whitespace-nowrap', value === k ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
    >
      {label} <span className="tabular-nums opacity-70">{n}</span>
    </button>
  )
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Which results">
      {chip('all', 'All', list.length)}
      {RESULT_KINDS.filter((k) => counts.has(k)).map((k) => chip(k, `${RESULT_KIND_LABELS[k]}${k === 'practice' ? '' : 's'}`, counts.get(k) ?? 0))}
    </div>
  )
}
