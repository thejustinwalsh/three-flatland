import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { materializeConsumerExample } from './lib/consumer-smoke-layout.mjs'

describe('consumer-smoke example materialization', () => {
  it('preserves shared imports while excluding local build output', () => {
    const repositoryRoot = mkdtempSync(join(tmpdir(), 'consumer-smoke-source-'))
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'consumer-smoke-work-'))
    const exampleDirectory = join(repositoryRoot, 'examples', 'react', 'knightmark')
    const sharedDirectory = join(repositoryRoot, 'examples', '_shared')

    try {
      mkdirSync(join(exampleDirectory, 'node_modules'), { recursive: true })
      mkdirSync(join(exampleDirectory, 'dist'), { recursive: true })
      mkdirSync(sharedDirectory, { recursive: true })
      writeFileSync(join(exampleDirectory, 'vite.config.ts'), "import '../../_shared/benchmark-vite'\n")
      writeFileSync(join(exampleDirectory, 'node_modules', 'leak.js'), '')
      writeFileSync(join(exampleDirectory, 'dist', 'leak.js'), '')
      writeFileSync(join(sharedDirectory, 'benchmark-vite.ts'), 'export const metadata = true\n')

      const destination = materializeConsumerExample(repositoryRoot, workspaceRoot, {
        type: 'react',
        slug: 'knightmark',
        dir: exampleDirectory,
      })

      expect(destination).toBe(join(workspaceRoot, 'examples', 'react', 'knightmark'))
      expect(existsSync(resolve(destination, '../../_shared/benchmark-vite.ts'))).toBe(true)
      expect(existsSync(join(destination, 'node_modules'))).toBe(false)
      expect(existsSync(join(destination, 'dist'))).toBe(false)
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true })
      rmSync(workspaceRoot, { recursive: true, force: true })
    }
  })
})
