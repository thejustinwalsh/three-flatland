# sync-pack: persistent drift prevention for examples and minis

**Date:** 2026-04-09
**Status:** Design approved, ready for implementation plan

## Problem

`scripts/sync-pack.ts` rewrites `package.json` files under `examples/**` and `minis/*` so they carry concrete npm version strings instead of pnpm's `catalog:` and `workspace:*` shorthands. The goal is for any example to be copy-paste-able outside the monorepo — a reader can clone a single example directory and run `npm install` without the workspace plumbing.

The current implementation only rewrites dependency values whose current string is literally `"catalog:"` or `"workspace:*"` (`scripts/sync-pack.ts:100-128`). Once those strings have been replaced with a concrete version, the script walks past them on every subsequent run. That means:

1. Bumping `vite: ^6.4.1` in `pnpm-workspace.yaml` does **not** propagate to examples that were synced when the catalog said `^6.0.7`.
2. Bumping an internal workspace package (e.g. `three-flatland` in `packages/three-flatland/package.json`) does **not** propagate to examples that were synced against an older version.
3. Drift is already live in the repository. `examples/react/tilemap/package.json:28` and `examples/react/skia/package.json:28` both pin `"vite": "^6.0.7"` while the catalog specifies `^6.4.1`. Several other pins are similarly stale.

Two related gaps compound the problem:

- **`peerDependencies` is not walked at all.** The current script only handles `dependencies` and `devDependencies` (`scripts/sync-pack.ts:227-228`). `minis/breakout/package.json:35-39` still contains unresolved `"catalog:"` strings in its `peerDependencies` block for exactly this reason.
- **Catalog bumps never trigger a sync.** lint-staged only runs `sync-pack` when a file under `examples/**/package.json` or `minis/**/package.json` is staged (`package.json:45-46`). A commit that touches only `pnpm-workspace.yaml` or an internal `packages/*/package.json` will not propagate anywhere.

## Goal

Make `pnpm-workspace.yaml` (for third-party deps) and the internal `packages/*/package.json` files (for workspace deps) the permanent single source of truth for all shared versions used in examples and minis. Any divergence should be corrected automatically on commit and flagged in CI.

## Scope

**In scope:** `examples/**` and `minis/*` package.json files.

**Out of scope:**
- `packages/*` and `docs` — these continue to use `catalog:` and `workspace:*` strings, which pnpm resolves at install time.
- The source-of-truth model. The catalog remains hand-edited; the script never queries npm for "latest" versions. Renovate is responsible for proposing version bumps to the catalog and to internal packages.
- Enforcing catalog membership for all example dependencies. Examples may freely declare one-off third-party deps that aren't in the catalog.

## Design

### Source-of-truth table

On every script run, build a single `{ name → version }` lookup from two sources:

1. **Catalog** — parsed from the `catalog:` block of `pnpm-workspace.yaml`. Values are used as-is (they already include a range prefix such as `^`).
2. **Internal workspace packages** — read from each `packages/*/package.json`. Values are formatted as `^<version>`.

These merge into one flat table. Catalog and internal package names do not overlap in practice; if they ever did, internal wins (the workspace copy is closer to the truth).

### Rewrite rules

In default (directory) mode and `--files` mode, for every target `package.json`:

- Walk `dependencies`, `devDependencies`, **and** `peerDependencies`. All three dep sections are treated identically.
- For each entry whose **name** exists in the table, overwrite the value with the table entry. This is the only condition — the current value is irrelevant. A literal `"catalog:"` and a stale `"^6.0.7"` are handled by the same code path.
- For each entry whose name is not in the table, leave it untouched. Renovate manages those.
- Report a file as "changed" only when at least one value actually differs from what was there before, to avoid spurious writes.

This replaces the current `strict` / non-strict branching in `syncDeps`. Because the rule is "name is in the table → overwrite," there is no case where a name would be "unrecognized" — names not in the table are simply skipped without warning or error.

### `--verify` mode

Rebuild the same table and walk the same three dep sections. For every entry whose name is in the table, compare the current value against the table value. Report mismatches in the format:

```
examples/react/tilemap/package.json:
  "vite": expected "^6.4.1", got "^6.0.7"
```

Exit non-zero if any mismatches are found. Entries outside the table are never reported.

### lint-staged triggers

Expand the set of files that trigger `sync-pack` so catalog and internal-package bumps propagate automatically:

| File pattern | Command |
|---|---|
| `pnpm-workspace.yaml` | `pnpm sync:pack examples minis` (full directory sync) |
| `packages/*/package.json` | `pnpm sync:pack examples minis` (full directory sync) |
| `examples/**/package.json` | `tsx scripts/sync-pack.ts --files` (unchanged) |
| `minis/**/package.json` | `tsx scripts/sync-pack.ts --files` (unchanged) |

The first two triggers run a full sync because a single catalog or internal bump can affect any example or mini — we cannot know from the staged file alone which downstream files need updating.

**Re-staging constraint (implementation detail).** lint-staged only auto-stages files it originally glob-matched. When a full sync runs from a `pnpm-workspace.yaml` or `packages/*/package.json` trigger, it will mutate files under `examples/**` and `minis/*` that were not part of the glob. Those mutations must still end up in the same commit. The implementation plan must pick a concrete mechanism for this — candidates include running the full sync from the `simple-git-hooks` pre-commit entry directly (outside lint-staged) with a `git add examples minis` step, or using a lint-staged function that explicitly re-adds the affected paths. The design does not mandate which one; it only requires the end state: committing a catalog bump leaves all affected example and mini files updated in the same commit.

### One-time cleanup

After the code change lands, run `pnpm sync:pack examples minis` once to heal existing drift. The expected result:

- `vite` pins updated across several examples (`^6.0.7` → `^6.4.1`).
- Any other stale pins corrected in the same pass.
- `minis/breakout/package.json` `peerDependencies` block rewritten from `"catalog:"` to concrete versions.

This cleanup commit is separate from the code change so the diff is reviewable.

## Non-goals and explicit exclusions

- **No npm querying.** The script never contacts the npm registry. "Latest" is defined by the catalog and by `packages/*/package.json`.
- **No bidirectional sync.** The script only ever writes into `examples/**` and `minis/*`. It never edits `pnpm-workspace.yaml` or `packages/*/package.json`.
- **No strictness escalation.** Deps not in the table are skipped silently in both sync and verify modes. Renovate handles their upkeep.
- **No changes to `packages/*` or `docs/` package.json files.**

## Verification

After implementation:

1. `pnpm sync:pack examples minis` heals all current drift in one pass (expected: at least the `vite` drift and the `minis/breakout` peer deps).
2. `pnpm sync:pack:verify examples minis` exits 0 on a clean tree.
3. Manually bumping `vite` in `pnpm-workspace.yaml`, staging it, and running the pre-commit hook updates every example/mini that depends on `vite`.
4. `pnpm sync:pack:verify examples minis` exits non-zero and prints a drift report when an example's `vite` pin is hand-edited to an older version.
5. `peerDependencies` entries in `minis/breakout/package.json` are concrete version strings after the sync.
