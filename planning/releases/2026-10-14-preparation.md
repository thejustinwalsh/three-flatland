# Release preparation — 2026-10-14

Prepared locally for review. No remote branches were pushed, no PRs merged, no packages published,
no releases or tags created, no environments approved, and no security settings changed.

The [follow-up docs integration review](2026-10-14-docs-integration.md) maps every pending docs PR,
records the independent review and final wording corrections, and distinguishes the preserved
fully tested candidate from the focused follow-up candidate. Permission to push remains pending.

## Branches and provenance

- Repository: `thejustinwalsh/three-flatland`.
- Verified main: `8df896bf1f1230fc06af4a36089b163fd16bd5e9`, 263 commits after the core alpha.10 tag.
- Preparation branch: `release/preparation-2026-10-14`; implementation tip before this report: `a6dcc731f1bf274817c263f0c3c9b0a11f2c1e6b`.
- Separate, versioned validation branch: `release/candidate-2026-10-14`, commit `8c5c3f05f7f902279a09c8311a5d16202444ee8e`.
  Its 61 generated version/changelog files are a local validation snapshot. Use the normal release
  PR automation to regenerate versions after approved preparation changes reach green main.
- Existing release PR [#228](https://github.com/thejustinwalsh/three-flatland/pull/228) remains
  `7c01bf619ec64eab3e657e7e66779a4bf5a4d523`, based on verified main. It does not contain these fixes.
- Reviewed docs heads were #239 `8bf87fb89f9a519d5e3d06b4e1661a7f72136004` and #245
  `d2613666a5c543caa95a7cb1e1623ca82fcdf6e7`.
  This standalone branch reuses the focused scaffolder block/package table from #239 and the
  Koota migration artifact from #245, with corrections. It leaves the full
  #239 → #240 → #243 → #245 → #244 stack, and competing #242, unmerged.
- The original task directory was empty; work was done in a fresh clone and separate worktree.
  Existing user checkouts and their uncommitted work were not edited.

## What is unpublished

Registry audit at `2026-10-14T22:30:52.189Z` queried npm metadata for every public pnpm workspace,
plus the actual VS Code Marketplace and Open VSX listings. **No public npm package needs a first
publication or bootstrap. All 13 main versions already exist on npm. Eleven updated versions are
unpublished.** All pending packages have all-alpha registry histories, so Changesets currently
chooses the `latest` dist-tag. Do not infer publication from a workspace version or private flag.

| Public npm package | Published latest / main | Prepared candidate | Status |
| --- | --- | --- | --- |
| `@three-flatland/alphamap` | `0.1.0-alpha.2` | `0.1.0-alpha.3` | Unpublished update |
| `@three-flatland/atlas` | `0.1.0-alpha.2` | `0.1.0-alpha.2` | Unchanged; published contents verified |
| `@three-flatland/bake` | `0.1.0-alpha.2` | `0.1.0-alpha.3` | Unpublished update |
| `create-three-flatland` | `0.1.0-alpha.2` | `0.1.0-alpha.3` | Unpublished update |
| `@three-flatland/devtools` | `1.0.0-alpha.7` | `1.0.0-alpha.8` | Unpublished update |
| `@three-flatland/image` | `0.1.0-alpha.3` | `0.1.0-alpha.4` | Unpublished update |
| `@three-flatland/nodes` | `0.1.0-alpha.10` | `0.1.0-alpha.10` | Unchanged; published contents verified |
| `@three-flatland/normals` | `0.1.0-alpha.4` | `0.1.0-alpha.5` | Unpublished update |
| `@three-flatland/presets` | `0.1.0-alpha.10` | `0.1.0-alpha.11` | Unpublished update |
| `@three-flatland/skia` | `0.1.0-alpha.6` | `0.1.0-alpha.7` | Unpublished update |
| `@three-flatland/slug` | `0.1.0-alpha.6` | `0.1.0-alpha.7` | Unpublished update |
| `three-flatland` | `0.1.0-alpha.10` | `0.1.0-alpha.11` | Unpublished update |
| `@three-flatland/skills` | `0.1.0-alpha.3` | `0.1.0-alpha.4` | Unpublished update |

FL Tools (`three-flatland.fl-tools`) is public through extension registries despite its private npm
workspace. Both Marketplace and Open VSX serve **0.2.5**. The prepared source version
`@three-flatland/vscode@0.2.0-alpha.6` maps to **0.2.6**. A local `darwin-arm64` VSIX was built and
inspected; it is not a universal release artifact.

Schemas, IO, preview, other support tools, docs, examples/templates, benchmarks and the repository
root remain intentionally private on npm. The extension is the separate public distribution channel.

## Corrections included

- Ship `codemods/koota-peer-dependency-removal.md` with core alpha.11 and retain the migration guide.
  Document invocation as an agent-applied Markdown recipe, not an executable CLI.
- Require confirmed peer-only provenance before removing Koota, decide per package, retain static,
  side-effect, dynamic, CommonJS, type-only and subpath use, and flag mocks, computed imports,
  aliases and indirect use. Preserve Koota's linked design lineage and recommended gameplay role.
- Reconcile the conflicting compatibility-handle release note: world/entity/trait handles are
  removed. The guide keeps concrete manual migration instructions, ownership, disposal, strict
  validation and capacity guidance.
- Pin migration artifact metadata to alpha.11. Correct frozen effect-vector guidance: readonly
  component writes fail typing and strict-mode writes throw; assign a whole tuple instead.
- Correct installation prerequisites (`three` and TypeScript declarations), add scaffolder discovery
  and destructive `--overwrite` guidance, preserve prompts/templates/help, state the quick-start
  image prerequisite, and repair the undefined texture/Suspense path in the Flatland React sample.
- Correct the generated `RenderStats` API docblock to `three-flatland/debug-protocol`.
- Inventory all public pnpm workspaces in consumer validation, including no-build `skills/`.
  Build/pack failures now fail the run. Inspect packed manifests, reject unresolved consumer
  protocols/private dependencies/source export conditions, verify exported files and packaged recipes.
- Reclaim each successful example's disposable `node_modules` before the next consumer to bound disk use.
- Use Nx dependency ordering for extension test builds and sidecar assembly; update obsolete
  Turbo/manual-publication comments and build instructions.
- Fix macOS integration testing against current VS Code: its bundle executable is `Code`, while
  the installed test downloader returns the old `Electron` path. Resolve `CFBundleExecutable`
  from bundle metadata when that path is missing. This changes test harness behavior only.

## Validation and artifacts

Host validation used Node **24.18.0** and pinned pnpm **10.28.1**.

- `pnpm install --frozen-lockfile`: passed on the final generated candidate.
- `pnpm nx run-many -t build test typecheck`: passed for **56 projects / 128 tasks** on the versioned
  candidate; matching cached tasks were reused. The docs build produced **503 pages**.
  Skia font tests passed after initializing the pinned `4502f88…` submodule; committed,
  freshness-checked WASM was used rather than claiming a fresh WASM toolchain build.
- Required lint, formatting, module boundaries, version synchronization, exports, React wrappers,
  standalone example helpers, schema generation and AGENTS/CLAUDE pair verification passed.
  The repaired Flatland React fence was independently TypeScript-checked, and built guide content
  and installation anchors were inspected.
- Documentation/embedded example Playwright suite: **120 passed**.
- Real VS Code 1.142.0 macOS integration suite: **62 passed**, **7 intentionally skipped** manual
  screenshot-capture cases. The final type-only/comment cleanup was then checked with TypeScript
  and syntax lint; it does not change runtime behavior.
- All **13 public tarballs** packed and passed manifest/export-file checks. All **9 internal
  dependency ranges** accept the prepared package set. Atlas alpha.2 and Nodes alpha.10 were
  compared file by file with actual npm tarballs: **identical**, so unchanged versions are valid.
- Full isolated loopback Verdaccio sweep: **26 passed, 0 failed, 0 skipped**. This includes
  24 example installs/builds/pixel checks, both CLI-generated scaffolds, scaffold unit/e2e suites,
  and live scaffold dev rendering. No packages were sent to an external registry.
- Repository vitexec checks rendered the Three.js and React basic-sprite pair with non-null
  WebGPU canvas contexts and adapters; screenshots were visually inspected.
- Local `fl-tools-0.2.6-darwin-arm64.vsix`: **1,333 files**, verified version/publisher/name,
  changelog 0.2.6, host/webviews, codelens binary, audio sidecar and native dependency closure.
  Source manifest/changelog were restored to Changesets alpha versions after packaging.

### Migration dogfood

A disposable multi-package consumer first installed real published **alpha.10**, built, passed its
unit test and rendered a sprite. After installing candidate tarballs, the original source correctly
failed typing at the tuple component write and the removed `group.world` / `sprite.entity` handles.
A fresh agent applied both installed recipes:

- removed only the root dependency, whose README confirmed former-peer-only provenance;
- rewrote the complete effect tuple;
- preserved all seven policy-fixture workspace dependencies (static, side-effect, dynamic,
  CommonJS, indirect re-export, mock and computed-import cases);
- flagged indirect/mock/computed cases and both renderer handles rather than guessing replacements.

A second application changed **zero bytes** across 22 fixture files. The parent then completed the
explicitly manual handle migration with an application-owned map of IDs to public sprite objects.
The final installed alpha.11 tarball's recipe metadata was checked, and the migrated consumer
built, passed both tests and rendered the same 4,096 sprite pixels with no page errors. Runtime
assertions verified frozen tuples and absent renderer handles. These results prove the representative
migration; arbitrary computed/aliased mutations and removed API semantics still require human review.

### Supporting files (outside the repository)

All are under `../release-validation/`:

- `tarballs/`: the 13 prepared npm tarballs.
- `fl-tools-0.2.6-darwin-arm64.vsix`: local platform-specific extension artifact.
- `evidence/publication-inventory.json`, `registry-audit.json`, `packed-inventory.json`,
  `dependency-order.json`, `unchanged-package-diff.json`, `vsix-inspection.json`.
- `evidence/final-workspace-checks.log`, `consumer-smoke-final.log`, `examples-e2e.log`,
  `vscode-e2e-resolved.log`, `lint-final.log`, `format-final.log` and focused verification logs.
- `evidence/codemod-first-pass.md`, `codemod-second-pass.md`, original input archive,
  migration build/test logs, and old/candidate render JSON/PNGs.
- `evidence/vitexec-three-webgpu.*` and `vitexec-react-webgpu.*`.
- `old-consumer/`, `pack-candidate.mjs`, `render-fixture.mjs`, `package-local-vsix.mjs`:
  reproducible local fixtures and validation helpers.

Initial missing-submodule and disk-full attempts are retained in diagnostic logs; the successful
runs above supersede them. Cleanup stayed within task-generated temporary files, caches and duplicate build outputs; source
branches, candidate docs output, logs, tarballs, migration fixture and VSIX are retained. The brief connection interruption lost no results.
An optional forced type-aware lint invocation of normally ignored e2e files hit an installed
`tsgolint` path-resolution panic; required repository lint, explicit syntax lint, TypeScript and
real integration tests passed. No claim is made that the optional invocation passed.

## Remaining external actions and decisions — not performed

1. Review this standalone preparation branch and decide how to fold its overlapping release-critical
   work into the existing docs PRs. Preserve the migration guide when reconciling #245, which deletes it.
   Cosmetic/authoring-standard portions of the stack can remain separate.
2. Push/open the chosen preparation PR and run its fresh GitHub required checks. Local validation
   does not supply `CI passed` or Mergify results for a new remote head. Do not bypass those checks.
3. After approved preparation changes reach green main, let release automation refresh #228 and
   review its generated versions, changelogs, template dependency ranges and exact head. The older
   expired approval-wait run with zero jobs was not a test failure.
4. Use the existing build-only CI workflow on the chosen candidate SHA to build and verify the
   **universal six-platform VSIX**. Local macOS packaging does not establish Linux/Windows support.
5. A human decides whether to merge the refreshed version PR and later approve the existing npm
   and VSIX publication gates. These are separate external actions. No first-publish bootstrap or
   security-setting change is required by the package inventory.

Changesets 2.29.8 publishes the pending npm packages concurrently (`Promise.all`), so treat successful
completion of the whole npm job as the release boundary. Bake must be resolvable before normals,
image, alphamap and slug consumers; bake/normals before core; core before presets/devtools and newly
generated starters. Existing VSIX jobs wait on npm release success and pin that release's SHA.
After an authorized publication, verify all exact versions and `latest` tags before announcing the
new scaffold command, and verify both extension registries separately.
