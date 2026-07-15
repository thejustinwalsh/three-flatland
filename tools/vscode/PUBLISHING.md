# Publishing runbook

Operational guide for shipping `@three-flatland/vscode` to the VS Code Marketplace and Open VSX.
For the packaging/build mechanics themselves (what the scripts and CI workflow actually do), see
[`.github/workflows/publish-vscode.yml`](../../.github/workflows/publish-vscode.yml) and
[`scripts/bundle-sidecars.mjs`](scripts/bundle-sidecars.mjs) — this doc is the human-side setup
and day-to-day operating checklist, not a design doc.

## One-time setup (do this before the first release)

None of this can be done by an agent — each step requires a human completing an OAuth/account flow
in a browser.

### 1. Register the VS Code Marketplace publisher

1. Go to <https://marketplace.visualstudio.com/manage> and sign in (Microsoft account).
2. Create a publisher with the **exact ID `three-flatland`** — this must match `"publisher"` in
   `tools/vscode/package.json`. If that exact ID is taken, you'll need to either negotiate for it
   or change `package.json`'s `publisher` field to match whatever you actually register (and update
   the marketplace badge URL in `README.md` to match).
3. Generate a Personal Access Token at <https://dev.azure.com> (any organization, or "All accessible
   organizations"): **User Settings → Personal Access Tokens → New Token**, scope
   **Marketplace → Manage**, expiration however long you're comfortable with (these can be rotated
   later without re-touching CI — just update the GitHub secret).
4. This is your `VSCE_PAT`.

### 2. Register the Open VSX namespace

This is also the step that covers Cursor, Windsurf, Trae, Google Antigravity, AWS Kiro, VSCodium,
Gitpod, and Eclipse Theia — every VS Code fork that isn't VS Code itself now runs on Open VSX as
its actual extension registry (not a fallback, not a mirror). There is no separate "Cursor
marketplace" to publish to and no extra step below for it — `publish-vscode.yml`'s existing
`ovsx publish` call, in the same `publish` job as the VS Code Marketplace publish, is the whole
auto-deploy story for all of them at once.

1. Go to <https://open-vsx.org> and sign in with GitHub.
2. Go to <https://open-vsx.org/user-settings/tokens> and generate an access token. This is your
   `OVSX_PAT`.
3. Claim the `three-flatland` namespace. Either:
   - Via the website's namespace UI, or
   - Locally: `npx ovsx create-namespace three-flatland -p <OVSX_PAT>` (run from anywhere — this
     talks to the registry directly, not tied to this repo).

### 3. Add both tokens as GitHub secrets

`publish-vscode.yml`'s `publish` job runs under `environment: release` — the **same environment**
`release.yml` already uses for the npm publish token, so if that's already configured you're just
adding two more secrets to it.

1. Repo → **Settings → Environments → release** (create it first if `release.yml`'s own npm publish
   hasn't been set up yet — it should already exist).
2. Add environment secrets: `VSCE_PAT` and `OVSX_PAT` (the two values from steps 1–2).

Do **not** add these as repo-wide secrets — the `release` environment scoping means only jobs that
explicitly declare `environment: release` can read them, which is why `check-version` and
`build-codelens-service` (jobs that don't need publish credentials) don't have access even though
they're in the same workflow file.

## First release

The hand-written changeset (`.changeset/vscode-tools-initial-release.md`) is already in place,
naming `@three-flatland/vscode: minor`. From here the normal release flow takes over:

1. Merge this branch to `main` (through whatever your normal PR process is).
2. `release.yml` runs after CI succeeds on `main`. Since there's a pending changeset, `changesets/
   action@v1` opens a **"Version Packages" PR** — this bumps `tools/vscode/package.json`'s version
   and writes `tools/vscode/CHANGELOG.md` for the first time (changesets creates the CHANGELOG file
   if it doesn't exist yet).
3. Merge that PR. `tools/vscode/package.json`'s version is now live on `main`.
4. That merge push touches `tools/vscode/package.json`, which triggers `publish-vscode.yml`
   automatically. Watch it in the **Actions** tab:
   - `check-version` — compares local vs. published version, should resolve `should_publish=true`
     (nothing is published yet).
   - `build-codelens-service` — 6 parallel legs, one per platform (darwin x2, linux x2, win32 x2,
     the last covering both `windows-latest` for x64 and the native `windows-11-arm` runner for
     arm64 — Surface/Copilot+ PCs). ~2-5 min each depending on Rust cache state.
   - `assemble-and-package` — merges all 6 binaries, builds audio-play once, produces the one
     universal VSIX.
   - `publish` — publishes to both registries.

### Verify it actually worked

- <https://marketplace.visualstudio.com/items?itemName=three-flatland.tools> — listing should be
  live within a few minutes of the `publish` job succeeding (marketplace indexing has a short
  delay).
- <https://open-vsx.org/extension/three-flatland/tools> — same check for Open VSX.
- Install for real, on a machine that has **never** had this extension in dev mode:
  `code --install-extension three-flatland.tools`, then open a `.png` and confirm the Flatland
  submenu appears and a tool actually opens. This is the one thing nothing in this whole pipeline
  can verify except an actual installed-from-marketplace run — everything up to this point only
  proves the VSIX *builds*, not that the *published, installed* artifact works end to end.
- In Cursor (or Windsurf/Trae/any other Open VSX-backed fork): Extensions panel
  (`Cmd+Shift+X`/`Ctrl+Shift+X`) → search "Flatland Tools" → Install. `cursor --install-extension
  three-flatland.tools` works the same way from the CLI. Same Open VSX listing, same artifact —
  this isn't a separate publish target, just a separate client reading the one above.

## Every release after the first

Nothing extra to do beyond normal changeset hygiene:

1. `tools/vscode` lives outside `packages/`, so — same as `minis/` and `skills/` — it's **never**
   auto-detected by `scripts/generate-changesets.ts`'s commit-scanning bot. Any change you want
   reflected in the next VSIX needs a **hand-written changeset** naming `@three-flatland/vscode`
   (see `.changeset/CLAUDE.md` for the exact format). Forgetting this doesn't break anything loudly
   — it just means that change ships in the extension's *code* next time something else triggers a
   release, but never gets its own version bump or CHANGELOG entry of its own.
2. Everything else is automatic: the version bump PR, the merge, the `publish-vscode.yml` trigger,
   the five-platform build, the publish. You don't need to touch this file's steps again.

## Troubleshooting

**`check-version` says `should_publish=false` but you expected a publish.** Run `npx vsce show
three-flatland.tools --json` locally and compare `versions[0].version` against `tools/vscode/
package.json`'s `version` by hand — if they already match, the workflow correctly did nothing (it's
not re-publishing an unchanged version, by design).

**One of the 6 `build-codelens-service` legs fails.** `fail-fast: false` means the other 5 keep
running — re-run just the failed job from the Actions UI once you've fixed whatever broke, rather
than re-running the whole workflow. `assemble-and-package` won't start until all 6 succeed.

**`publish` fails with "already exists" / a duplicate-version error.** This shouldn't happen —
both `vsce publish` and `ovsx publish` are called with `--skip-duplicate`, which no-ops instead of
erroring on a version that's already live. If you see a hard failure here anyway, that's a real
signal something's wrong (a network issue, an expired/revoked token, a marketplace-side outage) —
don't just re-run it blindly; check the actual error first.

**A token needs rotating.** Generate a new one (same steps as initial setup above), update the
GitHub environment secret, done — nothing in the workflow itself references the token's value, it's
only ever read from `secrets.VSCE_PAT`/`secrets.OVSX_PAT` at publish time.

**FL Audio's CodeLenses never appear after installing from the marketplace, but work fine in a dev
build.** This was a real bug in the first version of this pipeline: `actions/upload-artifact` /
`download-artifact` normalize all file permissions to `644`, silently stripping the executable bit
off the `codelens-service` binaries built by the `build-codelens-service` matrix before they ever
reach `assemble-and-package`. `tools/codelens-service/src/client.ts`'s `start()` now restores it
(`chmod 755`, non-Windows only) unconditionally right before `spawn()`, so this should no longer be
reachable — but if it resurfaces, check `Output → FL Audio` for an `EACCES` error and confirm that
fix is still in place before looking anywhere else.

**You need to test the packaging locally without touching CI.** From `tools/vscode/`:

```sh
pnpm run bundle:sidecars   # current platform's codelens-service + audio-play
pnpm build                 # extension.js + webviews
pnpm run package           # produces three-flatland-tools-<version>.vsix
```

This only ever bundles the **current machine's** platform for codelens-service — it will not
produce a true universal VSIX locally (that requires the 6-platform CI matrix). It's still the
right way to sanity-check a packaging-script change before pushing.
