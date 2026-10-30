/**
 * Each student's own Contracts folder (docs/DECISIONS.md §23, F5; the owner, 2026-10-29: "We don't need one folder that
 * has every contract: each student needs a contract folder"). Signed contracts went in one Contracts folder at the top
 * of the Drive; now each goes in the student's Contracts folder, inside their folder, which only owners and admins see.
 * This moves the ones from before, once, for one academy: each file goes in the Contracts folder of the student whose
 * signing link filed it (`contractLinks`, by `fileId`), the student's folder and their Contracts folder made when they
 * aren't there, each student's in one commit with an audit entry for every file moved and folder made. A file no link
 * names, and any folder in the old one, stay where they are and are listed (the office moves them on the website); once
 * nothing is left in the old folder, it's removed. A file's bytes never move (Storage keeps them by the file's ID).
 * Running it again moves what's still there, so it's safe.
 *
 *   npx tsx scripts/contracts-to-students.ts --academy skyarc            # say what it would do (nothing is written)
 *   npx tsx scripts/contracts-to-students.ts --academy skyarc --apply    # do it
 *
 * Run it after the deploy that files contracts in the students' folders (the rules let the website touch those folders
 * from then on), once for each academy: skyarc, then demo. Uses the developer's gcloud login
 * (scripts/lib/firestore-rest.ts); SKYARC_PROJECT and FIRESTORE_EMULATOR_HOST as the other scripts.
 */
import { parseArgs } from 'node:util'
import { ACADEMY_ID, DEMO_ACADEMY_ID } from '../shared/src/academy'
import { contractFilePlace } from '../shared/src/contracts/filing'
import { type DriveActor, OLD_CONTRACTS_FOLDER_ID, contractsFolderId } from '../shared/src/drive/types'
import { COL, ROOT } from '../shared/src/paths'
import { planContractsMove } from './lib/contracts-to-students'
import { type BatchWrite, PROJECT_ID, commitBatch, getDocument, listDocuments } from './lib/firestore-rest'

const { values } = parseArgs({ options: { academy: { type: 'string' }, apply: { type: 'boolean', default: false } } })
const BY = 'contracts-to-students'
/** Who made the folders, as the Drive shows it: the same as when a contract is signed (functions/src/contracts.ts). */
const MAKER: DriveActor = { uid: BY, email: '', name: 'Contract signing' }

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

async function main() {
  const academyId = values.academy
  if (academyId !== ACADEMY_ID && academyId !== DEMO_ACADEMY_ID) throw new Error(`Say which academy: --academy ${ACADEMY_ID} or --academy ${DEMO_ACADEMY_ID}.`)
  const base = `${ROOT.branches}/${academyId}`
  console.log(`Signed contracts into each student's Contracts folder, in ${PROJECT_ID} (${base})${values.apply ? '' : ': a dry run, nothing is written (add --apply to do it)'}`)
  if (!(await getDocument(base))) throw new Error(`No academy at ${base} in ${PROJECT_ID}.`)
  const [folders, files, links, students] = await Promise.all([
    listDocuments(`${base}/${COL.driveFolders}`),
    listDocuments(`${base}/${COL.driveFiles}`),
    listDocuments(`${base}/${COL.contractLinks}`),
    listDocuments(`${base}/${COL.students}`),
  ])
  const at = new Date()
  const plan = planContractsMove({ folders, files, links, students, by: MAKER, at })
  const moving = plan.students.reduce((n, s) => n + s.files.length, 0)
  if (!plan.oldFolder && !moving && !plan.unmatched.length) return console.log('There is no Contracts folder at the top of the Drive: nothing to move.')

  console.log(`The Contracts folder at the top holds ${count(moving + plan.unmatched.length, 'file')} and ${count(plan.folders.length, 'folder')}.`)
  for (const s of plan.students) {
    const made = s.folders.map((f) => (f.id === contractsFolderId(s.studentId) ? 'their Contracts folder' : 'their folder'))
    console.log(`  ${s.studentName}: ${count(s.files.length, 'file')} into ${s.studentName} / Contracts${made.length ? ` (${values.apply ? 'making' : 'would make'} ${made.join(' and ')})` : ''}`)
    for (const f of s.files) console.log(`    ${f.name}`)
  }
  if (plan.unmatched.length) {
    console.log(`Staying where they are, as no signing link names them (move them on the website):`)
    for (const f of plan.unmatched) console.log(`    ${f.name}`)
  }
  if (plan.folders.length) {
    console.log(`Folders in it, staying where they are (move them on the website):`)
    for (const f of plan.folders) console.log(`    ${f.name}`)
  }
  if (!values.apply) {
    if (plan.oldFolder) console.log(plan.emptied ? 'Then it is empty: it would be removed.' : 'It would stay, with what is left in it.')
    return
  }

  const audit = (entry: { action: string; entityType: string; entityId: string; summary: string; studentId: string | null; studentName: string | null }) => ({
    at,
    actorUid: BY,
    actorEmail: BY,
    actorName: 'Contracts, one time',
    actorRole: 'system',
    category: 'drive',
    context: '',
    dateKey: null,
    coachId: null,
    coachName: null,
    changes: [],
    via: 'function',
    ...entry,
  })
  const auditPath = (id: string) => `${base}/${COL.auditLog}/${BY}-${at.getTime()}-${id}`
  for (const s of plan.students) {
    const who = { studentId: s.studentId, studentName: s.studentName }
    const writes: BatchWrite[] = []
    for (const f of s.folders) {
      writes.push({ create: `${base}/${COL.driveFolders}/${f.id}`, data: { ...f.data } })
      const what = f.id === contractsFolderId(s.studentId) ? `${s.studentName}’s Contracts folder (owners and admins only)` : `${s.studentName}’s folder`
      writes.push({ set: auditPath(f.id), data: audit({ action: 'drive.folder_create', entityType: 'driveFolder', entityId: f.id, summary: `Made ${what}, for their signed contracts`, ...who }) })
    }
    // Its Updated moves, as when something lands in a folder.
    if (!s.folders.some((f) => f.id === contractsFolderId(s.studentId))) writes.push({ patch: `${base}/${COL.driveFolders}/${contractsFolderId(s.studentId)}`, fields: { updatedAt: at, updatedBy: MAKER } })
    for (const f of s.files) {
      writes.push({ patch: `${base}/${COL.driveFiles}/${f.id}`, fields: { ...contractFilePlace(s.studentId) } })
      writes.push({ set: auditPath(f.id), data: audit({ action: 'drive.move', entityType: 'driveFile', entityId: f.id, summary: `Moved “${f.name}” from the Contracts folder at the top of the Drive to ${s.studentName}’s Contracts folder`, ...who }) })
    }
    await commitBatch(writes)
    console.log(`  Moved ${count(s.files.length, 'file')} into ${s.studentName}’s Contracts folder.`)
  }

  // The old folder goes once nothing is in it, as it is now (the Trash included).
  if (!plan.oldFolder) return console.log('Done.')
  const [foldersNow, filesNow] = await Promise.all([listDocuments(`${base}/${COL.driveFolders}`), listDocuments(`${base}/${COL.driveFiles}`)])
  const left = filesNow.filter((f) => f.data.folderId === OLD_CONTRACTS_FOLDER_ID).length + foldersNow.filter((f) => f.data.parentId === OLD_CONTRACTS_FOLDER_ID).length
  if (left) return console.log(`Done. The Contracts folder at the top stays, with ${count(left, 'item')} still in it: move them on the website, then run this again to remove it.`)
  await commitBatch([
    { delete: `${base}/${COL.driveFolders}/${OLD_CONTRACTS_FOLDER_ID}` },
    {
      set: auditPath(OLD_CONTRACTS_FOLDER_ID),
      data: audit({
        action: 'drive.delete',
        entityType: 'driveFolder',
        entityId: OLD_CONTRACTS_FOLDER_ID,
        summary: 'Removed the Contracts folder at the top of the Drive, now empty: each student’s signed contracts are in their own Contracts folder',
        studentId: null,
        studentName: null,
      }),
    },
  ])
  console.log('Done. The Contracts folder at the top was empty, so it is removed.')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
