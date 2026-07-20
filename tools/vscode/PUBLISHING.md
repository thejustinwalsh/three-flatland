# Publishing runbook

Operational guide for shipping `@three-flatland/vscode` to the VS Code Marketplace and Open VSX.
For the packaging/build mechanics themselves (what the scripts and CI workflow actually do), see
[`.github/workflows/build-vscode-vsix.yml`](../../.github/workflows/build-vscode-vsix.yml) and
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
3. Generate a Marketplace-scoped Personal Access Token and store it as **`VSCODE_PAT`** in the
   repo's **`release` environment** (not repo-level secrets — environment scoping means the token
   is only reachable from an approved deployment). CI publishes with it; see §3 below.

   `az login` + `vsce publish --azure-credential` still works for a manual publish from your own
   machine if you ever need to bypass CI, but it is no longer the normal path.

### 2. Register the Open VSX namespace

This is also the step that covers Cursor, Windsurf, Trae, Google Antigravity, AWS Kiro, VSCodium,
Gitpod, and Eclipse Theia — many VS Code forks use Open VSX as their actual extension registry
(not a fallback, not a mirror). For those clients there's no separate marketplace to publish to and
no extra step — a single `ovsx publish` of the built VSIX (see the manual-publish steps below)
covers all of them at once.

1. Go to <https://open-vsx.org> and sign in with GitHub.
2. Go to <https://open-vsx.org/user-settings/tokens> and generate an access token. This is your
   `OVSX_PAT`.
3. Claim the `three-flatland` namespace. Either:
   - Via the website's namespace UI, or
   - Locally: `npx ovsx create-namespace three-flatland -p <OVSX_PAT>` (run from anywhere — this
     talks to the registry directly, not tied to this repo).

### 3. CI secrets — both live in the `release` environment

CI publishes to both registries. Two secrets are required, and both must be on the **`release`
environment** rather than repo-level, so they're reachable only from an approved deployment:

| Secret        | Used for                     | Where to get it                                             |
| ------------- | ---------------------------- | ----------------------------------------------------------- |
| `VSCODE_PAT`  | VS Code Marketplace publish  | <https://marketplace.visualstudio.com/manage> (§1 above)      |
| `OVSX_PAT`    | Open VSX publish             | <https://open-vsx.org/user-settings/tokens> (§2 above)        |

`vsce` reads its token from `VSCE_PAT`, so `release.yml` maps `VSCE_PAT: ${{ secrets.VSCODE_PAT }}`
— the names differ on purpose, don't "fix" one to match the other.

`build-vscode-vsix.yml` remains **build-only**: it produces the universal `vsix` artifact and
stops, so a manual `workflow_dispatch` run can never publish anything. The actual publishing lives
in `release.yml`'s `publish-vsix` job, which downloads that artifact.

Because `publish-vsix` references the `release` environment, it takes **its own approval** — you
will approve twice per release (once for the publish job, once for this). That is deliberate.

## First release

The hand-written changeset (`.changeset/vscode-tools-initial-release.md`) is already in place,
naming `@three-flatland/vscode: minor`. From here the normal release flow takes over:

1. Merge this branch to `main` (through whatever your normal PR process is).
2. `release.yml` runs after CI succeeds on `main`. Since there's a pending changeset, `changesets/
   action@v1` opens a **"Version Packages" PR** — this bumps `tools/vscode/package.json`'s version
   and writes `tools/vscode/CHANGELOG.md` for the first time (changesets creates the CHANGELOG file
   if it doesn't exist yet).
3. Merge that PR. `tools/vscode/package.json`'s version is now live on `main`.
4. Merging the "Version Packages" PR bumps `tools/vscode/package.json`. Once CI passes on `main`,
   `release.yml` runs, and because this release bumped the extension's version, its VSIX jobs fire
   (watch the **Actions → Release** run):
   - `build-vsix` — calls the reusable `build-vscode-vsix.yml`: 6 parallel `build-codelens-service`
     legs (darwin x2, linux x2, win32 x2 — the last on the native `windows-11-arm` runner), then
     `assemble-and-package` merges the 6 binaries, builds audio-play once, and packages the one
     universal VSIX. ~5-10 min depending on Rust cache state.
   - `publish-vsix` — creates the GitHub Release **`fl-tools-v<version>`** with the `.vsix`
     attached, then publishes to the Marketplace and Open VSX. Takes its own approval (see §3).
     Gated on a real version bump and idempotent on the release tag, so it can't spuriously fire.

   You can also build the VSIX anytime without a release: **Actions → Build VS Code Extension VSIX →
   Run workflow** (`workflow_dispatch`) — that produces the `vsix` artifact and publishes nothing.

### Versions: why the published number differs from `package.json`

While the repo is in changesets **pre-mode**, changesets stamps `-alpha.N` onto every version it
bumps — and pre-mode is repo-global, with no per-package opt-out. The Marketplace rejects semver
prerelease versions outright (`vsce` throws on them), so the release folds the alpha counter into
the patch position: **`0.3.0-alpha.1` publishes as `0.3.1`**.

This is strictly increasing (the counter is per-package and never resets within a pre period, and
the base `MAJOR.MINOR` never decreases), which is what the Marketplace requires. "Alpha" is
signalled by `"preview": true` on the listing, not by the version string. `CHANGELOG.md` headings
get the same treatment so the Changelog tab matches what people can actually install.

The rewrite is ephemeral CI state and is **never committed** — the repo's `package.json` must keep
the real changesets version or the next bump computes wrong. See
[`scripts/vsix-marketplace-version.mjs`](../../scripts/vsix-marketplace-version.mjs).

On exiting pre-mode this becomes a no-op (clean versions pass through). The one manual step then:
bump the extension past the last version actually published, since the derived patch numbers will
have run ahead of the committed `package.json`.

### Publishing by hand (only if you're bypassing CI)

Grab the `.vsix` from the **GitHub Release** (<https://github.com/thejustinwalsh/three-flatland/releases>
→ `fl-tools-v<version>` → assets) or a `workflow_dispatch` run's `vsix` artifact. Then:

- **VS Code Marketplace:** `az login` (browser; use the account owning the `three-flatland`
  publisher), then `npx @vscode/vsce publish --azure-credential --packagePath <the.vsix>`. Or with
  a token: `npx @vscode/vsce publish -p <VSCODE_PAT> --packagePath <the.vsix>`.
- **Open VSX** (covers Cursor/Windsurf/VSCodium/Theia/etc.):
  `npx ovsx publish --packagePath <the.vsix> -p <OVSX_PAT>` (one-time
  `npx ovsx create-namespace three-flatland -p <OVSX_PAT>`).

### Verify it actually worked

- <https://marketplace.visualstudio.com/items?itemName=three-flatland.fl-tools> — listing should be
  live within a few minutes of your `vsce publish` succeeding (marketplace indexing has a short
  delay).
- <https://open-vsx.org/extension/three-flatland/fl-tools> — same check for Open VSX.
- Install for real, on a machine that has **never** had this extension in dev mode:
  `code --install-extension three-flatland.fl-tools`, then open a `.png` and confirm the Flatland
  submenu appears and a tool actually opens. This is the one thing nothing in this whole pipeline
  can verify except an actual installed-from-marketplace run — everything up to this point only
  proves the VSIX *builds*, not that the *published, installed* artifact works end to end.
- In Cursor (or Windsurf/Trae/any other Open VSX-backed fork): Extensions panel
  (`Cmd+Shift+X`/`Ctrl+Shift+X`) → search "Flatland Tools" → Install. `cursor --install-extension
  three-flatland.fl-tools` works the same way from the CLI. Same Open VSX listing, same artifact —
  this isn't a separate publish target, just a separate client reading the one above.

## Every release after the first

Nothing extra to do beyond normal changeset hygiene:

1. `tools/vscode` lives outside `packages/`, so — same as `minis/` and `skills/` — it's **never**
   auto-detected by `scripts/generate-changesets.ts`'s commit-scanning bot. Any change you want
   reflected in the next VSIX needs a **hand-written changeset** naming `@three-flatland/vscode`
   (see `.changeset/README.md` for the exact format). Forgetting this doesn't break anything loudly
   — it just means that change ships in the extension's *code* next time something else triggers a
   release, but never gets its own version bump or CHANGELOG entry of its own.
2. Everything after that is automatic: the version bump PR, the merge, `release.yml`'s
   `build-vsix`/`publish-vsix` jobs, the `fl-tools-v<version>` release with the `.vsix` attached,
   and the Marketplace + Open VSX publishes. Your only manual step is approving `publish-vsix`.

## Troubleshooting

**The Release ran but no `fl-tools-v<version>` release / VSIX appeared.** `publish-vsix` only fires
when `tools/vscode/package.json`'s version actually bumped this release AND no `fl-tools-v<version>`
release exists yet (idempotent). If the version didn't change, that's correct — nothing to release.
If it did and nothing appeared, read the `release` job's "Detect a new FL Tools (VSIX) version" step
output (it prints why it decided to skip or build).

**One of the 6 `build-codelens-service` legs fails.** `fail-fast: false` means the other 5 keep
running. If it's a **transient** runner/cache failure, re-run just the failed job from the Actions
UI (a job re-run reuses the original commit, so this is only valid for flakes — not code fixes). If
it needs a **code fix**, push a new commit and let a fresh run rebuild. `assemble-and-package` won't
start until all 6 succeed.

**`vsce publish` says the version already exists.** You already published this version — bump
`tools/vscode/package.json` (via a changeset release), rebuild the artifact, and publish that. Add
`--skip-duplicate` if you want a re-run to no-op instead of erroring.

**`vsce publish --azure-credential` fails auth (401/403).** 401 usually means `az login` didn't
establish a usable session (run `az account show` to confirm you're logged in), or you logged in
with the wrong account. 403 means auth worked but that identity isn't a member of the
`three-flatland` Marketplace publisher — add it at
<https://marketplace.visualstudio.com/manage>. There is no token to rotate; it's your live
`az login` session.

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
