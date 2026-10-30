import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type RulesTestEnvironment, assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore'
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// Folders only owners and admins see (docs/DECISIONS.md §23, F6 and F5): coaches never read, list or change them, what's
// in them, or their files' bytes; only admins make something theirs; what's in a folder of theirs is theirs; a
// student's folder, and the Contracts folders (each student's, and the one from before at the top), keep their own.

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

const ctx = (email: string) => env.authenticatedContext(email.split('@')[0], { email, email_verified: true })
const db = (email: string) => ctx(email).firestore()
const storage = (email: string) => ctx(email).storage()
const actor = (email: string) => ({ uid: email.split('@')[0], email, name: email.split('@')[0] })

const ADMIN = 'admin@a.test'
const COACH = 'coach@a.test'
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46])

const folderRecord = (email: string, extra: Record<string, unknown> = {}) => ({
  name: 'Folder',
  parentId: null,
  studentId: null,
  createdAt: serverTimestamp(),
  createdBy: actor(email),
  ...extra,
})

const fileRecord = (email: string, extra: Record<string, unknown> = {}) => ({
  name: 'Notes.pdf',
  size: 4,
  kind: 'pdf',
  mime: 'application/pdf',
  status: 'uploading',
  folderId: null,
  studentId: null,
  uploadedAt: serverTimestamp(),
  uploadedBy: actor(email),
  ...extra,
})

const folders = (email: string) => collection(db(email), `branches/${A}/driveFolders`)
const files = (email: string) => collection(db(email), `branches/${A}/driveFiles`)

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
    await setDoc(doc(d, `branches/${A}`), { name: A, status: 'active', timezone: 'America/New_York', settings: {} })
    await setDoc(doc(d, `branches/${A}/members/${ADMIN}`), member(ADMIN, 'admin'))
    await setDoc(doc(d, `branches/${A}/members/owner@a.test`), member('owner@a.test', 'owner'))
    await setDoc(doc(d, `branches/${A}/members/${COACH}`), member(COACH, 'coach', { staffId: 'c1' }))
    await setDoc(doc(d, `branches/${A}/members/parent@a.test`), member('parent@a.test', 'parent', { studentIds: ['s1'] }))
    const put = (path: string, data: Record<string, unknown>) => setDoc(doc(d, `branches/${A}/${path}`), data)
    // Everyone's on staff: a student's folder (no access: from before), "Open" and its memo.
    await put('driveFolders/student-s1', { name: 'Student One', parentId: null, studentId: 's1', createdAt: null, createdBy: actor(ADMIN) })
    await put('driveFolders/open', { ...folderRecord(ADMIN, { name: 'Open', access: 'staff' }), createdAt: null })
    await put('driveFiles/memo', { ...fileRecord(ADMIN, { folderId: 'open', access: 'staff', status: 'ready' }), uploadedAt: null })
    await put('driveFiles/result', { ...fileRecord(ADMIN, { folderId: 'student-s1', studentId: 's1', evaluationId: 'e1', status: 'ready' }), uploadedAt: null })
    // Owners' and admins': "Office", a folder in it and a file, and the Contracts folder with a signed copy.
    await put('driveFolders/office', { ...folderRecord(ADMIN, { name: 'Office', access: 'admins' }), createdAt: null })
    await put('driveFolders/inner', { ...folderRecord(ADMIN, { name: 'Inner', parentId: 'office', access: 'admins' }), createdAt: null })
    await put('driveFiles/secret', { ...fileRecord(ADMIN, { folderId: 'office', access: 'admins', status: 'ready' }), uploadedAt: null })
    await put('driveFolders/contracts', { ...folderRecord(ADMIN, { name: 'Contracts', access: 'admins' }), createdAt: null })
    await put('driveFiles/signed', { ...fileRecord(ADMIN, { folderId: 'contracts', access: 'admins', status: 'ready' }), uploadedAt: null })
  })
  await env.withSecurityRulesDisabled(async (c) => {
    for (const f of ['memo', 'secret', 'signed']) await uploadBytes(ref(c.storage(), `branches/${A}/drive/${f}`), PDF, { contentType: 'application/pdf' })
  })
})

describe('what coaches see', () => {
  it('never reads a folder or file only owners and admins see, but reads the rest (and learns a folder isn’t there)', async () => {
    await assertFails(getDoc(doc(db(COACH), `branches/${A}/driveFolders/office`)))
    await assertFails(getDoc(doc(db(COACH), `branches/${A}/driveFolders/contracts`)))
    await assertFails(getDoc(doc(db(COACH), `branches/${A}/driveFiles/secret`)))
    await assertFails(getDoc(doc(db(COACH), `branches/${A}/driveFiles/signed`)))
    await assertSucceeds(getDoc(doc(db(COACH), `branches/${A}/driveFolders/open`)))
    await assertSucceeds(getDoc(doc(db(COACH), `branches/${A}/driveFolders/student-s1`)))
    await assertSucceeds(getDoc(doc(db(COACH), `branches/${A}/driveFiles/memo`)))
    // The phone app asks whether a student's folder is there yet before its first scan.
    await assertSucceeds(getDoc(doc(db(COACH), `branches/${A}/driveFolders/student-s9`)))
    await assertSucceeds(getDoc(doc(db(ADMIN), `branches/${A}/driveFolders/office`)))
    await assertSucceeds(getDoc(doc(db(ADMIN), `branches/${A}/driveFiles/signed`)))
  })

  it('lists only what’s everyone’s on staff, asked for as such (or one student’s files)', async () => {
    await assertFails(getDocs(folders(COACH)))
    await assertFails(getDocs(files(COACH)))
    await assertSucceeds(getDocs(query(folders(COACH), where('access', '==', 'staff'))))
    await assertSucceeds(getDocs(query(files(COACH), where('access', '==', 'staff'))))
    await assertFails(getDocs(query(files(COACH), where('access', '==', 'admins'))))
    // The phone app's student page lists one student's files: a student's are all everyone's on staff.
    await assertSucceeds(getDocs(query(files(COACH), where('studentId', '==', 's1'))))
    await assertSucceeds(getDocs(folders(ADMIN)))
    await assertSucceeds(getDocs(files(ADMIN)))
    await assertFails(getDocs(query(files('parent@a.test'), where('access', '==', 'staff'))))
  })

  it('never changes, trashes or removes theirs, nor adds or moves anything into a folder of theirs', async () => {
    const c = db(COACH)
    await assertFails(updateDoc(doc(c, `branches/${A}/driveFiles/secret`), { name: 'x.pdf' }))
    await assertFails(updateDoc(doc(c, `branches/${A}/driveFolders/office`), { name: 'Mine' }))
    await assertFails(updateDoc(doc(c, `branches/${A}/driveFolders/office`), { access: 'staff' }))
    await assertFails(updateDoc(doc(c, `branches/${A}/driveFiles/secret`), { trashed: true }))
    await assertFails(setDoc(doc(c, `branches/${A}/driveFiles/new1`), fileRecord(COACH, { folderId: 'office' })))
    await assertFails(setDoc(doc(c, `branches/${A}/driveFiles/new2`), fileRecord(COACH, { folderId: 'office', access: 'admins' })))
    await assertFails(setDoc(doc(c, `branches/${A}/driveFolders/new3`), folderRecord(COACH, { access: 'admins' })))
    await assertFails(setDoc(doc(c, `branches/${A}/driveFolders/new4`), folderRecord(COACH, { parentId: 'office' })))
    await assertFails(updateDoc(doc(c, `branches/${A}/driveFiles/memo`), { folderId: 'office' }))
    await assertFails(updateDoc(doc(c, `branches/${A}/driveFiles/memo`), { folderId: 'office', access: 'admins' }))
    await assertFails(updateDoc(doc(c, `branches/${A}/driveFiles/memo`), { access: 'admins' }))
    // Their own, everyone's on staff: as before.
    await assertSucceeds(updateDoc(doc(c, `branches/${A}/driveFiles/memo`), { name: 'Memo.pdf', folderId: null }))
    await assertSucceeds(setDoc(doc(c, `branches/${A}/driveFolders/mine`), folderRecord(COACH, { parentId: 'open', access: 'staff' })))
  })
})

describe('what admins do', () => {
  it('make folders theirs, and what’s in a folder of theirs is theirs too', async () => {
    const a = db(ADMIN)
    await assertSucceeds(setDoc(doc(a, `branches/${A}/driveFolders/n1`), folderRecord(ADMIN, { access: 'admins' })))
    await assertSucceeds(setDoc(doc(a, `branches/${A}/driveFolders/n2`), folderRecord(ADMIN, { parentId: 'office', access: 'admins' })))
    await assertFails(setDoc(doc(a, `branches/${A}/driveFolders/n3`), folderRecord(ADMIN, { parentId: 'office', access: 'staff' })))
    await assertFails(setDoc(doc(a, `branches/${A}/driveFolders/n4`), folderRecord(ADMIN, { parentId: 'office' })))
    await assertSucceeds(setDoc(doc(a, `branches/${A}/driveFiles/f1`), fileRecord(ADMIN, { folderId: 'office', access: 'admins' })))
    await assertFails(setDoc(doc(a, `branches/${A}/driveFiles/f2`), fileRecord(ADMIN, { folderId: 'office', access: 'staff' })))
    // Without access (the phone app's, until it writes it): everyone's on staff, so never in a folder of theirs.
    await assertFails(setDoc(doc(a, `branches/${A}/driveFiles/f3`), fileRecord(ADMIN, { folderId: 'office' })))
    await assertFails(setDoc(doc(a, `branches/${A}/driveFiles/f4`), fileRecord(ADMIN, { access: 'everyone' })))
    // Nothing lands in a folder that isn't there.
    await assertFails(updateDoc(doc(a, `branches/${A}/driveFiles/memo`), { folderId: 'nowhere' }))
  })

  it('move things in (they become theirs) and out (everyone’s on staff again), never leaving them open inside', async () => {
    const a = db(ADMIN)
    await assertFails(updateDoc(doc(a, `branches/${A}/driveFiles/memo`), { folderId: 'office' }))
    await assertSucceeds(updateDoc(doc(a, `branches/${A}/driveFiles/memo`), { folderId: 'office', access: 'admins' }))
    await assertSucceeds(updateDoc(doc(a, `branches/${A}/driveFiles/secret`), { folderId: null, access: 'staff' }))
    await assertFails(updateDoc(doc(a, `branches/${A}/driveFolders/open`), { parentId: 'office' }))
    // A folder and what's in it, in one batch.
    const batch = writeBatch(a)
    batch.update(doc(a, `branches/${A}/driveFiles/memo`), { access: 'admins' })
    batch.update(doc(a, `branches/${A}/driveFolders/open`), { parentId: 'office', access: 'admins' })
    await assertSucceeds(batch.commit())
  })

  it('open a folder of theirs to everyone on staff, top first', async () => {
    const a = db(ADMIN)
    await assertFails(updateDoc(doc(a, `branches/${A}/driveFolders/inner`), { access: 'staff' }))
    const batch = writeBatch(a)
    batch.update(doc(a, `branches/${A}/driveFolders/office`), { access: 'staff' })
    batch.update(doc(a, `branches/${A}/driveFolders/inner`), { access: 'staff' })
    batch.update(doc(a, `branches/${A}/driveFiles/secret`), { access: 'staff' })
    await assertSucceeds(batch.commit())
    await assertSucceeds(getDoc(doc(db(COACH), `branches/${A}/driveFiles/secret`)))
  })

  it('keep a student’s folder, and what’s in it, everyone’s on staff', async () => {
    const a = db(ADMIN)
    await assertFails(updateDoc(doc(a, `branches/${A}/driveFolders/student-s1`), { access: 'admins' }))
    await assertFails(setDoc(doc(a, `branches/${A}/driveFolders/student-s2`), folderRecord(ADMIN, { studentId: 's2', access: 'admins' })))
    await assertFails(setDoc(doc(a, `branches/${A}/driveFolders/n5`), folderRecord(ADMIN, { parentId: 'student-s1', access: 'admins' })))
    await assertFails(updateDoc(doc(a, `branches/${A}/driveFiles/result`), { access: 'admins' }))
    await assertFails(setDoc(doc(a, `branches/${A}/driveFiles/f5`), fileRecord(ADMIN, { folderId: 'office', studentId: 's1', access: 'admins' })))
  })

  it('keep the Contracts folder from before theirs, at the top and out of the Trash, and never make it again', async () => {
    const a = db(ADMIN)
    await assertFails(updateDoc(doc(a, `branches/${A}/driveFolders/contracts`), { access: 'staff' }))
    await assertFails(updateDoc(doc(a, `branches/${A}/driveFolders/contracts`), { parentId: 'open' }))
    await assertFails(updateDoc(doc(a, `branches/${A}/driveFolders/contracts`), { trashed: true }))
    await assertFails(deleteDoc(doc(a, `branches/${A}/driveFolders/contracts`)))
    // Its Updated still moves while it holds contracts (until scripts/contracts-to-students.ts empties it).
    await assertSucceeds(updateDoc(doc(a, `branches/${A}/driveFolders/contracts`), { updatedAt: serverTimestamp(), updatedBy: actor(ADMIN) }))
    // Once it's gone, nobody makes it again: each student has their own.
    await env.withSecurityRulesDisabled((c) => deleteDoc(doc(c.firestore(), `branches/${A}/driveFolders/contracts`)))
    await assertFails(setDoc(doc(a, `branches/${A}/driveFolders/contracts`), folderRecord(ADMIN, { name: 'Contracts' })))
    await assertFails(setDoc(doc(a, `branches/${A}/driveFolders/contracts`), folderRecord(ADMIN, { name: 'Contracts', access: 'admins' })))
  })
})

describe('a student’s Contracts folder', () => {
  const contracts = (email: string, extra: Record<string, unknown> = {}) => folderRecord(email, { name: 'Contracts', parentId: 'student-s1', access: 'admins', ...extra })
  const putContracts = () => env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), `branches/${A}/driveFolders/contracts-s1`), { ...contracts(ADMIN), createdAt: null }))

  it('is made by owners and admins only, right in its student’s folder, as theirs', async () => {
    const a = db(ADMIN)
    await assertFails(setDoc(doc(db(COACH), `branches/${A}/driveFolders/contracts-s1`), contracts(COACH)))
    await assertFails(setDoc(doc(db(COACH), `branches/${A}/driveFolders/contracts-s1`), contracts(COACH, { access: 'staff' })))
    await assertFails(setDoc(doc(a, `branches/${A}/driveFolders/contracts-s1`), contracts(ADMIN, { access: 'staff' })))
    await assertFails(setDoc(doc(a, `branches/${A}/driveFolders/contracts-s1`), contracts(ADMIN, { parentId: null })))
    await assertFails(setDoc(doc(a, `branches/${A}/driveFolders/contracts-s1`), contracts(ADMIN, { parentId: 'open' })))
    await assertFails(setDoc(doc(a, `branches/${A}/driveFolders/contracts-s1`), contracts(ADMIN, { studentId: 's1' })))
    await assertFails(setDoc(doc(a, `branches/${A}/driveFolders/contracts-s1`), contracts(ADMIN, { trashed: true })))
    // Another student's Contracts folder doesn't go in this student's folder.
    await assertFails(setDoc(doc(a, `branches/${A}/driveFolders/contracts-s2`), contracts(ADMIN)))
    // It's the only folder right in a student's folder that isn't everyone's on staff.
    await assertFails(setDoc(doc(a, `branches/${A}/driveFolders/n6`), contracts(ADMIN)))
    await assertSucceeds(setDoc(doc(a, `branches/${A}/driveFolders/contracts-s1`), contracts(ADMIN)))
  })

  it('stays theirs, in the student’s folder and out of the Trash', async () => {
    await putContracts()
    const a = db(ADMIN)
    const folder = doc(a, `branches/${A}/driveFolders/contracts-s1`)
    await assertFails(updateDoc(folder, { access: 'staff' }))
    await assertFails(updateDoc(folder, { parentId: null }))
    await assertFails(updateDoc(folder, { parentId: 'open' }))
    await assertFails(updateDoc(folder, { trashed: true }))
    await assertFails(deleteDoc(folder))
    await assertFails(updateDoc(doc(db(COACH), `branches/${A}/driveFolders/contracts-s1`), { name: 'Mine' }))
    // Its Updated moves when something lands in it.
    await assertSucceeds(updateDoc(folder, { updatedAt: serverTimestamp(), updatedBy: actor(ADMIN) }))
  })

  it('is never seen by coaches, nor what’s in it, and a coach’s list of the student’s files never finds it', async () => {
    await putContracts()
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), `branches/${A}/driveFiles/s1-signed`), { ...fileRecord(ADMIN, { folderId: 'contracts-s1', access: 'admins', status: 'ready' }), uploadedAt: null })
      await uploadBytes(ref(c.storage(), `branches/${A}/drive/s1-signed`), PDF, { contentType: 'application/pdf' })
    })
    const c = db(COACH)
    await assertFails(getDoc(doc(c, `branches/${A}/driveFolders/contracts-s1`)))
    await assertFails(getDoc(doc(c, `branches/${A}/driveFiles/s1-signed`)))
    await assertFails(getBytes(ref(storage(COACH), `branches/${A}/drive/s1-signed`)))
    // The phone's student page lists one student's files: the contract isn't one of them.
    const theirs = await assertSucceeds(getDocs(query(files(COACH), where('studentId', '==', 's1'))))
    expect(theirs.docs.map((d) => d.id)).toEqual(['result'])
    const open = await assertSucceeds(getDocs(query(folders(COACH), where('access', '==', 'staff'))))
    expect(open.docs.map((d) => d.id)).not.toContain('contracts-s1')
    await assertSucceeds(getDoc(doc(db(ADMIN), `branches/${A}/driveFiles/s1-signed`)))
    await assertSucceeds(getBytes(ref(storage('owner@a.test'), `branches/${A}/drive/s1-signed`)))
    await assertFails(getBytes(ref(storage('parent@a.test'), `branches/${A}/drive/s1-signed`)))
    // Filed as the student's (with their studentId), a coach's list would find it: the rules refuse that.
    await assertFails(setDoc(doc(db(ADMIN), `branches/${A}/driveFiles/f6`), fileRecord(ADMIN, { folderId: 'contracts-s1', studentId: 's1', access: 'admins' })))
  })

  it('takes what owners and admins add or move in, as theirs and no student’s; coaches add nothing', async () => {
    await putContracts()
    const a = db(ADMIN)
    // A paper contract the office adds.
    await assertSucceeds(setDoc(doc(a, `branches/${A}/driveFiles/paper`), fileRecord(ADMIN, { folderId: 'contracts-s1', access: 'admins' })))
    await assertFails(setDoc(doc(a, `branches/${A}/driveFiles/paper2`), fileRecord(ADMIN, { folderId: 'contracts-s1', access: 'staff' })))
    // A file of the student's moved in stops being the student's.
    await assertFails(updateDoc(doc(a, `branches/${A}/driveFiles/result`), { folderId: 'contracts-s1', access: 'admins' }))
    await assertSucceeds(updateDoc(doc(a, `branches/${A}/driveFiles/result`), { folderId: 'contracts-s1', studentId: null, evaluationId: null, access: 'admins' }))
    await assertFails(setDoc(doc(db(COACH), `branches/${A}/driveFiles/c1`), fileRecord(COACH, { folderId: 'contracts-s1' })))
    await assertFails(updateDoc(doc(db(COACH), `branches/${A}/driveFiles/memo`), { folderId: 'contracts-s1' }))
  })
})

describe('what the phone app writes until it writes access', () => {
  it('scans a card into a student’s folder, as everyone’s on staff', async () => {
    const c = db(COACH)
    const batch = writeBatch(c)
    batch.update(doc(c, `branches/${A}/driveFolders/student-s1`), { updatedAt: serverTimestamp(), updatedBy: actor(COACH) })
    batch.set(doc(c, `branches/${A}/driveFiles/card`), fileRecord(COACH, { folderId: 'student-s1', studentId: 's1', evaluationId: 'e2', name: 'card.jpg', kind: 'jpg', mime: 'image/jpeg' }))
    await assertSucceeds(batch.commit())
    // A new student's folder and its first card, together.
    const second = writeBatch(c)
    second.set(doc(c, `branches/${A}/driveFolders/student-s2`), folderRecord(COACH, { name: 'Student Two', studentId: 's2' }))
    second.set(doc(c, `branches/${A}/driveFiles/card2`), fileRecord(COACH, { folderId: 'student-s2', studentId: 's2' }))
    await assertSucceeds(second.commit())
    await assertSucceeds(updateDoc(doc(c, `branches/${A}/driveFiles/card`), { status: 'ready' }))
  })
})

describe('the bytes', () => {
  it('only owners and admins read theirs; families read their child’s results as before', async () => {
    await assertFails(getBytes(ref(storage(COACH), `branches/${A}/drive/secret`)))
    await assertFails(getBytes(ref(storage(COACH), `branches/${A}/drive/signed`)))
    await assertSucceeds(getBytes(ref(storage(COACH), `branches/${A}/drive/memo`)))
    await assertSucceeds(getBytes(ref(storage(ADMIN), `branches/${A}/drive/secret`)))
    await assertSucceeds(getBytes(ref(storage('owner@a.test'), `branches/${A}/drive/signed`)))
    await assertFails(getBytes(ref(storage('parent@a.test'), `branches/${A}/drive/signed`)))
  })

  it('only owners and admins upload or clear theirs', async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), `branches/${A}/driveFiles/up`), { ...fileRecord(ADMIN, { folderId: 'office', access: 'admins' }) })
      await setDoc(doc(c.firestore(), `branches/${A}/driveFiles/bad`), { ...fileRecord(ADMIN, { folderId: 'office', access: 'admins', status: 'error' }) })
      await uploadBytes(ref(c.storage(), `branches/${A}/drive/bad`), PDF, { contentType: 'application/pdf' })
    })
    await assertFails(uploadBytes(ref(storage(COACH), `branches/${A}/drive/up`), PDF, { contentType: 'application/pdf' }))
    await assertSucceeds(uploadBytes(ref(storage(ADMIN), `branches/${A}/drive/up`), PDF, { contentType: 'application/pdf' }))
    await assertFails(deleteObject(ref(storage(COACH), `branches/${A}/drive/bad`)))
    await assertSucceeds(deleteObject(ref(storage(ADMIN), `branches/${A}/drive/bad`)))
  })
})
