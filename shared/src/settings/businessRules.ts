import { type DateKey, addDays } from '../time'

/**
 * Core business rules of the academy: how coaches are paid and how many seats a class has. They live in
 * `branches/{b}.businessRules`; only the academy's owner changes them (Settings → Academy rules), and admins see them
 * read-only.
 */

/**
 * Classes taught (Sky Arc's default, the owner's decision of Oct 15, 2026): coaches are paid for the classes they
 * teach, from the schedule, and clocking in and out is only a log. The others price clocked time: Hourly pays every
 * clocked hour at the coach's rate; Teaching only pays only clocked time in classes; Teaching + Admin pays the class
 * rate in classes and the admin rate for the rest of the shift (e.g. setting up).
 */
export type PayModel = 'classes' | 'hourly' | 'teaching_only' | 'teaching_admin'

export const PAY_MODELS: readonly PayModel[] = ['classes', 'hourly', 'teaching_admin', 'teaching_only']

export const PAY_MODEL_LABELS: Record<PayModel, string> = {
  classes: 'Classes taught',
  hourly: 'Hourly',
  teaching_only: 'Teaching only',
  teaching_admin: 'Teaching + Admin',
}

export const PAY_MODEL_HELP: Record<PayModel, string> = {
  classes: 'Coaches are paid their teaching rate for the classes they teach, by the schedule. Clocking in and out is kept as a log and doesn’t change pay.',
  hourly: 'Coaches are paid their teaching rate for every clocked hour.',
  teaching_only: 'Coaches are paid only for clocked time spent teaching. Gaps and idle clocked-in time are unpaid.',
  teaching_admin: 'Teaching rate for clocked time in classes, admin rate for the rest of the clocked shift.',
}

export interface PayModelPeriod {
  model: PayModel
  /** First day (branch zone) this model applies. */
  from: DateKey
}

export interface BusinessRules {
  /**
   * Pay model over time, oldest first; each entry applies from its date until the
   * next one. A change only ever applies from a chosen date forward, so pay before
   * that date keeps the model it was earned under.
   */
  payModels: PayModelPeriod[]
  /** Seats a new class has, as on the sheets (each class keeps its own number, which the office can change). */
  seatsPerClass: number
  /**
   * Students one coach taught at once, from when each student had one coach. Classes are taught together now, so only
   * the phone app reads it until its update.
   */
  maxStudentsPerCoach: number
}

/** From the beginning: the first pay model covers every earlier date. */
export const PAY_MODEL_SINCE_START: DateKey = '2000-01-01'

export const MAX_STUDENTS_PER_COACH_LIMIT = 6

/** The most seats a class can have. */
export const MAX_SEATS_PER_CLASS = 12

/** Until the owner changes them: pay for classes taught, and six seats a class, as on the class sheets. */
export const DEFAULT_BUSINESS_RULES: BusinessRules = {
  payModels: [{ model: 'classes', from: PAY_MODEL_SINCE_START }],
  seatsPerClass: 6,
  maxStudentsPerCoach: 5,
}

/** Stored rules with every gap filled from the defaults. */
export function resolveBusinessRules(stored: Partial<BusinessRules> | null | undefined): BusinessRules {
  const payModels = (stored?.payModels ?? [])
    .filter((p) => p && (PAY_MODELS as readonly string[]).includes(p.model) && typeof p.from === 'string')
    .sort((a, b) => a.from.localeCompare(b.from))
  const max = Number(stored?.maxStudentsPerCoach)
  const seats = Number(stored?.seatsPerClass)
  return {
    payModels: payModels.length ? payModels : DEFAULT_BUSINESS_RULES.payModels,
    seatsPerClass: Number.isInteger(seats) && seats >= 1 ? Math.min(seats, MAX_SEATS_PER_CLASS) : DEFAULT_BUSINESS_RULES.seatsPerClass,
    maxStudentsPerCoach: Number.isInteger(max) && max >= 1 ? Math.min(max, MAX_STUDENTS_PER_COACH_LIMIT) : DEFAULT_BUSINESS_RULES.maxStudentsPerCoach,
  }
}

/** The pay model in force on a date. */
export function payModelOn(rules: Pick<BusinessRules, 'payModels'>, dateKey: DateKey): PayModel {
  let model = rules.payModels[0]?.model ?? DEFAULT_BUSINESS_RULES.payModels[0].model
  for (const p of rules.payModels) if (p.from <= dateKey) model = p.model
  return model
}

/** Changes after the first entry, i.e. actual switches (for display). */
export function payModelChanges(rules: Pick<BusinessRules, 'payModels'>): PayModelPeriod[] {
  return rules.payModels.slice(1)
}

/**
 * Earliest date a pay-model change may start: after the last locked pay period
 * (locked pay never changes). The owner picks any date from here on.
 */
export function earliestPayModelChange(lockedThrough: DateKey | null): DateKey | null {
  return lockedThrough ? addDays(lockedThrough, 1) : null
}

/**
 * The rules with a pay-model switch starting on `from`. Later scheduled switches
 * are replaced, so the history stays a simple timeline.
 */
export function withPayModelChange(rules: BusinessRules, model: PayModel, from: DateKey): BusinessRules {
  const kept = rules.payModels.filter((p) => p.from < from)
  const before = kept.length ? kept[kept.length - 1].model : null
  const payModels = before === model ? kept : [...kept, { model, from }]
  return { ...rules, payModels: payModels.length ? payModels : [{ model, from: PAY_MODEL_SINCE_START }] }
}
