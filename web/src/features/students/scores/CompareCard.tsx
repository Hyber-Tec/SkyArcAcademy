import { useMemo, useState } from 'react'
import { LuGitCompareArrows } from 'react-icons/lu'
import { toPoint } from '@shared/reports/facts'
import type { EvaluationPoint } from '@shared/reports/types'
import { type Evaluation, POSITIONS, POSITION_COLORS, POSITION_LABELS, type Position } from '@shared/shooting/evaluation'
import { formatDateKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Comparison } from '@/features/reports/ReportParts'
import { one } from '@/features/reports/model'
import { cn } from '@/lib/utils'

type Mode = 'lowest' | 'previous' | 'first' | 'choose'

const MODES: [Mode, string][] = [
  ['lowest', 'Lowest vs latest'],
  ['previous', 'Previous vs latest'],
  ['first', 'First vs latest'],
  ['choose', 'Choose two'],
]

const pointLabel = (p: EvaluationPoint) => `${formatDateKey(p.dateKey, 'medium')} · ${one(p.wholePer10)}${p.source === 'sius' ? ` (${one(p.per10)})` : ''}`

/** Two evaluations of one position side by side, picked the way families ask ("how far has she come?"). */
export function CompareCard({ evaluations }: { evaluations: WithId<Evaluation>[] }) {
  const points = useMemo(() => evaluations.filter((e) => e.shots > 0).map(toPoint), [evaluations])
  const positions = POSITIONS.filter((p) => points.filter((x) => x.position === p).length >= 2)
  const latestPosition = [...points].reverse().find((p) => positions.includes(p.position))?.position ?? positions[0] ?? null
  const [chosenPosition, setPosition] = useState<Position | null>(null)
  const position = chosenPosition && positions.includes(chosenPosition) ? chosenPosition : latestPosition
  const [mode, setMode] = useState<Mode>('first')
  const list = points.filter((p) => p.position === position)
  const [pickA, setPickA] = useState<string | null>(null)
  const [pickB, setPickB] = useState<string | null>(null)

  let a: EvaluationPoint | null = null
  let b: EvaluationPoint | null = null
  let labels: [string, string] = ['First', 'Latest']
  if (list.length >= 2) {
    const latest = list[list.length - 1]
    if (mode === 'first') {
      a = list[0]
      b = latest
    } else if (mode === 'previous') {
      a = list[list.length - 2]
      b = latest
      labels = ['Previous', 'Latest']
    } else if (mode === 'lowest') {
      a = list.slice(0, -1).reduce((lo, p) => (p.wholePer10 < lo.wholePer10 || (p.wholePer10 === lo.wholePer10 && p.per10 < lo.per10) ? p : lo))
      b = latest
      labels = ['Lowest', 'Latest']
    } else {
      a = list.find((p) => p.id === pickA) ?? list[0]
      b = list.find((p) => p.id === pickB) ?? latest
      if (b.dateKey < a.dateKey) [a, b] = [b, a]
      labels = ['Earlier', 'Later']
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card" data-testid="compare-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <LuGitCompareArrows className="size-4 text-muted-foreground" /> Compare
        </h2>
        {positions.length > 1 ? (
          <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs" role="group" aria-label="Position">
            {positions.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={position === p}
                onClick={() => setPosition(p)}
                className={cn('inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 font-medium', position === p ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                <span className="size-2 rounded-full" style={{ background: POSITION_COLORS[p] }} />
                {POSITION_LABELS[p]}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {list.length < 2 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">Two evaluations in the same position are needed to compare.</p>
      ) : (
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Compare">
            {MODES.map(([m, label]) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn('rounded-full border px-3 py-1 text-xs font-medium transition', mode === m ? 'border-[#2f68c4]/40 bg-[#2f68c4]/10 text-[#24539e] dark:text-[#93b4e6]' : 'text-muted-foreground hover:text-foreground')}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === 'choose' ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <Select value={pickA && list.some((p) => p.id === pickA) ? pickA : list[0].id} onValueChange={setPickA}>
                <SelectTrigger className="w-full" aria-label="First result to compare">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {list.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {pointLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-center text-xs text-muted-foreground">vs</span>
              <Select value={pickB && list.some((p) => p.id === pickB) ? pickB : list[list.length - 1].id} onValueChange={setPickB}>
                <SelectTrigger className="w-full" aria-label="Second result to compare">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {list.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {pointLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {a && b ? (
            <div className="rounded-xl bg-white p-1 text-[#0b0b0b]">
              <Comparison a={a} b={b} labelA={labels[0]} labelB={labels[1]} />
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
