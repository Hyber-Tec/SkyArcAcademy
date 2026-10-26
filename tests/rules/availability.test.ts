import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type RulesTestEnvironment, assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore'
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
    await setDoc(doc(db, `branches/${B}/members/other@a.test`), m('other@a.test', 'coach', 's-other'))
    await setDoc(doc(db, `branches/${B}/members/admin@a.test`), m('admin@a.test', 'admin', null))
    await setDoc(doc(db, `branches/${B}/members/parent@a.test`), { ...m('parent@a.test', 'parent', null), studentIds: ['s1'] })
    await setDoc(doc(db, `branches/${B}/members/student@a.test`), { ...m('student@a.test', 'student', null), studentId: 's1' })
    const near = addDays(todayKey(TZ), 2)
    const far = addDays(todayKey(TZ), 10)
    await setDoc(doc(db, `branches/${B}/availability/s-coach_${near}`), block('s-coach', near))
    await setDoc(doc(db, `branches/${B}/availability/s-other_${near}`), { ...block('s-other', near), staffName: 'Other Coach' })
    await setDoc(doc(db, `branches/${B}/availability/s-other_${far}`), { ...block('s-other', far), staffName: 'Other Coach' })
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

// Every coach in at a class's time teaches it, so coaches see each other's days.
describe('who’s in', () => {
  const near = () => addDays(todayKey(TZ), 2)
  const far = () => addDays(todayKey(TZ), 10)
  const days = (email: string) => collection(user(email), `branches/${B}/availability`)

  it('coaches read every coach’s days, to see who’s in with them', async () => {
    const db = user('coach@a.test')
    await assertSucceeds(getDoc(doc(db, `branches/${B}/availability/s-other_${near()}`)))
    await assertSucceeds(getDoc(doc(db, `branches/${B}/availability/s-coach_${near()}`)))
    await assertSucceeds(getDocs(days('coach@a.test')))
    await assertSucceeds(getDocs(query(days('coach@a.test'), where('dateKey', '==', near()))))
    await assertSucceeds(getDocs(query(days('coach@a.test'), where('staffId', '==', 's-other'))))
  })

  it('coaches still change only their own days', async () => {
    const db = user('coach@a.test')
    await assertFails(updateDoc(doc(db, `branches/${B}/availability/s-other_${far()}`), { ranges: [] }))
    await assertFails(updateDoc(doc(db, `branches/${B}/availability/s-other_${far()}`), { staffName: 'Someone Else' }))
    await assertFails(deleteDoc(doc(db, `branches/${B}/availability/s-other_${far()}`)))
    await assertSucceeds(deleteDoc(doc(user('other@a.test'), `branches/${B}/availability/s-other_${far()}`)))
  })

  it('a day carries its coach’s name', async () => {
    const d = far()
    await assertSucceeds(setDoc(doc(user('coach@a.test'), `branches/${B}/availability/s-coach_${d}`), { ...block('s-coach', d), staffName: 'Coach One' }))
    await assertSucceeds(updateDoc(doc(user('coach@a.test'), `branches/${B}/availability/s-coach_${d}`), { staffName: 'Coach Uno' }))
    await assertSucceeds(updateDoc(doc(user('admin@a.test'), `branches/${B}/availability/s-other_${near()}`), { staffName: 'Other C.' }))
  })

  it('families never read the coaches’ days', async () => {
    for (const who of ['parent@a.test', 'student@a.test']) {
      await assertFails(getDoc(doc(user(who), `branches/${B}/availability/s-coach_${near()}`)))
      await assertFails(getDocs(days(who)))
      await assertFails(getDocs(query(days(who), where('dateKey', '==', near()))))
    }
  })
})
