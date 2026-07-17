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
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
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

// Extension id becomes `<publisher>.<name>` = `three-flatland.fl-tools` —
// short, unambiguous given the publisher prefix already carries the
// project name (matches real-world convention, e.g. `ms-python.python`
// doesn't repeat "ms-python" in its own `name`).
const VSCE_VALID_NAME = 'fl-tools'

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

// vsce rewrites README.md's RELATIVE image paths (docs/marketplace/*.png,
// icons/readme/*.png) to absolute URLs at package time — but it resolves
// them against the REPOSITORY ROOT and ignores package.json's
// `repository.directory` (tools/vscode). In this monorepo that drops the
// `tools/vscode/` prefix, so every rewritten image URL 404s on both the
// Marketplace listing and the in-editor Extensions detail page (verified:
// `.../raw/main/docs/marketplace/banner.png` → 404, `.../raw/main/tools/
// vscode/docs/marketplace/banner.png` → 200). Pin the image base to the
// subdir so the rewrite resolves to the committed files. Images are loaded
// live over HTTPS from these URLs — they are NEVER served from inside the
// .vsix (that's why .vscodeignore excludes docs/ + icons/readme/), so a
// base64/local-packaged approach can't work; a reachable HTTPS URL is the
// only path. `main` matches --githubBranch above; the assets must be on it.
const hasImagesBase = extraArgs.some((a) => a === '--baseImagesUrl')
if (!hasImagesBase) {
  args.push(
    '--baseImagesUrl',
    'https://raw.githubusercontent.com/thejustinwalsh/three-flatland/main/tools/vscode'
  )
}

// GUARD: never ship a sidecar-less VSIX. `vsce` packages whatever files
// are on disk and NEVER errors on a missing sidecar — so a package/publish
// run on a tree where `bundle:sidecars` and/or `build` didn't run produces
// a VSIX that installs fine but has NO working CodeLens (bin/) or FL Audio
// (audio-play/), silently. This already bit once: a hand-built 0.0.0 VSIX
// shipped without either. Verify the built artifacts exist and abort loudly
// otherwise, for BOTH a bare local `pnpm run package` and the CI publish
// path (whose assemble-and-package job builds these in dedicated steps
// before calling `pnpm run package`). This only VERIFIES — it must NOT
// build the sidecars itself: CI assembles all five platforms' codelens
// binaries into bin/ before this point, and a current-platform-only
// `bundle:sidecars` here would clobber that universal set down to one.
const codelensBin = `bin/${process.platform}-${process.arch}/codelens-service${
  process.platform === 'win32' ? '.exe' : ''
}`
const requiredArtifacts = [
  ['dist/extension.js', 'pnpm --filter @three-flatland/vscode build'],
  [codelensBin, 'pnpm run bundle:sidecars'],
  ['audio-play/sidecar.js', 'pnpm run bundle:sidecars'],
]
const missingArtifacts = requiredArtifacts.filter(([rel]) => !existsSync(join(VSCODE_ROOT, rel)))
if (missingArtifacts.length > 0) {
  console.error(
    `[package-vsix] Refusing to ${vsceCommand} — the VSIX would ship WITHOUT working ` +
      `CodeLens/FL Audio. Missing build artifacts:\n` +
      missingArtifacts.map(([rel, how]) => `  - ${rel}   (build with: ${how})`).join('\n') +
      `\nRun \`pnpm run bundle:sidecars && pnpm --filter @three-flatland/vscode build\` first. ` +
      `(CI's assemble-and-package job does this before \`pnpm run package\`.)`
  )
  process.exit(1)
}

// Never package/publish the placeholder version. `private: true` does NOT stop
// vsce/ovsx (they ignore it), so a stray local `package`/`publish` before the
// changeset bump lands would emit — or publish to the Marketplace — a 0.0.0
// build. The version only becomes real once `changeset version` consumes the
// pending @three-flatland/vscode changeset (CI's release job does this).
if (pkg.version === '0.0.0') {
  console.error(
    `[package-vsix] Refusing to ${vsceCommand} at version 0.0.0 — the pre-release ` +
      `placeholder. Run \`pnpm changeset:version\` first (consumes the pending ` +
      `@three-flatland/vscode changeset → a real version + CHANGELOG). CI's release ` +
      `job does this automatically; a manual publish must never ship 0.0.0.`
  )
  process.exit(1)
}

try {
  writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`[package-vsix] package.json name: ${realName} → ${VSCE_VALID_NAME} (temporary)`)
  execFileSync(VSCE_BIN, args, { cwd: VSCODE_ROOT, stdio: 'inherit' })
} finally {
  writeFileSync(PKG_PATH, originalText)
  console.log(`[package-vsix] package.json restored (name: ${realName})`)
}
