/**
 * Who sees each Drive folder and file (docs/DECISIONS.md §23, F6): every folder and file carries `access` (`staff`:
 * everyone on staff; `admins`: owners and admins only), which the security rules check and coaches' lists ask for
 * (`access == 'staff'`). Documents from before have none, so coaches' lists would leave them out: this marks each one,
 * once, with its folder's (everyone on staff's at the top and in students' folders, which is all of them until someone
 * makes a folder only owners and admins see; scripts/lib/drive-access.ts). It never changes a document that says who
 * sees it, so running it again is safe. Both academies: the real one and the demo one. It prints counts only.
 *
 *   npx tsx scripts/drive-access.ts            # count what it would mark (nothing is written)
 *   npx tsx scripts/drive-access.ts --apply    # mark them, with an audit entry for each academy
 *
 * Run it right after the deploy that brings access in: until then coaches see an empty Drive on the website. Uses the
 * developer's gcloud login (scripts/lib/firestore-rest.ts); SKYARC_PROJECT and FIRESTORE_EMULATOR_HOST as the other
 * scripts.
 */
import { parseArgs } from 'node:util'
import { ACADEMY_ID, DEMO_ACADEMY_ID } from '../shared/src/academy'
import type { DriveAccess } from '../shared/src/drive/types'
import { COL, ROOT } from '../shared/src/paths'
import { missingAccess } from './lib/drive-access'
import { PROJECT_ID, commit, getDocument, listDocuments, patchDocuments } from './lib/firestore-rest'

const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false } } })
const BY = 'drive-access'

async function academy(academyId: string) {
  const base = `${ROOT.branches}/${academyId}`
  if (!(await getDocument(base))) return console.log(`${academyId}: no academy here.`)
  const [folders, files] = await Promise.all([listDocuments(`${base}/${COL.driveFolders}`), listDocuments(`${base}/${COL.driveFiles}`)])
  const marks = missingAccess(folders, files)
  const isFolder = (path: string) => path.includes(`/${COL.driveFolders}/`)
  const count = (folder: boolean, access: DriveAccess) => marks.filter((m) => isFolder(m.path) === folder && m.access === access).length
  const line = (access: DriveAccess) => `${count(true, access)} folders and ${count(false, access)} files`
  const what = marks.length ? `${line('staff')} get everyone on staff; ${line('admins')} get owners and admins` : 'each one already says who sees it'
  console.log(`${academyId}: ${folders.length} folders and ${files.length} files in the Drive; ${what}.`)
  if (!values.apply || !marks.length) return
  await patchDocuments(marks.map((m) => ({ path: m.path, set: { access: m.access } })))
  const at = new Date()
  const folderCount = marks.filter((m) => isFolder(m.path)).length
  await commit([
    {
      path: `${base}/${COL.auditLog}/${BY}-${at.getTime()}`,
      data: {
        at,
        actorUid: BY,
        actorEmail: BY,
        actorName: 'Drive access, one time',
        actorRole: 'system',
        action: 'drive.access_marked',
        category: 'drive',
        entityType: 'drive',
        entityId: 'drive',
        summary: `Marked who sees ${folderCount} folders and ${marks.length - folderCount} files in the Drive (from before folders only owners and admins see)`,
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
  console.log(`${academyId}: marked.`)
}

async function main() {
  console.log(`Drive access in ${PROJECT_ID}${values.apply ? '' : ' (counting only: add --apply to write)'}`)
  for (const id of [ACADEMY_ID, DEMO_ACADEMY_ID]) await academy(id)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
