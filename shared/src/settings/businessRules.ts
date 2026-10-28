import type { DateKey } from '../time'

/**
 * Core business rules of the academy: how coaches are paid and how many seats a class has. They live in
 * `branches/{b}.businessRules`; only the academy's owner changes them (Settings → Academy rules), and admins see them
 * read-only.
 */

/**
 * How coaches are paid. Since the manager's second meeting (docs/DECISIONS.md §23, K1 and K5) there is one way:
 * **Hourly**, every paid hour the kiosk records, at the person's one rate (`shared/src/pay`). Classes taught, Teaching
 * only and Teaching + Admin are gone (each needed the admin rate or paid from the schedule); stored ones are read as
 * Hourly (both academies were already Hourly). They stay in the type until the phone app's update.
 */
export type PayModel = 'hourly' | 'classes' | 'teaching_only' | 'teaching_admin'

export interface PayModelPeriod {
  model: PayModel
  /** First day (branch zone) this model applies. */
  from: DateKey
}

export interface BusinessRules {
  /** The pay model over time: always Hourly from the start (stored entries are read as Hourly). */
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

/** Until the owner changes them: Hourly, and six seats a class, as on the class sheets. */
export const DEFAULT_BUSINESS_RULES: BusinessRules = {
  payModels: [{ model: 'hourly', from: PAY_MODEL_SINCE_START }],
  seatsPerClass: 6,
  maxStudentsPerCoach: 5,
}

/** Stored rules with every gap filled from the defaults. Every stored pay model is read as Hourly. */
export function resolveBusinessRules(stored: Partial<BusinessRules> | null | undefined): BusinessRules {
  const max = Number(stored?.maxStudentsPerCoach)
  const seats = Number(stored?.seatsPerClass)
  return {
    payModels: DEFAULT_BUSINESS_RULES.payModels,
    seatsPerClass: Number.isInteger(seats) && seats >= 1 ? Math.min(seats, MAX_SEATS_PER_CLASS) : DEFAULT_BUSINESS_RULES.seatsPerClass,
    maxStudentsPerCoach: Number.isInteger(max) && max >= 1 ? Math.min(max, MAX_STUDENTS_PER_COACH_LIMIT) : DEFAULT_BUSINESS_RULES.maxStudentsPerCoach,
  }
}

/** The pay model in force on a date: Hourly, for rules read with `resolveBusinessRules`. */
export function payModelOn(rules: Pick<BusinessRules, 'payModels'>, dateKey: DateKey): PayModel {
  let model = rules.payModels[0]?.model ?? DEFAULT_BUSINESS_RULES.payModels[0].model
  for (const p of rules.payModels) if (p.from <= dateKey) model = p.model
  return model
}
