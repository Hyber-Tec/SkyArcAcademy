import type { NarrativeKey, ReportNarrative, SectionMeta } from '@shared/reports/types'
import { cn } from '@/lib/utils'
import { INK } from './paper'

/** What the report document needs to edit its written sections in place (admins, drafts only). */
export interface EditApi {
  narrative: ReportNarrative
  meta: Partial<Record<NarrativeKey, SectionMeta>>
  onChange: <K extends NarrativeKey>(key: K, value: ReportNarrative[K]) => void
  /** Back to the standard text built from the figures. */
  onRestore: (key: NarrativeKey) => void
}

const FIELD =
  'field-sizing-content w-full resize-none rounded-md border border-dashed border-[#c9c7bf] bg-white/60 px-2 py-1 outline-none focus:border-solid focus:border-[#52514e]'

/** In edit mode: where the words came from, and Restore. */
export function SectionTools({ k, edit, children }: { k: NarrativeKey; edit: EditApi; children: React.ReactNode }) {
  const edited = edit.meta[k]?.source === 'staff'
  return (
    <div className="relative mt-2 rounded-xl ring-1 ring-transparent ring-offset-4 transition hover:ring-[#e3e1da] print:ring-0">
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10.5px] print:hidden">
        <span className="rounded-full bg-[#f1f0eb] px-2 py-0.5 font-medium text-[#52514e]">{edited ? 'Edited' : 'Standard text'}</span>
        {edited ? (
          <button type="button" onClick={() => edit.onRestore(k)} className="ml-auto rounded-md px-1.5 py-0.5 font-medium text-[#52514e] hover:bg-[#f1f0eb]">
            Restore standard text
          </button>
        ) : null}
      </div>
      {children}
    </div>
  )
}

export function EditableText({
  k,
  value,
  edit,
  className,
  placeholder,
}: {
  k: 'overview' | 'coachNote'
  value: string
  edit?: EditApi | null
  className?: string
  placeholder: string
}) {
  if (!edit) return <p className={className}>{value}</p>
  return (
    <SectionTools k={k} edit={edit}>
      <textarea aria-label={k === 'overview' ? 'Overview' : 'Note from the coach'} data-section={k} value={value} placeholder={placeholder} onChange={(e) => edit.onChange(k, e.target.value)} className={cn(FIELD, 'p-2', className)} />
    </SectionTools>
  )
}

export function EditableList({ k, items, edit, icon, max, label }: { k: 'strengths' | 'focusAreas'; items: string[]; edit?: EditApi | null; icon?: React.ReactNode; max: number; label: string }) {
  if (!edit) {
    return (
      <ul className="mt-3 space-y-2">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2 text-[13.5px] leading-snug">
            {icon}
            {t}
          </li>
        ))}
      </ul>
    )
  }
  return (
    <SectionTools k={k} edit={edit}>
      <ul className="mt-3 space-y-2">
        {items.map((t, i) => (
          <li key={i} className="flex items-start gap-2">
            {icon}
            <textarea aria-label={`${label} ${i + 1}`} value={t} onChange={(e) => edit.onChange(k, items.map((x, j) => (j === i ? e.target.value : x)))} className={cn(FIELD, 'min-w-0 flex-1 text-[13.5px] leading-snug')} />
            <button type="button" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`} className="mt-1 text-[#7d7a72] hover:text-[#b42318]" onClick={() => edit.onChange(k, items.filter((_, j) => j !== i))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      {items.length < max ? (
        <button type="button" className="mt-2 text-[12px] font-medium text-[#52514e] underline underline-offset-2" onClick={() => edit.onChange(k, [...items, ''])}>
          + Add
        </button>
      ) : null}
    </SectionTools>
  )
}

export function EditableGoals({ edit, goals, accent }: { edit?: EditApi | null; goals: ReportNarrative['goals']; accent: string }) {
  if (!edit) {
    return (
      <ol className="mt-4 space-y-3">
        {goals.map((g, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white" style={{ background: accent }}>
              {i + 1}
            </span>
            <div>
              <div className="text-[14px] font-medium">{g.goal}</div>
              {g.measure ? (
                <div className="mt-0.5 text-[12px]" style={{ color: INK.secondary }}>
                  <span className="font-medium">How we’ll measure it:</span> {g.measure}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    )
  }
  const set = (i: number, patch: Partial<ReportNarrative['goals'][number]>) => edit.onChange('goals', goals.map((g, j) => (j === i ? { ...g, ...patch } : g)))
  return (
    <SectionTools k="goals" edit={edit}>
      <ol className="mt-4 space-y-3">
        {goals.map((g, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white" style={{ background: accent }}>
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <textarea aria-label={`Goal ${i + 1}`} value={g.goal} onChange={(e) => set(i, { goal: e.target.value })} className={cn(FIELD, 'text-[14px] leading-snug')} />
              <textarea aria-label={`How we’ll measure goal ${i + 1}`} value={g.measure} placeholder="How we’ll measure it" onChange={(e) => set(i, { measure: e.target.value })} className={cn(FIELD, 'text-[12px] leading-snug')} />
            </div>
            <button type="button" aria-label={`Remove goal ${i + 1}`} className="mt-1 text-[#7d7a72] hover:text-[#b42318]" onClick={() => edit.onChange('goals', goals.filter((_, j) => j !== i))}>
              ×
            </button>
          </li>
        ))}
      </ol>
      {goals.length < 4 ? (
        <button type="button" className="mt-2 text-[12px] font-medium text-[#52514e] underline underline-offset-2" onClick={() => edit.onChange('goals', [...goals, { goal: '', measure: '' }])}>
          + Add goal
        </button>
      ) : null}
    </SectionTools>
  )
}
