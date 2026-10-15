import { newBranchData, newMemberData, publicProfileFor } from '../../shared/src/branchFactory'
import { COL, DOC, ROOT } from '../../shared/src/paths'
import { type Write, commit, getDocument } from './firestore-rest'

export interface SeedAcademyOptions {
  academyId: string
  name: string
  shortName: string
  timezone: string
  /** The first owner's sign-in email. */
  owner: string
  ownerName: string
  log?: (line: string) => void
}

/** The academy's document, public profile and first owner, written only where missing. */
export async function seedAcademy(opts: SeedAcademyOptions) {
  const log = opts.log ?? console.log
  const now = new Date()
  const owner = opts.owner.trim().toLowerCase()
  const academyPath = `${ROOT.branches}/${opts.academyId}`
  const writes: Write[] = []

  if (!(await getDocument(academyPath))) {
    const data = {
      ...newBranchData({ name: opts.name, shortName: opts.shortName, timezone: opts.timezone, createdBy: owner }),
      createdAt: now,
      updatedAt: now,
    }
    writes.push({ path: academyPath, data })
    writes.push({ path: `${academyPath}/${COL.public}/${DOC.publicProfile}`, data: { ...publicProfileFor(data) } })
    writes.push({
      path: `${academyPath}/${COL.auditLog}/academy-created`,
      data: {
        at: now, actorUid: 'seed', actorEmail: owner, actorName: 'Seed script', actorRole: 'system',
        action: 'academy.create', category: 'settings', entityType: 'branch', entityId: opts.academyId,
        summary: `Set up ${opts.name}`, context: '', dateKey: null, studentId: null, studentName: null,
        tutorId: null, tutorName: null, changes: [], via: 'function',
      },
    })
    log(`+ Academy ${opts.academyId} (${opts.name}, ${opts.timezone})`)
  } else {
    log(`= Academy ${opts.academyId} already exists`)
  }

  // The first owner signs in with this email (Google or a password). No employee record: an owner who is also staff
  // gets one from the Account page.
  const memberPath = `${academyPath}/${COL.members}/${owner}`
  if (!(await getDocument(memberPath))) {
    writes.push({
      path: memberPath,
      data: { ...newMemberData({ email: owner, displayName: opts.ownerName, role: 'owner', createdBy: 'seed' }), createdAt: now, updatedAt: now },
    })
    log(`+ Owner ${owner}`)
  } else {
    log(`= Owner ${owner} already exists`)
  }

  if (writes.length) await commit(writes)
  log(`  wrote ${writes.length} documents`)
}
