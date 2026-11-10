import type { EvaluationSource, Position } from '../shooting/evaluation'
import type { ShotPoint } from '../shooting/target'
import type { DateKey } from '../time'

/**
 * Progress reports: a student's shooting over a period, built from their evaluations (SIUS results and paper cards)
 * and their classes, at the level of HyberCRM's progress reports (docs/DECISIONS.md §7). The numbers are a snapshot
 * taken when the report is made; the words start as standard text staff can edit. Parents see a report only once an
 * admin or a coach shares it (§6, Q11), and never the PDFs it came from.
 */

export type ReportPreset = 'since_last' | 'last_month' | 'this_month' | 'last_30' | 'last_90' | 'custom'

export interface ReportPeriod {
  from: DateKey
  to: DateKey
  preset: ReportPreset
  /** "September 2026" for a whole month, else "Sep 2 – Oct 15, 2026". */
  label: string
}

/** Calculated from the scores, never written by hand. */
export type TrendLevel = 'improving' | 'steady' | 'dipping'

/** One evaluation of the period, compact, for the charts and the target pictures. */
export interface EvaluationPoint {
  id: string
  dateKey: DateKey
  position: Position
  source: EvaluationSource
  shots: number
  total: number
  wholeTotal: number
  /** The average of every 10 shots on the source's scale: decimal for SIUS, whole for a paper card. */
  per10: number
  /** The average of every 10 shots in whole numbers (out of 100), the scale every source shares. */
  wholePer10: number
  innerTens: number | null
  groupMm: number | null
  mpi: ShotPoint | null
  /**
   * The counted shots: SIUS ones with their directions (for the target pictures), a paper card's whole scores, and a
   * scanned card's with their place on the target (mm, x right, y up).
   */
  marks: { v: number; a: number | null; x?: number; y?: number }[]
}

export interface PositionFacts {
  position: Position
  evaluations: number
  shots: number
  /** Average per 10 shots in whole numbers, every source. */
  average: number | null
  /** Average per 10 shots in decimals, SIUS results only. */
  decimal: number | null
  best: { id: string; wholePer10: number; per10: number; dateKey: DateKey; source: EvaluationSource } | null
  first: { id: string; wholePer10: number; dateKey: DateKey } | null
  latest: { id: string; wholePer10: number; dateKey: DateKey } | null
  /** Second half of the period against the first (whole per 10); null with fewer than two evaluations. */
  change: number | null
  /** SIUS: share of shots that were inner tens (%). */
  innerTensPct: number | null
  /** SIUS: average group size (mm). */
  groupMm: number | null
  /** SIUS: where the groups sit on average. */
  mpi: ShotPoint | null
  /** Lowest and highest whole per 10. */
  range: { low: number; high: number } | null
}

export interface ReportFacts {
  evaluations: { total: number; sius: number; paper: number; shots: number }
  positions: PositionFacts[]
  /** Every position together, whole per 10. */
  average: number | null
  /** SIUS results together, decimal per 10. */
  decimal: number | null
  innerTensPct: number | null
  groupMm: number | null
  /** Match shots by whole score: 10, 9, 8 and 7 or less. */
  distribution: { tens: number; nines: number; eights: number; lower: number }
  attendance: { attended: number; missed: number; canceled: number; unmarked: number; percent: number | null }
  trend: { level: TrendLevel | null; change: number | null }
  previous: { reportId: string; periodLabel: string; average: number | null; evaluations: number } | null
  /**
   * Difference from the previous report's average (whole per 10), over the positions both periods have, so a prone-only
   * month isn't measured against a standing-only one.
   */
  deltaAverage: number | null
  /**
   * The period's competitions, apart from practice (the manager's second meeting, docs/DECISIONS.md §23): the figures
   * above leave them out. Missing on reports made before.
   */
  competitions?: CompetitionFact[]
}

/** One competition result in a report. */
export interface CompetitionFact {
  id: string
  dateKey: DateKey
  match: string
  position: Position
  shots: number
  total: number
  innerTens: number | null
  decimal: boolean
  wholePer10: number
  /**
   * The same position's match before it (the owner, 2026-10-29: "compare a competition with the one a month before, as
   * we compare scores"), from before the period too; null for the first. Missing on reports made before.
   */
  since?: { dateKey: DateKey; match: string; wholePer10: number } | null
}

export interface ReportGoal {
  goal: string
  measure: string
}

/** The written parts: standard text from the figures, then edited by staff. */
export interface ReportNarrative {
  overview: string
  strengths: string[]
  focusAreas: string[]
  goals: ReportGoal[]
  coachNote: string
}

export type NarrativeKey = keyof ReportNarrative

export const NARRATIVE_KEYS: NarrativeKey[] = ['overview', 'strengths', 'focusAreas', 'goals', 'coachNote']

export const NARRATIVE_LABELS: Record<NarrativeKey, string> = {
  overview: 'Overview',
  strengths: 'Strengths',
  focusAreas: 'Focus areas',
  goals: 'Goals',
  coachNote: 'A note from the coach',
}

export interface SectionMeta {
  /**
   * Who wrote it: the standard text, staff by hand, or AI when an owner or admin asked for a draft ("Write with AI",
   * docs/DECISIONS.md §26); a section AI drafted stays `ai` as it's edited, and Restore takes it back to the standard text.
   */
  source: 'template' | 'staff' | 'ai'
  editedBy?: string
  editedAt?: string
}

export interface ReportOptions {
  showStatus: boolean
  showTargets: boolean
  showComparison: boolean
  showAttendance: boolean
}

export const DEFAULT_REPORT_OPTIONS: ReportOptions = { showStatus: true, showTargets: true, showComparison: true, showAttendance: true }

export interface ReportPerson {
  email: string
  name: string
  role: string
}

/** `branches/{b}/progressReports/{id}`. */
export interface ProgressReportDoc {
  schemaVersion: 1
  status: 'draft' | 'shared'
  /** Mirrors `status == 'shared'` (the families' queries and the rules read it). */
  sharedWithParents: boolean
  studentId: string
  studentName: string
  student: { name: string; firstName: string; lastName: string; level: string | null; program: string | null }
  period: ReportPeriod
  startDate: DateKey
  endDate: DateKey
  evaluationCount: number
  generatedAt: unknown
  generatedBy: ReportPerson
  updatedAt: unknown
  updatedBy: string
  sharedAt: unknown | null
  /** Who shared it, and whether they chose to email the family a link (Cloud Functions read it). */
  sharedBy: (ReportPerson & { emailFamily?: boolean }) | null
  /** A family member's first opening of the shared report. */
  firstViewedAt: unknown | null
  /** Who was told when it was shared (Cloud Functions write it). */
  notify: { status: 'sent' | 'not_configured' | 'failed' | 'skipped'; at: unknown; recipients: string[]; error: string | null } | null
  /** What it was built from; a different fingerprint now means the evaluations changed since. */
  source: { evaluationIds: string[]; fingerprint: string }
  snapshot: { academyName: string; contact: { phone: string; email: string; website: string; address: string } }
  facts: ReportFacts
  series: EvaluationPoint[]
  narrative: ReportNarrative
  /** The standard text, for "Restore". */
  narrativeOriginal: ReportNarrative
  narrativeMeta: { source: 'template'; sections: Partial<Record<NarrativeKey, SectionMeta>> }
  options: ReportOptions
  customName: string | null
}

/** Staff and families word the trend differently. */
export const TREND_LABELS: Record<TrendLevel, { staff: string; family: string }> = {
  improving: { staff: 'Improving', family: 'Improving' },
  steady: { staff: 'Steady', family: 'Steady' },
  dipping: { staff: 'Dipping', family: 'Building back up' },
}

export function trendLabel(level: TrendLevel, audience: 'staff' | 'family'): string {
  return TREND_LABELS[level][audience]
}
