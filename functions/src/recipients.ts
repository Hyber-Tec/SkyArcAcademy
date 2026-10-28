import { db } from './app'
import type { Outgoing } from './notify'
import type { NotificationType } from '@shared/comms'
import { type NoticePrefs, noticeKeyOf, noticeOn } from '@shared/notices'
import { COL, ROOT } from '@shared/paths'
import type { Role } from '@shared/roles'
import type { Member } from '@shared/types'

/**
 * Who hears of something about a student, and the office (docs/DECISIONS.md §23): a student's family (the parents whose
 * children include them, and the student's own login) and the academy's owners and admins, active only, each with
 * their switches (`branches/{b}/notificationPrefs/{email}`). Coaches are found elsewhere (notify.ts), with theirs.
 */
export interface Person {
  key: string
  role: Role
  name: string
  prefs: NoticePrefs
}

async function withPrefs(branchId: string, members: { key: string; m: Member }[]): Promise<Person[]> {
  if (!members.length) return []
  const prefs = await db.getAll(...members.map((x) => db.doc(`${ROOT.branches}/${branchId}/${COL.notificationPrefs}/${x.key}`)))
  return members.map((x, i) => ({ key: x.key, role: x.m.role, name: x.m.displayName ?? '', prefs: (prefs[i].data() ?? {}) as NoticePrefs }))
}

/** A student's family: the parents linked to them and their own login. */
export async function familyOf(branchId: string, studentId: string): Promise<Person[]> {
  const members = db.collection(`${ROOT.branches}/${branchId}/${COL.members}`)
  const [parents, own] = await Promise.all([members.where('studentIds', 'array-contains', studentId).get(), members.where('studentId', '==', studentId).get()])
  const found = [...parents.docs, ...own.docs]
    .map((d) => ({ key: d.id, m: d.data() as Member }))
    .filter((x, i, all) => x.m.status === 'active' && (x.m.role === 'parent' || x.m.role === 'student') && all.findIndex((y) => y.key === x.key) === i)
  return withPrefs(branchId, found)
}

/** The academy's owners and admins. */
export async function officeOf(branchId: string): Promise<Person[]> {
  const snap = await db.collection(`${ROOT.branches}/${branchId}/${COL.members}`).where('role', 'in', ['owner', 'admin']).get()
  return withPrefs(
    branchId,
    snap.docs.map((d) => ({ key: d.id, m: d.data() as Member })).filter((x) => x.m.status === 'active'),
  )
}

/** Every active parent and student (news shown to families). */
export async function allFamilies(branchId: string): Promise<Person[]> {
  const snap = await db.collection(`${ROOT.branches}/${branchId}/${COL.members}`).where('role', 'in', ['parent', 'student']).get()
  return withPrefs(
    branchId,
    snap.docs.map((d) => ({ key: d.id, m: d.data() as Member })).filter((x) => x.m.status === 'active'),
  )
}

/** One notice to each person whose switch for it is on (and who isn't `except`). `link` is per person, by role. */
export function noticesFor(
  people: readonly Person[],
  notice: { type: NotificationType; title: string; body: string },
  link: (p: Person) => string,
  refs: Outgoing['refs'],
  except: string | null = null,
): Outgoing[] {
  const key = noticeKeyOf(notice.type)
  return people
    .filter((p) => p.key !== except && noticeOn(p.prefs, key))
    .map((p) => ({ recipientKey: p.key, type: notice.type, title: notice.title, body: notice.body, link: link(p), refs }))
}

/** A family member's Classes page on a date (`parent/classes?date=…`, `student/…`). */
export function familyClassesLink(p: Person, dateKey: string): string {
  return `${p.role === 'student' ? 'student' : 'parent'}/classes?date=${dateKey}`
}
