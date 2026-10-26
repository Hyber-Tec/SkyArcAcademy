/** "in 25 min", "in 1 hr 5 min" (until a start time today). */
export function untilText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 1) return 'now'
  if (m < 60) return `in ${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `in ${h} hr ${r} min` : `in ${h} hr`
}

/** "35 min left", "1 hr 10 min left". */
export function leftText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m} min left`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} hr ${r} min left` : `${h} hr left`
}
