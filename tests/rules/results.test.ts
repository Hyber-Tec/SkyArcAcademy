import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type RulesTestEnvironment, assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

// The results site import (shared/src/scores/resultsSite.ts), and SCATT sessions (shared/src/scatt/session.ts): owners and admins read what it found, nobody else does,
// no client writes any of it (the server does, and a person's answers go through its callable), and its key is never
// read by a client. Its results are evaluations with the source `online`, which staff may correct as any other.

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
const PATHS = [`resultsSite/status`, `resultsSiteRuns/r1`, `onlineAthletes/averystone`, `onlineMatches/m-1`]

const onlineResult = (extra: Record<string, unknown> = {}) => ({
  studentId: 's1',
  studentName: 'Student One',
  source: 'online',
  position: 'standing',
  dateKey: '2026-10-31',
  timeMin: 560,
  shots: 2,
  total: 20.2,
  wholeTotal: 19,
  innerTens: 1,
  mpi: null,
  groupMm: null,
  series: [],
  sighters: 0,
  fileId: null,
  note: '',
  problems: [],
  sius: null,
  kind: 'competition',
  match: { name: 'Made-up October 3P', course: 'Air Rifle 3x20' },
  online: { matchId: 'm-1', resultCofId: 'r-1', url: 'https://example.test/r-1', status: 'OFFICIAL', lastUpdated: null, team: 'Made-up team', host: null },
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
    await setDoc(doc(d, `branches/${A}/members/parent@a.test`), member('parent@a.test', 'parent', { studentIds: ['s1'] }))
    await setDoc(doc(d, `branches/${A}/resultsSite/status`), { keyEnd: '1234', running: null, hosts: {} })
    await setDoc(doc(d, `branches/${A}/resultsSiteKey/main`), { key: 'made-up-key-not-real-1234' })
    await setDoc(doc(d, `branches/${A}/resultsSiteRuns/r1`), { kind: 'scheduled', state: 'done', log: [] })
    await setDoc(doc(d, `branches/${A}/onlineAthletes/averystone`), { name: 'Avery Stone', status: 'new', results: {} })
    await setDoc(doc(d, `branches/${A}/onlineMatches/m-1`), { name: 'Made-up October 3P', ours: 1 })
    await setDoc(doc(d, `branches/${A}/evaluations/online-r-1-standing`), onlineResult())
  })
})

describe('the results site import', () => {
  it('owners and admins read what it found; coaches and families don’t', async () => {
    for (const p of PATHS) {
      await assertSucceeds(getDoc(doc(db('owner@a.test'), `branches/${A}/${p}`)))
      await assertSucceeds(getDoc(doc(db('admin@a.test'), `branches/${A}/${p}`)))
      await assertFails(getDoc(doc(db('coach@a.test'), `branches/${A}/${p}`)))
      await assertFails(getDoc(doc(db('parent@a.test'), `branches/${A}/${p}`)))
    }
    await assertSucceeds(getDocs(collection(db('admin@a.test'), `branches/${A}/onlineAthletes`)))
    await assertFails(getDocs(collection(db('coach@a.test'), `branches/${A}/onlineMatches`)))
  })

  it('no client writes it, and nobody reads its key', async () => {
    for (const p of PATHS) {
      await assertFails(setDoc(doc(db('owner@a.test'), `branches/${A}/${p}`), { made: 'up' }))
      await assertFails(deleteDoc(doc(db('owner@a.test'), `branches/${A}/${p}`)))
    }
    await assertFails(updateDoc(doc(db('owner@a.test'), `branches/${A}/onlineAthletes/averystone`), { status: 'linked', studentId: 's1' }))
    await assertFails(getDoc(doc(db('owner@a.test'), `branches/${A}/resultsSiteKey/main`)))
    await assertFails(setDoc(doc(db('owner@a.test'), `branches/${A}/resultsSiteKey/main`), { key: 'another-made-up-key' }))
  })

  it('its results are scores like any other: staff correct them, families read their own', async () => {
    const path = `branches/${A}/evaluations/online-r-1-standing`
    await assertSucceeds(getDoc(doc(db('parent@a.test'), path)))
    await assertSucceeds(updateDoc(doc(db('coach@a.test'), path), { note: 'Steady standing.', kind: 'competition' }))
    await assertSucceeds(setDoc(doc(db('admin@a.test'), `branches/${A}/evaluations/e2`), onlineResult({ position: 'prone' })))
    await assertFails(setDoc(doc(db('admin@a.test'), `branches/${A}/evaluations/e3`), onlineResult({ source: 'website' })))
    await assertFails(updateDoc(doc(db('parent@a.test'), path), { note: 'Changed by a parent.' }))
  })
})

describe('SCATT sessions', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const d = c.firestore()
      await setDoc(doc(d, `branches/${A}/members/student@a.test`), member('student@a.test', 'student', { studentId: 's1' }))
      await setDoc(doc(d, `branches/${A}/members/other@a.test`), member('other@a.test', 'parent', { studentIds: ['s2'] }))
      await setDoc(doc(d, `branches/${A}/scattSessions/scatt-1`), { studentId: 's1', studentName: 'Student One', shots: [], dateKey: '2026-10-31' })
      await setDoc(doc(d, `branches/${A}/scattTraces/scatt-1`), { studentId: 's1', rateHz: 50, shots: [] })
    })
  })

  it('staff and the student’s family watch them; other families don’t', async () => {
    for (const p of ['scattSessions/scatt-1', 'scattTraces/scatt-1']) {
      for (const who of ['owner@a.test', 'coach@a.test', 'parent@a.test', 'student@a.test']) await assertSucceeds(getDoc(doc(db(who), `branches/${A}/${p}`)))
      await assertFails(getDoc(doc(db('other@a.test'), `branches/${A}/${p}`)))
    }
    await assertSucceeds(getDocs(query(collection(db('parent@a.test'), `branches/${A}/scattSessions`), where('studentId', '==', 's1'))))
    await assertFails(getDocs(query(collection(db('other@a.test'), `branches/${A}/scattSessions`), where('studentId', '==', 's1'))))
  })

  it('families only watch: nobody writes them from the app, and only staff delete one', async () => {
    await assertFails(setDoc(doc(db('parent@a.test'), `branches/${A}/scattSessions/scatt-2`), { studentId: 's1' }))
    await assertFails(setDoc(doc(db('coach@a.test'), `branches/${A}/scattSessions/scatt-2`), { studentId: 's1' }))
    await assertFails(updateDoc(doc(db('owner@a.test'), `branches/${A}/scattSessions/scatt-1`), { studentId: 's2' }))
    await assertFails(deleteDoc(doc(db('parent@a.test'), `branches/${A}/scattSessions/scatt-1`)))
    await assertSucceeds(deleteDoc(doc(db('coach@a.test'), `branches/${A}/scattTraces/scatt-1`)))
    await assertSucceeds(deleteDoc(doc(db('owner@a.test'), `branches/${A}/scattSessions/scatt-1`)))
  })

  it('a SCATT file the server has read is still the staff’s to rename, move and trash; its note is the server’s', async () => {
    const coach = { uid: 'coach', email: 'coach@a.test', name: 'coach' }
    const scattFile = (extra: Record<string, unknown> = {}) => ({
      name: 'Made-up.scatt-basic',
      size: 4,
      kind: 'scatt-basic',
      mime: 'application/x-scatt',
      status: 'uploading',
      folderId: 'student-s1',
      studentId: 's1',
      uploadedAt: serverTimestamp(),
      uploadedBy: coach,
      ...extra,
    })
    await env.withSecurityRulesDisabled(async (c) => {
      const d = c.firestore()
      for (const s of ['s1', 's2']) await setDoc(doc(d, `branches/${A}/driveFolders/student-${s}`), { name: s, parentId: null, studentId: s, access: 'staff' })
      await setDoc(doc(d, `branches/${A}/driveFiles/f1`), scattFile({ status: 'ready', scatt: { sessions: 3, skipped: 0, note: null, studentId: 's1', at: null } }))
    })
    const f1 = (who: string) => doc(db(who), `branches/${A}/driveFiles/f1`)
    await assertSucceeds(updateDoc(f1('coach@a.test'), { name: 'Renamed.scatt-basic' }))
    await assertSucceeds(updateDoc(f1('coach@a.test'), { folderId: 'student-s2', studentId: 's2' }))
    await assertSucceeds(updateDoc(f1('coach@a.test'), { trashed: true, trashedAt: serverTimestamp(), trashedBy: coach }))
    await assertFails(updateDoc(f1('owner@a.test'), { 'scatt.sessions': 0 }))
    await assertFails(updateDoc(f1('owner@a.test'), { scatt: null }))
    await assertFails(setDoc(doc(db('coach@a.test'), `branches/${A}/driveFiles/f2`), scattFile({ scatt: { sessions: 0, skipped: 0, note: null, studentId: 's1', at: null } })))
    await assertSucceeds(setDoc(doc(db('coach@a.test'), `branches/${A}/driveFiles/f2`), scattFile()))
    await assertFails(updateDoc(doc(db('coach@a.test'), `branches/${A}/driveFiles/f2`), { scatt: null }))
  })
})
