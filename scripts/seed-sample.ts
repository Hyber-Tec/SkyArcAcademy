/**
 * Sample data for trying the app before the academy's real data arrives (shared/src/sample/data.ts): fictional
 * coaches, a manager, students and families, ten weeks of classes around today in the academy's weekly layout (taught
 * together by the coaches in, with make-ups, practice and trials among their seats), who's in each day, time entries,
 * announcements and events; and their shooting (shared/src/sample/scores.ts): SIUS results as synthetic PDFs in the
 * students' Drive folders, a few paper cards (the recent ones mostly scanned, with a made-up picture of the card in the
 * Drive, as the phone app saves it), and progress reports (shared with the families that can sign in, one draft).
 * It also has a few trial requests and questions sent from the website. Running it again rewrites the same documents,
 * and the sample's schedule (classes, seats, who's in, time entries) becomes the ten weeks around the new today: the
 * sample's earlier ones are replaced, those from before classes were taught together too.
 *
 * Where it goes: production holds the academy's real people (docs/DECISIONS.md §21), so there the sample goes only into
 * the demo academy (`demo`, §22), which the first run makes from the real one (its settings, its website and its
 * owners). In the emulators it goes into the academy itself (the practice copy), or the demo one with --academy demo.
 *
 *   npm run seed:sample                # add it (production: to the demo academy)
 *   npm run seed:sample -- --remove    # delete it, with everything the app made for the sample people
 *   npm run seed:sample -- --login coach=you+coach@example.com
 *                                      # gives that email a sample person's access, to see the website and the phone app
 *                                      # as they do: coach (Daniel Reed), parent (the Hwang family's two children) or
 *                                      # student (Jiwoo Hwang). It gets the academy's sign-in email, as anyone the academy
 *                                      # adds; --remove takes it away with the rest
 *
 * Removing finds sample documents by their `sample-` IDs and `@skyarc-sample.test` emails, and also deletes what the
 * app made for those people later: their seats in classes, time entries, kiosk PINs, notifications and audit entries.
 * Real people and their data are never touched. Uses the developer's gcloud login (scripts/lib/firestore-rest.ts), or
 * the emulators when FIRESTORE_EMULATOR_HOST is set. The academy must exist first (npm run seed).
 */
import { parseArgs } from 'node:util'
import { ACADEMY_ID, DEMO_ACADEMY_ID } from '../shared/src/academy'
import { driveObjectPath, studentFolderId } from '../shared/src/drive/types'
import { COL, DOC } from '../shared/src/paths'
import { composeReport } from '../shared/src/reports/compose'
import { presetPeriod } from '../shared/src/reports/period'
import { newMemberData, publicProfileFor } from '../shared/src/branchFactory'
import { SAMPLE_AUTHOR, SAMPLE_EMAIL_DOMAIN, SAMPLE_MANAGER, SAMPLE_PREFIX, type SampleDoc, buildSampleData, sampleStaffId, sampleStudentId } from '../shared/src/sample/data'
import { buildSampleMessages } from '../shared/src/sample/messages'
import { buildSampleScores, sampleCardPicture } from '../shared/src/sample/scores'
import { POSITION_LABELS } from '../shared/src/shooting/evaluation'
import type { SessionStatus } from '../shared/src/settings/defaults'
import { resolveBusinessRules } from '../shared/src/settings/businessRules'
import { resolveSettings } from '../shared/src/settings/resolve'
import type { SettingsOverrides } from '../shared/src/settings/resolve'
import type { Branch } from '../shared/src/types'
import { drawSyntheticCard } from '../shared/src/targets/synthetic'
import { todayKey } from '../shared/src/time'
import { PROJECT_ID, type Write, commit, deleteDocuments, getDocument, listDocuments } from './lib/firestore-rest'
import { isReviewAdmin } from './lib/review-admin'
import { encodePng } from './lib/png'
import { siusPdf } from './lib/sius-pdf'
import { deleteObject, uploadObject } from './lib/storage-rest'

const { values } = parseArgs({ options: { remove: { type: 'boolean', default: false }, login: { type: 'string' }, academy: { type: 'string' } } })
const EMULATOR = !!process.env.FIRESTORE_EMULATOR_HOST
const academyId = values.academy ?? (EMULATOR ? ACADEMY_ID : DEMO_ACADEMY_ID)
if (!EMULATOR && academyId !== DEMO_ACADEMY_ID) {
  console.error(`${PROJECT_ID} holds the academy's real people: the sample goes only into the demo academy (--academy ${DEMO_ACADEMY_ID}).`)
  process.exit(1)
}
const base = `branches/${academyId}`

const isSample = (v: unknown) => typeof v === 'string' && v.startsWith(SAMPLE_PREFIX)
const isSampleEmail = (v: unknown) => typeof v === 'string' && v.toLowerCase().endsWith(`@${SAMPLE_EMAIL_DOMAIN}`)

/** What makes a document sample data, by collection. */
const SAMPLE_RULES: Record<string, (id: string, data: Record<string, unknown>) => boolean> = {
  [COL.staff]: (id) => isSample(id),
  [COL.students]: (id) => isSample(id),
  [COL.classes]: (id) => isSample(id),
  // Each sample class's seats taken (the server keeps them for every class), and families' requests for sample students.
  [COL.classSeats]: (id) => isSample(id),
  [COL.classRequests]: (id, d) => isSample(id) || isSample(d.studentId),
  [COL.sessions]: (id, d) => isSample(id) || isSample(d.studentId) || isSample(d.coachId),
  [COL.availability]: (id, d) => isSample(id) || isSample(d.staffId),
  [COL.clockShifts]: (id, d) => isSample(id) || isSample(d.staffId),
  [COL.openShifts]: (id) => isSample(id),
  [COL.kioskPins]: (_, d) => isSample(d.staffId),
  kioskPinOwners: (id) => isSample(id),
  // A sample person's own sign-in, and an email given a sample person's access (--login).
  // (Not the App Store's review account once it's an admin of its own: scripts/lib/review-admin.ts.)
  [COL.members]: (id, d) =>
    !isReviewAdmin(d) && (isSampleEmail(id) || isSample(d.staffId) || isSample(d.studentId) || (Array.isArray(d.studentIds) && d.studentIds.some(isSample))),
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
  [COL.websiteMessages]: (id) => isSample(id),
}

/** The sample's schedule, which each run replaces with the weeks around its today. */
const SCHEDULE = [COL.classes, COL.classSeats, COL.sessions, COL.availability, COL.clockShifts] as const

/** Sub-collections that go with a removed document. */
const CHILDREN: Record<string, string[]> = { [COL.staff]: ['private'], [COL.students]: ['private'], [COL.announcements]: ['comments', 'reads'], [COL.progressReports]: ['views'] }

async function add() {
  if (academyId === DEMO_ACADEMY_ID && !(await getDocument(base))) await createDemoAcademy()
  const academy = await getDocument(base)
  if (!academy) throw new Error(`No academy at ${base} in ${PROJECT_ID}. Run npm run seed first.`)
  const timezone = String(academy.timezone ?? 'America/New_York')
  const settings = resolveSettings((academy.settings ?? null) as SettingsOverrides | null)
  const rules = resolveBusinessRules((academy.businessRules ?? null) as Parameters<typeof resolveBusinessRules>[0])
  const now = new Date()
  const { docs, summary } = buildSampleData({
    academyId,
    timezone,
    today: todayKey(timezone, now),
    now,
    week: settings.schedule.defaultWeek,
    levels: settings.students.levels,
    programs: settings.students.programs,
    seatsPerClass: rules.seatsPerClass,
  })
  const shooting = await sampleShooting(docs, academy, timezone, settings.students.levels, now)
  const messages = buildSampleMessages({ academyId, now, manager: SAMPLE_MANAGER.email })
  // The sample's schedule from an earlier run that this one doesn't rewrite (other weeks, or from before classes were
  // taught together): this run's weeks replace it.
  const keep = new Set(docs.map((d) => d.path))
  const stale: string[] = []
  for (const col of SCHEDULE) {
    for (const d of await listDocuments(`${base}/${col}`)) if (SAMPLE_RULES[col](d.id, d.data) && !keep.has(d.path)) stale.push(d.path)
  }
  if (stale.length) {
    await deleteDocuments(stale)
    console.log(`- ${stale.length} documents of the sample's earlier schedule, replaced`)
  }
  await commit([...docs, ...shooting.docs, ...messages], (done, total) => process.stdout.write(`\r  writing ${done}/${total}`))
  console.log(`\n+ Sample data in ${PROJECT_ID} (${base}): ${summary.staff} staff (a manager and ${summary.staff - 1} coaches), ${summary.students} students, ${summary.parents} parents`)
  console.log(`  ${summary.classes} classes with ${summary.seats} seats (${summary.makeups} make-ups, ${summary.practice} practice, ${summary.trials} trial visits)`)
  console.log(`  Who's in: ${summary.whosIn} days of the staff's hours; ${summary.shifts} time entries`)
  console.log(`  ${messages.length} messages from the website (${messages.filter((m) => m.data.status === 'new').length} new)`)
  console.log(`  ${shooting.evaluations} evaluations (${shooting.pdfs} SIUS PDFs and ${shooting.cards} scanned cards in the students' Drive folders), ${shooting.reports} progress reports`)
  console.log('  Remove it all with: npm run seed:sample -- --remove')
}

/**
 * The sample students' shooting: their scores, the SIUS PDFs and scanned cards' pictures behind them uploaded into
 * their Drive folders, and progress reports for the last 30 days (shared with each family that can sign in, as a parent
 * or the student, and one draft).
 */
async function sampleShooting(docs: SampleDoc[], academy: Record<string, unknown>, timezone: string, levels: readonly string[], now: Date) {
  const today = todayKey(timezone, now)
  const scores = buildSampleScores(docs, { academyId, timezone, today, levels })
  const manager = { uid: SAMPLE_AUTHOR, email: SAMPLE_MANAGER.email, name: SAMPLE_MANAGER.name }
  const out: SampleDoc[] = []
  const folders = new Map<string, string>()
  let pdfs = 0
  let cards = 0
  for (const sc of scores) {
    const e = sc.evaluation
    out.push({ path: `${base}/${COL.evaluations}/${sc.evaluationId}`, data: { ...e, createdAt: sc.at, createdBy: manager.email, updatedAt: sc.at, updatedBy: manager.email } })
    const file = sc.file
    if (!file) continue
    // A SIUS result's PDF, or a scanned card's picture: the flattened card the phone app keeps, here made up.
    const pdf = file.kind === 'sius'
    const bytes = pdf ? await siusPdf(file.spec) : encodePng(drawSyntheticCard(sampleCardPicture(file.card)))
    const mime = pdf ? 'application/pdf' : 'image/png'
    await uploadObject(driveObjectPath(academyId, file.fileId), bytes, mime)
    if (pdf) pdfs++
    else cards++
    process.stdout.write(`\r  uploading sample files ${pdfs + cards}`)
    out.push({
      path: `${base}/${COL.driveFiles}/${file.fileId}`,
      data: {
        name: file.name,
        size: bytes.length,
        kind: pdf ? 'pdf' : 'png',
        mime,
        status: 'ready',
        folderId: studentFolderId(e.studentId),
        studentId: e.studentId,
        evaluationId: sc.evaluationId,
        ...(pdf ? { originalName: `${e.studentName.split(' ')[0]} 20 shot ${POSITION_LABELS[e.position].toLowerCase()}.pdf` } : {}),
        uploadedAt: sc.at,
        uploadedBy: manager,
      },
    })
    folders.set(e.studentId, e.studentName)
  }
  if (pdfs + cards) process.stdout.write('\n')
  for (const [studentId, name] of folders) {
    out.push({ path: `${base}/${COL.driveFolders}/${studentFolderId(studentId)}`, data: { name, parentId: null, studentId, createdAt: now, createdBy: manager } })
  }

  // Reports for the last 30 days: shared with each family that can sign in (a parent or the student), and one draft.
  const period = presetPeriod('last_30', today)
  const inPeriod = (studentId: string) => scores.filter((s) => s.evaluation.studentId === studentId && s.evaluation.dateKey >= period.from && s.evaluation.dateKey <= period.to)
  const members = docs.filter((d) => d.path.includes(`/${COL.members}/`))
  const withLogin = new Set([
    ...members.filter((d) => d.data.role === 'parent').flatMap((d) => (d.data.studentIds as string[]) ?? []),
    ...members.filter((d) => d.data.role === 'student').map((d) => String(d.data.studentId)),
  ])
  const candidates = [...new Set(scores.map((s) => s.evaluation.studentId))].filter((id) => inPeriod(id).length >= 3)
  const sharedFor = candidates.filter((id) => withLogin.has(id)).slice(0, 6)
  const draftFor = candidates.find((id) => !withLogin.has(id)) ?? candidates.find((id) => !sharedFor.includes(id))
  const studentDoc = (id: string) => docs.find((d) => d.path === `${base}/${COL.students}/${id}`)?.data ?? {}
  const contact = (academy.contact ?? {}) as Record<string, string>
  let reports = 0
  for (const [studentId, shared] of [...sharedFor.map((id) => [id, true] as const), [draftFor, false] as const]) {
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
      entityId: academyId,
      summary: `Added sample shooting: ${scores.length} evaluations (${pdfs} SIUS PDFs and ${cards} scanned cards in the Drive) and ${reports} progress reports`,
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
  return { docs: out, evaluations: scores.length, pdfs, cards, reports }
}

async function remove() {
  const paths: string[] = []
  for (const [col, isSampleDoc] of Object.entries(SAMPLE_RULES)) {
    const found = (await listDocuments(`${base}/${col}`)).filter((d) => isSampleDoc(d.id, d.data))
    // A Drive file's bytes go with it.
    if (col === COL.driveFiles) for (const d of found) await deleteObject(driveObjectPath(academyId, d.id))
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
          entityId: academyId,
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

/**
 * The demo academy (docs/DECISIONS.md §22), made from the real one on the first run: its name, contact, settings and
 * rules; its website (the pages' content, and the photos' records, whose files stay where they are: the website's
 * page deletes only its own academy's files); and its owners, as owners. Nothing in the real academy changes.
 */
async function createDemoAcademy() {
  const real = await getDocument(`branches/${ACADEMY_ID}`)
  if (!real) throw new Error(`No academy at branches/${ACADEMY_ID} in ${PROJECT_ID} to make the demo one from. Run npm run seed first.`)
  const now = new Date()
  const copied = ['name', 'shortName', 'timezone', 'locale', 'currency', 'branding', 'contact', 'settings', 'businessRules'].filter((k) => k in real)
  const academy = { ...Object.fromEntries(copied.map((k) => [k, real[k]])), status: 'active', createdBy: SAMPLE_AUTHOR, updatedBy: SAMPLE_AUTHOR, createdAt: now, updatedAt: now }
  const writes: Write[] = [
    { path: base, data: academy },
    { path: `${base}/${COL.public}/${DOC.publicProfile}`, data: { ...publicProfileFor(academy as unknown as Branch) } },
  ]
  const website = await getDocument(`branches/${ACADEMY_ID}/${COL.public}/${DOC.websiteContent}`)
  if (website) writes.push({ path: `${base}/${COL.public}/${DOC.websiteContent}`, data: website })
  const photos = await listDocuments(`branches/${ACADEMY_ID}/${COL.websitePhotos}`)
  for (const p of photos) writes.push({ path: `${base}/${COL.websitePhotos}/${p.id}`, data: p.data })
  const owners = (await listDocuments(`branches/${ACADEMY_ID}/${COL.members}`)).filter((m) => m.data.role === 'owner' && m.data.status === 'active')
  for (const m of owners) {
    writes.push({
      path: `${base}/${COL.members}/${m.id}`,
      data: { ...newMemberData({ email: m.id, displayName: String(m.data.displayName ?? ''), role: 'owner', createdBy: SAMPLE_AUTHOR }), createdAt: now, updatedAt: now },
    })
  }
  writes.push({
    path: `${base}/${COL.auditLog}/demo-academy-created`,
    data: {
      at: now,
      actorUid: SAMPLE_AUTHOR,
      actorEmail: SAMPLE_AUTHOR,
      actorName: 'Sample data',
      actorRole: 'system',
      action: 'academy.create',
      category: 'settings',
      entityType: 'branch',
      entityId: academyId,
      summary: `Set up the demo academy from ${String(real.name ?? ACADEMY_ID)}, with its ${owners.length === 1 ? 'owner' : `${owners.length} owners`}`,
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
  await commit(writes)
  console.log(`+ The demo academy (${base}), made from ${String(real.name ?? ACADEMY_ID)}: its settings, its website (${photos.length} photos) and ${owners.length} owner(s): ${owners.map((m) => m.id).join(', ')}`)
}

/**
 * Whose access a --login gives, by role: a coach in Monday to Thursday and some Sundays, a parent of two children, and
 * one of those children (so a parent's and a student's view of the same child compare).
 */
type LoginRole = 'coach' | 'parent' | 'student'
const LOGINS: Record<LoginRole, { name: string; access: { staffId?: string; studentId?: string; studentIds?: string[] }; check: string }> = {
  coach: { name: 'Daniel Reed', access: { staffId: sampleStaffId('daniel-reed') }, check: `${COL.staff}/${sampleStaffId('daniel-reed')}` },
  parent: { name: 'Jiyeon Hwang', access: { studentIds: [sampleStudentId('jiwoo-hwang'), sampleStudentId('minjun-hwang')] }, check: `${COL.students}/${sampleStudentId('jiwoo-hwang')}` },
  student: { name: 'Jiwoo Hwang', access: { studentId: sampleStudentId('jiwoo-hwang') }, check: `${COL.students}/${sampleStudentId('jiwoo-hwang')}` },
}

/**
 * Gives an email a sample person's access (`role=email`): a member doc with that role and their record(s). The
 * academy's sign-in email goes to it (functions/src/invites.ts), as for anyone the academy adds; whoever reads that
 * mailbox signs in with Google or makes a password there. The sample data must be there first.
 */
async function sampleLogin(arg: string) {
  const [role, raw = ''] = arg.split('=') as [string, string?]
  if (!(role in LOGINS)) throw new Error(`--login takes coach=, parent= or student= and an email (got "${arg}").`)
  const who = LOGINS[role as LoginRole]
  const key = raw.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(key)) throw new Error(`Not an email: ${raw}`)
  if (!(await getDocument(`${base}/${who.check}`))) throw new Error(`No sample data for ${who.name} in ${PROJECT_ID}. Run npm run seed:sample first.`)
  const existing = await getDocument(`${base}/${COL.members}/${key}`)
  if (existing && existing.role !== role) throw new Error(`${key} already has access to the academy (${String(existing.role)}); not changing it.`)
  if (existing) return console.log(`= ${key} already has ${who.name}'s access (${role}) in ${PROJECT_ID}.`)
  const now = new Date()
  await commit([
    {
      path: `${base}/${COL.members}/${key}`,
      data: { ...newMemberData({ email: key, displayName: who.name, role: role as LoginRole, ...who.access, createdBy: SAMPLE_AUTHOR }), createdAt: now, updatedAt: now },
    },
  ])
  console.log(`+ ${key} has ${who.name}'s access (${role}) in ${PROJECT_ID}; the academy's sign-in email goes to it.`)
  console.log('  Removed with the sample data: npm run seed:sample -- --remove')
}

;(values.remove ? remove() : values.login ? sampleLogin(values.login) : add()).catch((e) => {
  console.error(e)
  process.exit(1)
})
