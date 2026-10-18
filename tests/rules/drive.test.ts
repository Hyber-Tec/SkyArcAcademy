import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type RulesTestEnvironment, assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
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
    await setDoc(doc(d, `branches/${A}/members/student@a.test`), member('student@a.test', 'student', { studentId: 's1' }))
    await setDoc(doc(d, `branches/${A}/members/other@a.test`), member('other@a.test', 'parent', { studentIds: ['s2'] }))
    await setDoc(doc(d, `branches/${B}/members/admin@b.test`), member('admin@b.test', 'admin'))
    await setDoc(doc(d, `branches/${A}/driveFolders/student-s1`), { name: 'Student One', parentId: null, studentId: 's1', createdAt: null, createdBy: actor('admin@a.test') })
    // f1 is e1's file (a score of s1); fnote sits in s1's folder without a score; fs2's score (es2) is s2's.
    await setDoc(doc(d, `branches/${A}/driveFiles/f1`), { ...fileRecord('admin@a.test'), uploadedAt: null, status: 'ready', evaluationId: 'e1' })
    await setDoc(doc(d, `branches/${A}/driveFiles/fnote`), { ...fileRecord('admin@a.test'), uploadedAt: null, status: 'ready', name: 'Notes.pdf' })
    await setDoc(doc(d, `branches/${A}/driveFiles/fs2`), { ...fileRecord('admin@a.test'), uploadedAt: null, status: 'ready', folderId: 'student-s2', studentId: 's2', evaluationId: 'es2' })
    await setDoc(doc(d, `branches/${A}/evaluations/e1`), evaluation())
    await setDoc(doc(d, `branches/${A}/evaluations/es2`), evaluation({ studentId: 's2', studentName: 'Student Two', fileId: 'fs2' }))
  })
  await env.withSecurityRulesDisabled(async (c) => {
    for (const f of ['fnote', 'f1', 'fs2']) await uploadBytes(ref(c.storage(), `branches/${A}/drive/${f}`), PDF, { contentType: 'application/pdf' })
  })
})

describe('Drive records', () => {
  it('staff read them all; a family reads only the file a score of their own child came from', async () => {
    await assertSucceeds(getDoc(doc(db('admin@a.test'), `branches/${A}/driveFiles/f1`)))
    await assertSucceeds(getDoc(doc(db('coach@a.test'), `branches/${A}/driveFolders/student-s1`)))
    await assertSucceeds(getDoc(doc(db('admin@a.test'), `branches/${A}/driveFiles/fnote`)))
    await assertSucceeds(getDoc(doc(db('parent@a.test'), `branches/${A}/driveFiles/f1`)))
    await assertSucceeds(getDoc(doc(db('student@a.test'), `branches/${A}/driveFiles/f1`)))
    await assertFails(getDoc(doc(db('other@a.test'), `branches/${A}/driveFiles/f1`)))
    await assertFails(getDoc(doc(db('parent@a.test'), `branches/${A}/driveFiles/fnote`)))
    await assertFails(getDoc(doc(db('parent@a.test'), `branches/${A}/driveFiles/fs2`)))
    await assertFails(getDoc(doc(db('parent@a.test'), `branches/${A}/driveFolders/student-s1`)))
    await assertFails(getDocs(collection(db('parent@a.test'), `branches/${A}/driveFiles`)))
    await assertFails(getDoc(doc(db('admin@b.test'), `branches/${A}/driveFiles/f1`)))
  })

  it('a family loses the file once it’s in the Trash, no longer a score’s file, or moved to another student', async () => {
    const a = db('admin@a.test')
    const read = () => getDoc(doc(db('parent@a.test'), `branches/${A}/driveFiles/f1`))
    await updateDoc(doc(a, `branches/${A}/driveFiles/f1`), { trashed: true })
    await assertFails(read())
    await updateDoc(doc(a, `branches/${A}/driveFiles/f1`), { trashed: false })
    await assertSucceeds(read())
    // Deleting the score clears the file's link (web and phone scores/api.ts).
    await updateDoc(doc(a, `branches/${A}/driveFiles/f1`), { evaluationId: null })
    await assertFails(read())
    await updateDoc(doc(a, `branches/${A}/driveFiles/f1`), { evaluationId: 'e1', folderId: 'student-s2', studentId: 's2' })
    await assertFails(read())
  })

  it('staff (coaches too) add files as themselves, starting as uploads', async () => {
    await assertSucceeds(setDoc(doc(db('admin@a.test'), `branches/${A}/driveFiles/f2`), fileRecord('admin@a.test')))
    await assertFails(setDoc(doc(db('admin@a.test'), `branches/${A}/driveFiles/f3`), fileRecord('someone@a.test')))
    await assertFails(setDoc(doc(db('admin@a.test'), `branches/${A}/driveFiles/f4`), fileRecord('admin@a.test', { status: 'ready' })))
    await assertFails(setDoc(doc(db('admin@a.test'), `branches/${A}/driveFiles/f5`), fileRecord('admin@a.test', { size: 101 * 1024 * 1024 })))
    await assertFails(setDoc(doc(db('admin@a.test'), `branches/${A}/driveFiles/f6`), fileRecord('admin@a.test', { stray: true })))
    await assertSucceeds(setDoc(doc(db('coach@a.test'), `branches/${A}/driveFiles/f7`), fileRecord('coach@a.test')))
    await assertFails(setDoc(doc(db('coach@a.test'), `branches/${A}/driveFiles/f8`), fileRecord('admin@a.test')))
    await assertFails(setDoc(doc(db('parent@a.test'), `branches/${A}/driveFiles/f9`), fileRecord('parent@a.test')))
  })

  it('staff rename, move and trash files, but never change what was uploaded', async () => {
    const a = db('admin@a.test')
    await assertSucceeds(updateDoc(doc(a, `branches/${A}/driveFiles/f1`), { name: 'Renamed.pdf', folderId: null, studentId: null }))
    await assertSucceeds(updateDoc(doc(a, `branches/${A}/driveFiles/f1`), { trashed: true, trashedAt: serverTimestamp(), trashedBy: actor('admin@a.test') }))
    await assertFails(updateDoc(doc(a, `branches/${A}/driveFiles/f1`), { size: 99 }))
    await assertSucceeds(updateDoc(doc(db('coach@a.test'), `branches/${A}/driveFiles/f1`), { name: 'x.pdf' }))
    await assertFails(updateDoc(doc(db('coach@a.test'), `branches/${A}/driveFiles/f1`), { uploadedBy: actor('coach@a.test') }))
    await assertFails(updateDoc(doc(db('parent@a.test'), `branches/${A}/driveFiles/f1`), { name: 'y.pdf' }))
  })

  it('deletes a file record once admins empty it from the Trash, or a failed upload for anyone on staff', async () => {
    const a = db('admin@a.test')
    await assertFails(deleteDoc(doc(a, `branches/${A}/driveFiles/f1`)))
    await updateDoc(doc(a, `branches/${A}/driveFiles/f1`), { trashed: true })
    await assertFails(deleteDoc(doc(db('coach@a.test'), `branches/${A}/driveFiles/f1`)))
    await assertSucceeds(deleteDoc(doc(a, `branches/${A}/driveFiles/f1`)))
    const c = db('coach@a.test')
    await setDoc(doc(c, `branches/${A}/driveFiles/f2`), fileRecord('coach@a.test'))
    await assertFails(deleteDoc(doc(c, `branches/${A}/driveFiles/f2`)))
    await updateDoc(doc(c, `branches/${A}/driveFiles/f2`), { status: 'error', error: 'The upload didn’t finish.' })
    await assertSucceeds(deleteDoc(doc(c, `branches/${A}/driveFiles/f2`)))
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
    await assertSucceeds(setDoc(doc(db('coach@a.test'), `branches/${A}/driveFolders/student-s5`), folderRecord('coach@a.test', { name: 'S5', parentId: null, studentId: 's5' })))
    await assertSucceeds(setDoc(doc(db('coach@a.test'), `branches/${A}/driveFolders/n2`), folderRecord('coach@a.test')))
    await assertFails(setDoc(doc(db('parent@a.test'), `branches/${A}/driveFolders/n3`), folderRecord('parent@a.test')))
  })
})

describe('Drive files in Storage', () => {
  it('staff read the bytes; a family reads only the file a score of their own child came from', async () => {
    await assertSucceeds(getBytes(ref(storage('admin@a.test'), `branches/${A}/drive/f1`)))
    await assertSucceeds(getBytes(ref(storage('coach@a.test'), `branches/${A}/drive/f1`)))
    await assertSucceeds(getBytes(ref(storage('parent@a.test'), `branches/${A}/drive/f1`)))
    await assertSucceeds(getBytes(ref(storage('student@a.test'), `branches/${A}/drive/f1`)))
    await assertFails(getBytes(ref(storage('other@a.test'), `branches/${A}/drive/f1`)))
    await assertFails(getBytes(ref(storage('parent@a.test'), `branches/${A}/drive/fnote`)))
    await assertFails(getBytes(ref(storage('parent@a.test'), `branches/${A}/drive/fs2`)))
    await assertFails(getBytes(ref(storage('admin@b.test'), `branches/${A}/drive/f1`)))
  })

  it('a family loses the bytes once the file is in the Trash, no longer a score’s file, or moved to another student', async () => {
    const a = db('admin@a.test')
    const read = () => getBytes(ref(storage('parent@a.test'), `branches/${A}/drive/f1`))
    await updateDoc(doc(a, `branches/${A}/driveFiles/f1`), { trashed: true })
    await assertFails(read())
    await updateDoc(doc(a, `branches/${A}/driveFiles/f1`), { trashed: false })
    await assertSucceeds(read())
    await updateDoc(doc(a, `branches/${A}/driveFiles/f1`), { evaluationId: null })
    await assertFails(read())
    await updateDoc(doc(a, `branches/${A}/driveFiles/f1`), { evaluationId: 'e1', folderId: 'student-s2', studentId: 's2' })
    await assertFails(read())
    await assertSucceeds(getBytes(ref(storage('other@a.test'), `branches/${A}/drive/f1`)))
  })

  it('takes bytes only for a matching upload record, of an allowed type, and never replaces them', async () => {
    const a = db('admin@a.test')
    await setDoc(doc(a, `branches/${A}/driveFiles/f2`), fileRecord('admin@a.test'))
    await assertFails(uploadBytes(ref(storage('admin@a.test'), `branches/${A}/drive/f2`), PDF, { contentType: 'text/html' }))
    await assertFails(uploadBytes(ref(storage('admin@a.test'), `branches/${A}/drive/f2`), new Uint8Array(9), { contentType: 'application/pdf' }))
    await assertFails(uploadBytes(ref(storage('parent@a.test'), `branches/${A}/drive/f2`), PDF, { contentType: 'application/pdf' }))
    await assertFails(uploadBytes(ref(storage('admin@a.test'), `branches/${A}/drive/no-record`), PDF, { contentType: 'application/pdf' }))
    await assertSucceeds(uploadBytes(ref(storage('admin@a.test'), `branches/${A}/drive/f2`), PDF, { contentType: 'application/pdf' }))
    await assertFails(uploadBytes(ref(storage('admin@a.test'), `branches/${A}/drive/f1`), PDF, { contentType: 'application/pdf' }))
  })

  it('a coach uploads a card for their record', async () => {
    await setDoc(doc(db('coach@a.test'), `branches/${A}/driveFiles/f3`), fileRecord('coach@a.test'))
    await assertSucceeds(uploadBytes(ref(storage('coach@a.test'), `branches/${A}/drive/f3`), PDF, { contentType: 'application/pdf' }))
  })

  it('deletes bytes only once the record is in the Trash (admins) or the upload failed (staff)', async () => {
    await assertFails(deleteObject(ref(storage('admin@a.test'), `branches/${A}/drive/f1`)))
    await updateDoc(doc(db('admin@a.test'), `branches/${A}/driveFiles/f1`), { trashed: true })
    await assertFails(deleteObject(ref(storage('coach@a.test'), `branches/${A}/drive/f1`)))
    await assertSucceeds(deleteObject(ref(storage('admin@a.test'), `branches/${A}/drive/f1`)))
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), `branches/${A}/driveFiles/f4`), { ...fileRecord('coach@a.test'), status: 'error' })
      await uploadBytes(ref(c.storage(), `branches/${A}/drive/f4`), PDF, { contentType: 'application/pdf' })
    })
    await assertFails(deleteObject(ref(storage('parent@a.test'), `branches/${A}/drive/f4`)))
    await assertSucceeds(deleteObject(ref(storage('coach@a.test'), `branches/${A}/drive/f4`)))
  })
})

describe('evaluations', () => {
  it('families read their own children’s, one student at a time, and never change them', async () => {
    await assertSucceeds(getDoc(doc(db('parent@a.test'), `branches/${A}/evaluations/e1`)))
    await assertSucceeds(getDoc(doc(db('student@a.test'), `branches/${A}/evaluations/e1`)))
    await assertFails(getDoc(doc(db('other@a.test'), `branches/${A}/evaluations/e1`)))
    await assertFails(getDoc(doc(db('parent@a.test'), `branches/${A}/evaluations/es2`)))
    await assertSucceeds(getDocs(query(collection(db('parent@a.test'), `branches/${A}/evaluations`), where('studentId', '==', 's1'))))
    await assertSucceeds(getDocs(query(collection(db('student@a.test'), `branches/${A}/evaluations`), where('studentId', '==', 's1'))))
    await assertFails(getDocs(query(collection(db('parent@a.test'), `branches/${A}/evaluations`), where('studentId', '==', 's2'))))
    await assertFails(getDocs(collection(db('parent@a.test'), `branches/${A}/evaluations`)))
    await assertFails(updateDoc(doc(db('parent@a.test'), `branches/${A}/evaluations/e1`), { note: 'Great!' }))
    await assertFails(updateDoc(doc(db('student@a.test'), `branches/${A}/evaluations/e1`), { total: 200 }))
    await assertFails(deleteDoc(doc(db('student@a.test'), `branches/${A}/evaluations/e1`)))
  })

  it('staff read and write them (coaches too); families don’t write', async () => {
    await assertSucceeds(getDoc(doc(db('coach@a.test'), `branches/${A}/evaluations/e1`)))
    await assertSucceeds(setDoc(doc(db('admin@a.test'), `branches/${A}/evaluations/e2`), evaluation({ source: 'paper', total: 88, wholeTotal: 88, shots: 10 })))
    await assertFails(setDoc(doc(db('admin@a.test'), `branches/${A}/evaluations/e3`), evaluation({ position: 'sitting' })))
    await assertSucceeds(setDoc(doc(db('coach@a.test'), `branches/${A}/evaluations/e4`), evaluation()))
    await assertFails(setDoc(doc(db('coach@a.test'), `branches/${A}/evaluations/e5`), evaluation({ position: 'sitting' })))
    await assertFails(setDoc(doc(db('parent@a.test'), `branches/${A}/evaluations/e6`), evaluation()))
    await assertFails(deleteDoc(doc(db('parent@a.test'), `branches/${A}/evaluations/e1`)))
    await assertSucceeds(deleteDoc(doc(db('coach@a.test'), `branches/${A}/evaluations/e4`)))
    await assertSucceeds(deleteDoc(doc(db('admin@a.test'), `branches/${A}/evaluations/e1`)))
  })
})
