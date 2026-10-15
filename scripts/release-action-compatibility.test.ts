import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readPreState } from '@changesets/pre'
import { readChangesets } from '@changesets/read'
import { afterEach, describe, expect, it } from 'vitest'

// These exact test dependencies match changesets/action v2.1.2's bundled reader.
const root = fileURLToPath(new URL('../', import.meta.url))
const fixtures: string[] = []
const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), 'flatland-action-compatibility-'))
  fixtures.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('Changesets action prerelease compatibility', () => {
  it.each([true, false])('reads real archived notes with pending notes: %s', async (hasPending) => {
    const directory = fixture()
    mkdirSync(join(directory, '.changeset/pre'), { recursive: true })
    const archived = '---\n"three-flatland": minor\n---\nAlready applied.\n'
    const state = '{"mode":"pre","tag":"alpha"}\n'
    writeFileSync(join(directory, '.changeset/pre/applied.md'), archived)
    writeFileSync(join(directory, '.changeset/pre.json'), state)
    if (hasPending) {
      writeFileSync(join(directory, '.changeset/pending.md'), '---\n"three-flatland": patch\n---\nNext release.\n')
    }

    const preState = await readPreState(directory)
    const notes = await readChangesets(directory)
    // This is action v2.1.2's actual readChangesetState filtering rule.
    const pending = preState?.mode === 'pre' ? notes.filter((note) => !note.id.startsWith('pre/')) : notes
    expect(notes.map((note) => note.id)).toContain('pre/applied')
    expect(pending.map((note) => note.id)).toEqual(hasPending ? ['pending'] : [])
    expect(readFileSync(join(directory, '.changeset/pre/applied.md'), 'utf8')).toBe(archived)
    expect(readFileSync(join(directory, '.changeset/pre.json'), 'utf8')).toBe(state)
  })

  it('forwards the action report path through the real release script without publishing', () => {
    const directory = fixture()
    const bin = join(directory, 'bin')
    const output = join(directory, 'action-output.ndjson')
    mkdirSync(bin)
    writeFileSync(join(bin, 'nx'), '#!/bin/sh\nexit 0\n')
    writeFileSync(
      join(bin, 'changeset'),
      `#!/usr/bin/env node
const { writeFileSync } = require('node:fs')
if (process.argv[2] !== 'publish') process.exit(1)
writeFileSync(process.env.CHANGESETS_OUTPUT, JSON.stringify({
  type: 'git-tag', packageName: 'three-flatland', tag: 'three-flatland@0.1.0-alpha.11'
}) + '\\n')
`
    )
    chmodSync(join(bin, 'nx'), 0o755)
    chmodSync(join(bin, 'changeset'), 0o755)
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    // Fail before execution if this command changes: only the two fake binaries may run.
    expect(manifest.scripts.release).toBe('nx run-many -t build && changeset publish')
    execFileSync('/bin/sh', ['-c', manifest.scripts.release], {
      cwd: root,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CHANGESETS_OUTPUT: output },
      stdio: 'pipe',
    })
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual({
      type: 'git-tag',
      packageName: 'three-flatland',
      tag: 'three-flatland@0.1.0-alpha.11',
    })
  })
})
