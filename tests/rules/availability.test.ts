import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type RulesTestEnvironment, assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { dayStartInstant } from '../../shared/src/availability'
import { addDays, todayKey } from '../../shared/src/time'

const B = 'alpha-academy'
const TZ = 'America/New_York'
let env: RulesTestEnvironment

const user = (email: string) => env.authenticatedContext(email.split('@')[0], { email, email_verified: true }).firestore()

function block(staffId: string, dateKey: string) {
  return {
    staffId,
    dateKey,
    weekday: 'monday',
    ranges: [{ startMin: 900, endMin: 1200 }],
    unavailable: false,
    hidden: false,
    dayStartAt: Timestamp.fromDate(dayStartInstant(dateKey, TZ)),
    updatedVia: 'coach',
  }
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-skyarc',
    firestore: { rules: readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(async () => env.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, `branches/${B}`), { name: B, status: 'active', timezone: TZ, settings: {} })
    const m = (email: string, role: string, staffId: string | null) => ({ email, role, status: 'active', staffId, restrictions: [] })
    await setDoc(doc(db, `branches/${B}/members/coach@a.test`), m('coach@a.test', 'coach', 's-coach'))
    await setDoc(doc(db, `branches/${B}/members/admin@a.test`), m('admin@a.test', 'admin', null))
    const near = addDays(todayKey(TZ), 2)
    await setDoc(doc(db, `branches/${B}/availability/s-coach_${near}`), block('s-coach', near))
  })
})

describe('availability lock', () => {
  const far = () => addDays(todayKey(TZ), 10)
  const near = () => addDays(todayKey(TZ), 2)

  it('coaches set their own availability outside the lock window', async () => {
    const d = far()
    await assertSucceeds(setDoc(doc(user('coach@a.test'), `branches/${B}/availability/s-coach_${d}`), block('s-coach', d)))
  })

  it('coaches cannot add, change or remove days inside the lock window', async () => {
    const d = addDays(todayKey(TZ), 3)
    const db = user('coach@a.test')
    await assertFails(setDoc(doc(db, `branches/${B}/availability/s-coach_${d}`), block('s-coach', d)))
    await assertFails(updateDoc(doc(db, `branches/${B}/availability/s-coach_${near()}`), { ranges: [] }))
    await assertFails(deleteDoc(doc(db, `branches/${B}/availability/s-coach_${near()}`)))
  })

  it('coaches cannot fake the day start or write for someone else', async () => {
    const d = near()
    const fake = { ...block('s-coach', d), dayStartAt: Timestamp.fromDate(dayStartInstant(far(), TZ)) }
    await assertFails(setDoc(doc(user('coach@a.test'), `branches/${B}/availability/s-coach_${d}x`), fake))
    await assertFails(setDoc(doc(user('coach@a.test'), `branches/${B}/availability/s-coach_${d}`), fake))
    const f = far()
    await assertFails(setDoc(doc(user('coach@a.test'), `branches/${B}/availability/s-other_${f}`), block('s-other', f)))
  })

  it('coaches mark a day not available, without times', async () => {
    const d = far()
    const db = user('coach@a.test')
    await assertSucceeds(setDoc(doc(db, `branches/${B}/availability/s-coach_${d}`), { ...block('s-coach', d), ranges: [], unavailable: true }))
    await assertFails(setDoc(doc(db, `branches/${B}/availability/s-coach_${d}`), { ...block('s-coach', d), unavailable: true }))
    await assertFails(setDoc(doc(db, `branches/${B}/availability/s-coach_${d}`), { ...block('s-coach', d), ranges: [], unavailable: 'yes' }))
  })

  it('admins change any day', async () => {
    await assertSucceeds(deleteDoc(doc(user('admin@a.test'), `branches/${B}/availability/s-coach_${near()}`)))
  })

  it('a blocking lead time extends the lock', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `branches/${B}`), { settings: { availability: { leadTimeEnforcement: 'block' } } })
    })
    const d = far() // 10 days < 14-day lead time
    await assertFails(setDoc(doc(user('coach@a.test'), `branches/${B}/availability/s-coach_${d}`), block('s-coach', d)))
  })
})
