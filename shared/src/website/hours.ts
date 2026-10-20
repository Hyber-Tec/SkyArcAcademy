/**
 * The hours the Website page sets are lines of text ("Monday" · "4:30–8 PM", "Friday–Sunday" · "By arrangement").
 * These helpers find which line is today, in the academy's time zone.
 */
const NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** Today's weekday (0 = Sunday) in a time zone. */
export function weekdayIn(timeZone: string, now = new Date()): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now).slice(0, 3).toLowerCase()
  return Math.max(0, NAMES.indexOf(name))
}

/** The weekdays a line names: "Monday", "Mon & Wed", "Friday–Sunday", "Tue-Thu". */
export function weekdaysOf(days: string): number[] {
  const text = days.toLowerCase()
  const found: { day: number; at: number }[] = []
  const re = /\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\.?/g
  for (let m = re.exec(text); m; m = re.exec(text)) found.push({ day: NAMES.indexOf(m[1]), at: m.index })
  const out = new Set<number>()
  for (let i = 0; i < found.length; i++) {
    out.add(found[i].day)
    const next = found[i + 1]
    // A dash or "to" between two days is a range (it may wrap past Saturday).
    if (next && /^[^a-z]*(?:[–—-]|\bto\b|\bthrough\b)/.test(text.slice(found[i].at, next.at).replace(/^[a-z.]+/, ''))) {
      for (let d = found[i].day; d !== next.day; d = (d + 1) % 7) out.add(d)
    }
  }
  return [...out]
}
