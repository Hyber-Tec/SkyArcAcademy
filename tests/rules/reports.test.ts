import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type RulesTestEnvironment, assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
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
const person = (email: string, role = 'admin') => ({ email, name: email.split('@')[0], role })

const report = (studentId: string, extra: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  status: 'draft',
  sharedWithParents: false,
  studentId,
  studentName: 'Student',
  period: { from: '2026-09-01', to: '2026-09-30', preset: 'last_month', label: 'September 2026' },
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  generatedAt: serverTimestamp(),
  generatedBy: person('admin@a.test'),
  updatedAt: serverTimestamp(),
  updatedBy: 'admin@a.test',
  sharedAt: null,
  sharedBy: null,
  firstViewedAt: null,
  notify: null,
  narrative: { overview: 'Hello', strengths: [], focusAreas: [], goals: [], coachNote: '' },
  options: { showStatus: true, showTargets: true, showComparison: true, showAttendance: true },
  customName: null,
  ...extra,
})

const share = (email: string) => ({ status: 'shared', sharedWithParents: true, sharedAt: serverTimestamp(), sharedBy: person(email), updatedAt: serverTimestamp(), updatedBy: email })

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
    await setDoc(doc(d, `branches/${A}/members/other@a.test`), member('other@a.test', 'parent', { studentIds: ['s2'] }))
    await setDoc(doc(d, `branches/${A}/members/kid@a.test`), member('kid@a.test', 'student', { studentId: 's1' }))
    await setDoc(doc(d, `branches/${A}/progressReports/draft1`), { ...report('s1'), generatedAt: null, updatedAt: null })
    await setDoc(doc(d, `branches/${A}/progressReports/shared1`), { ...report('s1'), status: 'shared', sharedWithParents: true, generatedAt: null, updatedAt: null })
  })
})

describe('progress reports', () => {
  it('staff read every report; families only their own children’s shared ones', async () => {
    await assertSucceeds(getDoc(doc(db('coach@a.test'), `branches/${A}/progressReports/draft1`)))
    await assertSucceeds(getDoc(doc(db('parent@a.test'), `branches/${A}/progressReports/shared1`)))
    await assertSucceeds(getDoc(doc(db('kid@a.test'), `branches/${A}/progressReports/shared1`)))
    await assertFails(getDoc(doc(db('parent@a.test'), `branches/${A}/progressReports/draft1`)))
    await assertFails(getDoc(doc(db('other@a.test'), `branches/${A}/progressReports/shared1`)))
    const mine = query(collection(db('parent@a.test'), `branches/${A}/progressReports`), where('studentId', '==', 's1'), where('sharedWithParents', '==', true))
    await assertSucceeds(getDocs(mine))
    await assertFails(getDocs(query(collection(db('parent@a.test'), `branches/${A}/progressReports`), where('studentId', '==', 's1'))))
  })

  it('admins create drafts as themselves; coaches and parents can’t', async () => {
    await assertSucceeds(setDoc(doc(db('admin@a.test'), `branches/${A}/progressReports/new1`), report('s1')))
    await assertFails(setDoc(doc(db('admin@a.test'), `branches/${A}/progressReports/new2`), report('s1', { status: 'shared', sharedWithParents: true })))
    await assertFails(setDoc(doc(db('admin@a.test'), `branches/${A}/progressReports/new3`), report('s1', { generatedBy: person('coach@a.test', 'coach') })))
    await assertFails(setDoc(doc(db('coach@a.test'), `branches/${A}/progressReports/new4`), report('s1', { generatedBy: person('coach@a.test', 'coach') })))
  })

  it('admins edit drafts; shared reports are locked except their name', async () => {
    const a = db('admin@a.test')
    await assertSucceeds(updateDoc(doc(a, `branches/${A}/progressReports/draft1`), { 'narrative.overview': 'Edited', updatedAt: serverTimestamp(), updatedBy: 'admin@a.test' }))
    await assertFails(updateDoc(doc(a, `branches/${A}/progressReports/draft1`), { 'narrative.overview': 'No stamp' }))
    await assertFails(updateDoc(doc(a, `branches/${A}/progressReports/draft1`), { studentId: 's2', updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(a, `branches/${A}/progressReports/draft1`), { notify: { status: 'sent' }, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(a, `branches/${A}/progressReports/shared1`), { 'narrative.overview': 'Edited', updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(a, `branches/${A}/progressReports/shared1`), { customName: 'Fall report', updatedAt: serverTimestamp(), updatedBy: 'admin@a.test' }))
    await assertFails(updateDoc(doc(db('coach@a.test'), `branches/${A}/progressReports/draft1`), { 'narrative.overview': 'Coach edit', updatedAt: serverTimestamp() }))
  })

  it('admins and coaches share a draft; only admins stop sharing or delete', async () => {
    await assertSucceeds(updateDoc(doc(db('coach@a.test'), `branches/${A}/progressReports/draft1`), share('coach@a.test')))
    await assertFails(updateDoc(doc(db('coach@a.test'), `branches/${A}/progressReports/shared1`), { status: 'draft', sharedWithParents: false, updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(db('admin@a.test'), `branches/${A}/progressReports/shared1`), { status: 'draft', sharedWithParents: false, updatedAt: serverTimestamp(), updatedBy: 'admin@a.test' }))
    await assertFails(updateDoc(doc(db('parent@a.test'), `branches/${A}/progressReports/shared1`), share('parent@a.test')))
    await assertFails(deleteDoc(doc(db('coach@a.test'), `branches/${A}/progressReports/draft1`)))
    await assertSucceeds(deleteDoc(doc(db('admin@a.test'), `branches/${A}/progressReports/draft1`)))
  })

  it('a share must be signed by whoever shares', async () => {
    await assertFails(updateDoc(doc(db('coach@a.test'), `branches/${A}/progressReports/draft1`), share('admin@a.test')))
  })

  it('families record their first view of a shared report, once', async () => {
    const p = db('parent@a.test')
    await assertSucceeds(setDoc(doc(p, `branches/${A}/progressReports/shared1/views/parent@a.test`), { viewedAt: serverTimestamp(), role: 'parent' }))
    await assertFails(setDoc(doc(p, `branches/${A}/progressReports/shared1/views/parent@a.test`), { viewedAt: serverTimestamp(), role: 'parent' }))
    await assertFails(setDoc(doc(p, `branches/${A}/progressReports/draft1/views/parent@a.test`), { viewedAt: serverTimestamp(), role: 'parent' }))
    await assertFails(setDoc(doc(db('other@a.test'), `branches/${A}/progressReports/shared1/views/other@a.test`), { viewedAt: serverTimestamp(), role: 'parent' }))
    await assertSucceeds(getDoc(doc(db('coach@a.test'), `branches/${A}/progressReports/shared1/views/parent@a.test`)))
  })
})
