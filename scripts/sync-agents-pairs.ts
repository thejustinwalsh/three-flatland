/**
 * Generates the CLAUDE.md pointer file that sits beside every AGENTS.md.
 *
 * AGENTS.md is the single source of truth for agent instructions in this repo.
 * Claude Code reads CLAUDE.md, so each AGENTS.md gets a one-line sibling
 * `CLAUDE.md` containing `@AGENTS.md` — an import directive, not a copy, so the
 * two can never drift. The generated pointers are gitignored; this script
 * recreates them on Claude session start and guards them on commit.
 *
 * Usage: pnpm sync:agents
 *
 * Flags:
 *   --verify             CI/commit check; exit 1 on drift, no writes.
 *
 * Excluded: packages/create-three-flatland/templates/. Those CLAUDE.md files
 * are shipped product — tracked in git, published inside the
 * create-three-flatland tarball, and asserted by scaffold.test.ts and
 * scripts/scaffold-smoke.ts. They are never generated and never ignored.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

// Shipped-product templates — see the module docblock. Anything under this
// prefix is invisible to this script in both write and verify mode.
const EXCLUDED_PREFIX = 'packages/create-three-flatland/templates/'

const POINTER = '@AGENTS.md\n'

const verify = process.argv.includes('--verify')

/**
 * Repo-relative paths of every tracked AGENTS.md, minus the shipped templates.
 */
function listAgentFiles(): string[] {
  const stdout = execFileSync('git', ['ls-files', '-z', '--', '*AGENTS.md', 'AGENTS.md'], {
    cwd: ROOT,
    encoding: 'utf-8',
  })
  return stdout
    .split('\0')
    .filter(Boolean)
    .filter((path) => !path.startsWith(EXCLUDED_PREFIX))
    .sort()
}

/**
 * Repo-relative paths of every tracked CLAUDE.md that is NOT a shipped
 * template. These should not exist — the pointers are generated and ignored,
 * so a tracked one means someone hand-committed a file that will go stale.
 */
function listStrayTrackedPointers(): string[] {
  const stdout = execFileSync('git', ['ls-files', '-z', '--', '*CLAUDE.md', 'CLAUDE.md'], {
    cwd: ROOT,
    encoding: 'utf-8',
  })
  return stdout
    .split('\0')
    .filter(Boolean)
    .filter((path) => !path.startsWith(EXCLUDED_PREFIX))
    .sort()
}

function main(): void {
  const agentFiles = listAgentFiles()
  const stray = listStrayTrackedPointers()

  if (verify) {
    const drifted: string[] = []

    for (const agentFile of agentFiles) {
      const target = join(ROOT, dirname(agentFile), 'CLAUDE.md')
      const relPath = target.replace(ROOT + '/', '')
      if (!existsSync(target)) {
        drifted.push(`${relPath} (missing)`)
        continue
      }
      if (readFileSync(target, 'utf-8') !== POINTER) {
        drifted.push(`${relPath} (content differs)`)
      }
    }

    if (stray.length > 0) {
      console.error('✗ CLAUDE.md is tracked in git outside the shipped templates:')
      for (const path of stray) console.error(`    ${path}`)
      console.error('')
      console.error(
        'CLAUDE.md is generated from AGENTS.md and must stay gitignored.\n' +
          'Write your instructions in the sibling AGENTS.md instead, then run:\n' +
          `    git rm --cached ${stray.join(' ')}\n` +
          '    pnpm sync:agents'
      )
      process.exit(1)
    }

    if (drifted.length > 0) {
      console.error(`✗ ${drifted.length} CLAUDE.md pointer(s) out of sync:`)
      for (const path of drifted) console.error(`    ${path}`)
      console.error('')
      console.error('Run `pnpm sync:agents` to fix.')
      process.exit(1)
    }

    console.log(`✓ ${agentFiles.length} CLAUDE.md pointer(s) in sync.`)
    return
  }

  let written = 0

  for (const agentFile of agentFiles) {
    const target = join(ROOT, dirname(agentFile), 'CLAUDE.md')
    const relPath = target.replace(ROOT + '/', '')
    if (existsSync(target) && readFileSync(target, 'utf-8') === POINTER) continue
    writeFileSync(target, POINTER)
    console.log(`  wrote ${relPath}`)
    written++
  }

  console.log(`✓ ${agentFiles.length} AGENTS.md file(s), ${written} pointer(s) written.`)
}

main()
