/**
 * A bridge for the phone app 1.0 (in the App Store's review since 2026-10-21): it finds a class by its one coach
 * (`coachId`), while since classes are taught together a seat has none (docs/DECISIONS.md §21), so 1.0 can't open a
 * class and lists each one without a coach. This gives every seat in a class that coach-less the class's lead coach:
 * the first coach in at its time (who's in). The website and the phone's update read classes by `classId` and ignore
 * it. Pay is Hourly, so it changes nothing there; class notices go to that one coach while it's set.
 *
 *   npx tsx scripts/lead-coach.ts            # count what it would set
 *   npx tsx scripts/lead-coach.ts --apply    # set it (run again after the office adds students on the website)
 *   npx tsx scripts/lead-coach.ts --clear    # take it off again, once the phone's update is out (docs/TODO.md)
 *
 * Uses the developer's gcloud login; SKYARC_PROJECT and FIRESTORE_EMULATOR_HOST as the other scripts.
 */
import { parseArgs } from 'node:util'
import { dayHours } from '../shared/src/availability'
import { ACADEMY_ID } from '../shared/src/academy'
import { COL, ROOT } from '../shared/src/paths'
import { coachesIn } from '../shared/src/schedule/classes'
import { resolveSettings, type SettingsOverrides } from '../shared/src/settings/resolve'
import type { AcademyClass, Availability, DayConfig, Session, Staff } from '../shared/src/types'
import { PROJECT_ID, commit, getDocument, listDocuments, patchDocuments } from './lib/firestore-rest'

const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false }, clear: { type: 'boolean', default: false } } })
const base = `${ROOT.branches}/${ACADEMY_ID}`
const BY = 'lead-coach'

async function main() {
  const academy = await getDocument(base)
  if (!academy) throw new Error(`No academy at ${base} in ${PROJECT_ID}.`)
  const settings = resolveSettings((academy.settings ?? null) as SettingsOverrides | null)
  const [classes, seats, availability, staff, configs] = await Promise.all([
    listDocuments(`${base}/${COL.classes}`),
    listDocuments(`${base}/${COL.sessions}`),
    listDocuments(`${base}/${COL.availability}`),
    listDocuments(`${base}/${COL.staff}`),
    listDocuments(`${base}/${COL.dayConfigs}`),
  ])
  const now = new Date()
  const inClass = seats.filter((s) => (s.data as unknown as Session).classId)
  if (values.clear) {
    const led = inClass.filter((s) => (s.data as unknown as Session).coachId)
    console.log(`${led.length} seats have a lead coach in ${PROJECT_ID}.`)
    if (!led.length) return
    await patchDocuments(led.map((s) => ({ path: s.path, set: { coachId: '', coachName: '', updatedAt: now, updatedBy: BY } })))
    await audit(now, `Took the lead coach off ${led.length} seats (the phone app reads classes now)`)
    return console.log('Cleared.')
  }
  const coaches = new Map(staff.filter((s) => s.data.role === 'coach' && s.data.status === 'active').map((s) => [s.id, s.data as unknown as Staff]))
  const classById = new Map(classes.map((c) => [c.id, c.data as unknown as AcademyClass]))
  const dayCfg = new Map(configs.map((c) => [c.id, c.data as unknown as DayConfig]))
  const byDay = new Map<string, Availability[]>()
  for (const a of availability) {
    const d = a.data as unknown as Availability
    byDay.set(d.dateKey, [...(byDay.get(d.dateKey) ?? []), d])
  }
  const patches: { path: string; set: Record<string, unknown> }[] = []
  let nobody = 0
  for (const s of inClass) {
    const seat = s.data as unknown as Session
    if (seat.coachId || seat.isDeleted) continue
    const c = classById.get(seat.classId)
    if (!c || c.isDeleted) continue
    const lead = coachesIn(c, byDay.get(c.dateKey) ?? [], dayHours(c.dateKey, settings, dayCfg), (id) => coaches.has(id))[0]
    if (!lead) {
      nobody++
      continue
    }
    patches.push({ path: s.path, set: { coachId: lead.staffId, coachName: coaches.get(lead.staffId)?.name ?? lead.name, updatedAt: now, updatedBy: BY } })
  }
  console.log(`${patches.length} seats get their class's lead coach in ${PROJECT_ID}${nobody ? `; ${nobody} are in classes with no coach in` : ''}.`)
  if (!values.apply || !patches.length) return console.log(values.apply ? 'Nothing to set.' : 'Nothing written. Add --apply to set it.')
  await patchDocuments(patches)
  await audit(now, `Gave ${patches.length} seats their class's lead coach, for the phone app 1.0`)
  console.log('Done.')
}

async function audit(at: Date, summary: string) {
  await commit([
    {
      path: `${base}/${COL.auditLog}/${BY}-${at.getTime()}`,
      data: {
        at,
        actorUid: BY,
        actorEmail: BY,
        actorName: 'Lead coach for the phone app 1.0',
        actorRole: 'system',
        action: 'session.lead_coach',
        category: 'schedule',
        entityType: 'session',
        entityId: 'many',
        summary,
        context: '',
        dateKey: null,
        studentId: null,
        studentName: null,
        coachId: null,
        coachName: null,
        changes: [],
        via: 'function',
      },
    },
  ])
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
