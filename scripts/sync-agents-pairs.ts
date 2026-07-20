/**
 * Generates the CLAUDE.md file that sits beside every AGENTS.md.
 *
 * AGENTS.md is the single source of truth for agent instructions. Claude Code
 * reads CLAUDE.md, so every AGENTS.md gets a sibling. There are TWO modes, and
 * the difference is deliberate:
 *
 *   Repo (default)   — CLAUDE.md is a one-line `@AGENTS.md` import. Cheap, and
 *                      the two can never drift. Gitignored; recreated on Claude
 *                      session start and guarded on commit.
 *
 *   Templates        — CLAUDE.md is a byte-identical COPY of AGENTS.md. A
 *   (--templates)      scaffolded user project must not depend on Claude Code's
 *                      `@` import resolving; it just gets both files, 1:1, no
 *                      magic. This rule is special to templates we publish.
 *
 * Usage: pnpm sync:agents
 *
 * Flags:
 *   --verify             CI/commit check; exit 1 on drift, no writes.
 *   --templates          Write byte-identical copies for the shipped templates
 *                        instead of pointers for the repo. Run from
 *                        create-three-flatland's build (so scaffold tests see
 *                        them) and prepack (so they land in the published
 *                        tarball). Deliberately NOT run by the Claude
 *                        session-start hook: those files are product, not
 *                        developer ergonomics.
 *
 * Both sets are gitignored and generated; the two modes cover disjoint paths,
 * so neither can clobber the other.
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
const templatesMode = process.argv.includes('--templates')

/**
 * Repo-relative paths of every tracked AGENTS.md, minus the shipped templates.
 */
function listAgentFiles(): string[] {
  const stdout = execFileSync('git', ['ls-files', '-z', '--', '*AGENTS.md', 'AGENTS.md'], {
    cwd: ROOT,
    encoding: 'utf-8',
  })
  const all = stdout.split('\0').filter(Boolean)
  // --templates inverts the filter: generate exactly the pointers the repo mode
  // skips. The two sets are disjoint, so neither mode can clobber the other.
  return all.filter((path) => path.startsWith(EXCLUDED_PREFIX) === templatesMode).sort()
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

/** What CLAUDE.md must contain next to a given AGENTS.md, per mode. */
function expectedContent(agentFile: string): string {
  return templatesMode ? readFileSync(join(ROOT, agentFile), 'utf-8') : POINTER
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
      if (readFileSync(target, 'utf-8') !== expectedContent(agentFile)) {
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
    const content = expectedContent(agentFile)
    if (existsSync(target) && readFileSync(target, 'utf-8') === content) continue
    writeFileSync(target, content)
    console.log(`  wrote ${relPath}`)
    written++
  }

  const kind = templatesMode ? 'copy' : 'pointer'
  console.log(`✓ ${agentFiles.length} AGENTS.md file(s), ${written} ${kind}(s) written.`)
}

main()
