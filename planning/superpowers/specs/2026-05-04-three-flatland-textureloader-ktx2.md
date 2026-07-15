---
date: 2026-05-04
topic: textureloader-ktx2
status: deferred
parent: 2026-05-02-image-encoder-compare-slider.md
purpose: Inline KTX2 dispatch in three-flatland's TextureLoader / SpriteSheetLoader. Phase 2.1.2 leftover (T13).
---

# T13 — three-flatland's TextureLoader/SpriteSheetLoader inline KTX2 branch

**Status: deferred.** Blocked on the `lighting-stochastic-adoption` branch landing in main.

## Why this exists

Phase 2.1.2 shipped `Ktx2Loader` as a standalone-publishable subpath at `@three-flatland/image/loaders/ktx2`. Tier 2 (direct use) works today — vanilla three.js / R3F users can `useLoader(Ktx2Loader, url)`, and the encode tool's `ComparePreview` consumes it.

What's missing is **Tier 1 (everyday use)**: three-flatland's own `TextureLoader` and `SpriteSheetLoader` should detect KTX2 by URL extension and route through `Ktx2Loader` automatically, so a user calling `new TextureLoader().loadAsync('/foo.ktx2')` doesn't need to think about formats. That's how the loader architecture is supposed to work end-to-end (see `.library/three-flatland/loader-architecture.md` § "The three-tier surface").

## Why it's deferred

The `lighting-stochastic-adoption` branch is rewriting `packages/three-flatland/src/loaders/TextureLoader.ts` and `SpriteSheetLoader.ts` substantially:
- TextureLoader gains a hierarchical preset system (`pixel-art`, `smooth`, etc.) and a static `load()` API with caching.
- SpriteSheetLoader composes against `@three-flatland/normals` and the new TextureLoader.
- LDtkLoader and TiledLoader move from `src/tilemap/` into `src/loaders/`.

Grafting a KTX2 inline branch onto the *current* feat-vscode-tools shape would create merge conflicts when the lighting work lands. Doing it AFTER the merge is the right move — graft onto the rewritten shape, not the about-to-be-replaced one.

## What to implement

### 1. Inline KTX2 dispatch in TextureLoader

In `packages/three-flatland/src/loaders/TextureLoader.ts` (post-merge shape), add a format-detection branch in `load()` / `loadAsync()`:

```ts
// Inside TextureLoader.load() or its async core
const ext = extOf(url) // small helper: lowercase ext after last `.`, query/hash stripped
if (ext === 'ktx2') {
  const { Ktx2Loader } = await import('@three-flatland/image/loaders/ktx2')
  const loader = new Ktx2Loader()
  // Cap detection — see "Capability source" below.
  loader.setSupportedFormats(getRendererCaps(/* ... */))
  return loader.loadAsync(url)
}
// existing PNG/WebP/AVIF native-bitmap path
```

The dynamic `import('@three-flatland/image/loaders/ktx2')` keeps the KTX2 chunk + transcoder wasm out of the initial shell bundle. Vite/Rollup/tsdown all code-split this automatically; only fetched on first KTX2 hit.

### 2. Same dispatch in SpriteSheetLoader

`SpriteSheetLoader` reads an atlas JSON, then loads the sheet image. The image-load step needs the same KTX2 branch — atlas authors should be able to ship `.ktx2` sheets and have everything else work unchanged.

### 3. Capability source

The encode tool's stopgap (`probeKtx2Caps()` via a throwaway WebGL2 context) was a workaround for not having the renderer in scope. In three-flatland's TextureLoader, the renderer IS available via `getCurrentRenderer()` or whatever the post-merge code calls it (or three's `LoadingManager` / `WebGPURenderer.getCurrentRenderer()`). Use `Ktx2Loader.detectSupport(renderer)` directly for accurate per-device caps.

If no renderer is available (e.g. CLI / Node baker code paths), fall back to the all-false caps + DataTexture path that already works for that case in Ktx2Loader's `buildTexture`.

### 4. Cross-package dependency

Add `@three-flatland/image` as a **hard dependency** (NOT peerDependency) in `packages/three-flatland/package.json`:

```jsonc
{
  "dependencies": {
    "@three-flatland/image": "workspace:*"
  }
}
```

Per `.library/three-flatland/loader-architecture.md` § "Cross-package dependency policy". Changesets will pin the published version range; bundler dedupe handles the rest.

### 5. Verify lazy chunking still works

The lighting branch's TextureLoader is itself imported by code that runs at scene construction. Ensure the `await import('@three-flatland/image/loaders/ktx2')` inside the KTX2 branch produces a separate chunk in production builds (no eager pull-in of the transcoder wasm). Check `pnpm --filter <example> build` output: the Ktx2Loader + ktx2-worker + basis_transcoder.wasm should land in a chunk that only fetches when `.ktx2` URLs are actually loaded.

### 6. Test plan

- New `packages/three-flatland/src/loaders/TextureLoader.test.ts` cases: KTX2 URL routes to Ktx2Loader, PNG URL stays on the native path, both paths produce a usable Texture.
- Round-trip in an example: encode a small PNG → KTX2 via `flatland-bake encode`, load via TextureLoader, render in an example app, assert no console errors + visible sprite. Could be a scripted Playwright check or a manual smoke.
- Verify the encode tool's `ComparePreview` continues to work — it imports `Ktx2Loader` directly, but T13 doesn't touch that path, so this is just a regression check.

## Estimated scope

~100 LOC in three-flatland (TextureLoader branch + SpriteSheetLoader branch + helper). +1 dependency line in three-flatland's package.json. ~30 LOC of tests. No changes needed in `@three-flatland/image` (the public surface is already in place from Phase 2.1.2).

## Pre-flight checklist when picking this up

1. `lighting-stochastic-adoption` is merged into main (or wherever the rewritten TextureLoader/SpriteSheetLoader lives).
2. Read `.library/three-flatland/loader-architecture.md` — particularly the "three-tier surface" and "cross-package dependency policy" sections.
3. Read `packages/three-flatland/src/loaders/TextureLoader.ts` (post-merge shape) — the hierarchical preset resolution determines where the KTX2 branch slots in.
4. Confirm `@three-flatland/image` is at a published version in the consumer-facing changeset history; pin a range in three-flatland's deps that includes the version with `Ktx2Loader`.

## Out of scope for T13

- Adding new asset format loaders (LDtk, Tiled, etc.) — those are their own follow-ups; the loader-architecture doc covers the pattern.
- KTX2 encoder integration in three-flatland (e.g., a runtime API to encode at app start). Encoder belongs in `@three-flatland/image`'s tools/bake side; runtime three-flatland is decode-only.
- Bundle-size optimization on `basis_transcoder.wasm` itself (table stripping for unused decoder paths). Tracked separately; orthogonal to T13.

## When this lands, also update

- `.library/three-flatland/loader-architecture.md` — strike the "T13 is the planned plumbing" mention if any.
- `planning/superpowers/specs/2026-05-02-image-loader-fork-gate-report.md` — flip T13 from "deferred" to "complete" with a pointer to this doc.
- This doc — change `status: deferred` to `status: complete` in the frontmatter, summarize what shipped at the bottom.
