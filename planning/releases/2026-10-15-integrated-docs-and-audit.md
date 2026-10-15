# Integrated documentation and dependency audit — 2026-10-15

## Review and merge status

[PR #246](https://github.com/thejustinwalsh/three-flatland/pull/246) combines the reviewed release
preparation with Justin's subsequently authorized docs cleanup. Main remains at `8df896b` until
required checks pass. No version PR, package publication, release tag or publication gate is authorized.

The integration adapts #240 `a984e390`, #243 `3d8df6b5`, #245 `d2613666` and #244 `d1b41e40`.
#242 is the older competing split and was not added. #239's useful scaffolder/install/package
material was already integrated; the README trim and duplicate changesets were not copied.
Old PRs remain open while the combined candidate is unmerged.

## Documentation corrections

- Separate the Flatland explanation from the scene-setup how-to. Keep the alpha migration guide
  and both sidebar links rather than taking #245's migration-guide deletion.
- Preserve the working React TextureLoader/useLoader/Suspense example and explicit per-frame
  scheduling. Clarify renderer resizing versus camera synchronization and size-dependent updates.
- Correct pipeline initialization to the next render, remove unsupported per-effect draw counts,
  restore manual sizing/reset instructions and make the Three.js cleanup executable.
- Preserve full linked Koota provenance and its recommended application/gameplay ECS role.
- Integrate persistent framework tabs, clearer sentence-case headings and source-backed wording.
  Preserve proper-name capitalization such as React Three Fiber.
- Replace the marketing-voice authoring rules with the technical-writing standard, repair its
  executable fence-check command, and reconcile tutorial/framework and React-loading guidance.
- Restore the custom example/showcase title's `_top` anchor used by contents navigation.
- Give the theme's desktop contents element its own name so it does not collide with the
  upstream element registered by the mobile contents component.
- Repair the generated addPass API example, which imported nonexistent effect classes.

The fresh-context rewrite and final content review are recorded in
`../release-validation/evidence/docs-fresh-rewrite.md`. Historical local-review status in the
2026-10-14 reports predates authorization to push and expand this integration.

## Audit facts and release exposure

The original npm audit reports 85 findings (9 critical, 38 high, 33 moderate, 5 low), represented
by 77 npm advisory records, **72 unique GHSA identifiers and 28 affected modules**. Counts differ
because versions and dependency instances can share one advisory. Each finding's reported paths
and complete grouping are in `audit-remediation-grouping.json`; 72 current primary GitHub advisory
records and npm version histories were fetched successfully for the diagnosis.

The exact lockfile's declared regular/optional dependency closures have no reported matches in
any of the 13 public npm packages. This does not cover user-supplied peers, vendored native code,
or prove exploitability. The VS Code extension's declared production graph did contain:

`tools/vscode → @three-flatland/schemas → ajv → fast-uri@3.1.5`.

The scaffolder also distributes template development dependencies: its Vitest 3 range can recreate
the test-tool findings in a generated project. Classifying those as development tools does not make
them irrelevant to the release. Astro/Sharp and CSS tooling affect docs builds; Verdaccio/Changesets
and Nx affect CI/release tooling. Sharp in tools/vscode is a development dependency, not a direct
extension runtime dependency.

## Bounded fix included

The compatible fast-uri 3.1.8 update is within both locked Ajv versions' existing range. It changes
only five lockfile entries (package identity/integrity, two Ajv edges and snapshot identity), with
no dependency-manifest or API change. Unrelated metadata/Babel refresh from pnpm was discarded.
Frozen installation confirms the actual schema validator loads 3.1.8.

The affected core/schema/extension/theme/script test and typecheck graph passes. The subsequent
audit removes all six fast-uri advisory records: **79 findings remain** (9 critical, 33 high,
32 moderate, 5 low), covering 66 unique advisories and 27 modules. No reported production-closure
match remains in the npm or extension dependency graph checked. No audit exclusions or policy
changes were introduced.

## Proposed remaining remediation scope — not applied

Treat compatible versions below as candidates to test, not an assertion that the complete update
is already validated. Keep these batches separate from the reviewed docs change unless explicitly
chosen for the release.

1. Refresh remaining compatible patches, especially Sharp 0.35.5 and its native-image builds,
   Undici 7.29.1, js-yaml 3.15.2/4.3.2, brace-expansion 2.1.7/5.0.12 and the formatter's Tinypool
   2.1.2. Test docs/image processing, tooling and the complete CI matrix.
2. Review compatible minor updates: Astro 7.2.8, Nx 23.2.1 (the root pins 23.1.0 exactly),
   Axios 1.20.0, devalue 5.9.3, smol-toml 1.9.0 and other candidates in the table below.
3. Plan a controlled Vitest 3 → 4.1.11 migration with matching coverage/mocker packages and both
   starter templates. Its Tinypool 1 → 2 path is a major change: do not force every transitive
   Tinypool instance to 2. Review the [official Vitest 4 migration guide](https://v4.vitest.dev/guide/migration).
   Separately review postcss-selector-parser 6 → 7.1.6 against the theme's CSS generation tests.
4. Resolve the three advisories without a named patch through verified upstream releases,
   corrected advisory evidence, or an explicitly reviewed dependency-path replacement. Do not
   disable the audit, rename a package to hide it, or assume a local patch clears a version audit.

### Three advisories listing no patched version

- **http-cache-semantics**, [GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp):
  reported through Verdaccio's hooks → got-cjs → cacheable-request. Its maintainer disputes the
  advisory in [upstream issue #56](https://github.com/kornelski/http-cache-semantics/issues/56).
  npm has 4.3.0 outside the advisory's `<=4.2.0` range, but GitHub still names no patch. Comparing
  actual 4.2.0/4.3.0 tarballs shows changes to Vary handling and status access, not the reported
  max-stale branch. Do not call 4.3.0 a verified fix for this advisory based only on the range.
  Options: validate the upstream dispute/correction, validate the newer release against a focused
  reproduction, or select a parent update that removes the caching path. No such action is applied.
- **braces**, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm):
  reported through Changesets config → micromatch. Its maintainer disputes unrestricted untrusted
  pattern handling in [issue #70](https://github.com/micromatch/braces/issues/70). Restricting pattern
  inputs/depth is contextual risk reduction, not a green audit. Prefer a verified upstream release
  or compatible parent change removing that path; replacing the release tool is a separate decision.
- **sprintf-js**, [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c):
  reported through Changesets → get-packages → read-yaml-file → js-yaml 3 → argparse. A parent
  update removing that legacy parser chain is preferable to forcing a new major parser underneath
  it. A reviewed bounded formatting patch or trusted-input limits may reduce the practical risk,
  but the version-based audit still reports the installed release. No exception is authorized.

All three remain active in the primary advisory database. Maintainer disagreement alone is not
permission to suppress a required check. This unresolved upstream/dependency choice is a concrete
merge blocker even after routine patch/minor updates.

### Version and path inventory

The table uses the smallest published stable version outside every applicable current affected
range for that module. “Outside range” is not equivalent to a named or tested security patch,
especially for http-cache-semantics. Full reported paths and ranges are in the JSON evidence.

| Module | Locked → candidate | Scope | Representative reported path |
| --- | --- | --- | --- |
| `@vitest/mocker` | 3.2.7 → 4.1.11 | breaking-range upgrade | `. → vitest → @vitest/mocker` |
| `astro` | 7.1.3 → 7.2.8 | compatible minor candidate | `docs → astro` |
| `axios` | 1.18.1 → 1.20.0 | compatible minor candidate | `. → nx → axios` |
| `baseline-browser-mapping` | 2.9.17 → 2.11.0 | compatible minor candidate | `docs → @astrojs/react → @vitejs/plugin-react → @babel/core → @babel/helper-compilation-targets → browserslist → baseline-browser-mapping` |
| `brace-expansion` | 2.1.4 → 2.1.7; 5.0.9 → 5.0.12 | compatible patch candidate | `. → @vitest/coverage-v8 → test-exclude → glob → minimatch → brace-expansion` |
| `braces` | 3.0.3 → none | no published version outside affected range | `. → @changesets/cli → @changesets/config → micromatch → braces` |
| `browserslist` | 4.28.1 → 4.28.7 | compatible patch candidate | `docs → @astrojs/react → @vitejs/plugin-react → @babel/core → @babel/helper-compilation-targets → browserslist` |
| `compression` | 1.8.1 → 1.8.2 | compatible patch candidate | `. → verdaccio → compression` |
| `devalue` | 5.8.1 → 5.9.3 | compatible minor candidate | `docs → @astrojs/react → devalue` |
| `fast-uri` | 3.1.5 → 3.1.8 | compatible patch candidate | `. → verdaccio → @verdaccio/core → ajv → fast-uri` |
| `fflate` | 0.8.2 → 0.8.3 | compatible patch candidate | `benchmarks__overdraw → @types/three → fflate` |
| `handlebars` | 4.7.9 → 4.7.10 | compatible patch candidate | `. → verdaccio → @verdaccio/hooks → handlebars` |
| `http-cache-semantics` | 4.2.0 → 4.3.0 | compatible minor candidate | `. → verdaccio → @verdaccio/hooks → got-cjs → cacheable-request → http-cache-semantics` |
| `js-yaml` | 3.15.1 → 3.15.2; 4.3.1 → 4.3.2 | compatible patch candidate | `. → @changesets/cli → @changesets/read → @changesets/parse → js-yaml` |
| `markdown-it` | 14.3.0 → 14.3.1 | compatible patch candidate | `docs → typedoc → markdown-it` |
| `nx` | 23.1.0 → 23.2.1 | compatible minor candidate | `. → nx` |
| `postcss-selector-parser` | 6.1.2 → 7.1.6 | breaking-range upgrade | `packages__starlight-theme → postcss-selector-parser` |
| `proxy-addr` | 2.0.7 → 2.0.8 | compatible patch candidate | `. → verdaccio → @verdaccio/middleware → express → proxy-addr` |
| `qs` | 6.15.3 → 6.16.0 | compatible minor candidate | `. → verdaccio → @cypress/request → qs` |
| `sharp` | 0.35.3 → 0.35.5 | compatible patch candidate | `docs → sharp` |
| `shell-quote` | 1.10.0 → 1.11.0 | compatible minor candidate | `tools__vscode → concurrently → shell-quote` |
| `smol-toml` | 1.6.1 → 1.9.0; 1.7.0 → 1.9.0 | compatible minor candidate | `. → nx → smol-toml` |
| `source-map-js` | 1.2.1 → 1.2.2 | compatible patch candidate | `. → @vitest/coverage-v8 → magicast → source-map-js` |
| `sprintf-js` | 1.0.3 → none | no published version outside affected range | `. → @changesets/cli → @manypkg/get-packages → read-yaml-file → js-yaml → argparse → sprintf-js` |
| `svgo` | 4.0.2 → 4.1.0 | compatible minor candidate | `docs → astro → svgo` |
| `tinypool` | 1.1.1 → 2.1.2; 2.1.0 → 2.1.2 | breaking-range upgrade, compatible patch candidate | `. → oxfmt → tinypool` |
| `undici` | 7.29.0 → 7.29.1 | compatible patch candidate | `tools__vscode → @vscode/vsce → cheerio → undici` |
| `vitest` | 3.2.7 → 4.1.11 | breaking-range upgrade | `. → vitest` |

## Validation and limits

Local evidence is under `../release-validation/evidence/`: affected aggregate graph, required lint,
format and boundary checks, setup/API snippet compilation, rendered internal-link checks and
screenshots. All 122 browser/example tests pass, including framework persistence and desktop/mobile
contents navigation (with the intentional sub-420px visibility rule). The final source received a fresh docs/theme build, tests and typecheck. Rendered
checks cover 31 changed published pages and 26,100 internal links/anchors without failures; draft
pages are explicitly excluded. Screenshots report no browser page errors. The full Skia font suite was not rerun locally
in this source worktree, where its optional pinned source checkout is absent; the earlier versioned
candidate includes the complete Skia font validation. GitHub's build matrices ran their applicable
Nx-affected target sets; their success is not a claim that every workspace test was rerun there.

At the original PR head `df47c0da`, both Node build matrices passed build/test/typecheck/lint/boundary
checks; GitHub's example smoke, Linux VS Code suite, consumer tarball smoke and bundle-size check
also passed. Every non-audit job succeeded. The required aggregate failed solely on security-audit.
The new exact head's status must be read live, not inferred from those earlier successes.

The required `CI passed` gate still cannot pass while the dependency audit fails. Keep the PR
unmerged, leave #228 and all publication environments untouched, and obtain a decision on the
remaining remediation scope. No branch protection, audit configuration or security setting was changed.
