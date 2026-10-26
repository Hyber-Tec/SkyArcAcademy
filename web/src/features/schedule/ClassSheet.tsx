import { useState } from 'react'
import { LuMinus, LuPlus, LuTrash2, LuUsers } from 'react-icons/lu'
import { MAX_SEATS_PER_CLASS } from '@shared/settings/businessRules'
import { SESSION_STATUS_LABELS } from '@shared/schedule/status'
import type { SessionStatus } from '@shared/settings/defaults'
import { formatDateKey, formatMinutes } from '@shared/time'
import { TimeSelect } from '@/components/app/TimeSelect'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useBoard } from './board'
import { SeatMenu } from './DayList'
import { CoachBadge, KindTag, LevelChip, SeatCount, classRange, gradeLabel } from './seatParts'
import type { ClassView } from './useClassData'

const COMING_OR_OFF: SessionStatus[] = ['confirmed', 'canceled']
/** The sheets' words for a student's mark. */
const MARK: Partial<Record<SessionStatus, string>> = { confirmed: 'Coming', present: 'Here', no_show: 'No-show', canceled: 'Canceled' }
const ALL: SessionStatus[] = ['confirmed', 'present', 'no_show', 'canceled']

/**
 * A class, opened: its time, the coaches in who teach it, and its students. The office marks each student (coming, here,
 * no-show, canceled), moves or takes one out, fills an open seat, and changes the class's time, seats and note.
 */
export function ClassSheet({ classId, onClose }: { classId: string | null; onClose: () => void }) {
  const b = useBoard()
  // The last class opened stays in the sheet while it slides away, so it never empties before it's gone.
  const [shownId, setShownId] = useState(classId)
  if (classId && classId !== shownId) setShownId(classId)
  const v = shownId ? b.classById(shownId) : undefined
  const isOpen = !!classId && !!b.classById(classId)
  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md">
        {v ? <ClassBody key={v.c.id} v={v} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  )
}

function ClassBody({ v, onClose }: { v: ClassView; onClose: () => void }) {
  const b = useBoard()
  const { c } = v
  const editable = b.mode === 'admin' && b.canEdit(c.dateKey)
  const statuses = c.dateKey <= b.today ? ALL : COMING_OR_OFF
  const [note, setNote] = useState(c.note ?? '')
  const seats = [...v.seats].sort((a, b2) => Number(a.status === 'canceled') - Number(b2.status === 'canceled'))
  const levels = levelsOf(v, b.student)
  const hours = b.hoursOf(c.dateKey)
  const lo = Math.min(hours.openMin, c.startMin)
  const hi = Math.max(hours.closeMin, c.endMin)
  return (
    <>
      <SheetHeader className="border-b p-5">
        <SheetDescription>{formatDateKey(c.dateKey, 'weekdayLong')}</SheetDescription>
        <SheetTitle className="text-xl">{classRange(c.startMin, c.endMin)}</SheetTitle>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {levels.map((l) => (
            <LevelChip key={l} level={l} levels={b.levels} />
          ))}
          <SeatCount used={v.taken} of={c.seats} className="ml-auto" />
        </div>
      </SheetHeader>

      <section className="border-b p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Coaches</h3>
          {editable ? (
            <Button variant="ghost" size="xs" onClick={() => b.editWhosIn(c.dateKey)}>
              <LuUsers /> Who's in
            </Button>
          ) : null}
        </div>
        {v.coaches.length ? (
          <ul className="space-y-1.5">
            {v.coaches.map((k) => {
              const name = b.staffName(k.staffId, k.name)
              const r = k.ranges
              return (
                <li key={k.staffId} className="flex items-center gap-2.5 text-sm">
                  <CoachBadge name={name} color={b.staffColor(k.staffId)} />
                  <span className="font-medium">{name}</span>
                  <span className={cn('ml-auto text-xs', k.partial ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
                    {k.partial ? `Only ${classRange(Math.max(r[0].startMin, c.startMin), Math.min(r[r.length - 1].endMin, c.endMin))}` : `In ${r.map((x) => classRange(x.startMin, x.endMin)).join(', ')}`}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">No coach is in at this time.</p>
        )}
      </section>

      <section className="p-5">
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Students</h3>
        <ul className="space-y-1.5" data-testid="class-students">
          {seats.map((s) => {
            const st = b.student(s.studentId)
            const own = s.startMin !== c.startMin || s.endMin !== c.endMin ? classRange(s.startMin, s.endMin) : null
            const label = (s.note ?? '').trim()
            return (
              <li key={s.id} className={cn('rounded-lg border p-2.5', s.status === 'canceled' && 'bg-muted/40')}>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={cn('font-medium', s.status === 'canceled' && 'text-muted-foreground line-through')}>{s.studentName}</span>
                      <span className="text-xs text-muted-foreground">{gradeLabel(st?.grade ?? s.studentGrade)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <LevelChip level={st?.level ?? null} levels={b.levels} rifle={st?.rifle} />
                      <KindTag note={s.note} />
                      {label && !/^(mu|make-?up|practice|trial|eval)/i.test(label) ? <span className="text-xs text-muted-foreground">{label}</span> : null}
                      {own ? <span className="text-xs text-muted-foreground">{own}</span> : null}
                    </div>
                  </div>
                  {editable ? <SeatMenu seat={s} v={v} inSheet /> : null}
                </div>
                {editable ? (
                  <div className={cn('mt-2 grid gap-1', statuses.length === 4 ? 'grid-cols-4' : 'grid-cols-2')}>
                    {statuses.map((x) => (
                      <button
                        key={x}
                        type="button"
                        onClick={() => b.setStatus(s, x)}
                        className={cn(
                          'rounded-md border px-1 py-1 text-[11px] font-medium',
                          s.status === x || (x === 'confirmed' && s.status === 'pending')
                            ? x === 'canceled'
                              ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300'
                              : x === 'present'
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                                : 'border-foreground/30 bg-muted text-foreground'
                            : 'text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {MARK[x] ?? SESSION_STATUS_LABELS[x]}
                      </button>
                    ))}
                  </div>
                ) : s.status !== 'confirmed' ? (
                  <div className="mt-1.5 text-xs text-muted-foreground">{SESSION_STATUS_LABELS[s.status]}</div>
                ) : null}
              </li>
            )
          })}
          {Array.from({ length: Math.max(0, c.seats - v.taken) }, (_, i) => (
            <li key={`open-${i}`}>
              <button
                type="button"
                disabled={!editable}
                onClick={() => b.addSeat(c.id)}
                className="hatch-empty flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed text-sm text-muted-foreground enabled:hover:border-foreground/40 enabled:hover:text-foreground"
              >
                {editable ? <LuPlus className="size-4" /> : null} Open seat
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4 border-t p-5">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Class</h3>
        {editable ? (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="class-start">Starts</Label>
                <TimeSelect id="class-start" value={c.startMin} step={15} min={lo} max={c.endMin - 15} onChange={(m) => b.saveClass(v, { startMin: m })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="class-end">Ends</Label>
                <TimeSelect id="class-end" value={c.endMin} step={15} min={c.startMin + 15} max={hi} onChange={(m) => b.saveClass(v, { endMin: m })} />
              </div>
              <div className="space-y-1.5">
                <Label>Seats</Label>
                <div className="flex h-9 items-center rounded-md border">
                  <Button variant="ghost" size="icon-sm" aria-label="One seat fewer" disabled={c.seats <= Math.max(1, v.taken)} onClick={() => b.saveClass(v, { seats: c.seats - 1 })}>
                    <LuMinus />
                  </Button>
                  <span className="w-6 text-center text-sm tabular-nums">{c.seats}</span>
                  <Button variant="ghost" size="icon-sm" aria-label="One seat more" disabled={c.seats >= MAX_SEATS_PER_CLASS} onClick={() => b.saveClass(v, { seats: c.seats + 1 })}>
                    <LuPlus />
                  </Button>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="class-note">Note for the coaches</Label>
              <Textarea
                id="class-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => note.trim() !== (c.note ?? '').trim() && b.saveClass(v, { note })}
                placeholder="What to work on, equipment, anything to pass on."
                className="min-h-20"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                b.removeClass(v)
                onClose()
              }}
            >
              <LuTrash2 /> Remove this class
            </Button>
          </>
        ) : (
          <div className="space-y-1 text-sm">
            <div>
              {formatMinutes(c.startMin)} to {formatMinutes(c.endMin)} · {c.seats} seats
            </div>
            {c.note ? <p className="whitespace-pre-wrap text-muted-foreground">{c.note}</p> : <p className="text-muted-foreground">No note.</p>}
          </div>
        )}
      </section>
    </>
  )
}

/** The class's levels, most common first. */
function levelsOf(v: ClassView, student: (id: string) => { level: string | null } | undefined): string[] {
  const count = new Map<string, number>()
  for (const s of v.seats) {
    if (s.status === 'canceled') continue
    const l = student(s.studentId)?.level
    if (l) count.set(l, (count.get(l) ?? 0) + 1)
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l)
}
