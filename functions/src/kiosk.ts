import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { type DocumentSnapshot, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { KIOSK_LATE_MS, type KioskAutoOut, type KioskOp, type KioskPlan, type KioskShiftState, planKioskOp } from '@shared/kiosk/ops'
import type { KioskOpResult, KioskServerState } from '@shared/kiosk/tablet'
import { type PayClass, autoClockOutAt } from '@shared/pay/paidTime'
import { COL, ROOT } from '@shared/paths'
import { resolveSettings } from '@shared/settings/resolve'
import { dateKeyOf, formatMinutes, minutesOf, todayKey } from '@shared/time'
import type { BranchSettings } from '@shared/settings/defaults'
import type { Availability, Branch } from '@shared/types'
import { db } from './app'

/**
 * The kiosk tablet (`kiosk/`, docs/kiosk/): a tablet at the front desk where coaches clock in and out with their PIN,
 * with nobody signed in (docs/DECISIONS.md §6, Q9). An admin sets a setup PIN on the website; typing it on a tablet
 * registers that tablet, which then syncs with `kioskSync`: it sends the clock-ins and clock-outs it recorded, with or
 * without the internet, and gets back who can clock in (their PINs as fingerprints only) and who's in now.
 */

const base = (branchId: string) => `${ROOT.branches}/${branchId}`
/** The setup PIN: 4 to 8 digits. Five wrong tries lock it for 15 minutes. */
const SETUP_PIN = /^\d{4,8}$/
const MAX_TRIES = 5
const LOCK_MS = 15 * 60_000
/** At most this many ops in one sync (a tablet offline for days sends the rest at the next). */
const MAX_OPS = 200

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const scrypt = (pin: string, salt: string) => scryptSync(pin, salt, 32).toString('hex')
function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex')
  const y = Buffer.from(b, 'hex')
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y)
}

interface Caller {
  uid: string
  email: string
  name: string
  role: 'owner' | 'admin'
}

async function requireAdmin(branchId: string, auth: { uid: string; token: Record<string, unknown> } | undefined): Promise<Caller> {
  if (!auth || typeof auth.token.email !== 'string' || auth.token.email_verified !== true) throw new HttpsError('unauthenticated', 'Sign in first.')
  const email = (auth.token.email as string).toLowerCase()
  const m = (await db.doc(`${base(branchId)}/${COL.members}/${email}`).get()).data()
  if (!m || m.status !== 'active' || (m.role !== 'owner' && m.role !== 'admin')) throw new HttpsError('permission-denied', 'Only the academy’s admins can do this.')
  return { uid: auth.uid, email, name: (m.displayName as string) || (auth.token.name as string) || email, role: m.role }
}

function audit(branchId: string, entry: Record<string, unknown>) {
  return db.collection(`${base(branchId)}/${COL.auditLog}`).add({
    at: FieldValue.serverTimestamp(),
    actorUid: 'system',
    actorEmail: 'system',
    actorName: 'System',
    actorRole: 'system',
    context: '',
    dateKey: null,
    studentId: null,
    studentName: null,
    coachId: null,
    coachName: null,
    changes: [],
    via: 'kiosk',
    category: 'pay',
    ...entry,
  })
}

const actor = (c: Caller) => ({ actorUid: c.uid, actorEmail: c.email, actorName: c.name, actorRole: c.role, via: 'web' })

/** An admin sets the setup PIN that registers kiosk tablets (stored only as a salted hash). */
export const kioskSetupPin = onCall(async (req) => {
  const { branchId, pin } = (req.data ?? {}) as { branchId?: string; pin?: string }
  if (!branchId) throw new HttpsError('invalid-argument', 'Missing academy.')
  const caller = await requireAdmin(branchId, req.auth)
  if (typeof pin !== 'string' || !SETUP_PIN.test(pin)) throw new HttpsError('invalid-argument', 'The setup PIN is 4 to 8 digits.')
  const salt = randomBytes(16).toString('hex')
  const batch = db.batch()
  batch.set(db.doc(`${base(branchId)}/${COL.kioskSetup}/pin`), { salt, hash: scrypt(pin, salt), failures: 0, lockedUntil: null, updatedAt: FieldValue.serverTimestamp() })
  batch.set(db.doc(`${base(branchId)}/${COL.kioskSetup}/status`), { setAt: FieldValue.serverTimestamp(), setBy: caller.name })
  await batch.commit()
  await audit(branchId, { ...actor(caller), action: 'kiosk.setup_pin_set', entityType: 'kiosk', entityId: 'setup', summary: 'Set the setup PIN for kiosk tablets' })
  return { ok: true }
})

/** A tablet registers with the setup PIN and gets its own key, which it keeps; the key is stored only as a hash. */
export const kioskEnroll = onCall(async (req) => {
  const { branchId, setupPin, name, appVersion } = (req.data ?? {}) as { branchId?: string; setupPin?: string; name?: string; appVersion?: string }
  if (!branchId || typeof setupPin !== 'string') throw new HttpsError('invalid-argument', 'Type the setup PIN.')
  const pinRef = db.doc(`${base(branchId)}/${COL.kioskSetup}/pin`)
  const right = await db.runTransaction(async (tx) => {
    const snap = await tx.get(pinRef)
    if (!snap.exists) throw new HttpsError('failed-precondition', 'There’s no setup PIN yet: an admin sets it on the website, in Settings → Pay & time clock → Kiosk.')
    const d = snap.data()!
    const lockedUntil = (d.lockedUntil as Timestamp | null)?.toMillis() ?? 0
    if (lockedUntil > Date.now()) {
      throw new HttpsError('resource-exhausted', `Too many wrong tries. Try again in ${Math.ceil((lockedUntil - Date.now()) / 60_000)} minutes.`)
    }
    if (SETUP_PIN.test(setupPin) && sameHex(scrypt(setupPin, d.salt as string), d.hash as string)) {
      tx.update(pinRef, { failures: 0, lockedUntil: null })
      return true
    }
    const failures = ((d.failures as number) ?? 0) + 1
    tx.update(pinRef, failures >= MAX_TRIES ? { failures: 0, lockedUntil: Timestamp.fromMillis(Date.now() + LOCK_MS) } : { failures })
    return false
  })
  if (!right) throw new HttpsError('permission-denied', 'That’s not the setup PIN.')
  const token = randomBytes(32).toString('base64url')
  const ref = db.collection(`${base(branchId)}/${COL.kioskDevices}`).doc()
  const tabletName = (typeof name === 'string' && name.trim().slice(0, 60)) || 'Kiosk tablet'
  await ref.set({
    name: tabletName,
    tokenHash: sha256(token),
    createdAt: FieldValue.serverTimestamp(),
    lastSyncAt: null,
    appVersion: typeof appVersion === 'string' ? appVersion.slice(0, 40) : '',
    revokedAt: null,
    revokedBy: null,
  })
  await audit(branchId, { action: 'kiosk.tablet_added', entityType: 'kiosk', entityId: ref.id, summary: `Registered the kiosk tablet “${tabletName}” with the setup PIN` })
  return { deviceId: ref.id, token }
})

/** An admin renames a tablet, or removes it: a removed tablet can't sync until it's registered again. */
export const kioskTablet = onCall(async (req) => {
  const { branchId, deviceId, action, name } = (req.data ?? {}) as { branchId?: string; deviceId?: string; action?: string; name?: string }
  if (!branchId || !deviceId) throw new HttpsError('invalid-argument', 'Missing tablet.')
  const caller = await requireAdmin(branchId, req.auth)
  const ref = db.doc(`${base(branchId)}/${COL.kioskDevices}/${deviceId}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'That tablet isn’t registered.')
  const was = snap.data()!.name as string
  if (action === 'rename') {
    const next = typeof name === 'string' ? name.trim().slice(0, 60) : ''
    if (!next) throw new HttpsError('invalid-argument', 'Give the tablet a name.')
    await ref.update({ name: next })
    await audit(branchId, { ...actor(caller), action: 'kiosk.tablet_renamed', entityType: 'kiosk', entityId: deviceId, summary: `Renamed the kiosk tablet “${was}” to “${next}”` })
  } else if (action === 'remove') {
    await ref.update({ revokedAt: FieldValue.serverTimestamp(), revokedBy: caller.name })
    await audit(branchId, { ...actor(caller), action: 'kiosk.tablet_removed', entityType: 'kiosk', entityId: deviceId, summary: `Removed the kiosk tablet “${was}”` })
  } else throw new HttpsError('invalid-argument', 'Rename or remove.')
  return { ok: true }
})

/** A registered tablet sends what it recorded and gets back who can clock in and who's in now. */
export const kioskSync = onCall(async (req) => {
  const { branchId, deviceId, token, ops, appVersion } = (req.data ?? {}) as { branchId?: string; deviceId?: string; token?: string; ops?: unknown; appVersion?: string }
  if (!branchId || !deviceId || typeof token !== 'string') throw new HttpsError('invalid-argument', 'Missing tablet.')
  const deviceRef = db.doc(`${base(branchId)}/${COL.kioskDevices}/${deviceId}`)
  const device = await deviceRef.get()
  const d = device.data()
  if (!d || d.revokedAt || !sameHex(sha256(token), d.tokenHash as string)) {
    throw new HttpsError('unauthenticated', 'This tablet isn’t registered with the academy (anymore). Register it again with the setup PIN.')
  }
  const branchSnap = await db.doc(base(branchId)).get()
  if (!branchSnap.exists) throw new HttpsError('not-found', 'Academy not found.')
  const branch = branchSnap.data() as Branch
  const settings = resolveSettings(branch.settings)
  const list = (Array.isArray(ops) ? ops : []).slice(0, MAX_OPS)
  const results: KioskOpResult[] = []
  for (const raw of list) results.push(await applyOp(branchId, deviceId, d.name as string, branch.timezone, settings, raw))
  await deviceRef.update({ lastSyncAt: FieldValue.serverTimestamp(), appVersion: typeof appVersion === 'string' ? appVersion.slice(0, 40) : (d.appVersion ?? '') })
  const state: KioskServerState = await serverState(branchId, branch, settings)
  return { results, state }
})

function parseOp(raw: unknown): KioskOp | null {
  const o = raw as Partial<KioskOp> | null
  if (!o || typeof o.id !== 'string' || !/^[\w-]{6,64}$/.test(o.id)) return null
  if ((o.kind !== 'in' && o.kind !== 'out') || typeof o.staffId !== 'string' || !o.staffId || o.staffId.includes('/')) return null
  if (typeof o.at !== 'number' || !Number.isFinite(o.at)) return null
  const ref = (v: unknown) => (typeof v === 'string' && v && !v.includes('/') ? v : null)
  return { id: o.id, kind: o.kind, staffId: o.staffId, at: Math.round(o.at), shiftId: ref(o.shiftId), inOpId: ref(o.inOpId) }
}

function shiftState(snap: DocumentSnapshot | null, staffId: string): KioskShiftState | null {
  const s = snap?.data()
  if (!snap || !s || s.staffId !== staffId) return null
  return {
    id: snap.id,
    dateKey: s.dateKey as string,
    clockInAt: (s.clockInAt as Timestamp).toMillis(),
    clockOutAt: (s.clockOutAt as Timestamp | null)?.toMillis() ?? null,
    status: s.status as 'open' | 'closed',
    autoClosed: s.autoClosed === true,
  }
}

const KIND_WORD = { in: 'clock-in', out: 'clock-out' } as const

/** Applies one op in a transaction, once: a second time returns what the first did. */
async function applyOp(branchId: string, deviceId: string, tabletName: string, tz: string, settings: BranchSettings, raw: unknown): Promise<KioskOpResult> {
  const op = parseOp(raw)
  if (!op) return { opId: String((raw as { id?: unknown } | null)?.id ?? ''), status: 'rejected', reason: 'it isn’t a clock-in or a clock-out' }
  const b = base(branchId)
  const shiftRef = (id: string) => db.doc(`${b}/${COL.clockShifts}/${id}`)
  const opRef = db.doc(`${b}/${COL.kioskOps}/${deviceId}_${op.id}`)
  const openRef = db.doc(`${b}/${COL.openShifts}/${op.staffId}`)
  const now = Date.now()
  const at = Timestamp.fromMillis(op.at)
  const dateKey = dateKeyOf(op.at, tz)
  const late = now - op.at > KIOSK_LATE_MS
  const by = `kiosk-tablet:${tabletName}`

  const done = await db.runTransaction(async (tx) => {
    const prior = await tx.get(opRef)
    if (prior.exists) {
      const p = prior.data()!
      return { result: { opId: op.id, status: p.status, shiftId: p.shiftId ?? undefined, reason: p.reason ?? undefined } as KioskOpResult, fresh: false as const }
    }
    const [staff, payroll, open] = await Promise.all([tx.get(db.doc(`${b}/${COL.staff}/${op.staffId}`)), tx.get(db.doc(`${b}/${COL.payroll}/state`)), tx.get(openRef)])
    let targetId = op.kind === 'out' ? op.shiftId : null
    if (op.kind === 'out' && !targetId && op.inOpId) targetId = ((await tx.get(db.doc(`${b}/${COL.kioskOps}/${deviceId}_${op.inOpId}`))).data()?.shiftId as string | undefined) ?? null
    const openId = open.data()?.shiftId as string | undefined
    const [openShift, target, day] = await Promise.all([
      openId ? tx.get(shiftRef(openId)) : Promise.resolve(null),
      targetId ? tx.get(shiftRef(targetId)) : Promise.resolve(null),
      op.kind === 'in'
        ? tx.get(db.collection(`${b}/${COL.clockShifts}`).where('staffId', '==', op.staffId).where('dateKey', '==', dateKey))
        : Promise.resolve(null),
    ])
    const name = (staff.data()?.name as string | undefined) ?? 'Someone'
    // When the open shift is clocked out automatically, by its day's classes as the automatic clock-out decides it.
    const openState = shiftState(openShift, op.staffId)
    let openAutoOut: KioskAutoOut | null = null
    if (openState && openShift) {
      const [classes, availability] = await Promise.all([
        tx.get(db.collection(`${b}/${COL.classes}`).where('dateKey', '==', openState.dateKey)),
        tx.get(db.collection(`${b}/${COL.availability}`).where('dateKey', '==', openState.dateKey)),
      ])
      const out = autoClockOutAt({
        shift: { staffId: op.staffId, dateKey: openState.dateKey, inMin: openShift.data()!.inMin as number, clockInMs: openState.clockInAt },
        classes: classes.docs.map((c) => c.data() as PayClass),
        availability: availability.docs.map((a) => a.data() as Availability),
        settings,
        timeZone: tz,
      })
      openAutoOut = out ? { at: out.atMs, by: out.by } : null
    }
    const plan: KioskPlan =
      !staff.exists || (op.kind === 'in' && staff.data()!.status === 'finished')
        ? { kind: 'reject', reason: 'they can’t clock in here (no longer an employee?)' }
        : planKioskOp(op, {
            now,
            dateKey,
            lockedThrough: (payroll.data()?.lockedThrough as string | undefined) ?? '',
            open: openState,
            openAutoOut,
            target: shiftState(target, op.staffId),
            dayShifts: (day?.docs ?? []).map((s) => shiftState(s, op.staffId)).filter((s): s is KioskShiftState => s !== null),
          })
    let shiftId: string | null = null
    // A forgotten clock-out first, as the automatic clock-out would have made it had it known of the shift.
    if (plan.autoClose) {
      tx.update(shiftRef(plan.autoClose.shiftId), {
        clockOutAt: Timestamp.fromMillis(plan.autoClose.at),
        outDateKey: dateKeyOf(plan.autoClose.at, tz),
        outMin: minutesOf(plan.autoClose.at, tz),
        status: 'closed',
        autoClosed: true,
        autoClosedBy: plan.autoClose.by,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'system',
      })
      // A new shift takes its place below; otherwise nobody is in.
      if (plan.kind !== 'create') tx.delete(openRef)
    }
    if (plan.kind === 'create') {
      const ref = db.collection(`${b}/${COL.clockShifts}`).doc()
      shiftId = ref.id
      tx.set(ref, {
        staffId: op.staffId,
        staffName: name,
        dateKey,
        inMin: minutesOf(op.at, tz),
        clockInAt: at,
        clockOutAt: null,
        outDateKey: null,
        outMin: null,
        status: 'open',
        source: 'kiosk',
        kioskDeviceId: deviceId,
        recordedOffline: late,
        autoClosed: false,
        autoCorrected: false,
        forcedType: null,
        note: '',
        createdAt: FieldValue.serverTimestamp(),
        createdBy: by,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: by,
      })
      tx.set(openRef, { shiftId: ref.id, clockInAt: at })
    } else if (plan.kind === 'close' || plan.kind === 'correct') {
      shiftId = plan.shiftId
      tx.update(shiftRef(plan.shiftId), {
        clockOutAt: at,
        outDateKey: dateKey,
        outMin: minutesOf(op.at, tz),
        status: 'closed',
        ...(plan.kind === 'correct' ? { autoClosed: false, autoClosedBy: FieldValue.delete(), recordedOffline: true } : late ? { recordedOffline: true } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: by,
      })
      if (openId === plan.shiftId && !plan.autoClose) tx.delete(openRef)
    } else if (plan.kind === 'same') shiftId = plan.shiftId
    const status: KioskOpResult['status'] = plan.kind === 'reject' ? 'rejected' : plan.kind === 'same' ? 'same' : 'applied'
    const reason = plan.kind === 'reject' || plan.kind === 'same' ? plan.reason : null
    tx.set(opRef, { deviceId, staffId: op.staffId, kind: op.kind, at, status, plan: plan.kind, shiftId, reason, receivedAt: FieldValue.serverTimestamp() })
    return { result: { opId: op.id, status, shiftId: shiftId ?? undefined, reason: reason ?? undefined } as KioskOpResult, fresh: true as const, plan, name }
  })

  if (done.fresh && done.plan.autoClose) {
    const a = done.plan.autoClose
    await audit(branchId, {
      action: 'shift.auto_clock_out',
      via: 'function',
      entityType: 'shift',
      entityId: a.shiftId,
      coachId: op.staffId,
      coachName: done.name,
      dateKey: dateKeyOf(a.at, tz),
      context: tabletName,
      summary: `${done.name} was clocked out automatically at ${formatMinutes(minutesOf(a.at, tz))}${a.by === 'last_class' ? ', at the end of the last class' : ''}: they hadn’t clocked out, and the tablet sent their next clock-in or clock-out later`,
    })
  }
  if (done.fresh && done.plan.kind !== 'same') {
    const when = `${formatMinutes(minutesOf(op.at, tz))}${dateKey === todayKey(tz, now) ? '' : ` on ${dateKey}`}`
    const offline = late ? ' (recorded without the internet, sent later)' : ''
    const summary =
      done.plan.kind === 'create'
        ? `${done.name} clocked in at ${when} on the tablet${offline}`
        : done.plan.kind === 'close'
          ? `${done.name} clocked out at ${when} on the tablet${offline}`
          : done.plan.kind === 'correct'
            ? `${done.name} clocked out at ${when} on the tablet${offline}, replacing the automatic clock-out at ${formatMinutes(minutesOf(done.plan.autoOutAt, tz))}`
            : `A ${KIND_WORD[op.kind]} by ${done.name} at ${when} on the tablet wasn’t saved: ${done.plan.reason}`
    await audit(branchId, {
      action: done.plan.kind === 'create' ? 'shift.clock_in' : done.plan.kind === 'reject' ? 'kiosk.op_rejected' : 'shift.clock_out',
      entityType: 'shift',
      entityId: done.result.shiftId ?? op.id,
      coachId: op.staffId,
      coachName: done.name,
      dateKey,
      context: tabletName,
      summary,
    })
  }
  return done.result
}

/** Who can clock in (their PINs as fingerprints), who's in now, and today's automatic clock-outs. */
async function serverState(branchId: string, branch: Branch, settings: BranchSettings): Promise<KioskServerState> {
  const kiosk = settings.timeClock.kiosk
  const b = base(branchId)
  const tz = branch.timezone
  const [owners, open, today] = await Promise.all([
    db.collection(`${b}/kioskPinOwners`).get(),
    db.collection(`${b}/${COL.openShifts}`).get(),
    db.collection(`${b}/${COL.clockShifts}`).where('dateKey', '==', todayKey(tz)).get(),
  ])
  const hashes = new Map(owners.docs.map((d) => [d.id, d.data().pinHash as string]))
  const staff = owners.empty ? [] : await db.getAll(...owners.docs.map((d) => db.doc(`${b}/${COL.staff}/${d.id}`)))
  const people = staff
    .filter((s) => s.exists && s.data()!.status !== 'finished' && hashes.get(s.id))
    .map((s) => ({ staffId: s.id, name: s.data()!.name as string, pinHash: hashes.get(s.id)! }))
  const latest = new Map<string, FirebaseFirestore.DocumentData>()
  for (const s of today.docs.map((d) => d.data())) {
    if (s.status !== 'closed' || !s.clockOutAt) continue
    const was = latest.get(s.staffId as string)
    if (!was || (s.clockOutAt as Timestamp).toMillis() > (was.clockOutAt as Timestamp).toMillis()) latest.set(s.staffId as string, s)
  }
  return {
    academyName: branch.name,
    timeZone: tz,
    pinLength: kiosk.pinLength,
    successReturnSeconds: kiosk.successReturnSeconds,
    autoClockOut: { enabled: settings.timeClock.autoClockOut.enabled, localTime: settings.timeClock.autoClockOut.localTime },
    people,
    open: open.docs.map((d) => ({ staffId: d.id, shiftId: d.data().shiftId as string, clockInAt: (d.data().clockInAt as Timestamp).toMillis() })),
    autoOuts: [...latest.entries()].filter(([, s]) => s.autoClosed && !s.autoCorrected).map(([staffId, s]) => ({ staffId, at: (s.clockOutAt as Timestamp).toMillis() })),
    serverTime: Date.now(),
  }
}
