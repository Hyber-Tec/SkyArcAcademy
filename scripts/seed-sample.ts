/**
 * Sample data for trying the app before the academy's real data arrives (shared/src/sample/data.ts): fictional
 * coaches, a manager, students and families, ten weeks of classes around today with makeups and trials, availability,
 * time entries, announcements and events. Running it again rewrites the same documents and adds classes around the
 * new today.
 *
 *   npm run seed:sample                # add it to production (skyarcacademy)
 *   npm run seed:sample -- --remove    # delete it, with everything the app made for the sample people
 *
 * Removing finds sample documents by their `sample-` IDs and `@skyarc-sample.test` emails, and also deletes what the
 * app made for those people later: classes, time entries, kiosk PINs, notifications and audit entries. Real people and
 * their data are never touched. Uses the developer's gcloud login (scripts/lib/firestore-rest.ts), or the emulators
 * when FIRESTORE_EMULATOR_HOST is set. The academy must exist first (npm run seed).
 */
import { parseArgs } from 'node:util'
import { ACADEMY_ID } from '../shared/src/academy'
import { COL } from '../shared/src/paths'
import { SAMPLE_AUTHOR, SAMPLE_EMAIL_DOMAIN, SAMPLE_PREFIX, buildSampleData } from '../shared/src/sample/data'
import { resolveBusinessRules } from '../shared/src/settings/businessRules'
import { resolveSettings } from '../shared/src/settings/resolve'
import type { SettingsOverrides } from '../shared/src/settings/resolve'
import { todayKey } from '../shared/src/time'
import { PROJECT_ID, commit, deleteDocuments, getDocument, listDocuments } from './lib/firestore-rest'

const { values } = parseArgs({ options: { remove: { type: 'boolean', default: false } } })
const base = `branches/${ACADEMY_ID}`

const isSample = (v: unknown) => typeof v === 'string' && v.startsWith(SAMPLE_PREFIX)
const isSampleEmail = (v: unknown) => typeof v === 'string' && v.toLowerCase().endsWith(`@${SAMPLE_EMAIL_DOMAIN}`)

/** What makes a document sample data, by collection. */
const SAMPLE_RULES: Record<string, (id: string, data: Record<string, unknown>) => boolean> = {
  [COL.staff]: (id) => isSample(id),
  [COL.students]: (id) => isSample(id),
  [COL.sessions]: (id, d) => isSample(id) || isSample(d.studentId) || isSample(d.coachId),
  [COL.availability]: (id, d) => isSample(id) || isSample(d.staffId),
  [COL.clockShifts]: (id, d) => isSample(id) || isSample(d.staffId),
  [COL.openShifts]: (id) => isSample(id),
  [COL.kioskPins]: (_, d) => isSample(d.staffId),
  kioskPinOwners: (id) => isSample(id),
  [COL.members]: (id) => isSampleEmail(id),
  [COL.signupRequests]: (id) => isSampleEmail(id),
  [COL.notifications]: (_, d) => isSampleEmail(d.recipientKey),
  [COL.announcements]: (id) => isSample(id),
  [COL.events]: (id) => isSample(id),
  // A closed day the sample added, unless someone has changed it since.
  [COL.dayConfigs]: (_, d) => d.createdBy === SAMPLE_AUTHOR && d.updatedBy === SAMPLE_AUTHOR,
  [COL.auditLog]: (id, d) => isSample(id) || isSample(d.entityId) || isSample(d.studentId) || isSample(d.coachId),
}

/** Sub-collections that go with a removed document. */
const CHILDREN: Record<string, string[]> = { [COL.staff]: ['private'], [COL.students]: ['private'], [COL.announcements]: ['comments', 'reads'] }

async function add() {
  const academy = await getDocument(base)
  if (!academy) throw new Error(`No academy at ${base} in ${PROJECT_ID}. Run npm run seed first.`)
  const timezone = String(academy.timezone ?? 'America/New_York')
  const settings = resolveSettings((academy.settings ?? null) as SettingsOverrides | null)
  const rules = resolveBusinessRules((academy.businessRules ?? null) as Parameters<typeof resolveBusinessRules>[0])
  const now = new Date()
  const { docs, summary } = buildSampleData({
    academyId: ACADEMY_ID,
    timezone,
    today: todayKey(timezone, now),
    now,
    week: settings.schedule.defaultWeek,
    levels: settings.students.levels,
    programs: settings.students.programs,
    maxStudentsPerCoach: rules.maxStudentsPerCoach,
  })
  await commit(docs, (done, total) => process.stdout.write(`\r  writing ${done}/${total}`))
  console.log(`\n+ Sample data in ${PROJECT_ID}: ${summary.staff} staff (a manager and ${summary.staff - 1} coaches), ${summary.students} students, ${summary.parents} parents`)
  console.log(`  ${summary.classes} classes, ${summary.makeups} makeups, ${summary.trials} trial visits, ${summary.shifts} time entries`)
  console.log('  Remove it all with: npm run seed:sample -- --remove')
}

async function remove() {
  const paths: string[] = []
  for (const [col, isSampleDoc] of Object.entries(SAMPLE_RULES)) {
    const found = (await listDocuments(`${base}/${col}`)).filter((d) => isSampleDoc(d.id, d.data))
    for (const d of found) {
      for (const child of CHILDREN[col] ?? []) paths.push(...(await listDocuments(`${d.path}/${child}`)).map((c) => c.path))
      paths.push(d.path)
    }
    if (found.length) console.log(`- ${col}: ${found.length}`)
  }
  await deleteDocuments(paths)
  if (paths.length) {
    const now = new Date()
    await commit([
      {
        path: `${base}/${COL.auditLog}/data-sample-removed-${now.getTime()}`,
        data: {
          at: now,
          actorUid: SAMPLE_AUTHOR,
          actorEmail: SAMPLE_AUTHOR,
          actorName: 'Sample data',
          actorRole: 'system',
          action: 'sample.remove',
          category: 'settings',
          entityType: 'academy',
          entityId: ACADEMY_ID,
          summary: `Removed the sample data (${paths.length} documents)`,
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
  console.log(paths.length ? `  removed ${paths.length} documents from ${PROJECT_ID}` : `  no sample data in ${PROJECT_ID}`)
}

;(values.remove ? remove() : add()).catch((e) => {
  console.error(e)
  process.exit(1)
})
