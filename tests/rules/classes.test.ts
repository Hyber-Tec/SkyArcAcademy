import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type RulesTestEnvironment, assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore'
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

// A class a week from now, so its day is still open to changes.
const start = Date.now() + 7 * 24 * 3600 * 1000
const session = (studentId: string, coachId: string) => ({
  studentId,
  studentName: studentId,
  coachId,
  coachName: coachId,
  dateKey: '2099-01-01',
  startMin: 1020,
  endMin: 1080,
  startAt: Timestamp.fromMillis(start),
  endAt: Timestamp.fromMillis(start + 3600_000),
  dayEndAt: Timestamp.fromMillis(start + 6 * 3600_000),
  status: 'pending',
  note: '',
  isDeleted: false,
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
    await setDoc(doc(d, `branches/${A}/members/admin@a.test`), member('admin@a.test', 'admin'))
    await setDoc(doc(d, `branches/${A}/members/coach@a.test`), member('coach@a.test', 'coach', { staffId: 'c1' }))
    await setDoc(doc(d, `branches/${A}/members/parent@a.test`), member('parent@a.test', 'parent', { studentIds: ['s1', 's2'] }))
    await setDoc(doc(d, `branches/${A}/members/student@a.test`), member('student@a.test', 'student', { studentId: 's1' }))
    await setDoc(doc(d, `branches/${A}/members/other@a.test`), member('other@a.test', 'parent', { studentIds: ['s3'] }))
    await setDoc(doc(d, `branches/${A}/members/paused@a.test`), member('paused@a.test', 'parent', { studentIds: ['s1'], status: 'disabled' }))
    await setDoc(doc(d, `branches/${A}/sessions/k1`), session('s1', 'c1'))
    await setDoc(doc(d, `branches/${A}/sessions/k2`), session('s2', 'c2'))
    await setDoc(doc(d, `branches/${A}/sessions/k3`), session('s3', 'c2'))
  })
})

const sessions = (email: string) => collection(db(email), `branches/${A}/sessions`)

describe('classes', () => {
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

  it('a paused family member reads nothing', async () => {
    await assertFails(getDoc(doc(db('paused@a.test'), `branches/${A}/sessions/k1`)))
    await assertFails(getDocs(query(sessions('paused@a.test'), where('studentId', '==', 's1'))))
  })

  it('a coach reads their own classes, every student’s, and no other coach’s', async () => {
    await assertSucceeds(getDoc(doc(db('coach@a.test'), `branches/${A}/sessions/k1`)))
    await assertFails(getDoc(doc(db('coach@a.test'), `branches/${A}/sessions/k2`)))
    await assertSucceeds(getDocs(query(sessions('coach@a.test'), where('coachId', '==', 'c1'))))
    await assertFails(getDocs(query(sessions('coach@a.test'), where('studentId', '==', 's1'))))
  })

  it('only admins change classes; families and coaches never do', async () => {
    await assertSucceeds(updateDoc(doc(db('admin@a.test'), `branches/${A}/sessions/k1`), { note: 'Bring ear protection' }))
    await assertFails(updateDoc(doc(db('parent@a.test'), `branches/${A}/sessions/k1`), { status: 'canceled' }))
    await assertFails(updateDoc(doc(db('student@a.test'), `branches/${A}/sessions/k1`), { note: 'x' }))
    await assertFails(updateDoc(doc(db('coach@a.test'), `branches/${A}/sessions/k1`), { status: 'present' }))
    await assertFails(setDoc(doc(db('parent@a.test'), `branches/${A}/sessions/k9`), session('s1', 'c1')))
  })
})
