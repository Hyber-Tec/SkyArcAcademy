import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type RulesTestEnvironment, assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { Timestamp, collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
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

  it('coaches can only add time inside the lock window', async () => {
    const db = user('coach@a.test')
    const day = (d: string) => doc(db, `branches/${B}/availability/s-coach_${d}`)
    const r = (startMin: number, endMin: number) => ({ startMin, endMin })
    // Removing, shortening or moving time, or marking a day with times not available: an admin's to do.
    await assertFails(updateDoc(day(near()), { ranges: [] }))
    await assertFails(updateDoc(day(near()), { ranges: [r(900, 1000)] }))
    await assertFails(updateDoc(day(near()), { ranges: [r(960, 1260)] }))
    await assertFails(updateDoc(day(near()), { ranges: [], unavailable: true }))
    await assertFails(deleteDoc(day(near())))
    // A day with nothing can't be marked not available inside the lock either.
    const d = addDays(todayKey(TZ), 3)
    await assertFails(setDoc(day(d), { ...block('s-coach', d), ranges: [], unavailable: true }))
    // Adding: times on a day with none, a wider range, a new one (as saved, merged or not).
    await assertSucceeds(setDoc(day(d), block('s-coach', d)))
    await assertSucceeds(updateDoc(day(near()), { ranges: [r(840, 1260)] }))
    await assertSucceeds(updateDoc(day(near()), { ranges: [r(840, 1260), r(1260, 1320)] }))
    await assertSucceeds(updateDoc(day(near()), { ranges: [r(840, 1320)] }))
    await assertFails(updateDoc(day(near()), { ranges: [r(840, 1300)] }))
  })

  it('coaches add times to a day marked not available, and today, but not to a day that’s over', async () => {
    const db = user('coach@a.test')
    const today = todayKey(TZ)
    const yesterday = addDays(today, -1)
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `branches/${B}/availability/s-coach_${today}`), { ...block('s-coach', today), ranges: [], unavailable: true })
      await setDoc(doc(ctx.firestore(), `branches/${B}/availability/s-coach_${yesterday}`), block('s-coach', yesterday))
    })
    await assertSucceeds(setDoc(doc(db, `branches/${B}/availability/s-coach_${today}`), block('s-coach', today)))
    await assertFails(setDoc(doc(db, `branches/${B}/availability/s-coach_${yesterday}`), { ...block('s-coach', yesterday), ranges: [{ startMin: 840, endMin: 1260 }] }))
  })

  it('an add inside the lock keeps an undo, which puts back exactly the day before', async () => {
    const db = user('coach@a.test')
    const ref = doc(db, `branches/${B}/availability/s-coach_${near()}`)
    const before = { ranges: [{ startMin: 900, endMin: 1200 }], unavailable: false }
    const added = { ...block('s-coach', near()), ranges: [{ startMin: 900, endMin: 1260 }] }
    // The undo must be the day as it was, stamped by the server.
    await assertFails(setDoc(ref, { ...added, undo: { ranges: [], unavailable: false, at: serverTimestamp() } }))
    await assertFails(setDoc(ref, { ...added, undo: { ...before, at: Timestamp.now() } }))
    await assertSucceeds(setDoc(ref, { ...added, undo: { ...before, at: serverTimestamp() } }))
    // Only the day as it was, and without keeping the undo.
    await assertFails(updateDoc(ref, { ranges: [], undo: deleteField() }))
    await assertFails(updateDoc(ref, { ranges: before.ranges }))
    await assertSucceeds(updateDoc(ref, { ranges: before.ranges, unavailable: false, undo: deleteField() }))
    // Once undone, it's gone.
    await assertFails(updateDoc(ref, { ranges: [] }))
  })

  it('the undo lasts 15 seconds', async () => {
    const db = user('coach@a.test')
    const d = addDays(todayKey(TZ), 3)
    const ago = (s: number) => Timestamp.fromMillis(Date.now() - s * 1000)
    const added = (seconds: number) => ({ ...block('s-coach', d), undo: { ranges: [], unavailable: false, at: ago(seconds) } })
    const write = (data: object) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `branches/${B}/availability/s-coach_${d}`), data))
    const ref = doc(db, `branches/${B}/availability/s-coach_${d}`)
    // An add to a day with no record: its undo removes the record.
    await write(added(30))
    await assertFails(deleteDoc(ref))
    await write(added(5))
    await assertSucceeds(deleteDoc(ref))
    // An add to a day with times: put back within the window, not after.
    await write({ ...block('s-coach', d), ranges: [{ startMin: 840, endMin: 1260 }], undo: { ranges: [{ startMin: 900, endMin: 1200 }], unavailable: false, at: ago(20) } })
    await assertFails(updateDoc(ref, { ranges: [{ startMin: 900, endMin: 1200 }], undo: deleteField() }))
    await write({ ...block('s-coach', d), ranges: [{ startMin: 840, endMin: 1260 }], undo: { ranges: [{ startMin: 900, endMin: 1200 }], unavailable: false, at: ago(3) } })
    await assertSucceeds(updateDoc(ref, { ranges: [{ startMin: 900, endMin: 1200 }], undo: deleteField() }))
  })

  it('coaches never write an undo of their own outside the lock', async () => {
    const d = far()
    const ref = doc(user('coach@a.test'), `branches/${B}/availability/s-coach_${d}`)
    await assertFails(setDoc(ref, { ...block('s-coach', d), undo: { ranges: [], unavailable: false, at: Timestamp.fromMillis(Date.now() + 864e5) } }))
    await assertSucceeds(setDoc(ref, block('s-coach', d)))
    await assertSucceeds(updateDoc(ref, { ranges: [] }))
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

  it('admins change any day, inside the lock too', async () => {
    const db = user('admin@a.test')
    await assertSucceeds(updateDoc(doc(db, `branches/${B}/availability/s-coach_${near()}`), { ranges: [{ startMin: 960, endMin: 1020 }] }))
    await assertSucceeds(updateDoc(doc(db, `branches/${B}/availability/s-coach_${near()}`), { ranges: [], unavailable: true }))
    await assertSucceeds(deleteDoc(doc(db, `branches/${B}/availability/s-coach_${near()}`)))
  })

  it('a blocking lead time extends the lock', async () => {
    const lead = (leadTimeDays?: number) =>
      env.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), `branches/${B}`), { settings: { availability: { leadTimeEnforcement: 'block', ...(leadTimeDays ? { leadTimeDays } : {}) } } })
      })
    const d = far()
    const ref = doc(user('coach@a.test'), `branches/${B}/availability/s-coach_${d}`)
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `branches/${B}/availability/s-coach_${d}`), block('s-coach', d)))
    // The default notice is the week the lock already covers: day 10 stays free.
    await lead()
    await assertSucceeds(updateDoc(ref, { ranges: [{ startMin: 900, endMin: 1000 }] }))
    // A 14-day notice locks day 10 too: time can be added, not removed.
    await lead(14)
    await assertFails(updateDoc(ref, { ranges: [] }))
    await assertSucceeds(updateDoc(ref, { ranges: [{ startMin: 900, endMin: 1100 }] }))
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
