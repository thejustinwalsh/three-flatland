/**
 * Generates changesets from conventional commits on a PR branch.
 *
 * Parses commits between a base branch and HEAD, maps changed files to
 * publishable packages, determines semver bump types, and writes
 * `.changeset/auto-<package>-<id>.md` files (one per package).
 *
 * The id is a 7-char base36 inverted timestamp of the branch's first commit,
 * so files are deterministic per branch and sort most-recent-first.
 *
 * Usage:
 *   pnpm changeset:generate --branch jw/my-feature
 *   pnpm changeset:generate --branch jw/my-feature --base origin/main
 */

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const CHANGESET_DIR = join(ROOT, '.changeset')

const MAX_TS = 9999999999

let capMajor = false

// --- Types ---

type BumpType = 'major' | 'minor' | 'patch'

interface ParsedCommit {
  sha: string
  type: string
  scope: string | null
  breaking: boolean
  description: string
  body: string
  bump: BumpType | null
  files: string[]
  shortstat: string
  packages: string[]
}

interface PackageChangeset {
  name: string
  bump: BumpType
  commits: ParsedCommit[]
}

// --- Conventional commit → bump mapping ---

const BUMP_MAP: Record<string, BumpType> = {
  feat: 'minor',
  fix: 'patch',
  perf: 'patch',
  refactor: 'patch',
}

// Types that don't generate changesets
const SKIP_TYPES = new Set(['docs', 'test', 'ci', 'chore', 'style', 'build'])

// --- Branch ID ---

function branchId(base: string): string {
  try {
    const output = execSync(`git log --format="%ct" --reverse ${base}..HEAD`, {
      cwd: ROOT,
      encoding: 'utf-8',
    }).trim()
    const firstLine = output.split('\n')[0]
    if (!firstLine) return (MAX_TS).toString(36).padStart(7, '0')
    const ts = parseInt(firstLine, 10)
    return (MAX_TS - ts).toString(36).padStart(7, '0')
  } catch {
    return (MAX_TS).toString(36).padStart(7, '0')
  }
}

// --- Package discovery ---

function discoverPackages(): Map<string, string> {
  const mapping = new Map<string, string>()

  for (const dir of ['packages']) {
    const absDir = join(ROOT, dir)
    if (!existsSync(absDir)) continue

    for (const entry of readdirSync(absDir)) {
      const pkgPath = join(absDir, entry, 'package.json')
      if (!existsSync(pkgPath)) continue

      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
        if (pkg.name && pkg.private !== true) {
          mapping.set(`${dir}/${entry}/`, pkg.name)
        }
      } catch {
        // Skip malformed package.json
      }
    }
  }

  return mapping
}

// --- Git helpers ---

function getCommitRange(base: string): string[] {
  try {
    const output = execSync(`git log --format="%H" ${base}..HEAD`, {
      cwd: ROOT,
      encoding: 'utf-8',
    }).trim()
    if (!output) return []
    return output.split('\n').map((sha) => sha.trim())
  } catch {
    return []
  }
}

function getCommitMessage(sha: string): { subject: string; body: string } {
  const subject = execSync(`git log --format="%s" -1 ${sha}`, {
    cwd: ROOT,
    encoding: 'utf-8',
  }).trim()

  const body = execSync(`git log --format="%b" -1 ${sha}`, {
    cwd: ROOT,
    encoding: 'utf-8',
  }).trim()

  return { subject, body }
}

function getChangedFiles(sha: string): string[] {
  try {
    const output = execSync(`git diff-tree --no-commit-id --name-only -r ${sha}`, {
      cwd: ROOT,
      encoding: 'utf-8',
    }).trim()
    if (!output) return []
    return output.split('\n').map((f) => f.trim())
  } catch {
    return []
  }
}

function getShortStat(sha: string): string {
  try {
    return execSync(`git diff-tree --no-commit-id --shortstat -r ${sha}`, {
      cwd: ROOT,
      encoding: 'utf-8',
    }).trim()
  } catch {
    return ''
  }
}

// --- Conventional commit parsing ---

const CONVENTIONAL_RE = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)/

function parseConventionalCommit(
  sha: string,
  packageMap: Map<string, string>,
): ParsedCommit | null {
  const { subject, body } = getCommitMessage(sha)
  const match = subject.match(CONVENTIONAL_RE)
  if (!match) return null

  const [, type, scope, bang, description] = match
  const breakingInBody = body.includes('BREAKING CHANGE')
  const breaking = !!bang || breakingInBody

  const rawBump: BumpType | null = breaking ? 'major' : (BUMP_MAP[type] ?? null)
  const bump: BumpType | null = rawBump && capMajor && rawBump === 'major' ? 'minor' : rawBump

  // Skip types that don't produce changesets
  if (!bump && SKIP_TYPES.has(type)) return null

  const files = getChangedFiles(sha)
  const packages = mapFilesToPackages(files, packageMap)

  // Skip commits that don't affect any publishable package
  if (packages.length === 0) return null

  const shortstat = getShortStat(sha)

  return {
    sha,
    type,
    scope: scope || null,
    breaking,
    description,
    body,
    bump,
    files,
    shortstat,
    packages,
  }
}

function mapFilesToPackages(files: string[], packageMap: Map<string, string>): string[] {
  const matched = new Set<string>()

  for (const file of files) {
    for (const [prefix, name] of packageMap) {
      if (file.startsWith(prefix)) {
        matched.add(name)
      }
    }
  }

  return [...matched]
}

// --- Bump precedence ---

const BUMP_ORDER: Record<BumpType, number> = { patch: 1, minor: 2, major: 3 }

function highestBump(a: BumpType, b: BumpType): BumpType {
  return BUMP_ORDER[a] >= BUMP_ORDER[b] ? a : b
}

// --- Changeset aggregation ---

function aggregateByPackage(commits: ParsedCommit[]): PackageChangeset[] {
  const map = new Map<string, PackageChangeset>()

  for (const commit of commits) {
    if (!commit.bump) continue

    for (const pkg of commit.packages) {
      const existing = map.get(pkg)
      if (existing) {
        existing.bump = highestBump(existing.bump, commit.bump)
        existing.commits.push(commit)
      } else {
        map.set(pkg, { name: pkg, bump: commit.bump, commits: [commit] })
      }
    }
  }

  return [...map.values()]
}

// --- Changeset file generation ---

function sanitizeName(name: string): string {
  return name.replace(/[@/]/g, '-').replace(/^-+/, '')
}

interface Metadata {
  branch: string
  repo?: string
  pr?: number
}

function generateChangesetContent(changeset: PackageChangeset, meta: Metadata): string {
  const { name, bump, commits } = changeset

  const frontmatter = `---\n"${name}": ${bump}\n---`

  // Metadata block
  const metaLines = [`> Branch: ${meta.branch}`]
  if (meta.repo && meta.pr) {
    metaLines.push(`> PR: https://github.com/${meta.repo}/pull/${meta.pr}`)
  }
  const metaBlock = metaLines.join('\n')

  // Per-commit details with SHAs for AI-assisted changelog enhancement
  const entries = commits.map((c) => {
    const lines = [`### ${c.sha}`, `${c.type}: ${c.description}`]
    if (c.body) lines.push(c.body)
    lines.push(`Files: ${c.files.join(', ')}`)
    if (c.shortstat) lines.push(`Stats: ${c.shortstat}`)
    return lines.join('\n')
  })

  return `${frontmatter}\n\n${metaBlock}\n\n${entries.join('\n\n')}\n`
}

function cleanBranchChangesets(id: string): void {
  if (!existsSync(CHANGESET_DIR)) return

  const suffix = `-${id}.md`
  for (const file of readdirSync(CHANGESET_DIR)) {
    if (file.startsWith('auto-') && file.endsWith(suffix)) {
      rmSync(join(CHANGESET_DIR, file))
    }
  }
}

function writeChangeset(id: string, changeset: PackageChangeset, meta: Metadata): void {
  const filename = `auto-${sanitizeName(changeset.name)}-${id}.md`
  const filepath = join(CHANGESET_DIR, filename)
  const content = generateChangesetContent(changeset, meta)

  writeFileSync(filepath, content)
  console.log(`  ${changeset.bump} ${changeset.name} → .changeset/${filename}`)
}

// --- Main ---

function parseArgs(): { base: string; branch: string | null; repo: string | null; pr: number | null; capMajor: boolean } {
  const args = process.argv.slice(2)
  let base = 'origin/main'
  let branch: string | null = null
  let repo: string | null = null
  let pr: number | null = null
  let capMajor = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base' && args[i + 1]) {
      base = args[i + 1]
      i++
    } else if (args[i] === '--branch' && args[i + 1]) {
      branch = args[i + 1]
      i++
    } else if (args[i] === '--repo' && args[i + 1]) {
      repo = args[i + 1]
      i++
    } else if (args[i] === '--pr' && args[i + 1]) {
      pr = parseInt(args[i + 1], 10)
      i++
    } else if (args[i] === '--cap-major') {
      capMajor = true
    }
  }

  return { base, branch, repo, pr, capMajor }
}

function main() {
  const args = parseArgs()
  capMajor = args.capMajor

  if (!args.branch) {
    console.error('Error: --branch <name> is required')
    process.exit(1)
  }

  const id = branchId(args.base)
  console.log(`Scanning conventional commits: ${args.base}..HEAD (branch: ${args.branch}, id: ${id})\n`)

  const packageMap = discoverPackages()
  if (packageMap.size === 0) {
    console.log('No publishable packages found.')
    return
  }

  console.log(
    'Packages:',
    [...packageMap.values()].join(', '),
    '\n',
  )

  const shas = getCommitRange(args.base)
  if (shas.length === 0) {
    console.log('No commits found in range.')
    cleanBranchChangesets(id)
    return
  }

  console.log(`Found ${shas.length} commit(s)\n`)

  const commits: ParsedCommit[] = []
  for (const sha of shas) {
    const parsed = parseConventionalCommit(sha, packageMap)
    if (parsed) commits.push(parsed)
  }

  if (commits.length === 0) {
    console.log('No conventional commits that affect publishable packages.')
    cleanBranchChangesets(id)
    return
  }

  const changesets = aggregateByPackage(commits)
  const meta: Metadata = {
    branch: args.branch,
    repo: args.repo ?? undefined,
    pr: args.pr ?? undefined,
  }

  // Clean this branch's old changesets and write fresh ones
  cleanBranchChangesets(id)

  console.log(`Generating ${changesets.length} changeset(s):\n`)
  for (const cs of changesets) {
    writeChangeset(id, cs, meta)
  }

  console.log('\nDone.')
}

main()
