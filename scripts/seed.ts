/**
 * Creates the academy's document (once) and its first owner, so the app has something to sign in to. Safe to run
 * again: anything that already exists is left as it is. It never writes sample data; the academy's people are added in
 * the app (Account page).
 *
 *   npm run seed                                     # production (skyarcacademy); first owner Goo
 *   npm run seed -- --owner someone@example.com --owner-name "Someone"
 *
 * Uses the developer's gcloud login (see scripts/lib/firestore-rest.ts), or the emulators when FIRESTORE_EMULATOR_HOST
 * is set.
 */
import { parseArgs } from 'node:util'
import { ACADEMY_ID } from '../shared/src/academy'
import { seedAcademy } from './lib/seedAcademy'

const { values } = parseArgs({
  options: {
    name: { type: 'string', default: 'Sky Arc Sports Academy' },
    'short-name': { type: 'string', default: 'Sky Arc' },
    tz: { type: 'string', default: 'America/New_York' },
    owner: { type: 'string', default: 'goochoi913@gmail.com' },
    'owner-name': { type: 'string', default: 'Goo Choi' },
  },
})

seedAcademy({
  academyId: ACADEMY_ID,
  name: values.name!,
  shortName: values['short-name']!,
  timezone: values.tz!,
  owner: values.owner!,
  ownerName: values['owner-name']!,
}).catch((e) => {
  console.error(e)
  process.exit(1)
})
