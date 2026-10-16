import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type RulesTestEnvironment, assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment
const A = 'alpha-academy'
const B = 'beta-academy'

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

const ctx = (email: string) => env.authenticatedContext(email.split('@')[0], { email, email_verified: true })
const db = (email: string) => ctx(email).firestore()
const storage = (email: string) => ctx(email).storage()
const actor = (email: string) => ({ uid: email.split('@')[0], email, name: email.split('@')[0] })

const fileRecord = (email: string, extra: Record<string, unknown> = {}) => ({
  name: '2026-10-07 Prone 186.8.pdf',
  size: 4,
  kind: 'pdf',
  mime: 'application/pdf',
  status: 'uploading',
  folderId: 'student-s1',
  studentId: 's1',
  uploadedAt: serverTimestamp(),
  uploadedBy: actor(email),
  ...extra,
})

const folderRecord = (email: string, extra: Record<string, unknown> = {}) => ({
  name: 'Old results',
  parentId: 'student-s1',
  studentId: null,
  createdAt: serverTimestamp(),
  createdBy: actor(email),
  ...extra,
})

const evaluation = (extra: Record<string, unknown> = {}) => ({
  studentId: 's1',
  studentName: 'Student One',
  source: 'sius',
  position: 'prone',
  dateKey: '2026-10-07',
  timeMin: 1115,
  shots: 20,
  total: 186.8,
  wholeTotal: 179,
  innerTens: 3,
  mpi: { x: 0.9, y: 0.5 },
  groupMm: 24.9,
  series: [],
  sighters: 0,
  fileId: 'f1',
  note: '',
  problems: [],
  sius: null,
  ...extra,
})

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46])

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-skyarc',
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync(resolve(__dirname, '../../storage.rules'), 'utf8'), host: '127.0.0.1', port: 9199 },
  })
})

afterAll(async () => {
  await env.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.clearStorage()
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore()
    for (const b of [A, B]) await setDoc(doc(d, `branches/${b}`), { name: b, status: 'active', timezone: 'America/New_York', settings: {} })
    await setDoc(doc(d, `branches/${A}/members/admin@a.test`), member('admin@a.test', 'admin'))
    await setDoc(doc(d, `branches/${A}/members/coach@a.test`), member('coach@a.test', 'coach', { staffId: 'c1' }))
    await setDoc(doc(d, `branches/${A}/members/parent@a.test`), member('parent@a.test', 'parent', { studentIds: ['s1'] }))
    await setDoc(doc(d, `branches/${B}/members/admin@b.test`), member('admin@b.test', 'admin'))
    await setDoc(doc(d, `branches/${A}/driveFolders/student-s1`), { name: 'Student One', parentId: null, studentId: 's1', createdAt: null, createdBy: actor('admin@a.test') })
    await setDoc(doc(d, `branches/${A}/driveFiles/f1`), { ...fileRecord('admin@a.test'), uploadedAt: null, status: 'ready' })
    await setDoc(doc(d, `branches/${A}/evaluations/e1`), evaluation())
  })
  await env.withSecurityRulesDisabled(async (c) => {
    await uploadBytes(ref(c.storage(), `branches/${A}/drive/f1`), PDF, { contentType: 'application/pdf' })
  })
})

describe('Drive records', () => {
  it('staff read them; families and other academies don’t', async () => {
    await assertSucceeds(getDoc(doc(db('admin@a.test'), `branches/${A}/driveFiles/f1`)))
    await assertSucceeds(getDoc(doc(db('coach@a.test'), `branches/${A}/driveFolders/student-s1`)))
    await assertFails(getDoc(doc(db('parent@a.test'), `branches/${A}/driveFiles/f1`)))
    await assertFails(getDoc(doc(db('admin@b.test'), `branches/${A}/driveFiles/f1`)))
  })

  it('admins add files as themselves, starting as uploads; coaches can’t', async () => {
    await assertSucceeds(setDoc(doc(db('admin@a.test'), `branches/${A}/driveFiles/f2`), fileRecord('admin@a.test')))
    await assertFails(setDoc(doc(db('admin@a.test'), `branches/${A}/driveFiles/f3`), fileRecord('someone@a.test')))
    await assertFails(setDoc(doc(db('admin@a.test'), `branches/${A}/driveFiles/f4`), fileRecord('admin@a.test', { status: 'ready' })))
    await assertFails(setDoc(doc(db('admin@a.test'), `branches/${A}/driveFiles/f5`), fileRecord('admin@a.test', { size: 101 * 1024 * 1024 })))
    await assertFails(setDoc(doc(db('admin@a.test'), `branches/${A}/driveFiles/f6`), fileRecord('admin@a.test', { stray: true })))
    await assertFails(setDoc(doc(db('coach@a.test'), `branches/${A}/driveFiles/f7`), fileRecord('coach@a.test')))
  })

  it('admins rename, move and trash files, but never change what was uploaded', async () => {
    const a = db('admin@a.test')
    await assertSucceeds(updateDoc(doc(a, `branches/${A}/driveFiles/f1`), { name: 'Renamed.pdf', folderId: null, studentId: null }))
    await assertSucceeds(updateDoc(doc(a, `branches/${A}/driveFiles/f1`), { trashed: true, trashedAt: serverTimestamp(), trashedBy: actor('admin@a.test') }))
    await assertFails(updateDoc(doc(a, `branches/${A}/driveFiles/f1`), { size: 99 }))
    await assertFails(updateDoc(doc(db('coach@a.test'), `branches/${A}/driveFiles/f1`), { name: 'x.pdf' }))
  })

  it('deletes a file record only once it is in the Trash', async () => {
    const a = db('admin@a.test')
    await assertFails(deleteDoc(doc(a, `branches/${A}/driveFiles/f1`)))
    await updateDoc(doc(a, `branches/${A}/driveFiles/f1`), { trashed: true })
    await assertSucceeds(deleteDoc(doc(a, `branches/${A}/driveFiles/f1`)))
  })

  it('keeps students’ folders at the top, named for them, and out of the Trash', async () => {
    const a = db('admin@a.test')
    await assertSucceeds(setDoc(doc(a, `branches/${A}/driveFolders/n1`), folderRecord('admin@a.test')))
    await assertSucceeds(setDoc(doc(a, `branches/${A}/driveFolders/student-s2`), folderRecord('admin@a.test', { name: 'S2', parentId: null, studentId: 's2' })))
    await assertFails(setDoc(doc(a, `branches/${A}/driveFolders/student-s3`), folderRecord('admin@a.test', { name: 'S3', parentId: 'n1', studentId: 's3' })))
    await assertFails(setDoc(doc(a, `branches/${A}/driveFolders/wrong-id`), folderRecord('admin@a.test', { parentId: null, studentId: 's4' })))
    await assertFails(updateDoc(doc(a, `branches/${A}/driveFolders/student-s1`), { trashed: true }))
    await assertFails(updateDoc(doc(a, `branches/${A}/driveFolders/student-s1`), { parentId: 'n1' }))
    await assertFails(updateDoc(doc(a, `branches/${A}/driveFolders/student-s1`), { studentId: 's9' }))
    await assertSucceeds(updateDoc(doc(a, `branches/${A}/driveFolders/n1`), { trashed: true }))
    await assertSucceeds(deleteDoc(doc(a, `branches/${A}/driveFolders/n1`)))
    await assertFails(setDoc(doc(db('coach@a.test'), `branches/${A}/driveFolders/n2`), folderRecord('coach@a.test')))
  })
})

describe('Drive files in Storage', () => {
  it('staff read the bytes; families and other academies can’t', async () => {
    await assertSucceeds(getBytes(ref(storage('admin@a.test'), `branches/${A}/drive/f1`)))
    await assertSucceeds(getBytes(ref(storage('coach@a.test'), `branches/${A}/drive/f1`)))
    await assertFails(getBytes(ref(storage('parent@a.test'), `branches/${A}/drive/f1`)))
    await assertFails(getBytes(ref(storage('admin@b.test'), `branches/${A}/drive/f1`)))
  })

  it('takes bytes only for a matching upload record, of an allowed type, and never replaces them', async () => {
    const a = db('admin@a.test')
    await setDoc(doc(a, `branches/${A}/driveFiles/f2`), fileRecord('admin@a.test'))
    await assertFails(uploadBytes(ref(storage('admin@a.test'), `branches/${A}/drive/f2`), PDF, { contentType: 'text/html' }))
    await assertFails(uploadBytes(ref(storage('admin@a.test'), `branches/${A}/drive/f2`), new Uint8Array(9), { contentType: 'application/pdf' }))
    await assertFails(uploadBytes(ref(storage('coach@a.test'), `branches/${A}/drive/f2`), PDF, { contentType: 'application/pdf' }))
    await assertFails(uploadBytes(ref(storage('admin@a.test'), `branches/${A}/drive/no-record`), PDF, { contentType: 'application/pdf' }))
    await assertSucceeds(uploadBytes(ref(storage('admin@a.test'), `branches/${A}/drive/f2`), PDF, { contentType: 'application/pdf' }))
    await assertFails(uploadBytes(ref(storage('admin@a.test'), `branches/${A}/drive/f1`), PDF, { contentType: 'application/pdf' }))
  })

  it('deletes bytes only once the record is in the Trash', async () => {
    await assertFails(deleteObject(ref(storage('admin@a.test'), `branches/${A}/drive/f1`)))
    await updateDoc(doc(db('admin@a.test'), `branches/${A}/driveFiles/f1`), { trashed: true })
    await assertFails(deleteObject(ref(storage('coach@a.test'), `branches/${A}/drive/f1`)))
    await assertSucceeds(deleteObject(ref(storage('admin@a.test'), `branches/${A}/drive/f1`)))
  })
})

describe('evaluations', () => {
  it('staff read them, families don’t, and only admins write them', async () => {
    await assertSucceeds(getDoc(doc(db('coach@a.test'), `branches/${A}/evaluations/e1`)))
    await assertFails(getDoc(doc(db('parent@a.test'), `branches/${A}/evaluations/e1`)))
    await assertSucceeds(setDoc(doc(db('admin@a.test'), `branches/${A}/evaluations/e2`), evaluation({ source: 'paper', total: 88, wholeTotal: 88, shots: 10 })))
    await assertFails(setDoc(doc(db('admin@a.test'), `branches/${A}/evaluations/e3`), evaluation({ position: 'sitting' })))
    await assertFails(setDoc(doc(db('coach@a.test'), `branches/${A}/evaluations/e4`), evaluation()))
    await assertFails(deleteDoc(doc(db('coach@a.test'), `branches/${A}/evaluations/e1`)))
    await assertSucceeds(deleteDoc(doc(db('admin@a.test'), `branches/${A}/evaluations/e1`)))
  })
})
