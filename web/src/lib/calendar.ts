import { formatMinutesShort } from '@shared/time'

const keep = (s: string) => s.replace(/ /g, ' ')

/**
 * "2 PM–4:30 PM" for a calendar box: when the box is narrow it wraps only after
 * the dash ("2 PM–" / "4:30 PM"), never inside a time.
 */
export function boxRange(start: string, end: string): string {
  return `${keep(start)}–​${keep(end)}`
}

/**
 * `boxRange` from wall-clock minutes. The start drops its AM/PM when the end has the same one ("4:30–8:30 PM", as the
 * schedule writes times), so the range fits a phone's narrow day boxes.
 */
export function timeRange(startMin: number, endMin: number): string {
  const start = formatMinutesShort(startMin)
  const end = formatMinutesShort(endMin)
  const suffix = end.slice(-3)
  return boxRange(start.endsWith(suffix) ? start.slice(0, -3) : start, end)
}
