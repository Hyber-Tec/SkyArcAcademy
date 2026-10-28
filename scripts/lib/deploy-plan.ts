/**
 * What a deploy to production has to do, from what changed since the last one (docs/DEPLOY.md, "What each deploy
 * deploys"). Pure: scripts/deploy-plan.ts finds the last deploy, the changed files and each function's code, and asks
 * these.
 */

/** The deploy job's name in .github/workflows/ci.yml: its runs on main say what production runs. */
export const DEPLOY_JOB = 'Deploy main to production'

/** Production's parts that `firebase deploy --only` takes, besides the functions. */
export const TARGETS = ['hosting', 'firestore', 'storage', 'database'] as const
export type Target = (typeof TARGETS)[number]

/**
 * How production is deployed: a change to one of these deploys everything, so a new way of deploying starts from
 * production as a whole.
 */
export const EVERYTHING_FILES = [
  '.github/workflows/ci.yml',
  '.firebaserc',
  'firebase.json',
  'scripts/deploy.sh',
  'scripts/deploy-plan.ts',
  'scripts/lib/deploy-plan.ts',
  'scripts/open-callables.sh',
]

/** The functions' packages and build settings: a change to one redeploys every function. */
export const ALL_FUNCTIONS_FILES = ['functions/package.json', 'functions/package-lock.json', 'functions/tsconfig.json']

/** Each target's files (the website is built from web/ and the shared code). */
const TARGET_FILES: Record<Target, (file: string) => boolean> = {
  hosting: (f) => f.startsWith('web/') || isSharedCode(f),
  firestore: (f) => f === 'firestore.rules' || f === 'firestore.indexes.json',
  storage: (f) => f === 'storage.rules',
  database: (f) => f === 'database.rules.json',
}

const isTest = (file: string) => /\.test\.tsx?$/.test(file)
const isSharedCode = (file: string) => file.startsWith('shared/src/') && !isTest(file)
const isFunctionsCode = (file: string) => (file.startsWith('functions/src/') && !isTest(file)) || isSharedCode(file)

/**
 * The functions: none, all, or `check` (their code may have changed: compare each one's with `functionsToDeploy`).
 */
export type FunctionsPlan = 'none' | 'all' | 'check'

export interface Plan {
  targets: Target[]
  functions: FunctionsPlan
  /** Why, a line each, for the run's log. */
  why: string[]
}

export const EVERYTHING: Omit<Plan, 'why'> = { targets: [...TARGETS], functions: 'all' }

/** What the changed files need deployed. */
export function planFor(files: readonly string[]): Plan {
  const deployFile = files.find((f) => EVERYTHING_FILES.includes(f))
  if (deployFile) return { ...EVERYTHING, why: [`${deployFile} changed: everything is deployed`] }
  const why: string[] = []
  const targets = TARGETS.filter((t) => {
    const hit = files.find(TARGET_FILES[t])
    if (hit) why.push(`${t}: ${hit}${files.filter(TARGET_FILES[t]).length > 1 ? ' and more' : ''}`)
    return !!hit
  })
  const allFile = files.find((f) => ALL_FUNCTIONS_FILES.includes(f))
  const codeFile = files.find(isFunctionsCode)
  const functions: FunctionsPlan = allFile ? 'all' : codeFile ? 'check' : 'none'
  if (allFile) why.push(`functions: ${allFile} changed, all of them`)
  else if (codeFile) why.push(`functions: ${codeFile}${files.filter(isFunctionsCode).length > 1 ? ' and more' : ''} changed, those whose code changed`)
  return { targets, functions, why }
}

/** Each function's name and a hash of the code it runs. */
export type FunctionCode = Map<string, string>

/**
 * The functions to deploy: those whose code changed and the new ones; all when one was removed (a deploy of all of
 * them deletes it) or when what production runs isn't known.
 */
export function functionsToDeploy(before: FunctionCode | null, after: FunctionCode): { functions: 'none' | 'all' | string[]; why: string } {
  if (!before) return { functions: 'all', why: 'what production runs isn’t known: all of them' }
  const removed = [...before.keys()].filter((name) => !after.has(name))
  if (removed.length) return { functions: 'all', why: `${removed.join(', ')} removed: all of them, so the deploy deletes ${removed.length > 1 ? 'those' : 'it'}` }
  const changed = [...after.keys()].filter((name) => before.get(name) !== after.get(name)).sort()
  if (!changed.length) return { functions: 'none', why: 'no function’s code changed' }
  if (changed.length === after.size) return { functions: 'all', why: 'every function’s code changed' }
  return { functions: changed, why: `${changed.length} of ${after.size} changed or new` }
}

export interface ReExport {
  /** The name the entry exports (the function's name). */
  name: string
  /** Its name in the module. */
  local: string
  /** The module, as the entry writes it (`./requests`). */
  from: string
}

const RE_EXPORT = /export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]\s*;?/g

/**
 * The functions' entry (functions/src/index.ts) split in two: its re-exports (`export { a, b as c } from './m'`), each
 * function and the module it comes from, and the rest, its own code.
 */
export function splitEntry(source: string): { reExports: ReExport[]; own: string } {
  if (/export\s*\*/.test(source)) throw new Error('functions/src/index.ts re-exports everything from a module (export *): name the functions instead')
  const reExports: ReExport[] = []
  const own = source.replace(RE_EXPORT, (_, names: string, from: string) => {
    for (const spec of names.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (spec.startsWith('type ')) continue
      const [local, name = local] = spec.split(/\s+as\s+/).map((s) => s.trim())
      reExports.push({ name, local, from })
    }
    return ''
  })
  return { reExports, own }
}

/** The functions' build options (functions/package.json's `build`), without where it writes. */
export const FUNCTIONS_BUILD = { bundle: true, platform: 'node', target: 'node22', format: 'esm', packages: 'external' } as const
