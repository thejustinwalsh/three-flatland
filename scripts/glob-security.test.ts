import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import fastGlob from 'fast-glob'
import picomatch from 'picomatch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../', import.meta.url))
let fixture: string
const sourceFiles = ['src/a.ts', 'src/b1.ts', 'src/b2.ts', 'src/nested/leaf.ts', 'src/root.ts', 'src/z.ts']

beforeAll(() => {
  fixture = mkdtempSync(join(tmpdir(), 'flatland-glob-security-'))
  for (const name of [
    ...sourceFiles,
    'src/a.test.ts',
    'tests/unit.test.ts',
    'root.ts',
    '.hidden/secret.ts',
    'icons/01.png',
    'icons/02.png',
    'icons/03.png',
    'icons/04.png',
    'literal/{a,b}.txt',
    'literal/{unclosed.txt',
  ]) {
    const path = join(fixture, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, name)
  }
})

afterAll(() => rmSync(fixture, { recursive: true, force: true }))

const cases: { name: string; patterns: string[]; options?: fastGlob.Options; expected: string[] }[] = [
  {
    name: 'recursive alternatives and negative patterns',
    patterns: ['{src,tests}/**/*.ts', '!**/*.test.ts'],
    expected: sourceFiles,
  },
  {
    name: 'ignore options',
    patterns: ['{src,tests}/**/*.ts'],
    options: { ignore: ['**/*.test.ts'] },
    expected: sourceFiles,
  },
  {
    name: 'nested alternatives',
    patterns: ['src/{a,b{1,2}}.ts'],
    expected: ['src/a.ts', 'src/b1.ts', 'src/b2.ts'],
  },
  {
    name: 'padded numeric ranges',
    patterns: ['icons/{01..03}.png'],
    expected: ['icons/01.png', 'icons/02.png', 'icons/03.png'],
  },
  {
    name: 'escaped literal braces',
    patterns: [String.raw`literal/\{a,b\}.txt`],
    expected: ['literal/{a,b}.txt'],
  },
  {
    name: 'duplicate and empty alternatives',
    patterns: ['{src,src}/a.ts', '{src/,}root.ts'],
    expected: ['root.ts', 'src/a.ts', 'src/root.ts'],
  },
  { name: 'unclosed brace handling', patterns: ['literal/{unclosed.txt'], expected: [] },
  {
    name: 'case-insensitive matching',
    patterns: ['src/*.TS'],
    options: { caseSensitiveMatch: false },
    expected: ['src/a.test.ts', 'src/a.ts', 'src/b1.ts', 'src/b2.ts', 'src/root.ts', 'src/z.ts'],
  },
  {
    name: 'explicit dotfile inclusion',
    patterns: ['**/*.ts'],
    options: { dot: true, ignore: ['src/**', 'tests/**'] },
    expected: ['.hidden/secret.ts', 'root.ts'],
  },
]

describe('glob dependency replacement compatibility', () => {
  it.each(cases)('preserves $name', ({ patterns, options, expected }) => {
    expect(fastGlob.sync(patterns, { cwd: fixture, ...options }).sort()).toEqual([...expected].sort())
  })

  it('preserves async and stream traversal', async () => {
    const patterns = ['{src,tests}/**/*.ts', '!**/*.test.ts']
    expect((await fastGlob(patterns, { cwd: fixture })).sort()).toEqual(sourceFiles)
    const streamed: string[] = []
    for await (const path of fastGlob.stream(patterns, { cwd: fixture })) streamed.push(String(path))
    expect(streamed.sort()).toEqual(sourceFiles)
  })

  it('preserves the docs generator matching contract', () => {
    const excluded = ['api/**', 'showcases/**', 'llm-prompts']
    expect(picomatch.isMatch('api/three-flatland/classes/Flatland', excluded)).toBe(true)
    expect(picomatch.isMatch('llm-prompts', excluded)).toBe(true)
    expect(picomatch.isMatch('guides/flatland-setup', excluded)).toBe(false)
    expect(picomatch.isMatch('guides/private-ecs-migration', ['guides/{flatland*,private-*}'])).toBe(true)
  })
})

describe('bounded glob expansion (GHSA-vfj7-8cjw-p6xm path removal)', () => {
  it('retains every result at the supported expansion boundary', () => {
    const tasks = fastGlob.generateTasks('icons/{1..1000}.png')
    expect(tasks.flatMap((task) => task.patterns)).toHaveLength(1000)
  })
  it.each(['{a,b}'.repeat(30), '{1..1000000000}', '{'.repeat(1000) + 'a,b' + '}'.repeat(1000)])(
    'rejects excessive expansion without hanging the caller',
    (pattern) => {
      const script = `
        const glob = require('fast-glob')
        try { glob.generateTasks(process.argv[1]); process.exitCode = 1 }
        catch (error) {
          if (!(error instanceof RangeError)) throw error
          process.stdout.write('bounded')
        }
      `
      expect(
        execFileSync(process.execPath, ['--max-old-space-size=64', '-e', script, pattern], {
          cwd: root,
          timeout: 2000,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      ).toBe('bounded')
    }
  )
})
