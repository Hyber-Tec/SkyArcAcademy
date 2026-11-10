import { type DateKey, addDays, diffDays, formatDateKey } from '@shared/time'
/** The inbox's day headers: "Today", "Yesterday", "Thu", "Oct 30". */
export function dayHeaderIn(d: DateKey, today: DateKey): string {
  if (d === today) return 'Today'
  if (d === addDays(today, -1)) return 'Yesterday'
  const ago = diffDays(d, today)
  if (ago > 0 && ago < 7) return formatDateKey(d, 'weekdayMedium').split(',')[0]
  return formatDateKey(d, ago > 365 ? 'medium' : 'monthDay')
}
