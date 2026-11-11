/**
 * The results site's key (shared/src/scores/resultsSite.ts), which the server keeps and the page no longer shows (Goo,
 * 2026-11-10: "we have the key"). When it changes, whoever has the new one runs this on their own computer and pastes
 * it at the prompt, which doesn't show it: it's never in a chat, a file or the shell's history.
 *
 *   npx tsx scripts/results-site-key.ts            # asks for the key, tries it with the site, saves it
 *   npx tsx scripts/results-site-key.ts --remove   # takes it off: checks stop until a key is saved again
 *
 * Uses the developer's gcloud login; SKYARC_PROJECT and FIRESTORE_EMULATOR_HOST as the other scripts.
 */
import { parseArgs } from 'node:util'
import { ACADEMY_ID } from '../shared/src/academy'
import { COL, DOC, ROOT } from '../shared/src/paths'
import { todayKey } from '../shared/src/time'
import { PROJECT_ID, commit, deleteDocuments, getDocument, patchDocuments } from './lib/firestore-rest'

const SITE_API = 'https://api-stage.scopos.tech/production'
const base = `${ROOT.branches}/${ACADEMY_ID}`
const keyPath = `${base}/${COL.resultsSiteKey}/${DOC.resultsSiteKey}`
const statusPath = `${base}/${COL.resultsSite}/${DOC.resultsSiteStatus}`
const BY = 'results-site-key'

const ENTER = [String.fromCharCode(13), String.fromCharCode(10)]
const CTRL_C = String.fromCharCode(3)
const BACKSPACE = [String.fromCharCode(127), String.fromCharCode(8)]

/** A line typed at the terminal without showing it. */
function askHidden(prompt: string): Promise<string> {
  const input = process.stdin
  if (!input.isTTY) throw new Error('Run this in a terminal: it asks for the key without showing it.')
  process.stdout.write(prompt)
  input.setRawMode(true)
  input.resume()
  input.setEncoding('utf8')
  let value = ''
  return new Promise((resolve) => {
    const onData = (chunk: string) => {
      for (const c of chunk) {
        if (ENTER.includes(c)) {
          input.setRawMode(false)
          input.pause()
          input.off('data', onData)
          process.stdout.write('\n')
          return resolve(value.trim())
        }
        if (c === CTRL_C) {
          process.stdout.write('\n')
          process.exit(130)
        }
        value = BACKSPACE.includes(c) ? value.slice(0, -1) : value + c
      }
    }
    input.on('data', onData)
  })
}

async function audit(summary: string, from: string | null, to: string | null) {
  const at = new Date()
  await commit([
    {
      path: `${base}/${COL.auditLog}/${BY}-${at.getTime()}`,
      data: {
        at,
        actorUid: BY,
        actorEmail: BY,
        actorName: 'The results site’s key',
        actorRole: 'system',
        action: 'resultsSite.key',
        category: 'settings',
        entityType: 'resultsSite',
        entityId: 'key',
        summary,
        context: 'scripts/results-site-key.ts',
        dateKey: null,
        studentId: null,
        studentName: null,
        coachId: null,
        coachName: null,
        changes: [{ field: 'key', label: 'Key', from: from ? `…${from}` : null, to: to ? `…${to}` : null }],
        via: 'function',
      },
    },
  ])
}

async function main() {
  const { values } = parseArgs({ options: { remove: { type: 'boolean', default: false } } })
  const before = ((await getDocument(statusPath))?.keyEnd as string | undefined) ?? null
  if (values.remove) {
    await deleteDocuments([keyPath])
    await patchDocuments([{ path: statusPath, set: { keyEnd: null, keySetAt: new Date(), keySetBy: BY } }]).catch(() => undefined)
    await audit('Removed the results site’s key', before, null)
    return console.log(`Removed the key in ${PROJECT_ID}: checks stop until a key is saved again.`)
  }
  const key = await askHidden(`The results site’s key for ${PROJECT_ID} (it won’t show as you paste it): `)
  if (key.length < 16 || key.length > 200 || /\s/.test(key)) throw new Error('That doesn’t look like the results site’s key.')
  // One small request, so a wrong key is said now rather than at the next check.
  const day = todayKey('UTC')
  const res = await fetch(`${SITE_API}/match/search?start-date=${day}&end-date=${day}&limit=1`, { headers: { 'x-api-key': key } })
  if (res.status === 401 || res.status === 403) throw new Error('The results site refused this key: nothing was saved.')
  if (!res.ok) throw new Error(`The results site answered ${res.status}: try again in a minute. Nothing was saved.`)
  const end = key.slice(-4)
  await commit([{ path: keyPath, data: { key, setAt: new Date(), setBy: BY } }])
  const status = await getDocument(statusPath)
  if (status) await patchDocuments([{ path: statusPath, set: { keyEnd: end, keySetAt: new Date(), keySetBy: BY } }])
  else await commit([{ path: statusPath, data: { keyEnd: end, keySetAt: new Date(), keySetBy: BY, running: null, lastRun: null, going: null, hosts: {}, nationalAt: null } }])
  await audit(before ? 'Replaced the results site’s key' : 'Added the results site’s key', before, end)
  console.log(`Saved: the key ending …${end} works. Check now on the Results site page uses it.`)
}

main().catch((e) => {
  console.error((e as Error).message)
  process.exit(1)
})
