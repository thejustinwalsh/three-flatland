import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SHARED_BENCHMARK_SOURCES = ['examples/_shared/benchmark.ts', 'examples/_shared/benchmark-vite.ts'] as const

export interface BenchmarkBuildMetadata {
  revision: string
  fixtureSourceSha256: string
  devtoolsEnabled: boolean
  profileEnabled: boolean
}

function repositoryRoot(): string {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
}

export function benchmarkFixtureSourceFiles(exampleDirectory: string): string[] {
  if (!/^examples\/(?:three|react)\/(?:knightmark|lighting)$/.test(exampleDirectory)) {
    throw new Error(`Invalid benchmark fixture directory: ${exampleDirectory}`)
  }
  const root = repositoryRoot()
  const output = execFileSync('git', ['-C', root, 'ls-files', '-z', '--', exampleDirectory], { encoding: 'utf8' })
  const exampleFiles = output.split('\0').filter(Boolean)
  if (exampleFiles.length === 0) {
    throw new Error(`Benchmark fixture has no tracked files under ${exampleDirectory}`)
  }
  return [...SHARED_BENCHMARK_SOURCES, ...exampleFiles].sort((a, b) => a.localeCompare(b))
}

export function benchmarkFixtureSourceSha256(exampleDirectory: string): string {
  const root = repositoryRoot()
  const hash = createHash('sha256')
  for (const file of benchmarkFixtureSourceFiles(exampleDirectory)) {
    const contents = readFileSync(resolve(root, file))
    hash.update(`${Buffer.byteLength(file)}:${file}\0${contents.byteLength}:`)
    hash.update(contents)
    hash.update('\0')
  }
  return hash.digest('hex')
}

/**
 * Derive the revision embedded in benchmark builds. Ordinary docs/example
 * builds remain `development`; evidence builds require a clean worktree and
 * derive the SHA from Git rather than trusting an operator-supplied label.
 */
export function benchmarkBuildMetadata(command: 'build' | 'serve', exampleDirectory: string): BenchmarkBuildMetadata {
  const devtools = process.env.FL_DEVTOOLS ?? 'true'
  const profile = process.env.FL_PROFILE ?? 'false'
  if (devtools !== 'true' && devtools !== 'false') {
    throw new Error(`FL_DEVTOOLS must be exactly true or false, received ${JSON.stringify(devtools)}`)
  }
  if (profile !== 'true' && profile !== 'false') {
    throw new Error(`FL_PROFILE must be exactly true or false, received ${JSON.stringify(profile)}`)
  }
  if (command !== 'build' || process.env.FL_BENCHMARK_EVIDENCE !== 'true') {
    return {
      revision: 'development',
      fixtureSourceSha256: 'development',
      devtoolsEnabled: devtools === 'true',
      profileEnabled: profile === 'true',
    }
  }

  const fixtureSourceSha256 = benchmarkFixtureSourceSha256(exampleDirectory)

  if (devtools !== 'false') {
    throw new Error('Benchmark evidence builds require FL_DEVTOOLS=false')
  }

  const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()
  if (status) throw new Error(`Benchmark evidence build requires a clean source tree:\n${status}`)

  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error(`Invalid benchmark build revision: ${revision}`)

  const expected = process.env.VITE_FLATLAND_BENCHMARK_REVISION
  if (expected && expected !== revision) {
    throw new Error(`Benchmark revision mismatch: expected ${expected}, current worktree is ${revision}`)
  }
  return {
    revision,
    fixtureSourceSha256,
    devtoolsEnabled: false,
    profileEnabled: profile === 'true',
  }
}
