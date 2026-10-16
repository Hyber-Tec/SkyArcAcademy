/**
 * Sample data for trying the app before the academy's real data arrives (shared/src/sample/data.ts): fictional
 * coaches, a manager, students and families, ten weeks of classes around today with makeups and trials, availability,
 * time entries, announcements and events; and their shooting (shared/src/sample/scores.ts): SIUS results as synthetic
 * PDFs in the students' Drive folders, a few paper cards, and two progress reports (one shared with the family).
 * Running it again rewrites the same documents and adds classes around the new today.
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
import { driveObjectPath, studentFolderId } from '../shared/src/drive/types'
import { COL } from '../shared/src/paths'
import { composeReport } from '../shared/src/reports/compose'
import { presetPeriod } from '../shared/src/reports/period'
import { SAMPLE_AUTHOR, SAMPLE_EMAIL_DOMAIN, SAMPLE_MANAGER, SAMPLE_PREFIX, type SampleDoc, buildSampleData } from '../shared/src/sample/data'
import { buildSampleScores } from '../shared/src/sample/scores'
import { POSITION_LABELS } from '../shared/src/shooting/evaluation'
import type { SessionStatus } from '../shared/src/settings/defaults'
import { resolveBusinessRules } from '../shared/src/settings/businessRules'
import { resolveSettings } from '../shared/src/settings/resolve'
import type { SettingsOverrides } from '../shared/src/settings/resolve'
import { todayKey } from '../shared/src/time'
import { PROJECT_ID, commit, deleteDocuments, getDocument, listDocuments } from './lib/firestore-rest'
import { siusPdf } from './lib/sius-pdf'
import { deleteObject, uploadObject } from './lib/storage-rest'

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
  // The sample students' Drive folders and files (with their bytes), scores and reports, and whatever the app added
  // for them since.
  [COL.driveFolders]: (id, d) => isSample(id) || isSample(d.studentId),
  [COL.driveFiles]: (id, d) => isSample(id) || isSample(d.studentId),
  [COL.evaluations]: (id, d) => isSample(id) || isSample(d.studentId),
  [COL.progressReports]: (id, d) => isSample(id) || isSample(d.studentId),
}

/** Sub-collections that go with a removed document. */
const CHILDREN: Record<string, string[]> = { [COL.staff]: ['private'], [COL.students]: ['private'], [COL.announcements]: ['comments', 'reads'], [COL.progressReports]: ['views'] }

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
  const shooting = await sampleShooting(docs, academy, timezone, settings.students.levels, now)
  await commit([...docs, ...shooting.docs], (done, total) => process.stdout.write(`\r  writing ${done}/${total}`))
  console.log(`\n+ Sample data in ${PROJECT_ID}: ${summary.staff} staff (a manager and ${summary.staff - 1} coaches), ${summary.students} students, ${summary.parents} parents`)
  console.log(`  ${summary.classes} classes, ${summary.makeups} makeups, ${summary.trials} trial visits, ${summary.shifts} time entries`)
  console.log(`  ${shooting.evaluations} evaluations (${shooting.pdfs} SIUS PDFs in the students' Drive folders), ${shooting.reports} progress reports`)
  console.log('  Remove it all with: npm run seed:sample -- --remove')
}

/**
 * The sample students' shooting: their scores, the SIUS PDFs behind them uploaded into their Drive folders, and two
 * progress reports for the last 30 days (one shared with a family that has a sign-in, one draft).
 */
async function sampleShooting(docs: SampleDoc[], academy: Record<string, unknown>, timezone: string, levels: readonly string[], now: Date) {
  const today = todayKey(timezone, now)
  const scores = buildSampleScores(docs, { academyId: ACADEMY_ID, timezone, today, levels })
  const manager = { uid: SAMPLE_AUTHOR, email: SAMPLE_MANAGER.email, name: SAMPLE_MANAGER.name }
  const out: SampleDoc[] = []
  const folders = new Map<string, string>()
  let pdfs = 0
  for (const sc of scores) {
    const e = sc.evaluation
    out.push({ path: `${base}/${COL.evaluations}/${sc.evaluationId}`, data: { ...e, createdAt: sc.at, createdBy: manager.email, updatedAt: sc.at, updatedBy: manager.email } })
    if (!sc.file) continue
    const bytes = await siusPdf(sc.file.spec)
    await uploadObject(driveObjectPath(ACADEMY_ID, sc.file.fileId), bytes, 'application/pdf')
    pdfs++
    process.stdout.write(`\r  uploading sample PDFs ${pdfs}`)
    out.push({
      path: `${base}/${COL.driveFiles}/${sc.file.fileId}`,
      data: {
        name: sc.file.name,
        size: bytes.length,
        kind: 'pdf',
        mime: 'application/pdf',
        status: 'ready',
        folderId: studentFolderId(e.studentId),
        studentId: e.studentId,
        evaluationId: sc.evaluationId,
        originalName: `${e.studentName.split(' ')[0]} 20 shot ${POSITION_LABELS[e.position].toLowerCase()}.pdf`,
        uploadedAt: sc.at,
        uploadedBy: manager,
      },
    })
    folders.set(e.studentId, e.studentName)
  }
  if (pdfs) process.stdout.write('\n')
  for (const [studentId, name] of folders) {
    out.push({ path: `${base}/${COL.driveFolders}/${studentFolderId(studentId)}`, data: { name, parentId: null, studentId, createdAt: now, createdBy: manager } })
  }

  // Two reports for the last 30 days: one shared with a family that can sign in, one draft.
  const period = presetPeriod('last_30', today)
  const inPeriod = (studentId: string) => scores.filter((s) => s.evaluation.studentId === studentId && s.evaluation.dateKey >= period.from && s.evaluation.dateKey <= period.to)
  const withParent = new Set(docs.filter((d) => d.path.includes(`/${COL.members}/`) && d.data.role === 'parent').flatMap((d) => (d.data.studentIds as string[]) ?? []))
  const candidates = [...new Set(scores.map((s) => s.evaluation.studentId))].filter((id) => inPeriod(id).length >= 3)
  const sharedFor = candidates.find((id) => withParent.has(id))
  const draftFor = candidates.find((id) => id !== sharedFor)
  const studentDoc = (id: string) => docs.find((d) => d.path === `${base}/${COL.students}/${id}`)?.data ?? {}
  const contact = (academy.contact ?? {}) as Record<string, string>
  let reports = 0
  for (const [studentId, shared] of [[sharedFor, true], [draftFor, false]] as const) {
    if (!studentId) continue
    const st = studentDoc(studentId)
    // The same stamps the evaluations get, so the report's fingerprint matches them (no "check before sharing").
    const evaluations = inPeriod(studentId).map((s) => ({ ...s.evaluation, id: s.evaluationId, updatedAt: { seconds: Math.floor(s.at.getTime() / 1000), nanoseconds: 0, toDate: () => s.at, toMillis: () => s.at.getTime() } }))
    const sessions = docs
      .filter((d) => d.path.includes(`/${COL.sessions}/`) && d.data.studentId === studentId && String(d.data.dateKey) >= period.from && String(d.data.dateKey) <= period.to)
      .map((d) => ({ dateKey: String(d.data.dateKey), status: d.data.status as SessionStatus, past: (d.data.endAt as Date).getTime() <= now.getTime() }))
    const by = { email: manager.email, name: manager.name, role: 'admin' }
    const doc = composeReport({
      academy: { name: String(academy.name ?? 'Sky Arc Academy'), contact: { phone: contact.phone ?? '', email: contact.email ?? '', website: contact.website ?? '', address: contact.address ?? '' } },
      student: { id: studentId, name: String(st.name), firstName: String(st.firstName), lastName: String(st.lastName), level: (st.level as string | null) ?? null, program: (st.program as string | null) ?? null },
      period: { ...period, preset: 'last_30' },
      evaluations,
      sessions,
      previous: null,
      by,
    })
    const key = studentId.slice(SAMPLE_PREFIX.length)
    out.push({
      path: `${base}/${COL.progressReports}/${SAMPLE_PREFIX}r-${key}`,
      data: {
        ...doc,
        generatedAt: now,
        updatedAt: now,
        firstViewedAt: null,
        ...(shared ? { status: 'shared', sharedWithParents: true, sharedAt: now, sharedBy: by } : { sharedAt: null }),
      },
    })
    reports++
  }
  out.push({
    path: `${base}/${COL.auditLog}/${SAMPLE_PREFIX}shooting-${now.getTime()}`,
    data: {
      at: now,
      actorUid: SAMPLE_AUTHOR,
      actorEmail: SAMPLE_AUTHOR,
      actorName: 'Sample data',
      actorRole: 'system',
      action: 'sample.add',
      category: 'reports',
      entityType: 'academy',
      entityId: ACADEMY_ID,
      summary: `Added sample shooting: ${scores.length} evaluations (${pdfs} SIUS PDFs in the Drive) and ${reports} progress reports`,
      context: '',
      dateKey: null,
      studentId: null,
      studentName: null,
      coachId: null,
      coachName: null,
      changes: [],
      via: 'function',
    },
  })
  return { docs: out, evaluations: scores.length, pdfs, reports }
}

async function remove() {
  const paths: string[] = []
  for (const [col, isSampleDoc] of Object.entries(SAMPLE_RULES)) {
    const found = (await listDocuments(`${base}/${col}`)).filter((d) => isSampleDoc(d.id, d.data))
    // A Drive file's bytes go with it.
    if (col === COL.driveFiles) for (const d of found) await deleteObject(driveObjectPath(ACADEMY_ID, d.id))
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
