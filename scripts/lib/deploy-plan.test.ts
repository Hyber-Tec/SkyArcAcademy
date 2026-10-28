import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEPLOY_JOB, FUNCTIONS_BUILD, TARGETS, functionsToDeploy, planFor, splitEntry } from './deploy-plan'

const code = (entries: Record<string, string>) => new Map(Object.entries(entries))

describe('what a deploy deploys', () => {
  it('deploys nothing for docs and the phone app', () => {
    expect(planFor(['docs/DEPLOY.md', 'README.md', 'mobile/app/index.tsx'])).toMatchObject({ targets: [], functions: 'none' })
  })

  it('deploys the website for web/ and the shared code, but not for a test', () => {
    expect(planFor(['web/src/main.tsx'])).toMatchObject({ targets: ['hosting'], functions: 'none' })
    expect(planFor(['shared/src/time.ts'])).toMatchObject({ targets: ['hosting'], functions: 'check' })
    expect(planFor(['shared/src/time.test.ts', 'functions/src/contractPdf.test.ts'])).toMatchObject({ targets: [], functions: 'none' })
  })

  it('deploys each set of rules when its file changes', () => {
    expect(planFor(['firestore.indexes.json']).targets).toEqual(['firestore'])
    expect(planFor(['storage.rules', 'database.rules.json']).targets).toEqual(['storage', 'database'])
  })

  it('compares the functions’ code when it may have changed, and deploys them all when their packages change', () => {
    expect(planFor(['functions/src/requests.ts']).functions).toBe('check')
    expect(planFor(['functions/src/requests.ts', 'functions/package-lock.json']).functions).toBe('all')
  })

  it('deploys everything when the deploy itself changes', () => {
    for (const file of ['.github/workflows/ci.yml', 'firebase.json', 'scripts/deploy.sh', 'scripts/lib/deploy-plan.ts']) {
      expect(planFor(['docs/DEPLOY.md', file])).toMatchObject({ targets: [...TARGETS], functions: 'all' })
    }
  })
})

describe('which functions a deploy deploys', () => {
  const before = code({ a: '1', b: '2', c: '3' })

  it('deploys the functions whose code changed, and the new ones', () => {
    expect(functionsToDeploy(before, code({ a: '1', b: '9', c: '3', d: '4' })).functions).toEqual(['b', 'd'])
  })

  it('deploys none when no code changed, and all when every one did', () => {
    expect(functionsToDeploy(before, code({ a: '1', b: '2', c: '3' })).functions).toBe('none')
    expect(functionsToDeploy(before, code({ a: '7', b: '8', c: '9' })).functions).toBe('all')
  })

  it('deploys all of them when one was removed (so the deploy deletes it), or when production’s code isn’t known', () => {
    expect(functionsToDeploy(before, code({ a: '1', b: '2' })).functions).toBe('all')
    expect(functionsToDeploy(null, code({ a: '1' })).functions).toBe('all')
  })
})

describe('the functions’ entry', () => {
  it('splits its re-exports from its own code', () => {
    const { reExports, own } = splitEntry(
      ["import { db } from './app'", 'export const kiosk = onCall(() => db)', "export { a, b as c } from './one'", "export {\n  d,\n  type T,\n} from './two'"].join('\n'),
    )
    expect(reExports).toEqual([
      { name: 'a', local: 'a', from: './one' },
      { name: 'c', local: 'b', from: './one' },
      { name: 'd', local: 'd', from: './two' },
    ])
    expect(own).toContain('export const kiosk')
    expect(own).not.toContain('./one')
    expect(own).not.toContain('./two')
  })

  it('refuses `export *`, which hides the functions’ names', () => {
    expect(() => splitEntry("export * from './one'")).toThrow()
  })
})

describe('the deploy’s settings match the repository', () => {
  it('builds the functions as their build does', () => {
    const build = JSON.parse(readFileSync('functions/package.json', 'utf8')).scripts.build as string
    const flags = Object.fromEntries([...build.matchAll(/--([a-z-]+)(?:=(\S+))?/g)].map(([, key, value]) => [key, value ?? true]))
    // Where it writes and its tsconfig (each copy's own) are the only differences.
    delete flags.outfile
    delete flags.tsconfig
    expect(flags).toEqual(FUNCTIONS_BUILD)
  })

  it('reads the deploy job by the name CI gives it', () => {
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain(`name: ${DEPLOY_JOB}\n`)
  })
})
