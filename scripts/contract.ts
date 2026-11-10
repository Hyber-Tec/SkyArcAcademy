/**
 * The academy's enrollment contract, put in the database (docs/DECISIONS.md §34: the office doesn't write the contract
 * in the app, it changes only the prices). It reads the contract's text from a file kept on the owner's machine, never
 * in this repository (docs/internal/contract/), checks it as the app does, and makes it the contract the office sends
 * from then on: a new version, the one before kept for the contracts sent and signed with it. The prices the office set
 * in the app stay (the file's are used for a program the current contract doesn't have), unless --file-prices says to
 * use the file's. Nothing changes when the text is the same as the current version's.
 *
 * With --signer (and --title), it also sets who signs for the academy (§35): their name is typed on the academy's line
 * of every contract signed from then on, until the office uploads or draws the signature in Settings, which it keeps.
 * The contract is English only (docs/DECISIONS.md §42).
 *
 *   npx tsx scripts/contract.ts --academy skyarc --file docs/internal/contract/enrollment-contract.txt          # what it would do
 *   npx tsx scripts/contract.ts --academy skyarc --file docs/internal/contract/enrollment-contract.txt --apply  # do it
 *   npx tsx scripts/contract.ts --academy skyarc --signer "Full Name" --title "Director" --apply               # who signs
 *
 * Once for each academy: skyarc, then demo. Uses the developer's gcloud login (scripts/lib/firestore-rest.ts);
 * SKYARC_PROJECT and FIRESTORE_EMULATOR_HOST as the other scripts (the practice copy: SKYARC_PROJECT=demo-skyarc
 * FIRESTORE_EMULATOR_HOST=127.0.0.1:8080).
 */
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { ACADEMY_ID, DEMO_ACADEMY_ID } from '../shared/src/academy'
import { dollarsText, parseContract, pricedChoice, withPrices } from '../shared/src/contracts/document'
import { ACADEMY_SIGNER_ID, type AcademySigner, CONTRACT_TEXT_MAX, type ContractTemplate } from '../shared/src/contracts/types'
import type { DriveActor } from '../shared/src/drive/types'
import { COL, ROOT } from '../shared/src/paths'
import { type BatchWrite, PROJECT_ID, commitBatch, getDocument, listDocuments } from './lib/firestore-rest'

const { values } = parseArgs({
  options: {
    academy: { type: 'string' },
    file: { type: 'string' },
    apply: { type: 'boolean', default: false },
    'file-prices': { type: 'boolean', default: false },
    signer: { type: 'string' },
    title: { type: 'string' },
  },
})
const BY: DriveActor = { uid: 'contract-script', email: '', name: 'HyberTec' }

/** The audit entry of a change the script makes, as the system's. */
const audit = (at: Date, action: string, entityType: string, entityId: string, summary: string): Record<string, unknown> => ({
  at,
  actorUid: BY.uid,
  actorEmail: 'system',
  actorName: BY.name,
  actorRole: 'system',
  action,
  category: 'contracts',
  entityType,
  entityId,
  summary,
  context: '',
  dateKey: null,
  studentId: null,
  studentName: null,
  coachId: null,
  coachName: null,
  changes: [],
  via: 'function',
})

async function main() {
  const academyId = values.academy
  if (academyId !== ACADEMY_ID && academyId !== DEMO_ACADEMY_ID) throw new Error(`Say which academy: --academy ${ACADEMY_ID} or --academy ${DEMO_ACADEMY_ID}.`)
  if (!values.file && !values.signer) {
    throw new Error('Say what to set up: --file docs/internal/contract/enrollment-contract.txt (the contract), --signer "Full Name" (who signs for the academy).')
  }
  const base = `${ROOT.branches}/${academyId}`
  console.log(`The enrollment contract, in ${PROJECT_ID} (${base})${values.apply ? '' : ': a dry run, nothing is written (add --apply to do it)'}`)
  if (!(await getDocument(base))) throw new Error(`No academy at ${base} in ${PROJECT_ID}.`)
  const at = new Date()
  const made = values.file ? await contract(base, values.file, at) : { writes: [], version: null }
  const writes = [
    ...made.writes,
    ...(values.signer ? await signer(base, values.signer, values.title ?? '', at) : []),
  ]
  if (!values.apply || !writes.length) return
  await commitBatch(writes)
  console.log('Done.')
}

/** The version a write makes (its document and text). */
type Made = { path: string; text: string; data: Record<string, unknown> }

/** The contract in the file, as the current version (a new one, unless it's the same text). */
async function contract(base: string, file: string, at: Date): Promise<{ writes: BatchWrite[]; version: Made | null }> {
  let text = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n').trim()
  if (text.length > CONTRACT_TEXT_MAX) throw new Error('The contract is too long.')
  const { doc, problems } = parseContract(text)
  if (problems.length) throw new Error(`Fix the contract first:\n${problems.map((p) => `  line ${p.line}: ${p.message}`).join('\n')}`)

  const versions = (await listDocuments(`${base}/${COL.contractTemplates}`)).map((d) => ({ id: d.id, t: d.data as unknown as ContractTemplate }))
  const current = versions.find((v) => v.t.current) ?? null
  // The prices the office set in the app stay, by program.
  if (current && !values['file-prices']) {
    const kept: Record<string, number> = {}
    for (const o of pricedChoice(parseContract(current.t.text).doc)?.options ?? []) if (o.amount !== null) kept[o.id] = o.amount
    const next = withPrices(text, kept)
    for (const o of pricedChoice(doc)?.options ?? []) {
      if (kept[o.id] !== undefined && kept[o.id] !== o.amount) console.log(`  Keeping the office's price for ${o.title}: ${dollarsText(kept[o.id])} (the file says ${dollarsText(o.amount ?? 0)})`)
    }
    text = next
  }
  const sha256 = createHash('sha256').update(text).digest('hex')
  if (current?.t.sha256 === sha256) {
    console.log(`It's the current contract already (version ${current.t.version}): nothing to do.`)
    return { writes: [], version: null }
  }

  const version = Math.max(0, ...versions.map((v) => v.t.version || 0)) + 1
  const choice = pricedChoice(doc)
  console.log(`“${doc.title}”, version ${version}${current ? `, after version ${current.t.version}` : ', the first'}.`)
  if (choice) for (const o of pricedChoice(parseContract(text).doc)?.options ?? []) console.log(`  ${o.title}: ${o.price}`)

  const id = randomBytes(15).toString('base64url').slice(0, 20)
  const template: Omit<ContractTemplate, 'publishedAt'> & { publishedAt: Date } = { title: doc.title, text, sha256, version, current: true, publishedAt: at, publishedBy: BY }
  const data: Record<string, unknown> = { ...template }
  const path = `${base}/${COL.contractTemplates}/${id}`
  const writes: BatchWrite[] = []
  if (current) writes.push({ patch: `${base}/${COL.contractTemplates}/${current.id}`, fields: { current: false, replacedAt: at, replacedBy: BY } })
  writes.push({ create: path, data })
  writes.push({
    set: `${base}/${COL.auditLog}/contract-script-${at.getTime()}`,
    data: audit(at, 'contract.publish', 'contractTemplate', id, `Set up the enrollment contract, version ${version} (“${doc.title}”): the office sends it to each family from the student’s page`),
  })
  return { writes, version: { path, text, data } }
}

/** Who signs for the academy: their name, typed on its line, keeping a signature image the office set in Settings. */
async function signer(base: string, name: string, title: string, at: Date): Promise<BatchWrite[]> {
  const clean = name.replace(/\s+/g, ' ').trim()
  if (!clean || clean.length > 100 || title.length > 100) throw new Error('Give the signer’s full name (and title), at most 100 characters each.')
  const path = `${base}/${COL.contractSigner}/${ACADEMY_SIGNER_ID}`
  const now = (await getDocument(path)) as Partial<AcademySigner> | null
  const image = typeof now?.image === 'string' ? now.image : null
  if (now?.name === clean && (now.title ?? '') === title.trim()) {
    console.log(`${clean} signs for the academy already: nothing to do.`)
    return []
  }
  console.log(`The academy’s signature: ${[clean, title.trim()].filter(Boolean).join(', ')}, ${image ? 'with the signature image on file' : 'the name typed (no signature image yet)'}.`)
  return [
    { set: path, data: { name: clean, title: title.trim(), image, updatedAt: at, updatedBy: BY } },
    {
      set: `${base}/${COL.auditLog}/contract-signer-${at.getTime()}`,
      data: audit(at, 'contract.signer', 'contractSigner', ACADEMY_SIGNER_ID, `Set who signs for the academy on the enrollment contract: ${[clean, title.trim()].filter(Boolean).join(', ')}`),
    },
  ]
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
