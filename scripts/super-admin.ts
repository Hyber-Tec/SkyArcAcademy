/**
 * Super admins (docs/DECISIONS.md §26): who may open Settings → AI. Once there's one, the page adds and removes the
 * others; this adds the first, lists them, and can remove one (never the last).
 *
 *   npx tsx scripts/super-admin.ts --list
 *   npx tsx scripts/super-admin.ts --add someone@example.com
 *   npx tsx scripts/super-admin.ts --remove someone@example.com
 *
 * The email is the one the person signs in with. Each change is written to the AI's change history. Uses the
 * developer's gcloud login (scripts/lib/firestore-rest.ts) on production, or SKYARC_PROJECT and
 * FIRESTORE_EMULATOR_HOST for the emulators, as the other scripts.
 */
import { randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'
import { AI_COL } from '../shared/src/ai/paths'
import { looksLikeEmail } from '../shared/src/auth'
import { emailKey } from '../shared/src/paths'
import { PROJECT_ID, commit, deleteDocuments, getDocument, listDocuments } from './lib/firestore-rest'

const { values } = parseArgs({ options: { add: { type: 'string' }, remove: { type: 'string' }, list: { type: 'boolean', default: false } } })
const where = process.env.FIRESTORE_EMULATOR_HOST ? `${PROJECT_ID} (emulators)` : PROJECT_ID
/** Who the history says made the change: this script, not a person's sign-in. */
const BY = { uid: 'script', email: 'scripts/super-admin.ts', name: 'Command line' }

async function list() {
  const admins = (await listDocuments(AI_COL.superAdmins)).map((d) => d.id).sort()
  console.log(admins.length ? `Super admins in ${where}:\n${admins.map((a) => `  ${a}`).join('\n')}` : `No super admins in ${where} yet.`)
  return admins
}

function change(action: 'superAdmin.add' | 'superAdmin.remove', email: string, at: Date) {
  return {
    path: `${AI_COL.aiChanges}/${at.getTime()}-${randomUUID().slice(0, 8)}`,
    data: {
      at,
      by: BY,
      action,
      provider: null,
      feature: null,
      summary: action === 'superAdmin.add' ? `Made ${email} a super admin` : `Removed ${email} as a super admin`,
      from: action === 'superAdmin.add' ? null : email,
      to: action === 'superAdmin.add' ? email : null,
    },
  }
}

async function main() {
  const raw = values.add ?? values.remove
  if (!raw) {
    if (!values.list) console.log('Add one with --add <email>, remove one with --remove <email>, or --list them.\n')
    await list()
    return
  }
  if (values.add && values.remove) throw new Error('Either --add or --remove, not both.')
  const email = emailKey(raw)
  if (!looksLikeEmail(email)) throw new Error(`“${raw}” doesn’t look like an email address.`)
  const path = `${AI_COL.superAdmins}/${email}`
  const exists = !!(await getDocument(path))
  const at = new Date()
  if (values.add) {
    if (exists) console.log(`= ${email} is already a super admin in ${where}.`)
    else {
      await commit([{ path, data: { email, addedAt: at, addedBy: BY } }, change('superAdmin.add', email, at)])
      console.log(`+ ${email} is a super admin in ${where}: they see Settings → AI when they sign in with that email.`)
    }
  } else {
    if (!exists) console.log(`= ${email} isn’t a super admin in ${where}.`)
    else if ((await listDocuments(AI_COL.superAdmins)).length <= 1) throw new Error(`${email} is the only super admin: add another one first.`)
    else {
      await deleteDocuments([path])
      await commit([change('superAdmin.remove', email, at)])
      console.log(`- ${email} is no longer a super admin in ${where}.`)
    }
  }
  await list()
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
