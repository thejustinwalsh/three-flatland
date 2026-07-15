#!/usr/bin/env node
// `vsce package`/`vsce publish` validate package.json's own `name` field
// against the VS Code extension-manifest schema, which forbids npm scope
// syntax (`@scope/name`) — this package is `@three-flatland/vscode`
// everywhere else in the monorepo (pnpm --filter, workspace:* semantics,
// and — load-bearing — dozens of e2e specs assert
// `vscode.extensions.all.find(e => e.packageJSON.name ===
// '@three-flatland/vscode')` at runtime). Renaming the real field would
// ripple across all of that for no benefit; instead this script writes a
// temporary package.json with just `name` swapped to a valid extension
// id segment, runs vsce, and restores the original file in a `finally` —
// on disk before this script runs and after it exits, package.json is
// always the real, unmodified one.
//
// Usage: node scripts/package-vsix.mjs <package|publish> [...vsce args]
// Example: node scripts/package-vsix.mjs package --no-dependencies --target darwin-arm64
//
// Called through a package.json script + `pnpm run <script> -- <args>`
// forwarding (e.g. `pnpm run package -- --target darwin-arm64`), pnpm
// inserts its OWN `--` before the forwarded args regardless of whether
// the script string already ends in one — verified against a real
// invocation, not assumed. Filtering out bare `--` tokens below (rather
// than slicing from the first/last one) makes this robust to that no
// matter how many separators end up in argv.
import { execFileSync } from 'node:child_process'
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const VSCODE_ROOT = join(__dirname, '..')
const REPO_ROOT = join(VSCODE_ROOT, '..', '..')
const PKG_PATH = join(VSCODE_ROOT, 'package.json')

// vsce only looks for a LICENSE next to package.json, not up the
// monorepo tree — copy the real one in so the marketplace listing shows
// it (and the "no LICENSE found" warning goes away). Build artifact, not
// source: gitignored, regenerated here every package/publish run so it
// can never drift from the repo root's actual license text.
copyFileSync(join(REPO_ROOT, 'LICENSE'), join(VSCODE_ROOT, 'LICENSE'))
const VSCE_BIN = join(
  VSCODE_ROOT,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vsce.cmd' : 'vsce'
)

// Extension id becomes `<publisher>.<name>` = `three-flatland.tools` —
// short, unambiguous given the publisher prefix already carries the
// project name (matches real-world convention, e.g. `ms-python.python`
// doesn't repeat "ms-python" in its own `name`).
const VSCE_VALID_NAME = 'tools'

const vsceCommand = process.argv[2] ?? 'package'
const extraArgs = process.argv.slice(3).filter((a) => a !== '--')

const originalText = readFileSync(PKG_PATH, 'utf8')
const pkg = JSON.parse(originalText)
const realName = pkg.name
pkg.name = VSCE_VALID_NAME

// `vsce`'s own default output filename is derived from the (now
// temporary) `name` — `tools-0.0.0.vsix`, which reads as some generic
// "tools" package instead of this project's extension. Give it a
// self-descriptive name unless the caller already asked for a specific
// one (e.g. a per-platform target build's own -o).
const hasExplicitOut = extraArgs.includes('-o') || extraArgs.includes('--out')
const args = [vsceCommand, ...extraArgs]
if (vsceCommand === 'package' && !hasExplicitOut) {
  args.push('-o', `three-flatland-tools-${pkg.version}.vsix`)
}

// README.md's screenshots are relative paths (docs/marketplace/*.png) —
// vsce rewrites these to raw.githubusercontent.com URLs for the
// marketplace listing, but infers the branch from whatever's currently
// checked out unless told otherwise. This repo packages/publishes from
// feature branches routinely; without pinning this explicitly, an image
// URL baked from a since-deleted branch would 404 on the published
// listing forever (the VSIX itself doesn't get repackaged just because
// the branch went away).
const hasExplicitBranch = extraArgs.includes('--githubBranch')
if (!hasExplicitBranch) args.push('--githubBranch', 'main')

try {
  writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`[package-vsix] package.json name: ${realName} → ${VSCE_VALID_NAME} (temporary)`)
  execFileSync(VSCE_BIN, args, { cwd: VSCODE_ROOT, stdio: 'inherit' })
} finally {
  writeFileSync(PKG_PATH, originalText)
  console.log(`[package-vsix] package.json restored (name: ${realName})`)
}
