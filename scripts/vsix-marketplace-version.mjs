#!/usr/bin/env node
/**
 * Derive the VS Code Marketplace version for `@three-flatland/vscode`.
 *
 * The Marketplace rejects semver prerelease versions outright — `vsce publish`
 * throws on any `-alpha.N` suffix (see @vscode/vsce `publish.js`: "The VS
 * Marketplace doesn't support prerelease versions"). But the repo is in
 * changesets pre-mode, which is repo-global (`pre.json` has no per-package
 * exclusion), so changesets stamps `-alpha.N` onto the extension too.
 *
 * So we fold the alpha counter into the patch position at publish time:
 *
 *   0.3.0-alpha.1  ->  0.3.1
 *   0.4.0-alpha.7  ->  0.4.7
 *   1.2.3          ->  1.2.3   (already clean — passes through untouched)
 *
 * This is strictly increasing, which is what the Marketplace requires. The
 * reason it holds: changesets' pre-release counter is PER-PACKAGE and never
 * resets within a pre period (in this repo `three-flatland` sits at alpha.8
 * while the extension is at alpha.0), and the base MAJOR.MINOR never
 * decreases. Counter always up + base never down => the derived version is
 * always greater than the last one published.
 *
 * The naive alternative — just stripping the suffix — is broken: in pre-mode
 * consecutive releases share a base version (`0.3.0-alpha.0`, `0.3.0-alpha.1`,
 * …), so stripping collapses them all to `0.3.0` and the second publish is
 * rejected as a duplicate.
 *
 * "This is alpha" is signalled to users by `"preview": true` in the manifest
 * (the Marketplace Preview badge), not by the version string.
 *
 * On exiting pre-mode this becomes a no-op, because clean versions pass
 * through. The one manual step then: bump the extension past the last version
 * actually published to the Marketplace, since the derived patch numbers will
 * have run ahead of the committed `package.json`.
 *
 * Usage:
 *   node scripts/vsix-marketplace-version.mjs            # print the derived version
 *   node scripts/vsix-marketplace-version.mjs --write    # ALSO write it into the manifest
 *
 * `--write` is for CI only, immediately before `vsce package`, and the result
 * must NEVER be committed: the repo's package.json has to keep the real
 * changesets-managed `-alpha.N` version or the next `changeset version` will
 * compute the wrong bump and the counter sequence breaks.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VSCODE_DIR = join(dirname(dirname(fileURLToPath(import.meta.url))), 'tools/vscode')
const MANIFEST = join(VSCODE_DIR, 'package.json')
const CHANGELOG = join(VSCODE_DIR, 'CHANGELOG.md')

/** Fold a `-<tag>.<n>` prerelease counter into the patch position. */
export function marketplaceVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)-[0-9a-z-]+\.(\d+)$/i.exec(version)
  if (!match) {
    if (/^\d+\.\d+\.\d+$/.test(version)) return version
    throw new Error(
      `Cannot derive a Marketplace version from '${version}'. Expected MAJOR.MINOR.PATCH ` +
        `or MAJOR.MINOR.PATCH-<tag>.<n> (what changesets pre-mode produces).`
    )
  }
  const [, major, minor, , counter] = match
  return `${major}.${minor}.${counter}`
}

/**
 * Rewrite changesets' version headings through the same transform.
 *
 * vsce ships CHANGELOG.md in the VSIX and both marketplaces render it as a
 * Changelog tab, but changesets writes headings at the raw version
 * (`## 0.2.0-alpha.1`) while we publish the derived one (`0.2.1`). Left alone,
 * users read a changelog whose versions match nothing they can install.
 *
 * Applying the identical mapping keeps history correct, not just the newest
 * entry: every past release was published through this same transform, so each
 * old heading maps to the version that actually shipped for it. Headings that
 * are already clean (the hand-set 0.1.0 release) pass through untouched.
 */
export function rewriteChangelogHeadings(markdown) {
  // `[ \t]` not `\s`: `\s` matches newlines, so a greedy `\s*$` under the `m`
  // flag swallows the blank line after each heading and reflows the document.
  return markdown.replace(/^(##+[ \t]+)(\d+\.\d+\.\d+(?:-[0-9a-z-]+\.\d+)?)[ \t]*$/gim, (line, hashes, version) => {
    try {
      return `${hashes}${marketplaceVersion(version)}`
    } catch {
      return line
    }
  })
}

// CLI only when run directly — importing this module (tests, other scripts)
// must not read the manifest or print anything.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  const derived = marketplaceVersion(manifest.version)

  if (process.argv.includes('--write')) {
    if (derived !== manifest.version) {
      manifest.version = derived
      writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
      console.error('vsix: rewrote manifest version for the Marketplace — do NOT commit this')
    }

    if (existsSync(CHANGELOG)) {
      const original = readFileSync(CHANGELOG, 'utf8')
      const rewritten = rewriteChangelogHeadings(original)
      if (rewritten !== original) {
        writeFileSync(CHANGELOG, rewritten)
        console.error('vsix: rewrote CHANGELOG version headings to match — do NOT commit this')
      }
    }

    console.error(`vsix: publishing as ${derived} (preview: ${manifest.preview === true})`)
  }

  console.log(derived)
}
