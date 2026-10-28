/**
 * What a deploy of main has to do: CI's "Plan the deploy" job runs it while the checks run, and the deploy job then
 * deploys only that (docs/DEPLOY.md, "What each deploy deploys"). It compares main with the commit production runs,
 * which is the last run on main whose deploy succeeded (GitHub's record of the CI runs), and deploys each part whose
 * files changed: the website, the Firestore, Storage and Realtime Database rules, and of the functions, those whose
 * code changed. A function's code is what its module bundles, its imports included, as the functions' build bundles
 * it; so a change to shared code redeploys the functions that use it, and only them.
 *
 *   npx tsx scripts/deploy-plan.ts                          # in CI (GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID)
 *   npx tsx scripts/deploy-plan.ts --base <sha> [--head <sha>]   # what a deploy of <head> would do if production ran <base>
 *   npx tsx scripts/deploy-plan.ts --everything             # everything (a run started by hand)
 *
 * It deploys everything when it can't tell: no earlier deploy found, the last one didn't finish, the deploy itself
 * changed. In CI it writes its answer to GITHUB_OUTPUT (targets, hosting, functions, deploy, base) and the run's
 * summary. Needs the functions' packages installed (their esbuild).
 */
import { createHash } from 'node:crypto'
import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { spawnSync } from 'node:child_process'
import {
  DEPLOY_JOB,
  EVERYTHING,
  FUNCTIONS_BUILD,
  type FunctionCode,
  type Plan,
  type Target,
  functionsToDeploy,
  planFor,
  splitEntry,
} from './lib/deploy-plan'

const { values } = parseArgs({ options: { base: { type: 'string' }, head: { type: 'string' }, everything: { type: 'boolean', default: false } } })
const root = path.resolve(import.meta.dirname, '..')

function git(args: string[], input?: Buffer): { ok: boolean; out: string; raw: Buffer } {
  const r = spawnSync('git', args, { cwd: root, input, maxBuffer: 256 * 1024 * 1024 })
  return { ok: r.status === 0, out: r.stdout?.toString().trim() ?? '', raw: r.stdout ?? Buffer.alloc(0) }
}
const commit = (ref: string) => {
  const r = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
  return r.ok ? r.out : null
}
const isAncestor = (a: string, b: string) => git(['merge-base', '--is-ancestor', a, b]).ok

/** The commit of the last successful deploy, from the CI runs on main; or why everything is deployed instead. */
async function lastDeploy(): Promise<{ sha: string } | { everything: string }> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  const repo = process.env.GITHUB_REPOSITORY
  const api = process.env.GITHUB_API_URL ?? 'https://api.github.com'
  if (!token || !repo) throw new Error('Set GITHUB_TOKEN and GITHUB_REPOSITORY (as CI does), or pass --base <sha>.')
  const get = async <T>(url: string): Promise<T> => {
    const res = await fetch(`${api}/repos/${repo}/${url}`, { headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' } })
    if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${url}`)
    return (await res.json()) as T
  }
  type Run = { id: number; head_sha: string; event: string; status: string; head_repository: { full_name: string } | null }
  type Job = { name: string; conclusion: string | null; steps?: { conclusion: string | null }[] }
  const { workflow_runs: runs } = await get<{ workflow_runs: Run[] }>('actions/workflows/ci.yml/runs?branch=main&per_page=50')
  for (const run of runs) {
    if (String(run.id) === process.env.GITHUB_RUN_ID || run.event === 'pull_request' || run.head_repository?.full_name !== repo) continue
    // Runs on main go one at a time, so the earlier ones are done; one that isn't is passed over (an older deploy is
    // then the base, which deploys more, never less).
    if (run.status !== 'completed') continue
    const { jobs } = await get<{ jobs: Job[] }>(`actions/runs/${run.id}/jobs?filter=latest&per_page=100`)
    const job = jobs.find((j) => j.name === DEPLOY_JOB)
    // No deploy (the checks failed, nothing to deploy, or it waited and gave way to a newer run): look further back.
    if (!job || job.conclusion === 'skipped') continue
    if (job.conclusion === 'success') return { sha: run.head_sha }
    // A deploy that ran and didn't finish may have deployed part of its commit: deploy everything to be sure.
    if (job.steps?.some((s) => s.conclusion === 'success' || s.conclusion === 'failure')) return { everything: `the deploy of ${run.head_sha.slice(0, 7)} didn’t finish` }
  }
  return { everything: 'no earlier deploy found' }
}

/** A commit's functions code and shared code, unpacked in a folder of their own. */
function unpack(sha: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `deploy-plan-${sha.slice(0, 7)}-`))
  const archive = git(['archive', '--format=tar', sha, 'functions/src', 'functions/tsconfig.json', 'shared/src'])
  if (!archive.ok) throw new Error(`git archive ${sha} failed`)
  const tar = spawnSync('tar', ['-x', '-C', dir], { input: archive.raw })
  if (tar.status !== 0) throw new Error(`tar failed for ${sha}`)
  return dir
}

type Esbuild = typeof import('esbuild')
type BuildOptions = import('esbuild').BuildOptions

/**
 * Each function's code: the bundle of the module it comes from (its imports included), as the functions' build makes
 * it; the entry's own functions, the bundle of the entry without its re-exports. Checked against the whole entry's
 * exports, so a function can't be missed.
 */
async function functionCode(esbuild: Esbuild, functionsDir: string): Promise<FunctionCode> {
  const options: BuildOptions = { ...FUNCTIONS_BUILD, tsconfig: path.join(functionsDir, 'tsconfig.json'), absWorkingDir: functionsDir, write: false, metafile: true, logLevel: 'silent' }
  const bundle = async (input: BuildOptions) => {
    const r = await esbuild.build({ ...options, ...input })
    const meta = Object.values(r.metafile!.outputs)
    if (r.outputFiles!.length !== 1 || meta.length !== 1) throw new Error('expected one bundle')
    return { hash: createHash('sha256').update(r.outputFiles![0].text).digest('hex'), exports: meta[0].exports }
  }
  const entry = path.join(functionsDir, 'src/index.ts')
  const { reExports, own } = splitEntry(readFileSync(entry, 'utf8'))
  const code: FunctionCode = new Map()
  // The entry's own code, as a file beside it (the folder is an unpacked copy): its bundle then names the same paths
  // whichever folder it's in.
  const ownEntry = path.join(path.dirname(entry), '.deploy-plan-own.ts')
  writeFileSync(ownEntry, own)
  const ownBundle = await bundle({ entryPoints: [ownEntry] })
  for (const name of ownBundle.exports) code.set(name, ownBundle.hash)
  const modules = new Map<string, Awaited<ReturnType<typeof bundle>>>()
  for (const r of reExports) {
    if (!r.from.startsWith('.')) throw new Error(`functions/src/index.ts re-exports from a package (${r.from})`)
    const file = path.join(path.dirname(entry), `${r.from}.ts`)
    if (!modules.has(file)) modules.set(file, await bundle({ entryPoints: [file] }))
    const m = modules.get(file)!
    if (!m.exports.includes(r.local)) throw new Error(`${r.from} doesn't export ${r.local}`)
    code.set(r.name, `${m.hash}:${r.local}`)
  }
  const whole = await bundle({ entryPoints: [entry] })
  const names = [...code.keys()].sort()
  if (whole.exports.slice().sort().join() !== names.join()) throw new Error('the functions found don’t match the entry’s exports')
  return code
}

async function main() {
  const head = commit(values.head ?? 'HEAD')
  if (!head) throw new Error(`No commit ${values.head ?? 'HEAD'}`)
  let base: string | null = null
  let plan: Plan
  let functions: 'none' | 'all' | string[] = 'none'
  const everything = (why: string): Plan => ({ ...EVERYTHING, why: [why] })

  if (values.everything || process.env.EVERYTHING === 'true') plan = everything('a run started by hand: everything is deployed')
  else {
    const last = values.base ? { sha: values.base } : await lastDeploy().catch((e: Error) => ({ everything: `the last deploy couldn’t be found (${e.message})` }))
    if ('everything' in last) plan = everything(`${last.everything}: everything is deployed`)
    else if (!(base = commit(last.sha))) plan = everything(`production’s commit ${last.sha.slice(0, 7)} isn’t in the history: everything is deployed`)
    else if (base === head) plan = { targets: [], functions: 'none', why: ['production already runs this commit'] }
    else if (isAncestor(head, base)) plan = { targets: [], functions: 'none', why: [`production already runs a newer commit (${base.slice(0, 7)})`] }
    else if (!isAncestor(base, head)) plan = everything(`production’s commit ${base.slice(0, 7)} isn’t an ancestor of this one: everything is deployed`)
    else {
      // Renames as a removal and an addition, so a file moved out of a part of production counts for it.
      const diff = git(['diff', '--name-only', '--no-renames', base, head])
      plan = diff.ok ? planFor(diff.out.split('\n').filter(Boolean)) : everything('the changed files couldn’t be listed: everything is deployed')
    }
  }

  if (plan.functions === 'all') functions = 'all'
  else if (plan.functions === 'check' && base) {
    const dirs: string[] = []
    try {
      const require = createRequire(path.join(root, 'functions/package.json'))
      const esbuild = require('esbuild') as Esbuild
      dirs.push(unpack(base), unpack(head))
      const [before, after] = [await functionCode(esbuild, path.join(dirs[0], 'functions')), await functionCode(esbuild, path.join(dirs[1], 'functions'))]
      const r = functionsToDeploy(before, after)
      functions = r.functions
      plan.why.push(`functions: ${r.why}${Array.isArray(r.functions) ? ` (${r.functions.join(', ')})` : ''}`)
    } catch (e) {
      functions = 'all'
      plan.why.push(`functions: their code couldn’t be compared (${(e as Error).message}), all of them`)
    } finally {
      for (const d of dirs) rmSync(d, { recursive: true, force: true })
    }
  }

  const targets: Target[] = plan.targets
  const fnList = Array.isArray(functions) ? functions.join(',') : functions
  const deploy = targets.length > 0 || functions !== 'none'
  const lines = [
    `Production runs: ${base ? base.slice(0, 7) : 'unknown'}; this deploy: ${head.slice(0, 7)}`,
    ...plan.why.map((w) => `- ${w}`),
    deploy ? `Deploys: ${[...targets, ...(functions === 'none' ? [] : [functions === 'all' ? 'all functions' : `functions ${fnList}`])].join(', ')}` : 'Deploys nothing.',
  ]
  console.log(lines.join('\n'))
  if (process.env.GITHUB_OUTPUT) {
    const out = { base: base ?? '', targets: targets.join(','), hosting: String(targets.includes('hosting')), functions: fnList, deploy: String(deploy) }
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(out).map(([k, v]) => `${k}=${v}\n`).join(''))
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### The deploy\n\n${lines.join('\n')}\n`)
}

await main()
