import { useState } from 'react'
import { LuSearch } from 'react-icons/lu'
import { isInactiveStudent } from '@shared/people'
import { makeupLabel } from '@shared/schedule/classes'
import { formatDateKey, formatTimeRange } from '@shared/time'
import type { Session, Student, WithId } from '@shared/types'
import { TimeSelect } from '@/components/app/TimeSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { LevelChip, gradeLabel } from './seatParts'
import type { ClassView } from './useClassData'

type Kind = 'regular' | 'practice' | 'trial' | 'evaluation'
const KINDS: { kind: Kind; name: string }[] = [
  { kind: 'regular', name: 'Class' },
  { kind: 'practice', name: 'Practice' },
  { kind: 'trial', name: 'Trial' },
  { kind: 'evaluation', name: 'Evaluation' },
]

/**
 * Puts a student in an open seat: make-ups still owed first, then students at the class's level, then everyone. The
 * label is the sheets' own word: a make-up names the class it makes up ("MU for 11/2"), a trial is "Trial 1".
 */
export function AddSeatDialog({
  v,
  open,
  onOpenChange,
  students,
  levels,
  owed,
  onAdd,
}: {
  v: ClassView | null
  open: boolean
  onOpenChange: (open: boolean) => void
  students: readonly WithId<Student>[]
  levels: readonly string[]
  /** Canceled seats with no make-up booked yet. */
  owed: readonly WithId<Session>[]
  onAdd: (student: WithId<Student>, label: string, part: { startMin: number; endMin: number } | null) => void
}) {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<Kind>('regular')
  const [trial, setTrial] = useState(1)
  const [partOn, setPartOn] = useState(false)
  const [part, setPart] = useState<{ startMin: number; endMin: number } | null>(null)
  const [allOwed, setAllOwed] = useState(false)
  if (!v) return null
  const { c } = v
  const here = new Set(v.seats.filter((s) => s.status !== 'canceled').map((s) => s.studentId))
  const classLevels = new Set(v.seats.map((s) => students.find((x) => x.id === s.studentId)?.level).filter(Boolean))
  const needle = q.trim().toLowerCase()
  const list = students
    .filter((s) => !here.has(s.id) && !isInactiveStudent(s.status) && (!needle || s.nameLower.includes(needle)))
    .sort((a, b) => Number(classLevels.has(b.level)) - Number(classLevels.has(a.level)) || a.name.localeCompare(b.name))
  // Absences near this class first (a make-up can come before an absence planned ahead): five, then the rest on request.
  const away = (d: string) => Math.abs(new Date(`${d}T12:00:00Z`).getTime() - new Date(`${c.dateKey}T12:00:00Z`).getTime())
  const owedNear = owed.filter((o) => !here.has(o.studentId) && o.classId !== c.id).sort((a, b) => away(a.dateKey) - away(b.dateKey))
  const owedHere = allOwed ? owedNear : owedNear.slice(0, 5)
  const span = partOn ? (part ?? { startMin: c.startMin, endMin: Math.min(c.endMin, c.startMin + 30) }) : null
  const pick = (st: WithId<Student>, label?: string) => {
    const l = label ?? (kind === 'practice' ? 'Practice' : kind === 'trial' ? `Trial ${trial}` : kind === 'evaluation' ? 'Evaluation' : '')
    onAdd(st, l, span && (span.startMin !== c.startMin || span.endMin !== c.endMin) ? span : null)
    setQ('')
    setKind('regular')
    setPartOn(false)
    setPart(null)
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a student</DialogTitle>
          <DialogDescription>
            {formatDateKey(c.dateKey, 'weekdayLong').replace(/, \d{4}$/, '')} · {formatTimeRange(c.startMin, c.endMin)}
          </DialogDescription>
        </DialogHeader>
        {owedHere.length ? (
          <div className="rounded-lg border border-red-200 bg-red-50/60 p-2 dark:border-red-900 dark:bg-red-950/30">
            <div className="px-1 pb-1 text-[11px] font-semibold tracking-wide text-red-700 uppercase dark:text-red-300">Make-ups owed</div>
            {owedHere.map((o) => {
              const st = students.find((s) => s.id === o.studentId)
              if (!st) return null
              const label = makeupLabel(o.dateKey)
              return (
                <button key={o.id} type="button" onClick={() => pick(st, label)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-red-100/70 dark:hover:bg-red-900/40">
                  <span className="font-medium">{st.name}</span>
                  <LevelChip level={st.level} levels={levels} rifle={st.rifle} />
                  <span className="ml-auto text-xs text-red-700 dark:text-red-300">{label}</span>
                </button>
              )
            })}
            {owedNear.length > owedHere.length ? (
              <button type="button" onClick={() => setAllOwed(true)} className="px-2 pt-1 text-xs font-medium text-red-700 hover:underline dark:text-red-300">
                {owedNear.length - owedHere.length} more
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-1">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              onClick={() => setKind(k.kind)}
              className={cn('rounded-full border px-2.5 py-1 text-xs font-medium', kind === k.kind ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted')}
            >
              {k.name}
            </button>
          ))}
          {kind === 'trial' ? (
            <span className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              {[1, 2].map((n) => (
                <button key={n} type="button" onClick={() => setTrial(n)} className={cn('rounded-full border px-2 py-0.5', trial === n && 'border-foreground font-semibold text-foreground')}>
                  Trial {n}
                </button>
              ))}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Switch id="seat-part" checked={partOn} onCheckedChange={setPartOn} />
          <label htmlFor="seat-part" className="text-muted-foreground">
            Part of the class only
          </label>
          {span ? (
            <span className="flex items-center gap-1.5">
              <TimeSelect value={span.startMin} step={15} min={c.startMin} max={span.endMin - 15} onChange={(m) => setPart({ ...span, startMin: m })} className="h-8 w-28" />
              <span className="text-muted-foreground">to</span>
              <TimeSelect value={span.endMin} step={15} min={span.startMin + 15} max={c.endMin} onChange={(m) => setPart({ ...span, endMin: m })} className="h-8 w-28" />
            </span>
          ) : null}
        </div>
        <div className="relative">
          <LuSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search students" className="pl-8" />
        </div>
        <div className="-mx-1 max-h-72 overflow-y-auto">
          {list.map((st) => (
            <button key={st.id} type="button" onClick={() => pick(st)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
              <span className="font-medium">{st.name}</span>
              <span className="text-xs text-muted-foreground">{gradeLabel(st.grade)}</span>
              <LevelChip level={st.level} levels={levels} rifle={st.rifle} className="ml-auto" />
            </button>
          ))}
          {!list.length ? <p className="px-2 py-6 text-center text-sm text-muted-foreground">No student matches.</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
