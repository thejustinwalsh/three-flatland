# Verification plan: `lighting-stochastic-adoption` ← `main` (sprite-sort + slug GLB)

**Authored:** 2026-05-22, before integrating 123 commits of `main` into the lighting PR.

**Companion to:** the rebase guide at `fix-sprite-sort/.../2026-05-19-rebase-lighting-onto-sprite-sort.md` (covers ~5 of 28 conflict files; this plan covers verifying the *whole* integrated state).

## Backup / rollback (already in place)

- Tag `pre-sprite-sort-rebase-2026-05-22` → `e0a83ee4`
- Branch `backup/lighting-pre-sprite-sort-rebase-2026-05-22` (local **and** `origin/`)
- Live PR branch `origin/lighting-stochastic-adoption` NOT force-pushed until this plan passes.

**Rollback:** `git reset --hard pre-sprite-sort-rebase-2026-05-22` (local) or re-fetch the backup branch from origin. PR branch unaffected until the final verified push.

## What "correct final state" means

Goal is correctness of the *merged end state*, not a faithful commit replay. Two intents must both survive:

### From `main` (must NOT be lost in resolution)
- [ ] Sort-correctness regression suite passes (`test(ecs): sort-correctness regression suite`, `test(ecs): guard batch sort/swap buffer consistency`) — the reason this landed first.
- [ ] `bufferSyncSystem.ts` stays **deleted**; its responsibilities live in the rewritten batch systems.
- [ ] Anchor-in-matrix: `updateAnchor()` is gone; `(0.5 - this._anchor.x)` / `.y` arithmetic present in `Sprite2D.updateMatrix`.
- [ ] Slug GLB: `.slug.glb` baked path + `SlugFontLoader` GLB loading intact; `@three-flatland/asset` wired.
- [ ] `observable/` module present and exported from the barrel.
- [ ] `codemod` skill present; `skills/package.json` validate loop fix present.

### From this branch (must NOT be lost)
- [ ] Lighting bisect intact: `presets/lighting` exports only `DefaultLightEffect` + `NormalMapProvider` (Radiance/Direct/Simple remain OUT — they live on PR #72).
- [ ] Normals: unified `forceRuntime` flag, lazy-loaded baker, `NormalMapLoader` descriptor route, descriptor-hash cache key, `BakedAssetLoaderOptions` structural option type.
- [ ] Greptile fixes: `queueMicrotask` torch toggle in `examples/react/lighting/App.tsx`; `flatland.bake` in `bake/cli.ts` USAGE; `if (!header.ok)` in `bake/sidecar.ts`.
- [ ] Interleaved core buffer + per-instance enable-bit effect gating (`SpriteBatch` / `EffectMaterial`).
- [ ] devtools enablement, graph/size scripts, Astro 6 docs config.

### Semantic merges (two rewrites of one file — combine, don't pick a side)
- [ ] `transformSyncSystem` / `SpriteBatch`: my interleaved-buffer + `pz` depth packing AND main's "re-sort instance slots by zIndex each frame." Sort tests pass AND lighting renders.
- [ ] `EffectMaterial` / `Sprite2DMaterial`: enable-bit gating + main's material changes.
- [ ] `Sprite2D`: anchor-in-matrix (main) + lighting additions (mine) both present.

## Mechanical gates (all must pass)

```bash
pnpm install                                   # lockfile reconciled, no peer errors
pnpm --filter=three-flatland typecheck         # workspace typecheck green
pnpm lint                                       # clean
pnpm test                                       # all unit + type tests (incl. main's sort suite)
pnpm --filter=@three-flatland/skills test       # 2 valid skills (codemod + tsl)
pnpm build                                      # all build tasks green
pnpm --filter=docs build                        # docs pages build clean
```

## Runtime / visual (tests can't catch these)

```bash
pnpm dev
```
- [ ] **lighting** — normals load/bake, Forward+ tiles, shadows; no console errors.
- [ ] **batch-demo** — tiles render, shadows correct, tree scale right, **sprite sort order correct** (the original regression).
- [ ] **knightmark / animation** — runs ~12 fps, no frame-float / stuck frame (anchor-in-matrix sanity).
- [ ] **tilemap** — renders; parallax/sort correct.
- [ ] **slug-text** — GLB font loads and shapes (slug refactor sanity).

## Sign-off

Integration is "done" only when every box above is checked. Then — and only then — force-push the integrated branch over `origin/lighting-stochastic-adoption` and note that PR #72 (radiance) needs its base re-synced afterward.
