import { formatMinutes } from '@shared/time'

/** "4:00 – 5:30 PM" (one AM/PM when both times share it). */
export function timeSpan(startMin: number, endMin: number): string {
  const a = formatMinutes(startMin)
  const b = formatMinutes(endMin)
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

/** Age in whole years on a date. */
export function ageOn(dob: string, today: string): number | null {
  const [y, m, d] = dob.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  if (!y || !ty) return null
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0)
}
