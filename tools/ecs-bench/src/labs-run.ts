import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import {
  assertCaptureMode,
  assertCompatibleBaseline,
  createTrustedDescription,
  resolveLabsInstallation,
  sha256File,
  sha256Files,
  takeUserMessage,
  type TrustedProvenance,
} from './labs-run-support.ts'

const ROOT = resolve(import.meta.dirname, '../../..')
const LABS_RESULTS = resolve(ROOT, 'tools/ecs-bench/.labs')
const installation = resolveLabsInstallation(createRequire(import.meta.url).resolve('@pmndrs/labs'))

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function repositoryFile(path: string): string {
  return resolve(ROOT, path)
}

function readBaselineDescription(): unknown {
  const pointer = resolve(LABS_RESULTS, 'baseline')
  if (!existsSync(pointer)) throw new Error('No Labs baseline exists; run benchmark:labs:baseline first')
  const name = readFileSync(pointer, 'utf8').trim()
  if (name.length === 0 || name.includes('/') || name.includes('\\')) {
    throw new Error('Labs baseline pointer is malformed')
  }
  const path = resolve(LABS_RESULTS, 'results', `${name}.json`)
  if (!existsSync(path)) throw new Error(`Labs baseline result '${name}' is missing`)
  const result: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (typeof result !== 'object' || result === null || !('description' in result)) {
    throw new Error(`Labs baseline result '${name}' has no provenance description`)
  }
  return result.description
}

const requested = takeUserMessage(process.argv.slice(2))
const revision = git('rev-parse', 'HEAD')
const dirty = git('status', '--porcelain').length > 0
const fields: TrustedProvenance = {
  source: revision,
  dirty: dirty ? 'true' : 'false',
  labs: installation.version,
  lock: sha256File(repositoryFile('pnpm-lock.yaml')),
  config: sha256File(repositoryFile('tools/ecs-bench/labs.config.ts')),
  fixture: sha256Files([
    repositoryFile('tools/ecs-bench/benches/animation-playback.bench.ts'),
    repositoryFile('tools/ecs-bench/benches/renderer-frame.bench.ts'),
  ]),
  runner: sha256Files([
    repositoryFile('tools/ecs-bench/src/labs-run.ts'),
    repositoryFile('tools/ecs-bench/src/labs-run-support.ts'),
  ]),
  ...(requested.message === undefined ? {} : { note: requested.message }),
}
const baseline = requested.args.includes('--baseline') || requested.args.includes('-b')
const compare = requested.args.includes('--compare') || requested.args.includes('-c')
assertCaptureMode({
  baseline,
  compare,
  dirty,
  smoke: process.env['FLATLAND_LABS_SMOKE'] === 'true',
})
if (compare) assertCompatibleBaseline(readBaselineDescription(), fields)

const result = spawnSync(
  process.execPath,
  [installation.cli, ...requested.args, '--message', createTrustedDescription(fields)],
  {
    cwd: resolve(ROOT, 'tools/ecs-bench'),
    env: process.env,
    stdio: 'inherit',
  }
)

if (result.error) throw result.error
process.exitCode = result.status ?? 1
