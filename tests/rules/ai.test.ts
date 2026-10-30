import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type RulesTestEnvironment, assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

// The AI page's platform-wide collections (shared/src/ai/types.ts): super admins read, Cloud Functions write, and the
// keys are never readable by a client.

let env: RulesTestEnvironment
const A = 'alpha-academy'
const SUPER = 'super@platform.test'
const SECOND = 'second@platform.test'

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

const ctx = (email: string, verified = true) => env.authenticatedContext(email.split('@')[0], { email, email_verified: verified })
const db = (email: string, verified = true) => ctx(email, verified).firestore()
const anon = () => env.unauthenticatedContext().firestore()
const by = { uid: 'super', email: SUPER, name: 'Super' }

// The academy's people, and someone signed in with no place anywhere: none of them is a super admin.
const academy = ['owner@a.test', 'admin@a.test', 'coach@a.test', 'parent@a.test', 'nobody@elsewhere.test']

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
    await setDoc(doc(d, `superAdmins/${SUPER}`), { email: SUPER, addedAt: new Date(), addedBy: by })
    await setDoc(doc(d, `superAdmins/${SECOND}`), { email: SECOND, addedAt: new Date(), addedBy: by })
    await setDoc(doc(d, 'aiConfig/main'), {
      features: { reportText: { provider: 'gemini', model: 'made-up-model', thinking: 'low', enabled: true } },
      providers: { gemini: { keyLast4: '1234', keySetAt: new Date(), keySetBy: by } },
      monthlyLimitUsd: 10,
      hourlyLimit: 30,
      prices: { 'made-up-model': { inputPerM: 0.1, outputPerM: 0.4 } },
      updatedAt: new Date(),
      updatedBy: by,
    })
    await setDoc(doc(d, 'aiConfig/public'), { reportText: true })
    await setDoc(doc(d, 'aiKeys/gemini'), { key: 'test-key-not-real-1234', setAt: new Date(), setBy: by })
    await setDoc(doc(d, 'aiUsage/u1'), { at: new Date(), feature: 'reportText', provider: 'gemini', model: 'made-up-model', costUsd: 0.0004, ok: true, by: { uid: 'o', email: 'owner@a.test', name: 'Owner' } })
    await setDoc(doc(d, 'aiChanges/c1'), { at: new Date(), by, action: 'key.set', provider: 'gemini', summary: 'Added a Google Gemini key', from: null, to: '…1234' })
    await setDoc(doc(d, 'aiLimits/someone'), { times: [Date.now()] })
  })
})

describe('super admins', () => {
  it('anyone signed in may ask whether they are one; only super admins see who is', async () => {
    await assertSucceeds(getDoc(doc(db(SUPER), `superAdmins/${SUPER}`)))
    await assertSucceeds(getDoc(doc(db(SUPER), `superAdmins/${SECOND}`)))
    await assertSucceeds(getDocs(collection(db(SUPER), 'superAdmins')))
    // The sign-in's email in any case: the document is the lower-case one.
    await assertSucceeds(getDoc(doc(db('Super@Platform.test'), `superAdmins/${SUPER}`)))
    for (const who of academy) {
      await assertSucceeds(getDoc(doc(db(who), `superAdmins/${who}`)))
      await assertFails(getDoc(doc(db(who), `superAdmins/${SUPER}`)))
      await assertFails(getDocs(collection(db(who), 'superAdmins')))
    }
  })

  it('needs a verified email, and a sign-in', async () => {
    await assertFails(getDoc(doc(db(SUPER, false), `superAdmins/${SUPER}`)))
    await assertFails(getDocs(collection(db(SUPER, false), 'superAdmins')))
    await assertFails(getDoc(doc(anon(), `superAdmins/${SUPER}`)))
  })

  it('nobody adds or removes one from a client, a super admin included (aiSetSuperAdmin does)', async () => {
    await assertFails(setDoc(doc(db(SUPER), 'superAdmins/new@platform.test'), { email: 'new@platform.test', addedAt: new Date(), addedBy: by }))
    await assertFails(updateDoc(doc(db(SUPER), `superAdmins/${SECOND}`), { email: SECOND }))
    await assertFails(deleteDoc(doc(db(SUPER), `superAdmins/${SECOND}`)))
    await assertFails(setDoc(doc(db('owner@a.test'), 'superAdmins/owner@a.test'), { email: 'owner@a.test', addedAt: new Date(), addedBy: by }))
  })

  it('gives no access to an academy’s data by being one', async () => {
    await assertFails(getDoc(doc(db(SUPER), `branches/${A}`)))
    await assertFails(getDocs(collection(db(SUPER), `branches/${A}/members`)))
  })
})

describe('the AI config', () => {
  it('super admins read the config; anyone signed in reads only which features are on', async () => {
    await assertSucceeds(getDoc(doc(db(SUPER), 'aiConfig/main')))
    await assertSucceeds(getDoc(doc(db(SUPER), 'aiConfig/public')))
    for (const who of academy) {
      await assertSucceeds(getDoc(doc(db(who), 'aiConfig/public')))
      await assertFails(getDoc(doc(db(who), 'aiConfig/main')))
    }
    await assertFails(getDoc(doc(anon(), 'aiConfig/public')))
    await assertFails(getDoc(doc(db(SUPER, false), 'aiConfig/main')))
    // Read by name only, never listed.
    await assertFails(getDocs(collection(db(SUPER), 'aiConfig')))
  })

  it('nobody writes it from a client (the functions do, with the history)', async () => {
    for (const who of [SUPER, 'owner@a.test']) {
      await assertFails(setDoc(doc(db(who), 'aiConfig/main'), { monthlyLimitUsd: null }))
      await assertFails(updateDoc(doc(db(who), 'aiConfig/main'), { monthlyLimitUsd: 1000 }))
      await assertFails(setDoc(doc(db(who), 'aiConfig/public'), { reportText: true }))
      await assertFails(deleteDoc(doc(db(who), 'aiConfig/public')))
    }
  })
})

describe('the keys', () => {
  it('are never read by a client, a super admin’s included', async () => {
    for (const d of [db(SUPER), db('owner@a.test'), db('admin@a.test'), anon()]) {
      await assertFails(getDoc(doc(d, 'aiKeys/gemini')))
      await assertFails(getDoc(doc(d, 'aiKeys/openai')))
      await assertFails(getDocs(collection(d, 'aiKeys')))
    }
  })

  it('are never written by a client', async () => {
    for (const d of [db(SUPER), db('owner@a.test'), anon()]) {
      await assertFails(setDoc(doc(d, 'aiKeys/gemini'), { key: 'test-key-other-5678' }))
      await assertFails(setDoc(doc(d, 'aiKeys/openai'), { key: 'test-key-other-5678' }))
      await assertFails(deleteDoc(doc(d, 'aiKeys/gemini')))
    }
  })
})

describe('the log of requests and the change history', () => {
  it('super admins read them, newest first', async () => {
    for (const col of ['aiUsage', 'aiChanges']) {
      await assertSucceeds(getDocs(query(collection(db(SUPER), col), orderBy('at', 'desc'), limit(50))))
      await assertSucceeds(getDoc(doc(db(SECOND), `${col}/${col === 'aiUsage' ? 'u1' : 'c1'}`)))
    }
  })

  it('nobody else reads them, and nobody writes them from a client', async () => {
    for (const col of ['aiUsage', 'aiChanges']) {
      const id = col === 'aiUsage' ? 'u1' : 'c1'
      for (const who of academy) {
        await assertFails(getDocs(collection(db(who), col)))
        await assertFails(getDoc(doc(db(who), `${col}/${id}`)))
      }
      await assertFails(getDocs(collection(anon(), col)))
      for (const who of [SUPER, 'owner@a.test']) {
        await assertFails(addDoc(collection(db(who), col), { at: new Date(), summary: 'Made up' }))
        await assertFails(updateDoc(doc(db(who), `${col}/${id}`), { summary: 'Changed' }))
        await assertFails(deleteDoc(doc(db(who), `${col}/${id}`)))
      }
    }
  })
})

describe('the hourly counts', () => {
  it('are server only', async () => {
    for (const d of [db(SUPER), db('owner@a.test'), anon()]) {
      await assertFails(getDoc(doc(d, 'aiLimits/someone')))
      await assertFails(setDoc(doc(d, 'aiLimits/someone'), { times: [] }))
    }
  })
})
