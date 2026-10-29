import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type RulesTestEnvironment, assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment
const A = 'alpha-academy'

const member = (email: string, role: string, extra: Record<string, unknown> = {}) => ({
  email,
  displayName: email.split('@')[0],
  role,
  status: 'active',
  staffId: null,
  studentId: null,
  studentIds: [],
  restrictions: [],
  uid: null,
  ...extra,
})

const db = (email: string) => env.authenticatedContext(email.split('@')[0], { email, email_verified: true }).firestore()

const HOUR = 3600_000
const DAY = 24 * HOUR
// A class a week from now, so its day is still open to changes, and one two days ago, whose day is over.
const start = Date.now() + 7 * DAY
const past = Date.now() - 2 * DAY

// One student in a class. Seats from before classes were taught together keep their coach; newer ones have none.
const session = (studentId: string, coachId: string, extra: Record<string, unknown> = {}) => ({
  studentId,
  studentName: studentId,
  coachId,
  coachName: coachId,
  dateKey: '2099-01-01',
  startMin: 1020,
  endMin: 1080,
  startAt: Timestamp.fromMillis(start),
  endAt: Timestamp.fromMillis(start + HOUR),
  dayEndAt: Timestamp.fromMillis(start + 6 * HOUR),
  status: 'pending',
  note: '',
  isDeleted: false,
  ...extra,
})

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

// A class at `at`, two hours long, its day ending six hours after it starts.
const academyClass = (at: number, extra: Record<string, unknown> = {}) => ({
  dateKey: new Date(at).toISOString().slice(0, 10),
  weekday: WEEKDAYS[new Date(at).getUTCDay()],
  startMin: 1020,
  endMin: 1140,
  startAt: Timestamp.fromMillis(at),
  endAt: Timestamp.fromMillis(at + 2 * HOUR),
  dayEndAt: Timestamp.fromMillis(at + 6 * HOUR),
  seats: 6,
  note: 'Prone this week',
  source: 'manual',
  isDeleted: false,
  deletedAt: null,
  deletedBy: null,
  ...extra,
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-skyarc',
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})

afterAll(async () => {
  await env.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore()
    await setDoc(doc(d, `branches/${A}`), { name: A, status: 'active', timezone: 'America/New_York', settings: {} })
    await setDoc(doc(d, `branches/${A}/members/owner@a.test`), member('owner@a.test', 'owner'))
    await setDoc(doc(d, `branches/${A}/members/admin@a.test`), member('admin@a.test', 'admin'))
    await setDoc(doc(d, `branches/${A}/members/coach@a.test`), member('coach@a.test', 'coach', { staffId: 'c1' }))
    await setDoc(doc(d, `branches/${A}/members/pausedcoach@a.test`), member('pausedcoach@a.test', 'coach', { staffId: 'c3', status: 'disabled' }))
    await setDoc(doc(d, `branches/${A}/members/parent@a.test`), member('parent@a.test', 'parent', { studentIds: ['s1', 's2'] }))
    await setDoc(doc(d, `branches/${A}/members/student@a.test`), member('student@a.test', 'student', { studentId: 's1' }))
    await setDoc(doc(d, `branches/${A}/members/other@a.test`), member('other@a.test', 'parent', { studentIds: ['s3'] }))
    await setDoc(doc(d, `branches/${A}/members/paused@a.test`), member('paused@a.test', 'parent', { studentIds: ['s1'], status: 'disabled' }))
    // Classes: one to come, one whose day is over, and one in the Trash whose day is over.
    await setDoc(doc(d, `branches/${A}/classes/cl1`), academyClass(start))
    await setDoc(doc(d, `branches/${A}/classes/cl0`), academyClass(past))
    await setDoc(doc(d, `branches/${A}/classes/cl0t`), academyClass(past, { isDeleted: true }))
    // Seats from before classes were taught together, each with its coach.
    await setDoc(doc(d, `branches/${A}/sessions/k1`), session('s1', 'c1'))
    await setDoc(doc(d, `branches/${A}/sessions/k2`), session('s2', 'c2'))
    await setDoc(doc(d, `branches/${A}/sessions/k3`), session('s3', 'c2'))
    // Seats in a class taught together: no coach of their own.
    await setDoc(doc(d, `branches/${A}/sessions/k4`), session('s1', '', { classId: 'cl1' }))
    await setDoc(doc(d, `branches/${A}/sessions/k5`), session('s3', '', { classId: 'cl1' }))
    // Seats whose day is over: one kept, one in the Trash.
    const over = { startAt: Timestamp.fromMillis(past), endAt: Timestamp.fromMillis(past + HOUR), dayEndAt: Timestamp.fromMillis(past + 6 * HOUR) }
    await setDoc(doc(d, `branches/${A}/sessions/k0`), session('s1', '', { classId: 'cl0', ...over }))
    await setDoc(doc(d, `branches/${A}/sessions/k0t`), session('s1', '', { classId: 'cl0t', ...over, isDeleted: true }))
  })
})

const sessions = (email: string) => collection(db(email), `branches/${A}/sessions`)
const classes = (email: string) => collection(db(email), `branches/${A}/classes`)

describe('sessions (each student in a class)', () => {
  it('a family reads its own children’s classes, one student at a time, and no one else’s', async () => {
    await assertSucceeds(getDoc(doc(db('parent@a.test'), `branches/${A}/sessions/k1`)))
    await assertSucceeds(getDoc(doc(db('parent@a.test'), `branches/${A}/sessions/k2`)))
    await assertFails(getDoc(doc(db('parent@a.test'), `branches/${A}/sessions/k3`)))
    await assertSucceeds(getDocs(query(sessions('parent@a.test'), where('studentId', '==', 's2'))))
    await assertFails(getDocs(query(sessions('parent@a.test'), where('studentId', '==', 's3'))))
    await assertFails(getDocs(sessions('parent@a.test')))
    await assertFails(getDocs(query(sessions('parent@a.test'), where('coachId', '==', 'c2'))))
    await assertSucceeds(getDoc(doc(db('student@a.test'), `branches/${A}/sessions/k1`)))
    await assertFails(getDoc(doc(db('student@a.test'), `branches/${A}/sessions/k2`)))
    await assertFails(getDoc(doc(db('other@a.test'), `branches/${A}/sessions/k1`)))
  })

  it('a family sees its own child in a class taught together, never the class’s other students', async () => {
    await assertSucceeds(getDoc(doc(db('parent@a.test'), `branches/${A}/sessions/k4`)))
    await assertFails(getDoc(doc(db('parent@a.test'), `branches/${A}/sessions/k5`)))
    await assertSucceeds(getDocs(query(sessions('parent@a.test'), where('studentId', '==', 's1'), where('classId', '==', 'cl1'))))
    await assertFails(getDocs(query(sessions('parent@a.test'), where('classId', '==', 'cl1'))))
    await assertFails(getDocs(query(sessions('parent@a.test'), where('coachId', '==', ''))))
    await assertSucceeds(getDoc(doc(db('student@a.test'), `branches/${A}/sessions/k4`)))
    await assertFails(getDoc(doc(db('student@a.test'), `branches/${A}/sessions/k5`)))
    await assertFails(getDocs(query(sessions('student@a.test'), where('classId', '==', 'cl1'))))
    await assertSucceeds(getDoc(doc(db('other@a.test'), `branches/${A}/sessions/k5`)))
    await assertFails(getDoc(doc(db('other@a.test'), `branches/${A}/sessions/k4`)))
  })

  it('a paused family member reads nothing', async () => {
    await assertFails(getDoc(doc(db('paused@a.test'), `branches/${A}/sessions/k1`)))
    await assertFails(getDocs(query(sessions('paused@a.test'), where('studentId', '==', 's1'))))
  })

  it('a coach reads every student in every class, another coach’s older ones too', async () => {
    const coach = db('coach@a.test')
    await assertSucceeds(getDoc(doc(coach, `branches/${A}/sessions/k1`)))
    await assertSucceeds(getDoc(doc(coach, `branches/${A}/sessions/k2`)))
    await assertSucceeds(getDoc(doc(coach, `branches/${A}/sessions/k5`)))
    await assertSucceeds(getDocs(sessions('coach@a.test')))
    await assertSucceeds(getDocs(query(sessions('coach@a.test'), where('classId', '==', 'cl1'))))
    await assertSucceeds(getDocs(query(sessions('coach@a.test'), where('coachId', '==', 'c2'))))
    await assertSucceeds(getDocs(query(sessions('coach@a.test'), where('studentId', '==', 's3'))))
    await assertFails(getDoc(doc(db('pausedcoach@a.test'), `branches/${A}/sessions/k1`)))
    await assertFails(getDocs(sessions('pausedcoach@a.test')))
  })

  it('only admins change classes; families and coaches never do', async () => {
    await assertSucceeds(updateDoc(doc(db('admin@a.test'), `branches/${A}/sessions/k1`), { note: 'Bring ear protection' }))
    await assertSucceeds(setDoc(doc(db('admin@a.test'), `branches/${A}/sessions/k9`), session('s2', '', { classId: 'cl1' })))
    await assertFails(updateDoc(doc(db('parent@a.test'), `branches/${A}/sessions/k1`), { status: 'canceled' }))
    await assertFails(updateDoc(doc(db('student@a.test'), `branches/${A}/sessions/k1`), { note: 'x' }))
    await assertFails(updateDoc(doc(db('coach@a.test'), `branches/${A}/sessions/k1`), { status: 'present' }))
    await assertFails(updateDoc(doc(db('coach@a.test'), `branches/${A}/sessions/k5`), { status: 'present' }))
    await assertFails(setDoc(doc(db('coach@a.test'), `branches/${A}/sessions/k8`), session('s1', '', { classId: 'cl1' })))
    await assertFails(deleteDoc(doc(db('coach@a.test'), `branches/${A}/sessions/k4`)))
    await assertFails(setDoc(doc(db('parent@a.test'), `branches/${A}/sessions/k8`), session('s1', 'c1')))
  })

  it('owners and admins change a seat whose day is over, to put the record right; coaches never do', async () => {
    await assertFails(updateDoc(doc(db('coach@a.test'), `branches/${A}/sessions/k0`), { status: 'present' }))
    const admin = db('admin@a.test')
    await assertSucceeds(updateDoc(doc(admin, `branches/${A}/sessions/k0`), { status: 'present' }))
    await assertSucceeds(updateDoc(doc(db('owner@a.test'), `branches/${A}/sessions/k0`), { status: 'canceled' }))
    await assertSucceeds(deleteDoc(doc(admin, `branches/${A}/sessions/k0`)))
    await assertSucceeds(deleteDoc(doc(admin, `branches/${A}/sessions/k0t`)))
  })
})

describe('classes taught together', () => {
  it('owners, admins and coaches read every class; families never do (its note is for the coaches)', async () => {
    for (const who of ['owner@a.test', 'admin@a.test', 'coach@a.test']) {
      await assertSucceeds(getDoc(doc(db(who), `branches/${A}/classes/cl1`)))
      await assertSucceeds(getDocs(classes(who)))
      await assertSucceeds(getDocs(query(classes(who), where('dateKey', '==', academyClass(start).dateKey))))
    }
    for (const who of ['parent@a.test', 'student@a.test', 'paused@a.test', 'pausedcoach@a.test']) {
      await assertFails(getDoc(doc(db(who), `branches/${A}/classes/cl1`)))
      await assertFails(getDocs(classes(who)))
      await assertFails(getDocs(query(classes(who), where('dateKey', '==', academyClass(start).dateKey))))
    }
  })

  it('admins add, change and remove a class while its day is open', async () => {
    const ref = (email: string) => doc(db(email), `branches/${A}/classes/cl2`)
    await assertSucceeds(setDoc(ref('admin@a.test'), academyClass(start)))
    await assertSucceeds(updateDoc(ref('admin@a.test'), { seats: 8, note: 'Bring the new jackets' }))
    await assertSucceeds(updateDoc(ref('owner@a.test'), { startMin: 1050, endMin: 1170 }))
    await assertSucceeds(updateDoc(ref('admin@a.test'), { isDeleted: true, deletedBy: 'admin@a.test' }))
    await assertSucceeds(updateDoc(ref('admin@a.test'), { isDeleted: false, deletedBy: null }))
    await assertSucceeds(deleteDoc(ref('admin@a.test')))
  })

  it('coaches and families never add, change or remove a class', async () => {
    for (const who of ['coach@a.test', 'parent@a.test', 'student@a.test']) {
      await assertFails(setDoc(doc(db(who), `branches/${A}/classes/cl2`), academyClass(start)))
      await assertFails(updateDoc(doc(db(who), `branches/${A}/classes/cl1`), { note: 'Kneeling instead' }))
      await assertFails(deleteDoc(doc(db(who), `branches/${A}/classes/cl1`)))
    }
  })

  it('owners and admins add, change and remove a class whose day is over, to put the record right', async () => {
    await assertFails(updateDoc(doc(db('coach@a.test'), `branches/${A}/classes/cl0`), { note: 'Late note' }))
    const admin = db('admin@a.test')
    await assertSucceeds(setDoc(doc(admin, `branches/${A}/classes/cl2`), academyClass(past)))
    await assertSucceeds(updateDoc(doc(admin, `branches/${A}/classes/cl0`), { note: 'Late note' }))
    await assertSucceeds(updateDoc(doc(db('owner@a.test'), `branches/${A}/classes/cl0`), { isDeleted: true }))
    // Moved from a day that's over, or to one.
    await assertSucceeds(setDoc(doc(admin, `branches/${A}/classes/cl0`), academyClass(start)))
    await assertSucceeds(setDoc(doc(admin, `branches/${A}/classes/cl1`), academyClass(past)))
    await assertSucceeds(deleteDoc(doc(admin, `branches/${A}/classes/cl0`)))
    await assertSucceeds(deleteDoc(doc(admin, `branches/${A}/classes/cl0t`)))
  })

  it('a class takes 1 to 12 students, at a real time on a real day', async () => {
    const ref = doc(db('admin@a.test'), `branches/${A}/classes/cl2`)
    for (const seats of [0, 13, -1, 6.5, '6', null]) await assertFails(setDoc(ref, academyClass(start, { seats })))
    await assertFails(setDoc(ref, academyClass(start, { startMin: 1140, endMin: 1020 })))
    await assertFails(setDoc(ref, academyClass(start, { startMin: 1020, endMin: 1020 })))
    await assertFails(setDoc(ref, academyClass(start, { startMin: '17:00' })))
    await assertFails(setDoc(ref, academyClass(start, { dateKey: 'next Monday' })))
    await assertFails(setDoc(ref, academyClass(start, { note: null })))
    await assertFails(setDoc(ref, academyClass(start, { isDeleted: 'no' })))
    // Its day ends at the next midnight: never more than 25 hours after it starts, nor before.
    await assertFails(setDoc(ref, academyClass(start, { dayEndAt: Timestamp.fromMillis(start + 30 * HOUR) })))
    await assertFails(setDoc(ref, academyClass(start, { dayEndAt: Timestamp.fromMillis(start - HOUR) })))
    await assertSucceeds(setDoc(ref, academyClass(start, { seats: 1 })))
    await assertSucceeds(updateDoc(ref, { seats: 12 }))
    await assertFails(updateDoc(ref, { seats: 13 }))
    await assertFails(updateDoc(ref, { seats: 0 }))
    await assertFails(updateDoc(ref, { endMin: 1000 }))
  })
})
