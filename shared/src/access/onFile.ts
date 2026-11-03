import { emailKey } from '../paths'
import type { StudentPrivateProfile, StudentStatus } from '../types'

/**
 * Signing up by the email on file (docs/DECISIONS.md §31, the owner's pick for the third meeting's CT1): someone who
 * signs up with an email the academy wrote on a student's record is linked to that student once the email is confirmed,
 * by the server (functions/src/signup.ts), with no step from the office. A parent's email links them to every child
 * whose record lists it; a student's own email links the student. Anyone else asks the academy (`signupRequests`).
 */

/** A member doc the server made by the records says so in `createdBy`: no "you've been added" email goes out. */
export const LINKED_BY_RECORDS = 'email-on-file'

/** The students a sign-up can be linked to: those at the academy, starting or paused; not those who left, nor leads. */
export const LINKABLE_STATUSES: readonly StudentStatus[] = ['signed_up', 'enrolled', 'paused']

export const isLinkable = (status: StudentStatus | null | undefined): boolean => !!status && LINKABLE_STATUSES.includes(status)

/** A student with the emails on their record (their private profile, read on the server). */
export interface StudentOnFile {
  id: string
  name: string
  status: StudentStatus
  profile: Pick<StudentPrivateProfile, 'email' | 'parents'> | null
}

export interface OnFile {
  role: 'parent' | 'student'
  /** A parent's children (A to Z), or the student. */
  studentIds: string[]
  /** The name the record gives this person: the parent's, as the office typed it, or the student's. May be empty. */
  name: string
}

const same = (a: string | null | undefined, key: string) => !!a && emailKey(a) === key

/**
 * Who an email is on the academy's records: the parent of every child whose record lists it as a parent's (and of any
 * whose own email it also is: families often give one address for both), or the student whose own email it is. An
 * address several students give as their own is a parent's too. Null when no record has it.
 */
export function onFile(email: string, students: readonly StudentOnFile[]): OnFile | null {
  const key = emailKey(email)
  if (!key.includes('@')) return null
  const here = students.filter((s) => isLinkable(s.status) && s.profile)
  const asParent = here.filter((s) => (s.profile?.parents ?? []).some((p) => same(p.email, key)))
  const asSelf = here.filter((s) => same(s.profile?.email, key))
  const byName = (list: readonly StudentOnFile[]) => [...new Map(list.map((s) => [s.id, s])).values()].sort((a, b) => a.name.localeCompare(b.name)).map((s) => s.id)
  if (asParent.length) {
    const name = asParent.flatMap((s) => s.profile?.parents ?? []).find((p) => same(p.email, key) && p.name.trim())?.name.trim() ?? ''
    return { role: 'parent', studentIds: byName([...asParent, ...asSelf]), name }
  }
  if (asSelf.length === 1) return { role: 'student', studentIds: [asSelf[0].id], name: asSelf[0].name }
  if (asSelf.length > 1) return { role: 'parent', studentIds: byName(asSelf), name: '' }
  return null
}

/** Apple's "Hide My Email" address: never on a record, so the academy can't find whose it is. */
export const isHiddenEmail = (email: string | null | undefined): boolean => !!email && /@privaterelay\.appleid\.com$/i.test(email.trim())

/** What linking by the email on file answers (functions/src/signup.ts `linkMyAccount`). */
export type LinkResult =
  | { state: 'member' }
  | { state: 'not_found' }
  | { state: 'linked'; role: 'parent' | 'student'; students: { id: string; name: string }[] }
