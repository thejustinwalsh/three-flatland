# Security remediation and release validation — 2026-10-15

This continues [preparation PR #246](https://github.com/thejustinwalsh/three-flatland/pull/246)
under Justin's approval to remediate dependencies and merge the preparation after required checks pass.
The version PR #228, publishing, tags, releases and publication environment approval remain separate.

## Dependency changes and actual behavior

The repository audit now reports zero findings at every severity, with no exclusions, muted advisories
or audit-policy changes. The prior exact-head CI completed with all functional jobs passing and its
aggregate blocked solely by 79 audit findings. The new exact-head GitHub run must pass independently.

Compatible dependency updates cover Nx 23.2.1, Astro 7.2.8, Sharp 0.35.5 and the affected transitive
libraries. Vitest and coverage move together to 4.1.11, including both starter templates and ecs-bench;
remove the obsolete minWorkers setting and provide Vite explicitly where Vitest's peer needs it.
The theme's selector parser and scoped nested PostCSS parser move to 7.1.6.

Three advisories required investigation beyond selecting a version outside an advisory range:

- **http-cache-semantics:** actual 4.2.0 and 4.3.0 sources both reproduce cross-user cookie reuse through
  max-stale. The 4.3.0 source patch blocks security-ineligible stale reuse across max-stale,
  stale-while-revalidate and stale-if-error, including serialized caches and request/Vary matching.
  Thirteen regression cases preserve legitimate explicit-public, immutable and private-cache behavior.
  The original 4.3.0 implementation failed seven of the initial eleven cases; the patched implementation
  passes all thirteen final cases. Version 4.3.0 alone is not represented as the fix.
- **braces:** replace the actual micromatch edges in fast-glob and starlight-llms-txt with Picomatch 4
  and maintained brace-expansion 5. Preserve fast-glob's traversal API. Reject excessive input length,
  nesting and expansions explicitly, including expansion-engine truncation. Fifteen tests cover real
  traversal, streams, escapes, ranges, exclusions, matching contracts and resource-bounded hostile input.
  No braces or micromatch runtime package remains in the resolved lockfile.
- **sprintf-js:** maintained Changesets 3 removes the legacy YAML/argparse dependency chain entirely.

The three dependency patches, their declared replacement dependencies and upstream removal criteria
are documented in [patches/README.md](../../patches/README.md). Patch contents participate in Nx cache
inputs. Do not remove a patch merely because a version-based audit is green.

## Changesets 3 migration and workflow compatibility

Changesets is pinned to 3.0.3. Configuration preserves private-package versioning and disables private
tags. The 81 already-applied prerelease notes move byte-for-byte into .changeset/pre; pending notes
remain pending and the obsolete pre.json counters are removed. Before adding the new security note,
the computed versions match Changesets 2 for every workspace.

The unchanged changesets/action v1 expects stdout records of the form New tag: name@version.
Changesets 3 supplies actual tag events via CHANGESETS_OUTPUT instead. The release script's small
owned wrapper translates only validated, deduplicated git-tag report events into the action's expected
lines, preserving CLI arguments, output and exit status. Four contract tests exercise the action's real
parser pattern without executing publication or tag creation. pnpm 10 still delegates publication to
npm; no credential, trusted-publisher, workflow-security or environment changes are included.

Read-only Changesets publish-plan on the versioned candidate selects exactly eleven public npm
updates, all on latest. Atlas and nodes are already published at the candidate versions; private
packages are excluded. This check creates no packages, tags or releases.

## Validation status

Source preflight passed 166 script tests, 19 theme tests, type-aware lint, formatting across 1,310
TypeScript files, module boundaries and all thirteen instruction-pointer checks. Frozen installation
passed. The isolated versioned candidate is 5cda949d (generated versions plus the spy-measurement correction).

The complete candidate run passes: 56 projects, all 128 build/test/typecheck tasks. All 1,434 core
tests pass. Vitest 4 registers spies in a WeakMap; the allocation tests now clear setup observations
before measuring runtime operations, retaining every original allocation assertion.

All thirteen fresh tarballs pass manifest/export/file checks. Their executable JS and WASM match
the earlier validated artifacts; one core JSDoc example differs. The refreshed local darwin-arm64
FL Tools 0.2.6 VSIX contains 1,333 files, the fixed validator, both native sidecars and WASM.
All four setup/object/API snippets compile. Thirty-one changed published pages and 26,100 internal
links/anchors pass; screenshots have no page errors. The actual LLM generator preserves setup and
migration in both outputs and excludes API/prompt pages from the smaller output.

At this commit, the complete 26-flow consumer rerun, 122 browser checks and exact-head GitHub checks
are still running or pending. Terminal results belong in the PR validation section and the sibling
release-validation evidence index. Merge remains conditional on exact-head checks and repository
review requirements; this document does not assert that authorization conditions have passed.

Evidence and retained candidate artifacts are in the sibling release-validation directory. Existing
user work, prior candidate branches, earlier tarballs and previous validation evidence remain retained.
