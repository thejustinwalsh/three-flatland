import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// changesets/action@v1 discovers releases through these legacy stdout lines.
// Changesets 3 supplies the equivalent facts in its structured output report.
export function legacyTagLines(report) {
  const tags = new Set()
  for (const line of report.split('\n').filter((line) => line.trim())) {
    const event = JSON.parse(line)
    if (event.type !== 'git-tag') continue
    const match = typeof event.tag === 'string' && /^(@[^/\s]+\/[^@\s]+|[^/@\s]+)@([^\s]+)$/.exec(event.tag)
    if (!match || match[1] !== event.packageName) throw new Error('Invalid Changesets git-tag event')
    tags.add(event.tag)
  }
  return [...tags].map((tag) => `New tag: ${tag}`)
}

function publish(args) {
  const directory = mkdtempSync(join(tmpdir(), 'flatland-publish-report-'))
  const report = join(directory, 'events.jsonl')
  try {
    const require = createRequire(import.meta.url)
    const child = spawnSync(process.execPath, [require.resolve('@changesets/cli/bin.js'), 'publish', ...args], {
      cwd: resolve(import.meta.dirname, '..'),
      stdio: 'inherit',
      env: { ...process.env, CHANGESETS_OUTPUT: report },
    })
    if (child.error) throw child.error
    if (existsSync(report)) for (const line of legacyTagLines(readFileSync(report, 'utf8'))) console.log(line)
    process.exitCode = child.status ?? 1
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) publish(process.argv.slice(2))
