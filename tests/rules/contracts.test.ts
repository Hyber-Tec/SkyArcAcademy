import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type RulesTestEnvironment, assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

// The enrollment contract (docs/DECISIONS.md §23, F4, §31 and §33): owners and admins write the draft; the server
// publishes each version, and members read the current one (a parent signs it before using the app); the signing links
// are owners' and admins' only, made and signed on the server, and admins cancel one still waiting. Each student's
// signed contract is the family's to read; the server writes it, and owners and admins mark one signed on paper or
// remove it.

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
const actor = (email: string) => ({ uid: email.split('@')[0], email, name: email.split('@')[0] })
const TEMPLATE_ID = 'T1234567890abcdefghi'

const template = (email: string, extra: Record<string, unknown> = {}) => ({
  title: 'ENROLLMENT AGREEMENT',
  text: '# ENROLLMENT AGREEMENT\n[[sign: Parent Signature]]',
  sha256: 'a'.repeat(64),
  version: 2,
  current: true,
  publishedAt: Timestamp.now(),
  publishedBy: actor(email),
  ...extra,
})

const draft = (email: string, extra: Record<string, unknown> = {}) => ({ text: '# ENROLLMENT AGREEMENT\n[[sign: Parent Signature]]', updatedAt: serverTimestamp(), updatedBy: actor(email), ...extra })

const link = (extra: Record<string, unknown> = {}) => ({
  studentId: 's1',
  studentName: 'Student One',
  templateId: TEMPLATE_ID,
  templateName: 'ENROLLMENT AGREEMENT (version 2)',
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

const signedByServer = (studentId: string) => ({
  studentId,
  studentName: 'Student',
  via: 'app',
  signedAt: Timestamp.now(),
  signerName: 'Pat Parent',
  relation: 'parent',
  signerEmail: 'other@a.test',
  templateId: TEMPLATE_ID,
  templateName: 'ENROLLMENT AGREEMENT (version 2)',
  values: { 'selected-level': 'team' },
  fileId: 'f1',
  fileName: 'Student enrollment contract.pdf',
  linkId: null,
  markedBy: null,
  note: '',
})

const onPaper = (email: string, studentId: string, extra: Record<string, unknown> = {}) => ({
  studentId,
  studentName: 'Student One',
  via: 'paper',
  signedAt: serverTimestamp(),
  signerName: '',
  relation: null,
  signerEmail: null,
  templateId: null,
  templateName: null,
  fileId: null,
  fileName: null,
  linkId: null,
  markedBy: actor(email),
  note: 'Signed in September',
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
    await setDoc(doc(d, `branches/${A}/members/other@a.test`), member('other@a.test', 'parent', { studentIds: ['s2'] }))
    await setDoc(doc(d, `branches/${A}/members/kid@a.test`), member('kid@a.test', 'student', { studentId: 's1' }))
    await setDoc(doc(d, `branches/${A}/students/s1`), { name: 'Student One', status: 'enrolled' })
    await setDoc(doc(d, `branches/${A}/students/s2`), { name: 'Student Two', status: 'enrolled' })
    await setDoc(doc(d, `branches/${A}/contractTemplates/${TEMPLATE_ID}`), template(ADMIN))
    await setDoc(doc(d, `branches/${A}/contractTemplates/OLD4567890abcdefghij`), template(ADMIN, { version: 1, current: false }))
    await setDoc(doc(d, `branches/${A}/contractTemplates/draft`), { ...draft(ADMIN), updatedAt: Timestamp.now() })
    await setDoc(doc(d, `branches/${A}/signedContracts/s2`), signedByServer('s2'))
    await setDoc(doc(d, `branches/${A}/contractLinks/waiting`), link())
    await setDoc(doc(d, `branches/${A}/contractLinks/done`), link({ status: 'signed', signedAt: Timestamp.now() }))
  })
})

describe('the contract', () => {
  it('owners and admins read every version and the draft; members read the current one, nobody else', async () => {
    await assertSucceeds(getDoc(doc(db(ADMIN), `branches/${A}/contractTemplates/${TEMPLATE_ID}`)))
    await assertSucceeds(getDoc(doc(db(ADMIN), `branches/${A}/contractTemplates/OLD4567890abcdefghij`)))
    await assertSucceeds(getDoc(doc(db('owner@a.test'), `branches/${A}/contractTemplates/draft`)))
    await assertSucceeds(getDocs(query(collection(db('owner@a.test'), `branches/${A}/contractTemplates`), where('current', '==', true))))
    await assertSucceeds(getDocs(query(collection(db('parent@a.test'), `branches/${A}/contractTemplates`), where('current', '==', true))))
    await assertSucceeds(getDoc(doc(db('kid@a.test'), `branches/${A}/contractTemplates/${TEMPLATE_ID}`)))
    await assertFails(getDoc(doc(db('parent@a.test'), `branches/${A}/contractTemplates/OLD4567890abcdefghij`)))
    await assertFails(getDoc(doc(db('parent@a.test'), `branches/${A}/contractTemplates/draft`)))
    await assertFails(getDoc(doc(db('coach@a.test'), `branches/${A}/contractTemplates/draft`)))
    await assertFails(getDocs(collection(db('parent@a.test'), `branches/${A}/contractTemplates`)))
    await assertFails(getDoc(doc(db('stranger@b.test'), `branches/${A}/contractTemplates/${TEMPLATE_ID}`)))
  })

  it('takes the draft from owners and admins, as themselves, and nothing else', async () => {
    const a = db(ADMIN)
    const at = `branches/${A}/contractTemplates/draft`
    await assertSucceeds(setDoc(doc(a, at), draft(ADMIN)))
    await assertSucceeds(setDoc(doc(db('owner@a.test'), at), draft('owner@a.test', { text: '' })))
    await assertFails(setDoc(doc(a, at), draft('someone@a.test')))
    await assertFails(setDoc(doc(a, at), draft(ADMIN, { current: true })))
    await assertFails(setDoc(doc(a, at), draft(ADMIN, { text: 'x'.repeat(200_001) })))
    await assertFails(setDoc(doc(db('coach@a.test'), at), draft('coach@a.test')))
    await assertFails(setDoc(doc(db('parent@a.test'), at), draft('parent@a.test')))
    await assertFails(deleteDoc(doc(a, at)))
  })

  it('is published on the server only: nobody writes a version from the app', async () => {
    const a = db(ADMIN)
    await assertFails(setDoc(doc(a, `branches/${A}/contractTemplates/U1234567890abcdefghi`), template(ADMIN)))
    await assertFails(updateDoc(doc(a, `branches/${A}/contractTemplates/${TEMPLATE_ID}`), { current: false, replacedAt: serverTimestamp(), replacedBy: actor(ADMIN) }))
    await assertFails(updateDoc(doc(a, `branches/${A}/contractTemplates/${TEMPLATE_ID}`), { text: 'Other words' }))
    await assertFails(deleteDoc(doc(a, `branches/${A}/contractTemplates/${TEMPLATE_ID}`)))
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

describe('signed contracts', () => {
  it('the family reads their own; owners and admins read all; coaches none', async () => {
    await assertSucceeds(getDoc(doc(db('other@a.test'), `branches/${A}/signedContracts/s2`)))
    await assertSucceeds(getDoc(doc(db('parent@a.test'), `branches/${A}/signedContracts/s1`)))
    await assertSucceeds(getDoc(doc(db('kid@a.test'), `branches/${A}/signedContracts/s1`)))
    await assertFails(getDoc(doc(db('parent@a.test'), `branches/${A}/signedContracts/s2`)))
    await assertFails(getDoc(doc(db('kid@a.test'), `branches/${A}/signedContracts/s2`)))
    await assertFails(getDoc(doc(db('coach@a.test'), `branches/${A}/signedContracts/s2`)))
    await assertSucceeds(getDocs(collection(db(ADMIN), `branches/${A}/signedContracts`)))
  })

  it('owners and admins mark one signed on paper, as themselves; the rest is the server’s', async () => {
    const a = db(ADMIN)
    await assertFails(setDoc(doc(db('parent@a.test'), `branches/${A}/signedContracts/s1`), onPaper('parent@a.test', 's1')))
    await assertFails(setDoc(doc(db('parent@a.test'), `branches/${A}/signedContracts/s1`), { ...signedByServer('s1'), signerEmail: 'parent@a.test' }))
    await assertFails(setDoc(doc(a, `branches/${A}/signedContracts/s1`), onPaper('someone@a.test', 's1')))
    await assertFails(setDoc(doc(a, `branches/${A}/signedContracts/s1`), onPaper(ADMIN, 's1', { via: 'app' })))
    await assertFails(setDoc(doc(a, `branches/${A}/signedContracts/s1`), onPaper(ADMIN, 's2')))
    await assertFails(setDoc(doc(a, `branches/${A}/signedContracts/s1`), onPaper(ADMIN, 's1', { signerEmail: 'x@a.test' })))
    await assertFails(setDoc(doc(a, `branches/${A}/signedContracts/nobody`), onPaper(ADMIN, 'nobody')))
    await assertSucceeds(setDoc(doc(a, `branches/${A}/signedContracts/s1`), onPaper(ADMIN, 's1')))
    await assertFails(updateDoc(doc(a, `branches/${A}/signedContracts/s1`), { note: 'changed' }))
  })

  it('owners and admins remove one to ask again; nobody else', async () => {
    await assertFails(deleteDoc(doc(db('other@a.test'), `branches/${A}/signedContracts/s2`)))
    await assertFails(deleteDoc(doc(db('coach@a.test'), `branches/${A}/signedContracts/s2`)))
    await assertSucceeds(deleteDoc(doc(db(ADMIN), `branches/${A}/signedContracts/s2`)))
  })
})
