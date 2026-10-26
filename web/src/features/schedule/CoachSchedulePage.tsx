import { ClassSchedule } from './SchedulePage'

/**
 * The coach's schedule: the academy's classes as the office sees them, read-only. Coaches teach every class in their
 * hours together, so they see all of them, with who's in.
 */
export function CoachSchedulePage() {
  return <ClassSchedule mode="coach" basePath="/coach/schedule" />
}
