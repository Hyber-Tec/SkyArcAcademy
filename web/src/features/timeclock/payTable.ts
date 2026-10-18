import { type DateKey, formatDateKey } from '@shared/time'

/** True Education's page sizes: recent records, and a generated report. */
export const BROWSE_PAGE = 25
export const REPORT_PAGE = 70
/** How far back the recent list first looks; it reaches further back as pages need it. */
export const BROWSE_DAYS = 30

/** A payroll row's date: "Thu, Oct 15" this year, "Oct 15, 2025" before. */
export function payDateLabel(dateKey: DateKey, today: DateKey): string {
  return formatDateKey(dateKey, dateKey.slice(0, 4) === today.slice(0, 4) ? 'weekdayMedium' : 'medium')
}

/** Rows are shaded by date, not one by one: each new date flips the shade. */
export function shadeByDate(rows: readonly { dateKey: DateKey }[]): boolean[] {
  return rows.reduce<boolean[]>((acc, r, i) => [...acc, i > 0 && (r.dateKey !== rows[i - 1].dateKey ? !acc[i - 1] : acc[i - 1])], [])
}

/** Saves rows as a CSV file (every cell quoted). */
export function downloadCsv(filename: string, lines: string[][]) {
  const blob = new Blob([lines.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}
