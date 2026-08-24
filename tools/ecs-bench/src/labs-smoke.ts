import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  assertDirectorySnapshotUnchanged,
  assertSmokeResultsEmpty,
  resolveLabsInstallation,
  snapshotDirectory,
} from './labs-run-support.ts'

const ROOT = resolve(import.meta.dirname, '../../..')
const TRUSTED_RESULTS = resolve(ROOT, 'tools/ecs-bench/.labs')
const installation = resolveLabsInstallation(createRequire(import.meta.url).resolve('@pmndrs/labs'))
const temporaryRoot = mkdtempSync(join(tmpdir(), 'three-flatland-labs-smoke-'))
const isolatedResults = resolve(temporaryRoot, '.labs')
const before = snapshotDirectory(TRUSTED_RESULTS)

try {
  const result = spawnSync(process.execPath, [installation.cli, 'run', '@smoke'], {
    cwd: resolve(ROOT, 'tools/ecs-bench'),
    env: {
      ...process.env,
      FLATLAND_LABS_RESULTS_DIR: isolatedResults,
      FLATLAND_LABS_SMOKE: 'true',
      FL_DEVTOOLS: 'false',
      FL_PROFILE: 'false',
      NODE_ENV: 'production',
    },
    stdio: 'inherit',
  })

  assertSmokeResultsEmpty(isolatedResults)
  assertDirectorySnapshotUnchanged(before, snapshotDirectory(TRUSTED_RESULTS))
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true })
}
