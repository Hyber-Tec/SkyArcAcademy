/**
 * Creates the academy's document (once) and its first owner, so the app has something to sign in to. Safe to run
 * again: anything that already exists is left as it is. It never writes sample data (npm run seed:sample does); the
 * academy's people are added in the app (Account page).
 *
 *   npm run seed -- --owner you@example.com --owner-name "Your Name"
 *
 * Production (skyarcacademy) already has its academy and first owner. Locally, seed the emulators with yourself as the
 * owner and sign in with the same address. Uses the developer's gcloud login (see scripts/lib/firestore-rest.ts), or
 * the emulators when FIRESTORE_EMULATOR_HOST is set.
 */
import { parseArgs } from 'node:util'
import { ACADEMY_ID } from '../shared/src/academy'
import { seedAcademy } from './lib/seedAcademy'

const { values } = parseArgs({
  options: {
    name: { type: 'string', default: 'Sky Arc Sports Academy' },
    'short-name': { type: 'string', default: 'Sky Arc' },
    tz: { type: 'string', default: 'America/New_York' },
    owner: { type: 'string' },
    'owner-name': { type: 'string' },
  },
})

if (!values.owner || !values['owner-name']) {
  console.error('Name the first owner: npm run seed -- --owner you@example.com --owner-name "Your Name"')
  process.exit(1)
}

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
