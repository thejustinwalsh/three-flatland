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
3. That's all the Marketplace needs up front. **Publishing is manual** (CI only builds the VSIX —
   see below), and the simplest way to authenticate a manual publish is `az login` (interactive, in
   your browser): `vsce publish --azure-credential` rides that logged-in session. **No Personal
   Access Token, no Entra app registration, no federated credential** — those were only ever for
   automated CI publishing, which this repo intentionally does not do (Azure DevOps PATs are
   end-of-life and the Entra-ID CI story is painful to wire up).

### 2. Register the Open VSX namespace

This is also the step that covers Cursor, Windsurf, Trae, Google Antigravity, AWS Kiro, VSCodium,
Gitpod, and Eclipse Theia — every VS Code fork that isn't VS Code itself now runs on Open VSX as
its actual extension registry (not a fallback, not a mirror). There is no separate "Cursor
marketplace" to publish to and no extra step for it — a single `ovsx publish` of the built VSIX
(see the manual-publish steps below) covers all of them at once.

1. Go to <https://open-vsx.org> and sign in with GitHub.
2. Go to <https://open-vsx.org/user-settings/tokens> and generate an access token. This is your
   `OVSX_PAT`.
3. Claim the `three-flatland` namespace. Either:
   - Via the website's namespace UI, or
   - Locally: `npx ovsx create-namespace three-flatland -p <OVSX_PAT>` (run from anywhere — this
     talks to the registry directly, not tied to this repo).

### 3. No CI secrets needed — CI builds, you publish

`publish-vscode.yml` is a **build-only** workflow: it produces the universal `vsix` artifact and
stops. It does **not** publish, so it needs no `VSCE_PAT`/`OVSX_PAT` in GitHub secrets. You publish
the downloaded artifact by hand (next section). The only credential involved is whatever `az login`
gives you (Marketplace) and, optionally, a local `OVSX_PAT` for Open VSX — neither lives in CI.

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
     universal VSIX, and uploads it as the **`vsix`** artifact (kept 90 days). **CI stops here — it
     does not publish.**

   You can also build the artifact anytime without a version bump: **Actions → Build VS Code
   Extension VSIX → Run workflow** (`workflow_dispatch`).

### Publish the built artifact (manual — 2 minutes)

Download the `vsix` artifact from that run, unzip it (GitHub wraps artifacts in a `.zip`), then:

- **VS Code Marketplace** (no PAT, no app registration): `az login` — opens your browser; use the
  account that owns the `three-flatland` publisher — then
  `npx @vscode/vsce publish --azure-credential --packagePath <the.vsix>`. `--azure-credential` pulls
  an Entra token off your `az login` session; that's the entire "Entra" story for a manual publish.
- **Open VSX** (covers Cursor/Windsurf/VSCodium/Theia/etc.):
  `npx ovsx publish --packagePath <the.vsix> -p <OVSX_PAT>` (token from
  <https://open-vsx.org/user-settings/tokens>; one-time `npx ovsx create-namespace three-flatland -p <OVSX_PAT>`).

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
   (see `.changeset/CLAUDE.md` for the exact format). Forgetting this doesn't break anything loudly
   — it just means that change ships in the extension's *code* next time something else triggers a
   release, but never gets its own version bump or CHANGELOG entry of its own.
2. The build is automatic: the version bump PR, the merge, the `publish-vscode.yml` trigger, the
   six-platform universal VSIX artifact. The **publish** step stays manual every time — download the
   `vsix` artifact and run the one-liner from "Publish the built artifact" above.

## Troubleshooting

**`check-version` says `should_publish=false` but you expected a publish.** Run `npx vsce show
three-flatland.fl-tools --json` locally and compare `versions[0].version` against `tools/vscode/
package.json`'s `version` by hand — if they already match, the workflow correctly did nothing (it's
not re-publishing an unchanged version, by design).

**One of the 6 `build-codelens-service` legs fails.** `fail-fast: false` means the other 5 keep
running — re-run just the failed job from the Actions UI once you've fixed whatever broke, rather
than re-running the whole workflow. `assemble-and-package` won't start until all 6 succeed.

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
