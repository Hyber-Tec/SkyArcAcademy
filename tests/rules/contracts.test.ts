import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type RulesTestEnvironment, assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

// The enrollment contract (docs/DECISIONS.md §23, F4): the blank contract's uploads and the signing links are owners'
// and admins' only; links are made and signed on the server, and admins cancel one still waiting.

let env: RulesTestEnvironment
const A = 'alpha-academy'
const ADMIN = 'admin@a.test'

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
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
const TEMPLATE_ID = 'T1234567890abcdefghi'

const template = (email: string, id: string, extra: Record<string, unknown> = {}) => ({
  name: 'Enrollment contract.pdf',
  size: 5,
  pages: 3,
  sha256: 'a'.repeat(64),
  path: `branches/${A}/contracts/templates/${id}.pdf`,
  current: true,
  uploadedAt: serverTimestamp(),
  uploadedBy: actor(email),
  ...extra,
})

const link = (extra: Record<string, unknown> = {}) => ({
  studentId: 's1',
  studentName: 'Student One',
  templateId: TEMPLATE_ID,
  templateName: 'Enrollment contract.pdf',
  token: 't'.repeat(43),
  status: 'sent',
  createdAt: Timestamp.now(),
  createdBy: actor(ADMIN),
  expiresAt: Timestamp.fromMillis(Date.now() + 30 * 86_400_000),
  emailedTo: [],
  emailedAt: null,
  signedAt: null,
  signer: null,
  fileId: null,
  fileName: null,
  canceledAt: null,
  canceledBy: null,
  ...extra,
})

const cancel = (email: string) => ({ status: 'canceled', canceledAt: serverTimestamp(), canceledBy: actor(email) })

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
    await setDoc(doc(d, `branches/${A}/members/coach@a.test`), member('coach@a.test', 'coach', { staffId: 'c1' }))
    await setDoc(doc(d, `branches/${A}/members/parent@a.test`), member('parent@a.test', 'parent', { studentIds: ['s1'] }))
    await setDoc(doc(d, `branches/${A}/contractTemplates/${TEMPLATE_ID}`), { ...template(ADMIN, TEMPLATE_ID), uploadedAt: Timestamp.now() })
    await setDoc(doc(d, `branches/${A}/contractLinks/waiting`), link())
    await setDoc(doc(d, `branches/${A}/contractLinks/done`), link({ status: 'signed', signedAt: Timestamp.now() }))
    await uploadBytes(ref(c.storage(), `branches/${A}/contracts/templates/${TEMPLATE_ID}.pdf`), PDF, { contentType: 'application/pdf' })
  })
})

describe('the blank contract', () => {
  it('only owners and admins read its uploads, and the PDFs', async () => {
    await assertSucceeds(getDoc(doc(db(ADMIN), `branches/${A}/contractTemplates/${TEMPLATE_ID}`)))
    await assertSucceeds(getDocs(query(collection(db('owner@a.test'), `branches/${A}/contractTemplates`), where('current', '==', true))))
    await assertFails(getDoc(doc(db('coach@a.test'), `branches/${A}/contractTemplates/${TEMPLATE_ID}`)))
    await assertFails(getDocs(collection(db('parent@a.test'), `branches/${A}/contractTemplates`)))
    await assertSucceeds(getBytes(ref(storage(ADMIN), `branches/${A}/contracts/templates/${TEMPLATE_ID}.pdf`)))
    await assertFails(getBytes(ref(storage('coach@a.test'), `branches/${A}/contracts/templates/${TEMPLATE_ID}.pdf`)))
    await assertFails(getBytes(ref(storage('parent@a.test'), `branches/${A}/contracts/templates/${TEMPLATE_ID}.pdf`)))
  })

  it('takes a new upload from owners and admins, as themselves, and retires the one before, for good', async () => {
    const id = 'U1234567890abcdefghi'
    const a = db(ADMIN)
    await assertSucceeds(uploadBytes(ref(storage(ADMIN), `branches/${A}/contracts/templates/${id}.pdf`), PDF, { contentType: 'application/pdf' }))
    await assertFails(uploadBytes(ref(storage(ADMIN), `branches/${A}/contracts/templates/${id}.pdf`), PDF, { contentType: 'application/pdf' }))
    await assertFails(uploadBytes(ref(storage(ADMIN), `branches/${A}/contracts/templates/V1234567890abcdefghi.pdf`), PDF, { contentType: 'text/html' }))
    await assertFails(uploadBytes(ref(storage('coach@a.test'), `branches/${A}/contracts/templates/W1234567890abcdefghi.pdf`), PDF, { contentType: 'application/pdf' }))
    await assertFails(deleteObject(ref(storage(ADMIN), `branches/${A}/contracts/templates/${TEMPLATE_ID}.pdf`)))
    await assertFails(setDoc(doc(a, `branches/${A}/contractTemplates/${id}`), template('someone@a.test', id)))
    await assertFails(setDoc(doc(a, `branches/${A}/contractTemplates/${id}`), template(ADMIN, id, { path: `branches/${A}/drive/x` })))
    await assertFails(setDoc(doc(a, `branches/${A}/contractTemplates/${id}`), template(ADMIN, id, { sha256: 'not a hash' })))
    await assertFails(setDoc(doc(db('coach@a.test'), `branches/${A}/contractTemplates/${id}`), template('coach@a.test', id)))
    await assertSucceeds(setDoc(doc(a, `branches/${A}/contractTemplates/${id}`), template(ADMIN, id)))
    await assertSucceeds(updateDoc(doc(a, `branches/${A}/contractTemplates/${TEMPLATE_ID}`), { current: false, replacedAt: serverTimestamp(), replacedBy: actor(ADMIN) }))
    await assertFails(updateDoc(doc(a, `branches/${A}/contractTemplates/${TEMPLATE_ID}`), { current: true }))
    await assertFails(updateDoc(doc(a, `branches/${A}/contractTemplates/${id}`), { name: 'Other.pdf' }))
    await assertFails(deleteDoc(doc(a, `branches/${A}/contractTemplates/${id}`)))
  })
})

describe('signing links', () => {
  it('only owners and admins read them', async () => {
    await assertSucceeds(getDocs(query(collection(db(ADMIN), `branches/${A}/contractLinks`), where('studentId', '==', 's1'))))
    await assertFails(getDoc(doc(db('coach@a.test'), `branches/${A}/contractLinks/waiting`)))
    await assertFails(getDocs(query(collection(db('parent@a.test'), `branches/${A}/contractLinks`), where('studentId', '==', 's1'))))
  })

  it('are made on the server; owners and admins cancel one still waiting, as themselves, and nothing else', async () => {
    const a = db(ADMIN)
    await assertFails(setDoc(doc(a, `branches/${A}/contractLinks/new`), link()))
    await assertFails(updateDoc(doc(a, `branches/${A}/contractLinks/waiting`), { ...cancel(ADMIN), token: 'x'.repeat(43) }))
    await assertFails(updateDoc(doc(a, `branches/${A}/contractLinks/waiting`), { ...cancel('someone@a.test') }))
    await assertFails(updateDoc(doc(a, `branches/${A}/contractLinks/waiting`), { status: 'signed' }))
    await assertFails(updateDoc(doc(db('coach@a.test'), `branches/${A}/contractLinks/waiting`), cancel('coach@a.test')))
    await assertFails(updateDoc(doc(a, `branches/${A}/contractLinks/done`), cancel(ADMIN)))
    await assertSucceeds(updateDoc(doc(a, `branches/${A}/contractLinks/waiting`), cancel(ADMIN)))
    await assertFails(deleteDoc(doc(a, `branches/${A}/contractLinks/done`)))
  })
})
