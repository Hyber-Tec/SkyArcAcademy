/**
 * Moves the academy's real data in, once (docs/TODO.md, "Moving the real data in"): the staff with their pay rates,
 * the students with their levels, rifles, grades and parents, and the classes on the schedule sheets with each
 * student's seat and who's in each day. Nobody gets access, so no sign-in email goes out; the office gives access from
 * the website when it's ready.
 *
 *   npx tsx scripts/import-academy.ts docs/internal/schedule-import/import.json            # dry run: what it would write
 *   npx tsx scripts/import-academy.ts docs/internal/schedule-import/import.json --apply    # write it
 *   npx tsx scripts/import-academy.ts docs/internal/schedule-import/import.json --remove   # take it out again
 *
 * The import file is built from the academy's sheets and spreadsheet by docs/internal/import-tools/build_import.py
 * (local only: it holds names and contacts). The IDs given to each person, class and seat are kept beside it
 * (ids-<project>.json), so a second run rewrites the same documents and --remove finds them (with every day of the
 * imported staff's hours, and every seat of the imported students). In production it refuses to write while the
 * sample data or the stores' review logins are still there (remove them first: docs/DEPLOY.md, "Sample data"). Uses
 * the developer's gcloud login (scripts/lib/firestore-rest.ts), or the emulators when FIRESTORE_EMULATOR_HOST is set.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { ACADEMY_ID } from '../shared/src/academy'
import { COL, DOC } from '../shared/src/paths'
import { SAMPLE_EMAIL_DOMAIN, SAMPLE_PREFIX } from '../shared/src/sample/data'
import { resolveBusinessRules } from '../shared/src/settings/businessRules'
import { resolveSettings, type SettingsOverrides } from '../shared/src/settings/resolve'
import { formatDateKey, todayKey } from '../shared/src/time'
import { type IdMap, IMPORT_AUTHOR, type ImportFile, classesDocs, peopleDocs } from './lib/academy-import'
import { PROJECT_ID, commit, deleteDocuments, getDocument, listDocuments } from './lib/firestore-rest'
import { isReviewAdmin } from './lib/review-admin'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { apply: { type: 'boolean', default: false }, remove: { type: 'boolean', default: false }, yes: { type: 'boolean', default: false } },
})
const file = positionals[0]
if (!file || !existsSync(file)) {
  console.error('Usage: npx tsx scripts/import-academy.ts <import.json> [--apply | --remove]')
  process.exit(1)
}
const emulator = !!process.env.FIRESTORE_EMULATOR_HOST
const base = `branches/${ACADEMY_ID}`
// One ID map per Firebase project, so a practice run on the emulators never decides production's IDs.
const idsFile = path.join(path.dirname(file), `ids-${PROJECT_ID}.json`)
const ids: IdMap = existsSync(idsFile) ? JSON.parse(readFileSync(idsFile, 'utf8')) : {}
const input = JSON.parse(readFileSync(file, 'utf8')) as ImportFile
if (input.version !== 1) throw new Error(`Unknown import file version ${String(input.version)}`)
const where = emulator ? `the emulators (${PROJECT_ID})` : `PRODUCTION (${PROJECT_ID})`

/** Sample people or the review logins still in the academy: the import waits until they're gone. */
async function sampleLeft(): Promise<string[]> {
  const found: string[] = []
  if ((await listDocuments(`${base}/${COL.staff}`)).some((d) => d.id.startsWith(SAMPLE_PREFIX))) found.push('sample staff')
  if ((await listDocuments(`${base}/${COL.students}`)).some((d) => d.id.startsWith(SAMPLE_PREFIX))) found.push('sample students')
  const members = (await listDocuments(`${base}/${COL.members}`)).filter((d) => !isReviewAdmin(d.data))
  if (members.some((d) => d.id.endsWith(`@${SAMPLE_EMAIL_DOMAIN}`) || String(d.data.staffId ?? '').startsWith(SAMPLE_PREFIX))) found.push('sample sign-ins (the review logins)')
  return found
}

async function run() {
  const academy = await getDocument(base)
  if (!academy) throw new Error(`No academy at ${base} in ${PROJECT_ID}. Run npm run seed first.`)

  if (values.remove) {
    const idsOf = (prefix: string) => Object.entries(ids).flatMap(([key, id]) => (key.startsWith(prefix) ? [id] : []))
    const staffIds = new Set(idsOf('staff:'))
    const studentIds = new Set(idsOf('student:'))
    const classIds = idsOf('class:')
    // The imported seats, and any the office has given the imported students since; every day of the staff's hours.
    const seatPaths = new Set(idsOf('seat:').map((id) => `${base}/${COL.sessions}/${id}`))
    for (const d of await listDocuments(`${base}/${COL.sessions}`)) if (studentIds.has(String(d.data.studentId))) seatPaths.add(d.path)
    const whosIn = (await listDocuments(`${base}/${COL.availability}`)).filter((d) => staffIds.has(String(d.data.staffId)))
    const paths = [
      ...[...staffIds].flatMap((id) => [`${base}/${COL.staff}/${id}/private/${DOC.compensation}`, `${base}/${COL.staff}/${id}/private/${DOC.staffNotes}`, `${base}/${COL.staff}/${id}`]),
      ...[...studentIds].flatMap((id) => [`${base}/${COL.students}/${id}/private/${DOC.privateProfile}`, `${base}/${COL.students}/${id}`]),
      ...classIds.map((id) => `${base}/${COL.classes}/${id}`),
      ...seatPaths,
      ...whosIn.map((d) => d.path),
    ]
    console.log(
      `Removing ${staffIds.size + studentIds.size} imported people, ${classIds.length} classes, ${seatPaths.size} seats and ${whosIn.length} days of the staff's hours (${paths.length} documents) from ${where}.`,
    )
    if (!emulator && !values.yes) {
      console.log('Production: anything the office has changed on them or added for them since goes too. Add --yes to go ahead.')
      return
    }
    await deleteDocuments(paths)
    console.log('Done.')
    return
  }

  const now = new Date()
  const timezone = String(academy.timezone ?? 'America/New_York')
  const settings = resolveSettings((academy.settings ?? null) as SettingsOverrides | null)
  const rules = resolveBusinessRules((academy.businessRules ?? null) as Parameters<typeof resolveBusinessRules>[0])
  const people = peopleDocs(input, { academyId: ACADEMY_ID, now, today: todayKey(timezone, now), levels: settings.students.levels, programs: settings.students.programs, ids })
  const schedule = classesDocs(input, { academyId: ACADEMY_ID, now, timezone, seatsPerClass: rules.seatsPerClass, ids })
  const sched = schedule.summary
  const span = sched.from && sched.to ? `${formatDateKey(sched.from, 'monthDay')} to ${formatDateKey(sched.to, 'monthDay')}` : 'no days'
  const auditEntry = (id: string, category: 'people' | 'schedule', summary: string) => ({
    path: `${base}/${COL.auditLog}/${id}-${now.getTime()}`,
    data: {
      at: now,
      actorUid: IMPORT_AUTHOR,
      actorEmail: '',
      actorName: 'Data import',
      actorRole: 'system',
      action: 'import',
      category,
      entityType: 'academy',
      entityId: ACADEMY_ID,
      summary,
      context: '',
      dateKey: todayKey(timezone, now),
      studentId: null,
      studentName: null,
      coachId: null,
      coachName: null,
      changes: [],
      via: 'function',
    },
  })
  const audits = [
    auditEntry('import', 'people', `Imported ${people.summary.staff} staff and ${people.summary.students} students from the academy's schedule sheets and spreadsheet (no access given)`),
    auditEntry('import-classes', 'schedule', `Imported the schedule sheets, ${span}: ${sched.classes} classes with ${sched.seats} students' seats, and who's in (${sched.whosIn} days of the staff's hours)`),
  ]

  console.log(`${values.apply ? 'Writing to' : 'Dry run against'} ${where}:`)
  console.log(`  ${people.summary.staff} staff, ${people.summary.students} students, ${people.summary.parents} parents' contacts (${people.docs.length} documents); no access, no emails`)
  if (people.summary.withoutParents.length) console.log(`  Without parents yet: ${people.summary.withoutParents.length}`)
  for (const p of people.problems) console.log(`  ! ${p}`)
  const k = sched.kinds
  const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
  console.log(
    `  ${count(sched.classes, 'class', 'classes')} on ${count(sched.days, 'day')} (${span}), ${rules.seatsPerClass} seats each, with ${sched.seats} students' seats: ${k.regular} regular, ${count(k.makeup, 'make-up')}, ${k.practice} practice, ${count(k.trial, 'trial')}, ${count(k.evaluation, 'evaluation')}; ${sched.canceled} canceled`,
  )
  console.log(`  Who's in: ${sched.whosIn} days of the staff's hours (one record per person and day)`)
  for (const p of schedule.problems) console.log(`  ! ${p}`)

  if (!values.apply) {
    console.log('Nothing written. Add --apply to write it.')
    return
  }
  if (!emulator) {
    const left = await sampleLeft()
    if (left.length) {
      console.error(`Refused: ${left.join(', ')} still in production. Remove them first (docs/TODO.md, "Moving the real data in", step 1).`)
      process.exit(1)
    }
  }
  await commit([...people.docs, ...schedule.docs, ...audits], (done, total) => process.stdout.write(`\r  writing ${done}/${total}`))
  writeFileSync(idsFile, `${JSON.stringify(ids, null, 1)}\n`)
  console.log(`\nDone. IDs kept in ${idsFile}.`)
}

await run()
