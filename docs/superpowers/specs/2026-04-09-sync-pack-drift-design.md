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

A third, more fundamental constraint surfaces once the previous two are fixed: a full sync triggered by a `pnpm-workspace.yaml` or `packages/*/package.json` edit will mutate files under `examples/**` and `minis/*` that were never part of the commit's staged set. lint-staged only re-stages files matching the hook's own glob, so the mutations would be left unstaged and fall out of the commit. Rather than work around this, retire `simple-git-hooks` + `lint-staged` entirely and move pre-commit behavior to lefthook, which natively re-stages every file a command touches via `stage_fixed: true`.

## Goal

Make `pnpm-workspace.yaml` (for third-party deps) and the internal `packages/*/package.json` files (for workspace deps) the permanent single source of truth for all shared versions used in examples and minis. Any divergence should be corrected automatically on commit and flagged in CI.

## Scope

**In scope:**
- Rewrite logic in `scripts/sync-pack.ts` so catalog and internal workspace package versions become the permanent source of truth for `examples/**` and `minis/*`.
- Extend dep walking to cover `peerDependencies` alongside `dependencies` and `devDependencies`.
- Replace `simple-git-hooks` + `lint-staged` with lefthook. Migrate every existing pre-commit trigger, not just the sync-pack ones.
- Expand pre-commit coverage so `pnpm-workspace.yaml` and `packages/*/package.json` edits trigger a full sync of examples and minis.
- One-time cleanup sync to heal existing drift after the code change lands.

**Out of scope:**
- `packages/*` and `docs` package.json files — these continue to use `catalog:` and `workspace:*` strings, which pnpm resolves at install time.
- The source-of-truth model. The catalog remains hand-edited; the script never queries npm for "latest" versions. Renovate is responsible for proposing version bumps to the catalog and to internal packages.
- Enforcing catalog membership for all example dependencies. Examples may freely declare one-off third-party deps that aren't in the catalog.
- Adding any new pre-commit behavior beyond what simple-git-hooks + lint-staged already run plus the two new sync-pack triggers.

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

### Git hooks: migrate to lefthook

Retire `simple-git-hooks` and `lint-staged`. Install `lefthook` and move all pre-commit behavior into a single `lefthook.yml` at the repo root. lefthook's `stage_fixed: true` directive re-stages every file a command touched, regardless of whether the file was originally part of the staged set — this is the mechanism that makes the new sync-pack full-sync triggers safe.

**New file: `lefthook.yml`** (repo root):

```yaml
pre-commit:
  parallel: false
  commands:
    sync-pack-full:
      glob: "{pnpm-workspace.yaml,packages/*/package.json}"
      run: pnpm sync:pack examples minis
      stage_fixed: true
    sync-pack-files:
      glob: "{examples,minis}/**/package.json"
      run: tsx scripts/sync-pack.ts --files {staged_files}
      stage_fixed: true
    sync-react-subpaths:
      glob: "{packages/three-flatland/src/index.ts,packages/three-flatland/src/*/index.ts,packages/skia/src/ts/three/index.ts}"
      run: tsx scripts/sync-react-subpaths.ts
      stage_fixed: true
    check-skia-pin:
      glob: "packages/skia/third_party/skia"
      run: tsx scripts/check-skia-pin.ts
```

Notes on this config:

- `parallel: false` gives deterministic ordering. `sync-pack-full` runs before `sync-pack-files`, so a commit that stages both `pnpm-workspace.yaml` and an example `package.json` applies the catalog bump across all examples first, then the per-file step runs as an idempotent no-op on the already-synced file.
- `stage_fixed: true` is set on every mutating command. It covers both the full-sync case (files mutated outside the original glob) and the per-file case (in-place edits).
- `check-skia-pin` deliberately omits `stage_fixed`. It's a verification script that doesn't mutate files; it either passes or exits non-zero.
- Glob brace expansion `{a,b,c}` matches any of the listed patterns, preserving the semantics of the current multi-entry `lint-staged` patterns for sync-react and the two sync-pack scopes.
- The `{staged_files}` placeholder in `sync-pack-files` receives the staged files that matched the glob for that specific command — unchanged behavior versus the current lint-staged setup.

**`package.json` changes:**

- Remove `simple-git-hooks` and `lint-staged` from `devDependencies`.
- Remove the top-level `"simple-git-hooks"` and `"lint-staged"` config blocks.
- Add `lefthook` to `devDependencies`.
- Update the `prepare` script from `"simple-git-hooks"` to `"lefthook install"`. lefthook self-installs its git-hook shims into `.git/hooks/` on `lefthook install`.

**Developer-facing behavior after the migration:**

- On `pnpm install`, lefthook installs its pre-commit shim.
- On `git commit`, lefthook runs the pre-commit commands against the current staged set; mutated files are automatically re-staged.
- Running `lefthook run pre-commit` manually executes the same commands outside of a commit, for debugging.

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
- **No new pre-commit behavior.** The lefthook migration preserves existing hooks exactly (sync-react-subpaths, check-skia-pin, sync-pack per-file) and adds only the two new sync-pack full-sync triggers justified by this spec. No reformatting, linting, or type-checking hooks are added as part of this work.

## Verification

After implementation:

1. `pnpm install` installs lefthook and its pre-commit shim. `.git/hooks/pre-commit` is a lefthook-managed file.
2. `simple-git-hooks` and `lint-staged` are gone from `node_modules`, `devDependencies`, and the `package.json` config blocks.
3. `pnpm sync:pack examples minis` heals all current drift in one pass (expected: at least the `vite` drift across several examples and the `minis/breakout` peer deps).
4. `pnpm sync:pack:verify examples minis` exits 0 on a clean tree.
5. `pnpm sync:pack:verify examples minis` exits non-zero and prints a drift report when an example's `vite` pin is hand-edited to an older version.
6. `peerDependencies` entries in `minis/breakout/package.json` are concrete version strings after the sync.
7. **End-to-end hook test.** Stage a `vite` catalog bump in `pnpm-workspace.yaml` alone, run `git commit`, confirm the resulting commit includes the catalog bump plus updated `vite` pins in every example and mini that depended on it, with no separate re-stage step.
8. **Combined hook test.** Stage a catalog bump and an unrelated edit to an `examples/*/package.json` in the same commit. Confirm the final commit contains both edits plus any additional propagated pins, and that `sync-pack-files` running after `sync-pack-full` is a no-op (no double writes).
9. **Existing hooks regression test.** Stage an edit to `packages/three-flatland/src/index.ts`. Confirm `sync-react-subpaths` runs and any generated files are included in the commit. Stage an edit under `packages/skia/third_party/skia`. Confirm `check-skia-pin` runs and blocks the commit when the pin is invalid.
