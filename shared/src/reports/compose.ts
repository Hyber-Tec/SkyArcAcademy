import type { Evaluation } from '../shooting/evaluation'
import type { DateKey } from '../time'
import { type FactsSession, type PreviousReport, evaluationsFingerprint, reportFacts } from './facts'
import { periodLabel } from './period'
import { templateNarrative } from './template'
import { DEFAULT_REPORT_OPTIONS, type ProgressReportDoc, type ReportPerson, type ReportPreset } from './types'

export interface ComposeInput {
  academy: { name: string; contact: { phone: string; email: string; website: string; address: string } }
  student: { id: string; name: string; firstName: string; lastName: string; level: string | null; program: string | null }
  period: { from: DateKey; to: DateKey; preset: ReportPreset }
  /** The student's evaluations inside the period. */
  evaluations: readonly (Evaluation & { id: string })[]
  /** The student's classes inside the period. */
  sessions: readonly FactsSession[]
  previous: PreviousReport | null
  by: ReportPerson
}

/** Everything of a new draft report except the timestamps, which the writer adds. */
export type ComposedReport = Omit<ProgressReportDoc, 'generatedAt' | 'updatedAt' | 'sharedAt' | 'firstViewedAt'>

export function composeReport(input: ComposeInput): ComposedReport {
  const label = periodLabel(input.period.from, input.period.to)
  const { facts, series } = reportFacts(input.evaluations, input.sessions, input.previous)
  const narrative = templateNarrative(facts, input.student.firstName, label)
  return {
    schemaVersion: 1,
    status: 'draft',
    sharedWithParents: false,
    studentId: input.student.id,
    studentName: input.student.name,
    student: {
      name: input.student.name,
      firstName: input.student.firstName,
      lastName: input.student.lastName,
      level: input.student.level,
      program: input.student.program,
    },
    period: { ...input.period, label },
    startDate: input.period.from,
    endDate: input.period.to,
    evaluationCount: series.length,
    generatedBy: input.by,
    updatedBy: input.by.email,
    sharedBy: null,
    notify: null,
    source: { evaluationIds: series.map((s) => s.id), fingerprint: evaluationsFingerprint(input.evaluations) },
    snapshot: { academyName: input.academy.name, contact: input.academy.contact },
    facts,
    series,
    narrative,
    narrativeOriginal: narrative,
    narrativeMeta: { source: 'template', sections: {} },
    options: { ...DEFAULT_REPORT_OPTIONS, showAttendance: facts.attendance.attended + facts.attendance.missed > 0 },
    customName: null,
  }
}

/** "September 2026 progress report", or the name staff gave it. */
export function reportName(r: Pick<ProgressReportDoc, 'customName' | 'period'>): string {
  return r.customName || `${r.period.label} progress report`
}
