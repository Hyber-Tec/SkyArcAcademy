/**
 * Sample data for trying the app before the academy's real data arrives (shared/src/sample/data.ts): fictional
 * coaches, a manager, students and families, ten weeks of classes around today in the academy's weekly layout (taught
 * together by the coaches in, with make-ups, practice and trials among their seats), who's in each day, time entries
 * and announcements; and their shooting (shared/src/sample/scores.ts): SIUS results as synthetic PDFs in the
 * students' Drive folders, a few paper cards (the recent ones mostly scanned, with a made-up picture of the card in the
 * Drive, as the phone app saves it), and progress reports (shared with the families that can sign in, one draft).
 * It also has a few trial requests and questions sent from the website, and families' requests for classes (waiting for
 * the office, waiting for a family's answer to a time suggested, approved and declined), and, once the academy has its
 * enrollment contract (scripts/contract.ts), the contracts the office sent the families (shared/src/sample/contracts.ts):
 * some waiting (the Hwang family's two, for the demo's parent login), most signed with their PDFs in the students'
 * Contracts folders, one withdrawn, one on paper. Running it again rewrites the same documents (a student with a
 * contract keeps it), and the sample's schedule (classes, seats, who's in, time entries, families' requests) becomes the ten
 * weeks around the new today: the sample's earlier ones are replaced, those from before classes were taught together too.
 *
 * Where it goes: production holds the academy's real people (docs/DECISIONS.md §21), so there the sample goes only into
 * the demo academy (`demo`, §22), which the first run makes from the real one (its settings, its website and its
 * owners). In the emulators it goes into the academy itself (the practice copy), or the demo one with --academy demo.
 *
 *   npm run seed:sample                # add it (production: to the demo academy)
 *   npm run seed:sample -- --remove    # delete it, with everything the app made for the sample people
 *   npm run seed:sample -- --contracts # the sample's enrollment contracts again, as the plan has them (after a demo)
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
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { buildContractPdf } from '../functions/src/contractPdf'
import { ACADEMY_ID, DEMO_ACADEMY_ID } from '../shared/src/academy'
import { parseContract } from '../shared/src/contracts/document'
import { RELATION_LABELS, checkContractSigning, relationLabel, usDate, withPreset } from '../shared/src/contracts/fill'
import { contractFilePlace, contractFoldersToMake } from '../shared/src/contracts/filing'
import { contractFileName, signatureFacts, signatureStatement } from '../shared/src/contracts/signing'
import { contractIn } from '../shared/src/contracts/translation'
import { ACADEMY_SIGNER_ID, type AcademySigner, CONTRACT_TOKEN_DOC, type ContractTemplate, templateLabel } from '../shared/src/contracts/types'
import { type DriveActor, contractsFolderStudent, driveObjectPath, studentFolderId } from '../shared/src/drive/types'
import { COL, DOC } from '../shared/src/paths'
import { composeReport } from '../shared/src/reports/compose'
import { presetPeriod } from '../shared/src/reports/period'
import { newMemberData, publicProfileFor } from '../shared/src/branchFactory'
import { SAMPLE_AUTHOR, SAMPLE_EMAIL_DOMAIN, SAMPLE_MANAGER, SAMPLE_PREFIX, type SampleDoc, buildSampleData, sampleStaffId, sampleStudentId } from '../shared/src/sample/data'
import { buildSampleContracts, drawSampleSignature } from '../shared/src/sample/contracts'
import { buildSampleMessages } from '../shared/src/sample/messages'
import { buildSampleScores, sampleCardPicture } from '../shared/src/sample/scores'
import { POSITION_LABELS } from '../shared/src/shooting/evaluation'
import type { SessionStatus } from '../shared/src/settings/defaults'
import { resolveBusinessRules } from '../shared/src/settings/businessRules'
import { resolveSettings } from '../shared/src/settings/resolve'
import type { SettingsOverrides } from '../shared/src/settings/resolve'
import type { Branch } from '../shared/src/types'
import { drawSyntheticCard } from '../shared/src/targets/synthetic'
import { dateKeyOf, todayKey } from '../shared/src/time'
import { PROJECT_ID, type Write, commit, deleteDocuments, getDocument, listDocuments } from './lib/firestore-rest'
import { isReviewAdmin } from './lib/review-admin'
import { encodePng } from './lib/png'
import { siusPdf } from './lib/sius-pdf'
import { deleteObject, uploadObject } from './lib/storage-rest'

const { values } = parseArgs({ options: { remove: { type: 'boolean', default: false }, login: { type: 'string' }, academy: { type: 'string' }, contracts: { type: 'boolean', default: false } } })
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
  // for them since: their Contracts folders and the contracts in them too (no studentId: by the folder's ID).
  [COL.driveFolders]: (id, d) => isSample(id) || isSample(d.studentId) || isSample(contractsFolderStudent(id)),
  [COL.driveFiles]: (id, d) => isSample(id) || isSample(d.studentId) || isSample(contractsFolderStudent(typeof d.folderId === 'string' ? d.folderId : null)),
  [COL.evaluations]: (id, d) => isSample(id) || isSample(d.studentId),
  [COL.progressReports]: (id, d) => isSample(id) || isSample(d.studentId),
  [COL.websiteMessages]: (id) => isSample(id),
  // The contracts sent to sample families (with their links' tokens), their signed contracts, and who signs for the
  // academy when the sample set it.
  [COL.contractLinks]: (_, d) => isSample(d.studentId),
  [COL.signedContracts]: (id) => isSample(id),
  [COL.contractSigner]: (_, d) => (d.updatedBy as { uid?: unknown } | undefined)?.uid === SAMPLE_AUTHOR,
}

/** The sample's schedule, which each run replaces with the weeks around its today (the families' requests are for its classes). */
const SCHEDULE = [COL.classes, COL.classSeats, COL.sessions, COL.availability, COL.clockShifts, COL.classRequests] as const
/** What the sample no longer makes, which each run deletes: its events (the website stopped showing them, 2026-10-29). */
const RETIRED = [COL.events] as const

/** Sub-collections that go with a removed document. */
const CHILDREN: Record<string, string[]> = { [COL.staff]: ['private'], [COL.students]: ['private'], [COL.announcements]: ['comments', 'reads'], [COL.progressReports]: ['views'], [COL.contractLinks]: ['private'] }

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
  const contracts = await sampleContracts(docs, shooting.docs, academy, timezone, now)
  // The sample's schedule from an earlier run that this one doesn't rewrite (other weeks, or from before classes were
  // taught together): this run's weeks replace it. Its events from earlier runs go too.
  const keep = new Set(docs.map((d) => d.path))
  const stale: string[] = []
  for (const col of [...SCHEDULE, ...RETIRED]) {
    for (const d of await listDocuments(`${base}/${col}`)) if (SAMPLE_RULES[col](d.id, d.data) && !keep.has(d.path)) stale.push(d.path)
  }
  if (stale.length) {
    await deleteDocuments(stale)
    console.log(`- ${stale.length} documents of the sample's earlier schedule, replaced`)
  }
  await commit([...docs, ...shooting.docs, ...messages, ...contracts.docs], (done, total) => process.stdout.write(`\r  writing ${done}/${total}`))
  console.log(`\n+ Sample data in ${PROJECT_ID} (${base}): ${summary.staff} staff (a manager and ${summary.staff - 1} coaches), ${summary.students} students, ${summary.parents} parents`)
  console.log(`  ${summary.classes} classes with ${summary.seats} seats (${summary.makeups} make-ups, ${summary.practice} practice, ${summary.trials} trial visits)`)
  console.log(`  Who's in: ${summary.whosIn} days of the staff's hours; ${summary.shifts} time entries`)
  console.log(`  ${summary.requests} requests from families: waiting for the office, for a family's answer to a time suggested, approved and declined`)
  console.log(`  ${messages.length} messages from the website (${messages.filter((m) => m.data.status === 'new').length} new)`)
  console.log(`  ${shooting.evaluations} evaluations (${shooting.pdfs} SIUS PDFs and ${shooting.cards} scanned cards in the students' Drive folders), ${shooting.reports} progress reports`)
  if (contracts.families) console.log(`  Enrollment contracts for ${contracts.families} students: ${contracts.waiting} waiting, ${contracts.signed} signed (their PDFs in the Contracts folders), the rest withdrawn or on paper`)
  console.log('  Remove it all with: npm run seed:sample -- --remove')
}

/** Who files the signed copies, as the server does (functions/src/contracts.ts). */
const SIGNING: DriveActor = { uid: 'contract-signing', email: '', name: 'Contract signing' }
const LOGO = readFileSync(new URL('../web/public/brand/skyarc-logo-email.png', import.meta.url))
const pngBytes = (dataUrl: string) => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')

/** An audit entry of the sample's contracts: the office's (sending, withdrawing, on paper) or the signing's. */
function contractAudit(id: string, at: Date, actor: { uid: string; email: string; name: string; role: string }, e: { action: string; entityType: string; entityId: string; studentId: string; studentName: string; summary: string }): SampleDoc {
  return {
    path: `${base}/${COL.auditLog}/${id}`,
    data: {
      at,
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorName: actor.name,
      actorRole: actor.role,
      category: 'contracts',
      context: '',
      dateKey: null,
      coachId: null,
      coachName: null,
      changes: [],
      via: actor.role === 'system' ? 'function' : 'web',
      ...e,
    },
  }
}

/**
 * The sample's enrollment contracts (shared/src/sample/contracts.ts), on the academy's own contract once it has one:
 * each contract the office sent, with its link's token; for each one signed, its PDF as the server makes it
 * (functions/src/contractPdf.ts), filed in the student's Contracts folder, and the student's signed contract; one
 * marked signed on paper; the parents who sign in told of the ones waiting; and who signs for the academy (the sample
 * manager, their name typed) unless someone does already. A student with a contract already keeps it.
 */
async function sampleContracts(docs: SampleDoc[], shooting: SampleDoc[], academy: Record<string, unknown>, timezone: string, now: Date) {
  const result = { docs: [] as SampleDoc[], families: 0, waiting: 0, signed: 0 }
  const current = (await listDocuments(`${base}/${COL.contractTemplates}`)).find((t) => t.data.current === true)
  if (!current) {
    console.log('  No enrollment contract in the academy yet: set it up with scripts/contract.ts, then run this again for the sample contracts.')
    return result
  }
  const template = current.data as unknown as ContractTemplate
  const { doc } = parseContract(template.text)
  const taken = new Set([
    ...(await listDocuments(`${base}/${COL.contractLinks}`)).map((l) => String(l.data.studentId)),
    ...(await listDocuments(`${base}/${COL.signedContracts}`)).map((d) => d.id),
  ])
  const plan = buildSampleContracts({ doc, docs, academyId, timezone, today: todayKey(timezone, now), skip: taken })
  const out = result.docs
  const academyName = String(academy.name ?? 'Sky Arc Sports Academy')
  const manager: DriveActor = { uid: SAMPLE_AUTHOR, email: SAMPLE_MANAGER.email, name: SAMPLE_MANAGER.name }
  const office = { ...manager, role: 'admin' }
  const label = templateLabel(template)

  // Who signs for the academy: the sample manager, their name typed, unless the academy has someone.
  const signerPath = `${base}/${COL.contractSigner}/${ACADEMY_SIGNER_ID}`
  const onFile = (await getDocument(signerPath)) as Partial<AcademySigner> | null
  const signer = onFile?.name ? { name: onFile.name, title: onFile.title ?? '', image: typeof onFile.image === 'string' ? onFile.image : null } : { name: SAMPLE_MANAGER.name, title: 'Office manager', image: null }
  if (!onFile?.name) out.push({ path: signerPath, data: { ...signer, updatedAt: now, updatedBy: manager } })
  const academySigner = { name: signer.name, title: signer.title, image: signer.image ? pngBytes(signer.image) : null }

  const folders = new Set(shooting.filter((d) => d.path.startsWith(`${base}/${COL.driveFolders}/`)).map((d) => String(d.data.studentId)))
  const parentLogins = (studentId: string) =>
    docs.filter((d) => d.path.startsWith(`${base}/${COL.members}/`) && d.data.role === 'parent' && Array.isArray(d.data.studentIds) && (d.data.studentIds as string[]).includes(studentId)).map((d) => d.path.slice(d.path.lastIndexOf('/') + 1))
  let files = 0
  for (const c of plan) {
    const key = c.studentId.slice(SAMPLE_PREFIX.length)
    const first = c.studentName.split(' ')[0]
    const who = { studentId: c.studentId, studentName: c.studentName }
    result.families++
    if (c.paper) {
      out.push({
        path: `${base}/${COL.signedContracts}/${c.studentId}`,
        data: { ...who, via: 'paper', signedAt: c.paper.at, signerName: '', relation: null, signerEmail: null, templateId: null, templateName: null, fileId: null, fileName: null, linkId: null, markedBy: manager, note: c.paper.note },
      })
      out.push(contractAudit(`${SAMPLE_PREFIX}contract-paper-${key}`, c.paper.at, office, { action: 'contract.paper', entityType: 'signedContract', entityId: c.studentId, ...who, summary: `Marked ${c.studentName}’s enrollment contract signed on paper` }))
    }
    for (const [i, s] of c.sent.entries()) {
      const token = randomBytes(32).toString('base64url')
      const id = createHash('sha256').update(token).digest('hex')
      const link: Record<string, unknown> = {
        ...who,
        templateId: current.id,
        templateName: label,
        preset: s.preset,
        status: s.status,
        createdAt: s.at,
        createdBy: manager,
        emailedTo: [],
        emailedAt: null,
        signedAt: null,
        signer: null,
        fileId: null,
        fileName: null,
        canceledAt: s.canceledAt,
        canceledBy: s.canceledAt ? manager : null,
      }
      out.push({ path: `${base}/${COL.contractLinks}/${id}/private/${CONTRACT_TOKEN_DOC}`, data: { token } })
      out.push(contractAudit(`${SAMPLE_PREFIX}contract-send-${key}-${i}`, s.at, office, { action: 'contract.send', entityType: 'contractLink', entityId: id, ...who, summary: `Sent ${c.studentName}’s enrollment contract` }))
      if (s.canceledAt) {
        out.push(contractAudit(`${SAMPLE_PREFIX}contract-cancel-${key}-${i}`, s.canceledAt, office, { action: 'contract.cancel', entityType: 'contractLink', entityId: id, ...who, summary: `Withdrew ${c.studentName}’s enrollment contract, sent but not signed` }))
      }
      const sig = s.signed
      const png = sig ? encodePng(drawSampleSignature(sig.name)) : null
      // A parent who read it in Korean: their PDF has the Korean too, once the contract has its translation (§36).
      const read = sig?.lang === 'ko' && template.ko?.text ? contractIn('ko', template.text, template.ko.text) : null
      const translation = read?.translated && template.ko ? { doc: read.doc, sha256: template.ko.sha256 } : null
      const checked = sig && png ? checkContractSigning(doc, { values: sig.values, relation: sig.relation, signature: `data:image/png;base64,${Buffer.from(png).toString('base64')}`, agree: true }) : null
      if (sig && png && checked && !checked.ok) console.warn(`  ${c.studentName}: the sample couldn't fill the contract in (${Object.keys(checked.errors).join(', ')}); it's left waiting`)
      if (sig && png && checked?.ok) {
        // Signed as the server signs: the PDF, filed in the student's Contracts folder, and the student's signed contract.
        const values = withPreset(doc, checked.value.values, s.preset)
        const signedOn = dateKeyOf(sig.at, timezone)
        const how = sig.via === 'link' ? { link: token } : { account: sig.signerEmail ?? '', where: sig.via === 'app' ? ('app' as const) : ('website' as const) }
        const pdf = await buildContractPdf({
          doc,
          values,
          signature: png,
          signerName: sig.name,
          relation: RELATION_LABELS[sig.relation].toLowerCase(),
          signedOn: usDate(signedOn),
          academySigner,
          record: {
            statement: signatureStatement({ signerName: sig.name, studentName: c.studentName, academyName }),
            facts: signatureFacts({
              academyName,
              studentName: c.studentName,
              signerName: sig.name,
              relation: sig.relation,
              signedAtMs: sig.at.getTime(),
              timezone,
              ip: sig.ip,
              userAgent: sig.userAgent,
              how,
              templateName: label,
              templateSha256: template.sha256,
              sentBy: { name: manager.name, atMs: s.at.getTime() },
              academySigner: { name: signer.name, title: signer.title, typed: !signer.image },
              translation: translation ? { sha256: translation.sha256 } : null,
            }),
            footnote: `Signed electronically ${sig.via === 'app' ? `in ${academyName}’s app` : `through ${academyName}’s website`}. The SHA-256 identifies the exact text of the contract that was signed: the same text always gives the same value.`,
          },
          sample: false,
          createdAt: sig.at,
          logo: LOGO,
          translation: translation ? { doc: translation.doc, relation: relationLabel(sig.relation, 'ko') } : null,
        })
        const fileId = `${SAMPLE_PREFIX}contract-${key}`
        const fileName = contractFileName(c.studentName, signedOn)
        await uploadObject(driveObjectPath(academyId, fileId), pdf, 'application/pdf')
        process.stdout.write(`\r  filing sample contracts ${++files}`)
        for (const f of contractFoldersToMake({ studentId: c.studentId, studentName: c.studentName, has: { studentFolder: folders.has(c.studentId), contractsFolder: false }, by: SIGNING, at: sig.at })) {
          out.push({ path: `${base}/${COL.driveFolders}/${f.id}`, data: f.data })
        }
        out.push({
          path: `${base}/${COL.driveFiles}/${fileId}`,
          data: { name: fileName, size: pdf.length, kind: 'pdf', mime: 'application/pdf', status: 'ready', ...contractFilePlace(c.studentId), evaluationId: null, originalName: null, uploadedAt: sig.at, uploadedBy: { uid: SIGNING.uid, email: '', name: sig.name } },
        })
        out.push({
          path: `${base}/${COL.signedContracts}/${c.studentId}`,
          data: { ...who, via: sig.via, signedAt: sig.at, signerName: sig.name, relation: sig.relation, signerEmail: sig.signerEmail, templateId: current.id, templateName: label, values, fileId, fileName, linkId: id, markedBy: null, note: '' },
        })
        Object.assign(link, { status: 'signed', signedAt: sig.at, signer: { name: sig.name, relation: sig.relation, ip: sig.ip, userAgent: sig.userAgent, templateSha256: template.sha256 }, fileId, fileName })
        out.push(
          contractAudit(`${SAMPLE_PREFIX}contract-signed-${key}-${i}`, sig.at, { uid: SIGNING.uid, email: 'system', name: sig.name, role: 'system' }, {
            action: 'contract.signed',
            entityType: 'contractLink',
            entityId: id,
            ...who,
            summary: `${sig.name} (${RELATION_LABELS[sig.relation].toLowerCase()}) signed ${c.studentName}’s enrollment contract ${sig.via === 'link' ? 'with the link' : sig.via === 'app' ? 'in the app' : 'on the website'}; it’s in ${c.studentName}’s Contracts folder in the Drive`,
          }),
        )
        result.signed++
      } else if (link.status === 'signed') link.status = 'sent'
      if (link.status === 'sent') {
        result.waiting++
        // The parents who sign in hear of it, as the server tells them.
        for (const email of parentLogins(c.studentId)) {
          out.push({
            path: `${base}/${COL.notifications}/${SAMPLE_PREFIX}contract-sent-${key}-${email}`,
            data: { recipientKey: email, type: 'contract_sent', title: `Please sign ${first}’s enrollment contract`, body: `${academyName} sent ${first}’s contract. Open the app to read it and sign it.`, ko: { title: `${first} 학생 등록 계약서에 서명해 주세요`, body: `${academyName}에서 ${first} 학생 계약서를 보냈어요. 앱에서 읽고 서명해 주세요.` }, link: 'parent', refs: {}, createdAt: s.at, readAt: null },
          })
        }
      }
      out.push({ path: `${base}/${COL.contractLinks}/${id}`, data: link })
    }
  }
  if (files) process.stdout.write('\n')
  return result
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
        // A student's folder, and what's in it, is everyone's on staff (shared/src/drive/types.ts, DriveAccess).
        access: 'staff',
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
    out.push({ path: `${base}/${COL.driveFolders}/${studentFolderId(studentId)}`, data: { name, parentId: null, studentId, access: 'staff', createdAt: now, createdBy: manager } })
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

/**
 * The sample's enrollment contracts again (--contracts), to show signing once more after a demo: the sample families'
 * contracts, their signed copies (records and files) and their notices go, and the plan's are made again. The rest of
 * the sample stays as it is.
 */
async function contractsAgain() {
  const academy = await getDocument(base)
  if (!academy) throw new Error(`No academy at ${base} in ${PROJECT_ID}.`)
  const paths: string[] = []
  for (const col of [COL.contractLinks, COL.signedContracts] as const) {
    for (const d of (await listDocuments(`${base}/${col}`)).filter((x) => SAMPLE_RULES[col](x.id, x.data))) {
      for (const child of CHILDREN[col] ?? []) paths.push(...(await listDocuments(`${d.path}/${child}`)).map((c) => c.path))
      paths.push(d.path)
    }
  }
  const contractFiles = (await listDocuments(`${base}/${COL.driveFiles}`)).filter((d) => isSample(contractsFolderStudent(typeof d.data.folderId === 'string' ? d.data.folderId : null)))
  for (const d of contractFiles) await deleteObject(driveObjectPath(academyId, d.id))
  paths.push(...contractFiles.map((d) => d.path))
  paths.push(...(await listDocuments(`${base}/${COL.notifications}`)).filter((d) => d.data.type === 'contract_sent' && isSampleEmail(d.data.recipientKey)).map((d) => d.path))
  await deleteDocuments(paths)
  console.log(`- the sample's contracts: ${paths.length} documents`)
  const timezone = String(academy.timezone ?? 'America/New_York')
  const settings = resolveSettings((academy.settings ?? null) as SettingsOverrides | null)
  const rules = resolveBusinessRules((academy.businessRules ?? null) as Parameters<typeof resolveBusinessRules>[0])
  const now = new Date()
  const { docs } = buildSampleData({
    academyId,
    timezone,
    today: todayKey(timezone, now),
    now,
    week: settings.schedule.defaultWeek,
    levels: settings.students.levels,
    programs: settings.students.programs,
    seatsPerClass: rules.seatsPerClass,
  })
  const folders = (await listDocuments(`${base}/${COL.driveFolders}`)).filter((d) => d.id.startsWith('student-') || d.data.parentId === null).map((d) => ({ path: d.path, data: d.data }))
  const contracts = await sampleContracts(docs, folders, academy, timezone, now)
  await commit(contracts.docs)
  console.log(`+ Enrollment contracts for ${contracts.families} students: ${contracts.waiting} waiting, ${contracts.signed} signed`)
}

;(values.remove ? remove() : values.login ? sampleLogin(values.login) : values.contracts ? contractsAgain() : add()).catch((e) => {
  console.error(e)
  process.exit(1)
})
