# Package Boundaries, Cycles & Drift — spec

**Status:** in progress on `feat/nx-migration` (2026-07-18). Cluster of NX-cleanup + architecture hardening.
**Goal:** every package usable **standalone** *and* inside three-flatland; a hard, enforced dependency DAG; zero cycles of any kind; no schema/contract drift on release.

## The layer model (enforced)

```
foundation (bake, schemas)         layer 0  — shared contracts everything builds on
  ↓
sibling (atlas, alphamap, image,   layer 1  — standalone-publishable; reach only DOWN to foundation
         nodes, normals, slug, skia)
  ↓
composer (three-flatland)          layer 2  — composes siblings
  ↓
consumer (presets, devtools)       layer 3  — consume the composer
```

- **`scope:docs`** (starlight-theme) = docs-only design system, **out of the library DAG**, explicitly skipped.
- **Untagged** (docs, examples, minis, tools, benchmarks) = top-level, outside policy, skipped.
- **Rule:** a dependency edge `src → tgt` is legal **only if `layer(src) > layer(tgt)`** — strictly downward. UPWARD (sibling→composer) and SIDEWAYS (sibling→sibling) are both violations. Siblings therefore stay standalone: they may reach *down* to foundation, never sideways to each other.

**Enforcement:** `scripts/check-boundaries.mjs` reads the Nx project graph and applies the strictly-downward rule. (Not `@nx/enforce-module-boundaries` — that's ESLint-only and we're oxlint-only; Nx's own boundary conformance rule is paid Enterprise. The nx-graph script is the free, oxlint-compatible enforcer.) Wired as the `boundaries` CI gate.

## Cycles — "of any kind"

- **Project-level:** Nx builds its graph from the AST; it detects project cycles (none today). `check-boundaries` + `nx graph` cover this.
- **File-level:** **oxlint `import/no-cycle`** = **`"error"`** (the `import` plugin is already enabled) — replaces the retired, brittle `madge` pipeline. Runs in every `pnpm lint`.
  - It surfaced 10 pre-existing cycles in the vscode extension's registry↔registrant pattern; **fixed** by extracting `isToolEnabled` + tool metadata into a leaf `extension/toolEnabled.ts` (`toolRegistry.ts` keeps only register-wiring). 10 → 0, then escalated warn → error.
- **Retired:** `madge` dep + `generate-madge-tsconfig`/`graph-circular`/`graph-types`/`wrap-graph-viewer` scripts + `graph:sync/circular/types/*:open`. Kept `graph = nx graph`.

## Bundling & standalone (direction)

- **three-flatland bundles its `@three-flatland/*` deps** (bake, normals) → ships **self-contained** (peers stay `three`/`koota` only). If you use three-flatland you don't hand-manage siblings. The siblings remain **separately published** for standalone use.
  - *Deferred:* three-flatland's `tsdown` currently `unbundle: true` keeps `@three-flatland/*` external (hence declared deps). Flip those specific deps to bundled + drop from `dependencies`. **Bundling code is safe** — bake/schemas are **stateless** (pure FNV-1a hashing, deterministic helpers; no singletons/registries), so N inlined copies behave identically. The thing that must not drift is the **data contract**, not the code.

## Drift prevention (contracts: schemas + bake)

`schemas` (`./atlas`, `./normal-descriptor` validators) is `private` → **bundled** into consumers; `bake`'s `hashDescriptor`/`bakedSiblingURL` is the asset-location contract. If two published packages bundle *different* versions of a contract, producers/validators disagree.

Machinery (partly in place):
- **Build-time consistency ✓** — every consumer uses `workspace:*`, so all build against one source.
- **Artifact drift guarded ✓** — `gen:types:verify` + `sync:docs:schemas:verify` CI gates fail if generated types / `docs/public/schemas/*.json` diverge from the schemas source.
- **Release coordination (to add *when bundlers exist*):** put contracts + their published bundlers in a changeset **`fixed`** group so any contract change rebumps all bundlers together. *Deferred* because no published library bundles `schemas` at runtime yet (current uses: vscode extension, repo scripts, tests) and `bake` is public+external today (npm dedupes → no drift). Add the group in lockstep with the three-flatland bundling change above.

## Tests

- **Default everywhere (local, PR CI, agents): `nx affected -t test`** — only projects touched by the change; cache-restore the rest.
- **`nx run-many -t test`** on the **release/publish gate** (all-green before shipping) + optional nightly.
- *Deferred refactor:* delete `vitest.workspace.ts` + the root `include`/`exclude` curation + the skia carve-out; give each testable package its own `vitest.config.ts` (shared `vitest.base.ts`) → per-project nx `test` targets. Removes the skia special-case (`pnpm --filter skia test`), enables `affected`, makes skia a normal target.

## Known phantom/test-edge cleanups

- **`three-flatland → atlas`** — test-only import in `src/loaders/atlasBakerE2E.test.ts` (cross-package e2e), undeclared. *Deferred:* move the test to top-level `e2e/` (it imports three-flatland internals, so needs those made public or the test rewired to the public API). Removes the phantom entirely — no devDep fig-leaf.
- **`normals → schemas`** — was declared as a runtime `dependency`, used only in `descriptor.schema.test.ts`. **Fixed → `devDependency`.** ✅

## Status / execution order

| # | Item | Status |
| --- | --- | --- |
| 1 | oxlint `no-cycle` (warn) + retire madge | ✅ done |
| 2 | 4-layer retag + strictly-downward `check-boundaries` | ✅ done |
| 3 | tag devtools (consumer) / starlight-theme (docs) | ✅ done |
| 4 | `normals` schemas → devDependency | ✅ done |
| 5 | Move `atlasBakerE2E.test.ts` → `e2e/` | deferred (needs internal→public) |
| 6 | Per-project test model + `nx affected` in CI | deferred (build-verified) |
| 7 | three-flatland bundles `@three-flatland/*` | deferred (build-verified) |
| 8 | schemas/bake `fixed` changeset group | deferred (with #7) |
| 9 | Fix vscode registry cycle → escalate no-cycle to `error` | ✅ done (`toolEnabled.ts` leaf) |
