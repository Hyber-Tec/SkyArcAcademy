import { LuArrowDown, LuArrowUp, LuChevronDown, LuLayoutGrid, LuList, LuListFilter, LuSearch, LuX } from 'react-icons/lu'
import { STUDENT_STATUS_LABELS } from '@shared/people'
import { levelColor } from '@shared/schedule/seatColors'
import { STUDENT_SORT_LABELS, STUDENT_SORT_ORDER, STUDENT_TABS, type StudentSort, type StudentSortKey, type StudentTab } from '@shared/studentList'
import { StudentStatusDot } from '@/components/app/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/** The Level filter's value for students without a level yet. */
export const NO_LEVEL = '__none'

const TAB_LABELS: Record<StudentTab, string> = {
  all: 'All',
  enrolled: STUDENT_STATUS_LABELS.enrolled,
  signed_up: STUDENT_STATUS_LABELS.signed_up,
  paused: STUDENT_STATUS_LABELS.paused,
  inactive: 'Inactive',
}

/** The status tabs, each with how many students it holds (within the search and the levels picked). */
export function StatusTabs({ tab, counts, onChange, className }: { tab: StudentTab; counts: Record<StudentTab, number>; onChange: (t: StudentTab) => void; className?: string }) {
  return (
    <div
      role="group"
      aria-label="Status"
      className={cn(
        // A phone scrolls them sideways, fading at the edge; a wide page has them beside the search.
        '-mb-px flex min-w-0 gap-1 overflow-x-auto pr-8 [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)] [scrollbar-width:none] @4xl/students:gap-1.5 @4xl/students:pr-0 @4xl/students:[mask-image:none]',
        className,
      )}
      data-testid="student-tabs"
    >
      {STUDENT_TABS.map((t) => {
        const button = (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => onChange(t)}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-foreground aria-pressed:font-semibold aria-pressed:text-foreground"
            data-testid={`student-tab-${t}`}
          >
            {t !== 'all' && t !== 'inactive' ? <StudentStatusDot status={t} tip={false} /> : null}
            {TAB_LABELS[t]}
            <span className="text-xs font-medium text-muted-foreground/70 tabular-nums">{counts[t]}</span>
          </button>
        )
        if (t !== 'inactive') return button
        return (
          <Tooltip key={t}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent>
              {STUDENT_STATUS_LABELS.finished}, {STUDENT_STATUS_LABELS.no_answer} and {STUDENT_STATUS_LABELS.not_interested}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

export function SearchBox({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <InputGroup className={cn('bg-background', className)}>
      <InputGroupAddon>
        <LuSearch />
      </InputGroupAddon>
      <InputGroupInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onChange('')
        }}
        placeholder="Search by name…"
        aria-label="Search students by name or another name"
        data-testid="student-search"
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

/** A level's colour as a small square (the schedule's colours); an empty one for no level yet. */
export function LevelSwatch({ level, levels, className }: { level: string | null; levels: readonly string[]; className?: string }) {
  if (!level) return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-[2.5px] ring-1 ring-muted-foreground/60 ring-inset', className)} />
  return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-[2.5px]', className)} style={{ backgroundColor: levelColor(level, levels).dot }} />
}

/** The Level filter: any number of levels, each with how many students it has (within the search and the status tab). */
export function LevelFilter({
  options,
  selected,
  counts,
  ladder,
  onChange,
}: {
  options: string[]
  selected: string[]
  counts: Map<string, number>
  ladder: readonly string[]
  onChange: (levels: string[]) => void
}) {
  const one = selected.length === 1 ? selected[0] : null
  const label = selected.length === 0 ? 'Level' : one ? (one === NO_LEVEL ? 'No level yet' : one) : `${selected.length} levels`
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn('shrink-0', selected.length && 'border-foreground/50 dark:border-foreground/40')} data-testid="student-level-filter">
          {one ? <LevelSwatch level={one === NO_LEVEL ? null : one} levels={ladder} className="mx-0.5" /> : <LuListFilter />}
          <span className="max-w-32 truncate">{label}</span>
          <LuChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Show levels</DropdownMenuLabel>
        <DropdownMenuCheckboxItem checked={selected.length === 0} onCheckedChange={() => onChange([])}>
          All levels
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {options.map((l) => (
          <DropdownMenuCheckboxItem
            key={l}
            checked={selected.includes(l)}
            // Several can be picked, so the menu stays open.
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(on) => onChange(on ? [...selected, l] : selected.filter((x) => x !== l))}
          >
            <LevelSwatch level={l === NO_LEVEL ? null : l} levels={ladder} className="mx-0.5" />
            <span className="truncate">{l === NO_LEVEL ? 'No level yet' : l}</span>
            <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums">{counts.get(l) ?? 0}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const SORT_KEYS: StudentSortKey[] = ['name', 'grade', 'level', 'signUp', 'next', 'last']

/**
 * The sort: "Name ↑" with its menu (name, grade, level, sign-up, next and last class; the one that's on again turns it
 * around). Where the list shows its columns (`columns`), it's the name column's heading: a sort by the next or the last
 * class shows on theirs, and this one says "Name".
 */
export function SortMenu({ sort, onPick, columns = false }: { sort: StudentSort; onPick: (key: StudentSortKey) => void; columns?: boolean }) {
  const Arrow = sort.dir === 'asc' ? LuArrowUp : LuArrowDown
  const current = (
    <>
      {STUDENT_SORT_LABELS[sort.key]}
      <Arrow className="size-3.5" aria-label={STUDENT_SORT_ORDER[sort.key][sort.dir]} />
    </>
  )
  const elsewhere = columns && (sort.key === 'next' || sort.key === 'last')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          // As wide as its longest label, so what's beside it stays put when the sort changes.
          className={cn('-ml-2 min-w-[7.5rem] justify-start gap-1 px-2 text-[13px] font-semibold text-foreground', elsewhere && '@3xl/students:font-medium @3xl/students:text-muted-foreground')}
          data-testid="student-sort"
        >
          {elsewhere ? (
            <>
              <span className="contents @3xl/students:hidden">{current}</span>
              <span className="hidden @3xl/students:inline">{STUDENT_SORT_LABELS.name}</span>
            </>
          ) : (
            current
          )}
          <LuChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={sort.key}>
          {SORT_KEYS.map((k) => (
            // A radio item that's on doesn't fire on its own, so each picks through `onSelect` (on again: turn it around).
            <DropdownMenuRadioItem key={k} value={k} onSelect={() => onPick(k)}>
              {STUDENT_SORT_LABELS[k]}
              {sort.key === k ? <span className="ml-auto pl-3 text-xs text-muted-foreground">{STUDENT_SORT_ORDER[k][sort.dir]}</span> : null}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <p className="px-1.5 py-1 text-xs text-muted-foreground">Pick it again to turn the order around.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A list column's heading that sorts by it (the next or the last class). */
export function SortHeading({ sortKey, sort, onPick, className }: { sortKey: StudentSortKey; sort: StudentSort; onPick: (key: StudentSortKey) => void; className?: string }) {
  const on = sort.key === sortKey
  const Arrow = sort.dir === 'asc' ? LuArrowUp : LuArrowDown
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('-ml-2 w-fit gap-1 px-2 text-[13px]', on ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground', className)}
      onClick={() => onPick(sortKey)}
      aria-label={`Sort by ${STUDENT_SORT_LABELS[sortKey].toLowerCase()}${on ? `, ${STUDENT_SORT_ORDER[sortKey][sort.dir].toLowerCase()}` : ''}`}
    >
      {STUDENT_SORT_LABELS[sortKey]}
      {on ? <Arrow className="size-3.5" /> : null}
    </Button>
  )
}

/** Group by level: on, the students come under their level's heading, lowest level first. */
export function GroupSwitch({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[13px] font-medium whitespace-nowrap select-none">
      <Switch size="sm" checked={checked} onCheckedChange={onChange} data-testid="student-group" />
      Group by level
    </label>
  )
}

/** List or Grid, as the Drive switches (`LuList` / `LuLayoutGrid`). */
export function LayoutToggle({ layout, onChange }: { layout: 'list' | 'grid'; onChange: (l: 'list' | 'grid') => void }) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      value={layout}
      onValueChange={(v) => v && onChange(v as 'list' | 'grid')}
      aria-label="Show the students as"
      className="shrink-0"
      data-testid="student-layout"
    >
      {(
        [
          ['list', 'List', LuList],
          ['grid', 'Grid', LuLayoutGrid],
        ] as const
      ).map(([v, label, Icon]) => (
        <Tooltip key={v}>
          <TooltipTrigger asChild>
            <ToggleGroupItem value={v} aria-label={label} className="px-2 data-[state=on]:bg-muted data-[state=on]:text-foreground" data-testid={`student-layout-${v}`}>
              <Icon />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  )
}
