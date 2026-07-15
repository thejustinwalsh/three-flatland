# @three-flatland/io

> Agent-facing reference for shared, vscode-free data-layer helpers.
>
> **Related**: `.library/three-flatland/loader-architecture.md` is the canonical reference for runtime loaders (texture, atlas, tilemap, font, image format). `tools/io` covers tools-side image decode + atlas data plumbing; if you're adding a runtime loader (consumed by `three-flatland`'s `TextureLoader`/`SpriteSheetLoader`), it does NOT belong here — read the loader architecture first.

## What's here

- `src/image.ts` — `decodeImageData()` (Blob/ArrayBuffer/Uint8Array → ImageData via `createImageBitmap` + OffscreenCanvas), `loadImage()` (URI → HTMLImageElement). Browser-only.
- `src/atlas/` — pure atlas types + builders + packer + merge orchestrator. **No vscode imports.** Both the VSCode atlas tool and the merge tool import from here.

## Subpath exports

- `import {…} from '@three-flatland/io'` — root: `decodeImageData`, `loadImage`.
- `import {…} from '@three-flatland/io/atlas'` — atlas namespace: types (`AtlasJson`, `RectInput`, `AnimationInput`, `AsepriteFrameTag`, `AtlasMergeMeta`, `WireAnimation`), builders (`buildAtlasJson`, `atlasToRects`, `readAnimationsFromJson`, `animationInputToWire`, `wireAnimationToInput`, `importAsepriteFrameTags`, `uniqueKey`), packer (`packRects`, `PackInput`, `PackResult`, `Placement`), merge (`computeMerge`, `aliasFromUri`, `namespaceSource`, `MergeSource`, `MergeInput`, `MergeResult`, `NameConflict`).

## tsup gotcha — bundle: false

`tools/io/tsup.config.ts` sets `bundle: false`. Every entry compiles standalone; when one module imports another, **the imported file must also be a tsup entry** — otherwise it ends up as a missing import in `dist/`.

Current entries: `src/index.ts`, `src/image.ts`, `src/atlas/index.ts`, `src/atlas/types.ts`, `src/atlas/build.ts`, `src/atlas/maxrects.ts`, `src/atlas/merge.ts`.

**When you add a new file under `src/`** that is imported by another file, add it to the `entry` array in `tools/io/tsup.config.ts`. The build appears to succeed without it, but consumers hit `Module not found` at runtime or when esbuild bundles the VSCode host.

## Tests

- Tests live alongside source as `*.test.ts` (e.g., `src/atlas/merge.test.ts`).
- Run a single file: `pnpm vitest run tools/io/src/atlas/merge.test.ts`.
- Run all atlas tests: `pnpm vitest run tools/io/src/atlas/`.
- Run all io tests: `pnpm vitest run tools/io/`.
- The root `vitest.config.ts` `include` glob already covers `tools/*/src/**/*.test.ts`. No per-package vitest config needed.

## Atlas core — canonical home

Pure atlas logic lives in `src/atlas/`. It used to live inside `tools/vscode/extension/tools/atlas/sidecar.ts` — that is no longer the source of truth. `sidecar.ts` is now a thin VSCode wrapper that imports from here and adds `vscode.workspace.fs` I/O on top.

If you want to add a builder, converter, packing, or merge function:
- Add to `src/atlas/` and re-export via `src/atlas/index.ts`.
- Do not add to `tools/vscode/extension/tools/atlas/sidecar.ts` — that file should stay minimal.

A future CLI (`fl-atlas merge …`) will wrap `computeMerge` directly. Keep that path open: no vscode or Node-only deps in `src/atlas/`.

## Adding a new module under src/atlas/

1. Create `src/atlas/<name>.ts`.
2. Add tests in `src/atlas/<name>.test.ts`.
3. Re-export from `src/atlas/index.ts`.
4. Add `'src/atlas/<name>.ts'` to `tools/io/tsup.config.ts` `entry` array (required by `bundle: false`).
5. Build: `pnpm --filter @three-flatland/io build`.

## Common pitfalls

- Adding a file under `src/` without updating `tsup.config.ts` — VSCode host build fails with `Module not found`.
- Importing `vscode` from anywhere in `src/atlas/` — keep this module portable.
- Adding a Node-only dep (e.g. `node:fs`) — webview-side consumers will fail.
- Re-extracting `buildAtlasJson` etc. into the VSCode extension — they are already here; import via `@three-flatland/io/atlas`.

## Reference

- VSCode wrapper pattern (vscode I/O on top of pure logic): `tools/vscode/extension/tools/atlas/sidecar.ts`.
- Pure consumer from a webview: `tools/vscode/webview/merge/mergeStore.ts` (calls `computeMerge`).
