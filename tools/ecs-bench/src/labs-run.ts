import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../../..')
const PROVENANCE_FILES = [
  'pnpm-lock.yaml',
  'tools/ecs-bench/labs.config.ts',
  'tools/ecs-bench/benches/renderer-frame.bench.ts',
  'tools/ecs-bench/src/labs-run.ts',
] as const
const LABS_PACKAGE = resolve(import.meta.dirname, '../node_modules/@pmndrs/labs/package.json')
const LABS_CLI = resolve(import.meta.dirname, '../node_modules/@pmndrs/labs/dist/cli.mjs')
const LABS_RESULTS = resolve(ROOT, 'tools/ecs-bench/.labs')

if (process.env['FLATLAND_LABS_SMOKE'] === 'true') {
  throw new Error('Saved Labs results cannot use the smoke sampling profile')
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function sha256(path: string): string {
  return createHash('sha256')
    .update(readFileSync(resolve(ROOT, path)))
    .digest('hex')
}

function takeUserMessage(args: string[]): { args: string[]; message?: string } {
  const forwarded: string[] = []
  let message: string | undefined

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    if (arg === '-m' || arg === '--message') {
      const value = args[index + 1]
      if (value === undefined) throw new Error(`${arg} requires a value`)
      message = value
      index++
      continue
    }
    forwarded.push(arg)
  }

  return { args: forwarded, ...(message === undefined ? {} : { message }) }
}

function parseDescription(description: unknown): Record<string, string> {
  if (typeof description !== 'string') return {}
  return Object.fromEntries(
    description.split('; ').flatMap((part) => {
      const separator = part.indexOf('=')
      return separator === -1 ? [] : [[part.slice(0, separator), part.slice(separator + 1)]]
    })
  )
}

function assertCompatibleBaseline(current: Record<string, string>): void {
  const pointer = resolve(LABS_RESULTS, 'baseline')
  if (!existsSync(pointer)) throw new Error('No Labs baseline exists; run benchmark:labs:baseline first')
  const name = readFileSync(pointer, 'utf8').trim()
  const path = resolve(LABS_RESULTS, 'results', `${name}.json`)
  if (!existsSync(path)) throw new Error(`Labs baseline result '${name}' is missing`)
  const result: unknown = JSON.parse(readFileSync(path, 'utf8'))
  const baseline =
    typeof result === 'object' && result !== null && 'description' in result ? parseDescription(result.description) : {}

  const mismatches: string[] = []
  if (baseline['dirty'] !== 'false') mismatches.push('baseline source is dirty or lacks trusted provenance')
  for (const key of ['labs', 'lock', 'config', 'fixture', 'runner'] as const) {
    if (baseline[key] !== current[key]) mismatches.push(`${key} differs from baseline`)
  }
  if (mismatches.length > 0) {
    throw new Error(`Labs comparison provenance mismatch: ${mismatches.join('; ')}`)
  }
}

const requested = takeUserMessage(process.argv.slice(2))
const revision = git('rev-parse', 'HEAD')
const dirty = git('status', '--porcelain').length > 0
const hashes = {
  lock: sha256(PROVENANCE_FILES[0]),
  config: sha256(PROVENANCE_FILES[1]),
  fixture: sha256(PROVENANCE_FILES[2]),
  runner: sha256(PROVENANCE_FILES[3]),
}
const labsPackage: unknown = JSON.parse(readFileSync(LABS_PACKAGE, 'utf8'))
if (
  typeof labsPackage !== 'object' ||
  labsPackage === null ||
  !('version' in labsPackage) ||
  typeof labsPackage.version !== 'string'
) {
  throw new Error('Unable to read the installed @pmndrs/labs version')
}
const fields = {
  source: revision,
  dirty: String(dirty),
  labs: labsPackage.version,
  lock: hashes.lock,
  config: hashes.config,
  fixture: hashes.fixture,
  runner: hashes.runner,
}
const baseline = requested.args.includes('--baseline') || requested.args.includes('-b')
const compare = requested.args.includes('--compare') || requested.args.includes('-c')
if ((baseline || compare) && dirty) {
  throw new Error('Labs baseline and comparison captures require a clean source tree')
}
if (compare) assertCompatibleBaseline(fields)

const provenance = [
  ...Object.entries(fields).map(([key, value]) => `${key}=${value}`),
  ...(requested.message === undefined ? [] : [`note=${requested.message}`]),
].join('; ')

const result = spawnSync(process.execPath, [LABS_CLI, ...requested.args, '--message', provenance], {
  cwd: resolve(ROOT, 'tools/ecs-bench'),
  env: process.env,
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exitCode = result.status ?? 1
