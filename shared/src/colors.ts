/** Calendar colors assigned to employees (schedule rows, Employee Calendar). */
export const STAFF_COLORS: readonly string[] = [
  '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#ca8a04', '#4f46e5', '#dc2626', '#0d9488',
]

export function pickStaffColor(index: number): string {
  return STAFF_COLORS[((index % STAFF_COLORS.length) + STAFF_COLORS.length) % STAFF_COLORS.length]
}

/** A coach's colour: their own, or one picked from their ID where it can't be read (a coach seeing another coach). */
export function coachColor(staffId: string, own?: string | null): string {
  if (own) return own
  let h = 0
  for (const ch of staffId) h = (h * 31 + ch.charCodeAt(0)) | 0
  return STAFF_COLORS[Math.abs(h) % STAFF_COLORS.length]
}
