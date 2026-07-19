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

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MANIFEST = join(dirname(dirname(fileURLToPath(import.meta.url))), 'tools/vscode/package.json')

/** Fold a `-<tag>.<n>` prerelease counter into the patch position. */
export function marketplaceVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)-[0-9a-z-]+\.(\d+)$/i.exec(version)
  if (!match) {
    if (/^\d+\.\d+\.\d+$/.test(version)) return version
    throw new Error(
      `Cannot derive a Marketplace version from '${version}'. Expected MAJOR.MINOR.PATCH ` +
        `or MAJOR.MINOR.PATCH-<tag>.<n> (what changesets pre-mode produces).`,
    )
  }
  const [, major, minor, , counter] = match
  return `${major}.${minor}.${counter}`
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
    console.error(`vsix: publishing as ${derived} (preview: ${manifest.preview === true})`)
  }

  console.log(derived)
}
