/**
 * The logins for Apple's and Google's reviewers (docs/store/review-notes.md, "The review logins"): password sign-ins with
 * confirmed emails for sample people in production, so a reviewer sees only made-up students. One for each kind of
 * account the app has: the office (the sample manager, an admin), a coach and a parent; and a student kept for trying
 * "Delete my account" without breaking the others.
 *
 * Their passwords are made here once and kept in mobile/.publish/review-logins.json (git-ignored, printed nowhere).
 * Run it again at any time, after a reviewer deletes an account for instance: every login comes back with the same
 * password, as Apple asks ("Credentials that expire or change before your review starts may result in the submission
 * being rejected").
 *
 *   npx tsx scripts/review-logins.ts            # make the logins, or bring them back
 *   npx tsx scripts/review-logins.ts --remove   # delete them (before removing the sample data, for instance)
 *
 * The sample data must be in production first (npm run seed:sample). Uses the developer's gcloud login.
 */
import { randomInt } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { ACADEMY_ID } from '../shared/src/academy'
import { COL, ROOT } from '../shared/src/paths'
import { SAMPLE_EMAIL_DOMAIN } from '../shared/src/sample/data'
import { deleteUserByEmail, upsertPasswordUser } from './lib/auth-rest'
import { PROJECT_ID, getDocument } from './lib/firestore-rest'

const { values } = parseArgs({ options: { remove: { type: 'boolean', default: false } } })

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'mobile', '.publish', 'review-logins.json')

/** Who each login is, in the sample data, and what a reviewer sees with it. */
const LOGINS = [
  { kind: 'office', email: `paige.sutton@${SAMPLE_EMAIL_DOMAIN}`, name: 'Paige Sutton', role: 'admin', sees: 'The office: every tab of the staff app, as the academy’s manager.' },
  { kind: 'coach', email: `daniel.reed@${SAMPLE_EMAIL_DOMAIN}`, name: 'Daniel Reed', role: 'coach', sees: 'A coach: their own classes, availability, the students, Scan.' },
  { kind: 'parent', email: `jiyeon.hwang@${SAMPLE_EMAIL_DOMAIN}`, name: 'Jiyeon Hwang', role: 'parent', sees: 'A parent of two students: the family’s tabs (classes, scores, reports).' },
  {
    kind: 'delete-test',
    email: `seoyeon.lim@${SAMPLE_EMAIL_DOMAIN}`,
    name: 'Seoyeon Lim',
    role: 'student',
    sees: 'A student. Use this one to try More → Delete my account; run this script again to bring it back.',
  },
] as const

interface Saved {
  note: string
  logins: { kind: string; email: string; password: string; sees: string }[]
}

function readSaved(): Saved | null {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8')) as Saved
  } catch {
    return null
  }
}

/** 18 characters from letters and digits that can't be mistaken for each other when typed from a page. */
function newPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  for (;;) {
    const p = Array.from({ length: 18 }, () => chars[randomInt(chars.length)]).join('')
    if (/\d/.test(p) && /[a-z]/.test(p) && /[A-Z]/.test(p)) return p
  }
}

async function make() {
  const saved = readSaved()
  const logins: Saved['logins'] = []
  for (const login of LOGINS) {
    const member = await getDocument(`${ROOT.branches}/${ACADEMY_ID}/${COL.members}/${login.email}`)
    if (!member) throw new Error(`${login.email} has no access in ${PROJECT_ID}: the sample data isn't there. Run npm run seed:sample first.`)
    if (member.role !== login.role) throw new Error(`${login.email} is a ${String(member.role)} in ${PROJECT_ID}, not a ${login.role}; not touching it.`)
    const password = saved?.logins.find((l) => l.email === login.email)?.password ?? newPassword()
    const { created } = await upsertPasswordUser({ email: login.email, password, displayName: login.name })
    logins.push({ kind: login.kind, email: login.email, password, sees: login.sees })
    console.log(`${created ? '+' : '='} ${login.kind.padEnd(11)} ${login.email}`)
  }
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  const note = 'The reviewers’ logins in production (scripts/review-logins.ts): sample people only. Never in git; paste them into App Store Connect and the Play Console.'
  fs.writeFileSync(FILE, `${JSON.stringify({ note, logins }, null, 2)}\n`, { mode: 0o600 })
  console.log(`\nThe passwords are in ${path.relative(process.cwd(), FILE)} (the same ones as before, if there were any).`)
}

async function remove() {
  for (const login of LOGINS) console.log(`${(await deleteUserByEmail(login.email)) ? '-' : '='} ${login.kind.padEnd(11)} ${login.email}`)
  console.log(`\nThe sign-ins are deleted; ${path.relative(process.cwd(), FILE)} keeps the passwords for when they're made again.`)
}

;(values.remove ? remove() : make()).catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
