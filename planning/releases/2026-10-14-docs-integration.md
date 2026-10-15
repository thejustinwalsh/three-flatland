# Release preparation: docs integration review

This records the initial review. Justin subsequently authorized the useful docs integration;
see [the 2026-10-15 integration and audit report](2026-10-15-integrated-docs-and-audit.md) for the
expanded PR scope, corrections and remaining merge blocker.

The standalone preparation branch is ready for a draft PR after the requested permission to push.
No remaining docs-stack PR is a prerequisite for this release. No remote mutation was performed.

## Exact reviewed heads

Read-only GitHub metadata and `git ls-remote` confirmed these heads during this integration review:

| PR | Head | Base / status in the preparation branch |
| --- | --- | --- |
| #239 | `8bf87fb89f9a519d5e3d06b4e1661a7f72136004` | Main; release-critical content incorporated with corrections |
| #240 | `a984e390920b0eb539be0a2f7e263d9f49551121` | #239; no own changes incorporated |
| #242 | `4cd89b79ff83b159d8023b216715d9ab9d403224` | #240; older competing split, not incorporated |
| #243 | `3d8df6b53d60f4ad6c5b84d305354b704e54334d` | #240; no own changes incorporated |
| #245 | `d2613666a5c543caa95a7cb1e1623ca82fcdf6e7` | #243; focused migration/API corrections incorporated |
| #244 | `d1b41e40ef06cef893f58fa386575fc5db1a1796` | #245; no own changes incorporated |

Main remains `8df896bf1f1230fc06af4a36089b163fd16bd5e9`; release PR #228 remains
`7c01bf619ec64eab3e657e7e66779a4bf5a4d523`. #240 predates three current #239 commits;
its base is not the current #239 head. Deltas were compared against each PR's merge base,
rather than treating inherited stack changes as its own contribution.

## Integration map and later reconciliation

- **#239:** Includes the scaffolder discovery block, package table (extended to all 13 public npm
  packages), shipped-feature status corrections and quick-start link. Keeps the fuller scaffolder
  README's prompts, flags, templates and noninteractive usage; adds the destructive overwrite warning.
  Does not take the README trim, its separate changeset, or optional roadmap additions. The init
  warning was independently corrected against installed Three.js: premature `render()` throws.
- **#240:** Hit-test tab synchronization/labels and the historical audit are deferred. Neither is
  required for migration or package validation. If the audit is retained later, update its stale
  `@three-flatland/debug` recommendation to the actual protocol/provider distinction.
- **#242:** The older concept/setup split is deferred in favor of deciding once how to handle #245.
  Do not land both alternatives unchanged.
- **#243:** Authoring-skill replacement and planning edits are deferred. Before using the new
  technical-writing skill, fix its Python fence-check invocation (missing the filename argument)
  and reconcile its conflicting tutorial/example guidance.
- **#245:** Includes the Koota removal recipe, index/invocation guidance, alpha.11 metadata and API
  docblock correction. Strengthens per-manifest peer-only provenance, ambiguous-use safeguards and
  repeat-run verification. Retains the existing migration guide and its manual API guidance;
  corrects frozen-snapshot behavior and the obsolete compatibility-handle changeset claim. Does not
  take the concept/setup split, sidebar replacement, migration-guide deletion, duplicate changesets,
  or expanded breaking-change prose already covered by the retained guide and existing release notes.
  If the split is adopted later, preserve the guide/link, carry over the defined texture and Suspense
  sample fix, retain explicit frame scheduling, and add full linked Koota provenance wherever the
  private ECS is discussed. Expanded changelog text must say frozen tuple writes throw in strict mode.
- **#244:** Heading/prose cleanup is deferred. It is not required to release the shipped API.

The concrete integration decision is to review this focused preparation branch on its own, then
rebase or revise overlapping docs PRs after its outcome. Do not merge the stack wholesale or assume
the incorporated portions make their current heads safe to merge.

## Independent review and final local changes

The independent reviewer found no P0–P2 issue or draft-PR blocker. It rechecked all 13 tarball
identities/exports/recipes and reviewed consumer failure handling, migration safeguards, Nx ordering,
disk cleanup and the macOS VS Code executable fallback. Its one P3 finding was corrected: the
devtools provider collects renderer statistics; `three-flatland/debug-protocol` exports payload types.
Two additional wording fixes align the recipe's summary table with its confirmed-peer-only rule
and replace the quick-start's unsupported silent-blank-canvas claim with Three.js's actual error.
These are documentation/comment changes only, committed as `c3c20325` on the preparation branch.

The original fully tested candidate remains untouched at `release/candidate-2026-10-14`,
`8c5c3f05f7f902279a09c8311a5d16202444ee8e`. A separate follow-up candidate branch,
`release/candidate-integration-2026-10-14`, applies only those wording changes. Focused follow-up
verification and any replacement tarball are recorded under `../release-validation/evidence/`;
the original tarballs and full-suite logs are preserved.

Follow-up verification passed on `8c06c77b777d3e07053665b74cf3df11c7ca103e`:

- `pnpm nx build docs`: target plus 38 dependency tasks; Astro checked 72 files with zero errors
  and zero warnings. Required guides/anchors and the corrected built quick-start text were checked.
- `pnpm nx typecheck three-flatland`: target plus four dependency tasks; focused formatting and
  `git diff --check` also passed.
- A new core alpha.11 tarball passed identity, dependency, export and packaged-recipe checks.
  All 165 runtime JavaScript files are byte-identical to the original tested tarball, and manifest
  values are unchanged (pnpm reordered two development-dependency keys). The other changed archive
  files are the Koota recipe, API declaration comment and declaration map. The corrected recipe
  summary and generated API comment were asserted directly from the archive.

Use `integration-tarballs/three-flatland-0.1.0-alpha.11.tgz` plus the original other 12 tarballs for
this follow-up. The earlier 26-consumer, browser and extension runs were not repeated for wording
changes; their tested runtime is unchanged. Logs are `integration-docs-build.log`,
`integration-core-typecheck.log`, `integration-pack-check.log` and `integration-packed-core.json`.

Permission to push/open the draft PR remains pending. Fresh GitHub checks and universal VSIX CI
remain external follow-ups. No merge, publication, tag, release, gate approval or security change
has been performed or is implied by local readiness.
