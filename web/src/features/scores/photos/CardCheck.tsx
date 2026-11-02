import { useRef, useState } from 'react'
import { LuCircleAlert, LuTrophy } from 'react-icons/lu'
import { POSITIONS, POSITION_COLORS, POSITION_LABELS, type Position, per10 } from '@shared/shooting/evaluation'
import { FLAT_SIZE } from '@shared/targets/flat'
import { type CardReview, bullState, confirmBull, retypeBull, reviewTotals, settleCloseCall } from '@shared/targets/review'
import { type DateKey, todayKey } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { DatePicker } from '@/components/app/DatePicker'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { one } from '@/features/reports/model'
import { CardPicture } from '@/features/scores/card/CardPicture'
import { STATE_COLORS } from '@/features/scores/card/parts'
import { ResultKindPicker } from '@/features/scores/kinds'
import { cn } from '@/lib/utils'
import { type CardDraft, bullLooks, typing } from './cards'
import { useObjectUrl } from './objectUrl'

/** The card's frame: its own shape, never taller than the dialog has room for. */
const CARD_FRAME = { aspectRatio: `${FLAT_SIZE.width} / ${FLAT_SIZE.height}`, maxHeight: 'min(60svh, 34rem)' }

/** The three positions side by side, each with its colour; amber-edged while none is chosen. */
function PositionChoice({ value, onChange }: { value: Position | null; onChange: (p: Position) => void }) {
  return (
    <div className={cn('inline-flex w-full rounded-lg bg-muted p-0.5 text-sm sm:w-auto', !value && 'ring-2 ring-amber-400 dark:ring-amber-600')} role="group" aria-label="Position">
      {POSITIONS.map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={value === p}
          onClick={() => onChange(p)}
          className={cn('inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-3 font-medium whitespace-nowrap sm:flex-none', value === p ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >
          <span className="size-2 rounded-full" style={{ background: POSITION_COLORS[p] }} />
          {POSITION_LABELS[p]}
        </button>
      ))}
    </div>
  )
}

/**
 * One card read from its photo, to check before it's saved (Add paper scores): the card as read, each bull's score on
 * it (a bull clicked there picks its box), and beside it the ten scores in boxes to correct, what's worth a look in
 * words (a hole only just touching a line: keep it or make it one lower), the total, the position (from the photo's
 * name, else chosen), the date (the photo's own, else the file's), what it was and the coach's note. A photo where no
 * card was found shows itself instead, and its scores are typed.
 */
export function CardCheck({ card, onChange, priorBest }: { card: CardDraft; onChange: (patch: Partial<CardDraft>) => void; priorBest: (p: Position) => number | null }) {
  const { timezone } = useBranch()
  const today = todayKey(timezone)
  const review = card.review as CardReview
  const scanned = card.scanned as CardReview
  const read = card.read!
  const typed = typing(card)
  const photoUrl = useObjectUrl(read.found ? null : read.jpeg)
  /** The bull picked on the picture (its box is focused), and what's being typed in a box. */
  const [selected, setSelected] = useState<number | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const boxes = useRef(new Map<string, HTMLInputElement>())
  const totals = reviewTotals(review)
  const value = per10(totals.total, totals.shots)
  const best = card.position ? priorBest(card.position) : null
  const looks = typed ? [] : bullLooks(review)
  const setReview = (next: CardReview) => onChange({ review: next })

  const pick = (n: number) => {
    setSelected(n)
    const box = boxes.current.get(`${n}:0`)
    box?.focus({ preventScroll: false })
    box?.select()
  }
  const type = (n: number, k: number, text: string) => {
    const clean = text.replace(/[^0-9]/g, '').slice(0, 2)
    const next = { ...edits, [`${n}:${k}`]: clean }
    setEdits(next)
    const bull = review.bulls.find((b) => b.n === n)!
    const values = Array.from({ length: review.shotsPerBull }, (_, i) => next[`${n}:${i}`] ?? (bull.shots[i] ? String(bull.shots[i].value) : '')).filter((t) => t !== '' && Number(t) <= 10).map(Number)
    setReview(retypeBull(review, scanned, n, values))
  }

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] md:items-start" data-testid="card-check">
      <figure className="min-w-0 rounded-xl bg-muted p-2 md:sticky md:top-0">
        {read.found ? (
          <CardPicture
            image={read.image}
            review={review}
            selected={selected}
            onBull={pick}
            label="The card as read. Choose a bull to correct its score; zoom with the wheel or a pinch."
            className="mx-auto w-full overflow-hidden rounded-md"
            style={CARD_FRAME}
          />
        ) : photoUrl ? (
          <img src={photoUrl} alt="The photo, where no card was found" className="mx-auto max-h-[min(60svh,34rem)] w-full rounded-md object-contain" />
        ) : null}
        <figcaption className="mt-2 px-1 text-xs text-muted-foreground">
          <span className="font-medium break-all text-foreground">{card.name}</span> · {read.found ? 'the card as read. Choose a bull to correct its score.' : 'no card was found in it.'}
        </figcaption>
      </figure>

      <FieldGroup className="min-w-0 gap-5">
        {typed ? (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" data-testid="no-card">
            <LuCircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <span>{read.found ? null : read.reason} Type its scores below: the photo is kept with them.</span>
          </p>
        ) : null}
        <Field>
          <FieldLabel>
            Position
            <span className={cn('font-normal', card.position ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400')}>
              {card.position ? (card.positionFromName ? 'read from the file name' : '') : 'not in the file name: choose it'}
            </span>
          </FieldLabel>
          <PositionChoice value={card.position} onChange={(p) => onChange({ position: p, positionFromName: false })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Date shot</FieldLabel>
            <DatePicker value={card.dateKey} onChange={(d: DateKey) => onChange({ dateKey: d })} max={today} aria-label="Date shot" />
            <FieldDescription>
              {card.dateFrom === 'photo'
                ? 'When the photo was taken. Change it if the card says otherwise.'
                : card.dateFrom === 'name'
                  ? 'The date in the file’s name. Change it if the card says otherwise.'
                  : 'The file’s date: the photo doesn’t say when it was taken. Change it if the card says otherwise.'}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel>What it was</FieldLabel>
            <ResultKindPicker value={card.kind} onChange={(kind) => onChange({ kind })} />
          </Field>
        </div>

        <Field>
          <FieldLabel>
            Bulls <span className="font-normal text-muted-foreground">{typed ? 'typed from the card' : 'as read from the card'}</span>
          </FieldLabel>
          <div className="grid grid-cols-5 gap-x-2 gap-y-2.5" role="group" aria-label="Each bull’s score">
            {review.bulls.map((b) => {
              const state = bullState(b, review.shotsPerBull, review)
              const was = scanned.bulls.find((x) => x.n === b.n)!
              const changed = !typed && (was.shots.length !== b.shots.length || was.shots.some((s, i) => s.value !== b.shots[i]?.value || s.x !== b.shots[i]?.x))
              const look = !typed && state !== 'ok'
              return (
                <div key={b.n} className="min-w-0 text-center">
                  <span className="mb-1 block text-[11px] leading-none text-muted-foreground">{b.n}</span>
                  <div className={cn('flex gap-1', selected === b.n && 'rounded-lg ring-2 ring-foreground/50 ring-offset-1 ring-offset-background')}>
                    {Array.from({ length: review.shotsPerBull }, (_, k) => {
                      const id = `${b.n}:${k}`
                      const text = edits[id] ?? (b.shots[k] ? String(b.shots[k].value) : '')
                      return (
                        <Input
                          key={k}
                          ref={(el) => {
                            if (el) boxes.current.set(id, el)
                            else boxes.current.delete(id)
                          }}
                          inputMode="numeric"
                          aria-label={`Bull ${b.n}${review.shotsPerBull > 1 ? `, shot ${k + 1}` : ''}`}
                          placeholder="–"
                          value={text}
                          onFocus={(e) => {
                            setSelected(b.n)
                            e.target.select()
                          }}
                          onChange={(e) => type(b.n, k, e.target.value)}
                          onBlur={() =>
                            setEdits((cur) => {
                              const { [id]: _gone, ...rest } = cur
                              return rest
                            })
                          }
                          className={cn('h-11 min-w-0 px-0 text-center text-lg font-semibold tabular-nums', changed && 'bg-muted', look && 'border-[1.5px]')}
                          style={look ? { borderColor: STATE_COLORS[state === 'unseen' ? 'missing' : state] } : undefined}
                          data-testid={`bull-box-${b.n}${k ? `-${k}` : ''}`}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          <FieldDescription>{typed ? 'Whole numbers, 0 to 10, as written on the card.' : 'Whole numbers, 0 to 10. A box you change is your word: its shot keeps no place on the target.'}</FieldDescription>
        </Field>

        {looks.length ? (
          <ul className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" data-testid="card-looks">
            {looks.map((l) => (
              <li key={`${l.kind}-${l.n}-${'index' in l ? l.index : ''}`} className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                <span className="flex min-w-0 flex-1 basis-64 items-start gap-2">
                  <LuCircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                  <button type="button" className="text-left hover:underline" onClick={() => pick(l.n)}>
                    {l.text}
                  </button>
                </span>
                {l.kind === 'close' ? (
                  <span className="flex gap-1.5 pl-6">
                    <Button size="xs" variant="outline" className="bg-background" onClick={() => setReview(settleCloseCall(review, l.n, l.index, true))}>
                      Keep {l.ring}
                    </Button>
                    <Button size="xs" variant="outline" className="bg-background" onClick={() => setReview(settleCloseCall(review, l.n, l.index, false))}>
                      Make it {l.ring - 1}
                    </Button>
                  </span>
                ) : l.kind === 'unsure' || l.kind === 'marks' ? (
                  <span className="pl-6">
                    <Button size="xs" variant="outline" className="bg-background" onClick={() => setReview(confirmBull(review, l.n))}>
                      Looks right
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1" data-testid="card-check-total">
          <span className="text-3xl leading-none font-semibold tabular-nums">{totals.total}</span>
          <span className="text-sm text-muted-foreground">
            out of {totals.shots * 10} · {value !== null ? one(value) : '—'} per 10
          </span>
          {card.position && value !== null && best !== null && value > best ? (
            <span className="inline-flex h-5 items-center gap-1 rounded-full bg-amber-100 px-2 text-xs font-medium text-amber-900 ring-1 ring-amber-300/70 ring-inset dark:bg-amber-950/60 dark:text-amber-200 dark:ring-amber-800">
              <LuTrophy className="size-3" aria-hidden /> New best for {POSITION_LABELS[card.position].toLowerCase()}
            </span>
          ) : null}
        </p>

        <Field>
          <FieldLabel htmlFor={`card-note-${card.key}`}>
            Coach’s note <span className="font-normal text-muted-foreground">optional · the family sees it</span>
          </FieldLabel>
          <Textarea id={`card-note-${card.key}`} value={card.note} maxLength={2000} rows={2} onChange={(e) => onChange({ note: e.target.value })} placeholder="Anything worth remembering about this card." />
        </Field>
      </FieldGroup>
    </div>
  )
}
