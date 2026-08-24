import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertCaptureMode,
  assertCompatibleBaseline,
  assertDirectorySnapshotUnchanged,
  assertSmokeResultsEmpty,
  createTrustedDescription,
  parseTrustedDescription,
  resolveLabsInstallation,
  sha256File,
  sha256Files,
  snapshotDirectory,
  takeUserMessage,
  type TrustedProvenance,
} from './labs-run-support.ts'

const temporaryDirectories: string[] = []
const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)
const trusted = {
  source: '1'.repeat(40),
  dirty: 'false',
  labs: '0.6.0',
  lock: HASH_A,
  config: HASH_A,
  fixture: HASH_A,
  runner: HASH_A,
} satisfies TrustedProvenance

function temporaryDirectory(prefix = 'three-flatland-labs-test-'): string {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('Labs trusted provenance', () => {
  it('extracts one safe note without forwarding Labs message flags', () => {
    expect(takeUserMessage(['@renderer-frame', '-n', 'candidate', '-m', 'transform lookup'])).toEqual({
      args: ['@renderer-frame', '-n', 'candidate'],
      message: 'transform lookup',
    })
    expect(takeUserMessage(['@renderer-frame'])).toEqual({ args: ['@renderer-frame'] })
    expect(takeUserMessage(['@renderer-frame', '--message=controlled host'])).toEqual({
      args: ['@renderer-frame'],
      message: 'controlled host',
    })
  })

  it.each(['source=forged', 'safe; source=forged', 'line\nbreak', 'line\rbreak', ''])(
    'rejects note injection %j',
    (note) => {
      expect(() => takeUserMessage(['-m', note])).toThrow(/note|contain|empty/i)
    }
  )

  it('rejects missing note values and duplicate message flags', () => {
    expect(() => takeUserMessage(['-m'])).toThrow(/requires a value/)
    expect(() => takeUserMessage(['-m', 'one', '--message', 'two'])).toThrow(/only one/)
  })

  it('round-trips every trusted field and a safe note', () => {
    const description = createTrustedDescription({ ...trusted, note: 'controlled host' })
    expect(parseTrustedDescription(description)).toEqual({ ...trusted, note: 'controlled host' })
    expect(description).toBe(
      `source=${trusted.source}; dirty=false; labs=0.6.0; lock=${HASH_A}; config=${HASH_A}; ` +
        `fixture=${HASH_A}; runner=${HASH_A}; note=controlled host`
    )
    expect(() => createTrustedDescription({ ...trusted, note: '' })).toThrow(/empty/)
  })

  it.each([
    ['', /missing/i],
    [`source=${trusted.source}`, /missing field/i],
    [createTrustedDescription(trusted).replace('; dirty=false', ''), /dirty/i],
    [createTrustedDescription(trusted).replace('dirty=false', 'dirty=maybe'), /dirty flag/i],
    [createTrustedDescription(trusted).replace(`lock=${HASH_A}`, 'lock=nope'), /SHA-256/i],
    [`${createTrustedDescription(trusted)}; source=${trusted.source}`, /duplicate/i],
    [`${createTrustedDescription(trusted)}; forged=value`, /unknown field/i],
    [createTrustedDescription(trusted).replace('labs=0.6.0', 'labs'), /malformed/i],
  ])('fails closed for malformed description %j', (description, expected) => {
    expect(() => parseTrustedDescription(description)).toThrow(expected)
  })

  it('accepts only a clean baseline with identical trust hashes', () => {
    expect(() => assertCompatibleBaseline(createTrustedDescription(trusted), trusted)).not.toThrow()
    expect(() => assertCompatibleBaseline(createTrustedDescription({ ...trusted, dirty: 'true' }), trusted)).toThrow(
      /dirty/
    )
    expect(() => assertCompatibleBaseline(createTrustedDescription({ ...trusted, fixture: HASH_B }), trusted)).toThrow(
      /fixture differs/
    )
    expect(() => assertCompatibleBaseline(undefined, trusted)).toThrow(/missing.*description/i)
  })

  it('requires clean, non-smoke baseline and compare captures', () => {
    expect(() => assertCaptureMode({ baseline: true, compare: false, dirty: true, smoke: false })).toThrow(/clean/)
    expect(() => assertCaptureMode({ baseline: false, compare: true, dirty: false, smoke: true })).toThrow(/smoke/)
    expect(() => assertCaptureMode({ baseline: false, compare: false, dirty: true, smoke: true })).not.toThrow()
  })
})

describe('Labs installation resolution', () => {
  it('resolves the installed 0.6.0 binary through package metadata', () => {
    const entry = createRequire(import.meta.url).resolve('@pmndrs/labs')
    const installation = resolveLabsInstallation(entry)
    const metadata: unknown = JSON.parse(readFileSync(resolve(installation.packageRoot, 'package.json'), 'utf8'))
    expect(installation.version).toBe('0.6.0')
    expect(existsSync(installation.cli)).toBe(true)
    expect(metadata).toMatchObject({ bin: { labs: './dist/cli.mjs' }, name: '@pmndrs/labs', version: '0.6.0' })
    expect(basename(installation.cli)).toBe('cli.mjs')
  })

  it('supports a string bin target and rejects package escapes', () => {
    const root = temporaryDirectory()
    const dist = resolve(root, 'dist')
    mkdirSync(dist)
    writeFileSync(resolve(dist, 'index.cjs'), '')
    writeFileSync(resolve(dist, 'cli.mjs'), '')
    writeFileSync(
      resolve(root, 'package.json'),
      JSON.stringify({ bin: './dist/cli.mjs', name: '@pmndrs/labs', version: '0.6.0' })
    )
    expect(resolveLabsInstallation(resolve(dist, 'index.cjs')).cli).toBe(resolve(dist, 'cli.mjs'))

    writeFileSync(
      resolve(root, 'package.json'),
      JSON.stringify({ bin: '../outside.mjs', name: '@pmndrs/labs', version: '0.6.0' })
    )
    expect(() => resolveLabsInstallation(resolve(dist, 'index.cjs'))).toThrow(/escapes/)
  })
})

describe('Labs result isolation and hashes', () => {
  it('computes exact single-file and ordered multi-file SHA-256 hashes', () => {
    const root = temporaryDirectory()
    const first = resolve(root, 'first')
    const second = resolve(root, 'second')
    writeFileSync(first, 'abc')
    writeFileSync(second, 'def')
    expect(sha256File(first)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256Files([first, second])).toBe(createHash('sha256').update('abcdef').digest('hex'))
  })

  it('detects any trusted-result mutation and any smoke result', () => {
    const root = temporaryDirectory()
    const before = snapshotDirectory(root)
    expect(before).toEqual({})
    expect(() => assertSmokeResultsEmpty(root)).not.toThrow()
    writeFileSync(resolve(root, 'baseline'), 'candidate')
    const after = snapshotDirectory(root)
    expect(() => assertDirectorySnapshotUnchanged(before, after)).toThrow(/modified/)
    expect(() => assertSmokeResultsEmpty(root)).toThrow(/saved result or baseline/)
  })
})
