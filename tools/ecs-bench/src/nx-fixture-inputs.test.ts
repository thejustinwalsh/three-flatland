import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url))
const nxExecutable = resolve(workspaceRoot, 'node_modules/.bin/nx')
const fixtureProjects = [
  'example-three-knightmark',
  'example-react-knightmark',
  'example-three-lighting',
  'example-react-lighting',
] as const

function affectedProjects(file: string, target: 'build' | 'typecheck' | 'lint'): string[] {
  return JSON.parse(
    execFileSync(
      nxExecutable,
      ['show', 'projects', '--affected', `--files=${file}`, `--with-target=${target}`, '--json'],
      {
        cwd: workspaceRoot,
        encoding: 'utf8',
        env: { ...process.env, NX_DAEMON: 'false' },
      }
    )
  ) as string[]
}

describe('benchmark fixture Nx inputs', () => {
  it.each(['examples/_shared/benchmark.ts', 'examples/_shared/benchmark-vite.ts'])(
    'invalidates all fixture targets when %s changes',
    (file) => {
      for (const target of ['build', 'typecheck', 'lint'] as const) {
        expect(affectedProjects(file, target)).toEqual(expect.arrayContaining([...fixtureProjects]))
      }
    }
  )
})
