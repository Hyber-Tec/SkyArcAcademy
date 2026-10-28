import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type RulesTestEnvironment, assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

// Families cancel and ask for classes through the server only; they read their own requests and every class's seats
// taken (no names); each person keeps their own notification switches (docs/DECISIONS.md §23).

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

const start = Date.now() + 7 * 24 * 3600_000
const request = (studentId: string) => ({
  kind: 'makeup',
  studentId,
  studentName: studentId,
  classId: 'cl1',
  dateKey: '2099-01-01',
  startMin: 1020,
  endMin: 1140,
  startAt: Timestamp.fromMillis(start),
  forSessionId: 'k9',
  forDateKey: '2098-12-20',
  message: '',
  status: 'pending',
  requestedBy: { email: 'parent@a.test', name: 'parent', role: 'parent' },
  decidedAt: null,
  decidedBy: null,
  decisionNote: '',
  sessionId: null,
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
    await setDoc(doc(d, `branches/${A}/members/parent@a.test`), member('parent@a.test', 'parent', { studentIds: ['s1'] }))
    await setDoc(doc(d, `branches/${A}/members/student@a.test`), member('student@a.test', 'student', { studentId: 's1' }))
    await setDoc(doc(d, `branches/${A}/members/other@a.test`), member('other@a.test', 'parent', { studentIds: ['s3'] }))
    await setDoc(doc(d, `branches/${A}/members/paused@a.test`), member('paused@a.test', 'parent', { studentIds: ['s1'], status: 'disabled' }))
    await setDoc(doc(d, `branches/${A}/classRequests/r1`), request('s1'))
    await setDoc(doc(d, `branches/${A}/classRequests/r3`), request('s3'))
    await setDoc(doc(d, `branches/${A}/classSeats/cl1`), { dateKey: '2099-01-01', startMin: 1020, endMin: 1140, startAt: Timestamp.fromMillis(start), seats: 6, taken: 4, isDeleted: false })
  })
})

describe('class requests', () => {
  it('the office reads them all; a family only its own child’s; a coach none', async () => {
    await assertSucceeds(getDocs(collection(db('admin@a.test'), `branches/${A}/classRequests`)))
    await assertSucceeds(getDoc(doc(db('parent@a.test'), `branches/${A}/classRequests/r1`)))
    await assertSucceeds(getDoc(doc(db('student@a.test'), `branches/${A}/classRequests/r1`)))
    await assertSucceeds(getDocs(query(collection(db('parent@a.test'), `branches/${A}/classRequests`), where('studentId', '==', 's1'))))
    await assertFails(getDoc(doc(db('parent@a.test'), `branches/${A}/classRequests/r3`)))
    await assertFails(getDocs(collection(db('parent@a.test'), `branches/${A}/classRequests`)))
    await assertFails(getDoc(doc(db('paused@a.test'), `branches/${A}/classRequests/r1`)))
    await assertFails(getDoc(doc(db('coach@a.test'), `branches/${A}/classRequests/r1`)))
  })

  it('nobody writes them but the server, the office included', async () => {
    await assertFails(setDoc(doc(db('parent@a.test'), `branches/${A}/classRequests/new`), request('s1')))
    await assertFails(updateDoc(doc(db('parent@a.test'), `branches/${A}/classRequests/r1`), { status: 'withdrawn' }))
    await assertFails(updateDoc(doc(db('admin@a.test'), `branches/${A}/classRequests/r1`), { status: 'approved' }))
    await assertFails(deleteDoc(doc(db('admin@a.test'), `branches/${A}/classRequests/r1`)))
  })
})

describe('seats taken', () => {
  it('every active member reads them; nobody writes them', async () => {
    await assertSucceeds(getDoc(doc(db('parent@a.test'), `branches/${A}/classSeats/cl1`)))
    await assertSucceeds(getDocs(query(collection(db('student@a.test'), `branches/${A}/classSeats`), where('dateKey', '>=', '2099-01-01'))))
    await assertSucceeds(getDoc(doc(db('coach@a.test'), `branches/${A}/classSeats/cl1`)))
    await assertFails(getDoc(doc(db('paused@a.test'), `branches/${A}/classSeats/cl1`)))
    await assertFails(updateDoc(doc(db('admin@a.test'), `branches/${A}/classSeats/cl1`), { taken: 0 }))
  })
})

describe('notification switches', () => {
  it('each person reads and sets only their own, with on/off values', async () => {
    const mine = doc(db('parent@a.test'), `branches/${A}/notificationPrefs/parent@a.test`)
    await assertSucceeds(setDoc(mine, { scores: false, updatedAt: serverTimestamp() }))
    await assertSucceeds(getDoc(mine))
    await assertSucceeds(updateDoc(mine, { classChanges: false, updatedAt: serverTimestamp() }))
    await assertFails(setDoc(mine, { scores: 'no', updatedAt: serverTimestamp() }))
    await assertFails(setDoc(mine, { anything: true, updatedAt: serverTimestamp() }))
    await assertFails(setDoc(mine, { scores: true }))
    await assertFails(getDoc(doc(db('other@a.test'), `branches/${A}/notificationPrefs/parent@a.test`)))
    await assertFails(setDoc(doc(db('other@a.test'), `branches/${A}/notificationPrefs/parent@a.test`), { scores: true, updatedAt: serverTimestamp() }))
    await assertFails(setDoc(doc(db('paused@a.test'), `branches/${A}/notificationPrefs/paused@a.test`), { scores: true, updatedAt: serverTimestamp() }))
    await assertSucceeds(setDoc(doc(db('admin@a.test'), `branches/${A}/notificationPrefs/admin@a.test`), { websiteMessages: false, updatedAt: serverTimestamp() }))
  })
})
