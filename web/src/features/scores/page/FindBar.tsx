import { LuSearch, LuX } from 'react-icons/lu'
import { FEED_SORTS, type FeedSort } from '@shared/scores/feed'
import { POSITIONS, POSITION_COLORS, POSITION_LABELS, type Position, RESULT_KINDS, RESULT_KIND_LABELS, type ResultKind } from '@shared/shooting/evaluation'
import type { DateKey } from '@shared/time'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { DatesMenu } from './DatesMenu'
import { type Find, NO_LEVEL } from './find'

/** The search: a student by any of their names. */
export function SearchField({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <InputGroup className={cn('h-9 bg-background', className)}>
      <InputGroupAddon>
        <LuSearch />
      </InputGroupAddon>
      <InputGroupInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onChange('')
        }}
        placeholder="Search students…"
        aria-label="Search students, by any of their names"
        data-testid="scores-search"
      />
      {value ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" onClick={() => onChange('')} aria-label="Clear the search">
            <LuX />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  )
}

/** All, Standing, Kneeling or Prone, side by side, each with its colour. */
function PositionChoice({ value, onChange }: { value: Position | 'all'; onChange: (p: Position | 'all') => void }) {
  return (
    <div className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5" role="group" aria-label="Position">
      {(['all', ...POSITIONS] as const).map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={value === p}
          onClick={() => onChange(p)}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors',
            value === p ? 'bg-background text-foreground shadow-sm dark:bg-input/60' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {p === 'all' ? null : <span className="size-2 rounded-full" style={{ background: POSITION_COLORS[p] }} aria-hidden />}
          {p === 'all' ? 'All' : POSITION_LABELS[p]}
        </button>
      ))}
    </div>
  )
}

const pickClass = (on: boolean) => cn('h-9! shrink-0 gap-2 bg-background px-3', on && 'border-foreground/40')

/**
 * The Scores page's filters, as Goo's pick has them: the search (any of a student's names), the position, the kind, the
 * level, the days and the order. On a phone the search has its own row and the rest scroll sideways under it.
 */
export function FindBar({
  find,
  onChange,
  levels,
  today,
  hasResults,
  wide,
}: {
  find: Find
  onChange: (patch: Partial<Find>) => void
  /** The level filter's choices: the academy's levels, any other a student has, and none yet. */
  levels: { value: string; label: string; color?: string }[]
  today: DateKey
  hasResults: (d: DateKey) => boolean
  /** The search sits in the row (a wide list); else on its own above it. */
  wide: boolean
}) {
  return (
    <div className="space-y-2.5" data-testid="scores-find">
      {wide ? null : <SearchField value={find.q} onChange={(q) => onChange({ q })} />}
      <div className={cn('flex items-center gap-2', wide ? 'flex-wrap' : '-mx-4 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden')}>
        {wide ? <SearchField value={find.q} onChange={(q) => onChange({ q })} className="w-60 shrink-0" /> : null}
        <PositionChoice value={find.position} onChange={(position) => onChange({ position })} />
        <Select value={find.kind} onValueChange={(v) => onChange({ kind: v as ResultKind | 'all' })}>
          <SelectTrigger className={pickClass(find.kind !== 'all')} aria-label="Kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            {RESULT_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {RESULT_KIND_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={find.level} onValueChange={(level) => onChange({ level })}>
          <SelectTrigger className={pickClass(find.level !== 'all')} aria-label="Level">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            {levels.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                <span className={cn('size-2 shrink-0 rounded-[2.5px]', l.value === NO_LEVEL && 'ring-1 ring-muted-foreground/60 ring-inset')} style={l.color ? { background: l.color } : undefined} aria-hidden />
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DatesMenu range={find.range} onChange={(range) => onChange({ range })} today={today} hasResults={hasResults} className="shrink-0" />
        <Select value={find.sort} onValueChange={(v) => onChange({ sort: v as FeedSort })}>
          <SelectTrigger className={pickClass(false)} aria-label="Order">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {FEED_SORTS.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
