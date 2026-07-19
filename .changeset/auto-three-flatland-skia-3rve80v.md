---
"@three-flatland/skia": patch
---

> Branch: feat/nx-migration
> PR: https://github.com/thejustinwalsh/three-flatland/pull/197

### ffad0dd0ccd96ec1bddd637fb4a5e4a4269a7c9a
fix: emit wgpu-layouts.json to dist root so consumers can bundle it
The built dist/ts/wasm-loader-wgpu.js imports "../wgpu-layouts.json" (root:'src'
places the external JSON asset at the dist ROOT, not mirrored under ts/), but the
tsdown build:done hook copied it to dist/ts/wgpu-layouts.json — one directory below
where the import points. Any consumer bundling @three-flatland/skia hit 'Could not
resolve ../wgpu-layouts.json'. Copy it to dist/wgpu-layouts.json to match the
emitted import. Surfaced by the consumer smoke test.
Files: packages/skia/tsdown.config.ts
Stats: 1 file changed, 6 insertions(+), 2 deletions(-)

### 1745f92f91d8fa491d89172b198942c7da941203
fix: load test wasm from lib/ not the removed dist/skia-*/ path
The final wasm relocated from dist/skia-*/ to lib/ in the binary-artifacts
unification, but test/setup.ts (and the browser-test harness) still read the old
dist/skia-gl/skia-gl.wasm path. On CI that file no longer exists, so every skia
API test file failed to collect with ENOENT — only wasm-loader-shared.test.ts
(which never opens the file) passed. Point both at lib/skia-*.wasm, the tracked
nx build output.

Verified locally: 295 tests pass; the only remaining locals failures are the two
font tests that read the skia submodule's resources/fonts/abc.ttf, absent on this
machine — CI checks out submodules:true so they pass there.
Files: packages/skia/test/browser-test.html, packages/skia/test/setup.ts
Stats: 2 files changed, 6 insertions(+), 6 deletions(-)

### 7345ff8f15b3992f31a35913a213f6790d836d80
fix: make --ensure freshness source-aware so CI recompiles on skia changes
The old --ensure early-exit (and build-wasm.mjs --skip-if-fresh) skipped whenever
lib/*.wasm merely EXISTED, ignoring whether the wasm sources changed. So a skia-
source PR would cache-miss nx, run setup.mjs --ensure, early-exit on the stale
committed libs, and the commit-skia-libs job would commit nothing — the compiled
libs never got rebuilt. That defeats the whole committed-libs flow.

Now --ensure decides freshness by a content hash of the wasm sources (build.zig,
build.zig.zon, src/zig, patches, vendor, wit + the skia submodule tree SHA; TS/
production deliberately excluded so a pure-TS change never forces a multi-minute
recompile). Fresh iff the libs exist AND lib/.wasm-sources.sha256 matches the
current hash → skip; otherwise compile and rewrite the stamp. This is the single
'script checks for libs, else builds' entry — no second graph target.

- stamp is a build output + committed by the commit-skia-libs CI job, so a fresh
  checkout knows the committed libs match the committed sources
- removed the dead/buggy build-wasm.mjs --skip-if-fresh (existsSync, not source-
  aware); build-wasm.mjs always compiles now, freshness lives in setup.mjs
- added a --wasm-hash debug flag to diagnose CI rebuild decisions
- seeded the stamp (verified the committed libs match current wasm sources)
Files: .github/workflows/ci.yml, packages/skia/lib/.wasm-sources.sha256, packages/skia/package.json, packages/skia/scripts/build-wasm.mjs, packages/skia/scripts/setup.mjs
Stats: 5 files changed, 456 insertions(+), 407 deletions(-)

### 957f9195e729420953cbfa7605f2c1a9619e309d
fix: use committed wasm libs on non-building hosts, never remote-fetch
The compiled lib/*.wasm are committed to the repo now (CI rebuilds and commits
them on skia changes), so the old remote-prebuilt fetch would overwrite the
tracked libs with a stale published version and dirty git history. Drop it.

On a host that can't compile (macOS 27 / ziglang#31658), setup.mjs and
build-wasm.mjs now use the committed libs when present and fail hard when
they're missing — never fetch. Remove the dead skia:fetch-wasm script and its
stale prebuilt-wasm.json manifest; rename prebuilt-wasm.mjs to host-capability.mjs
since only the canBuildWasm host probe survives.
Files: packages/skia/package.json, packages/skia/prebuilt-wasm.json, packages/skia/scripts/build-wasm.mjs, packages/skia/scripts/host-capability.mjs, packages/skia/scripts/prebuilt-wasm.mjs, packages/skia/scripts/setup.mjs
Stats: 6 files changed, 79 insertions(+), 178 deletions(-)

### 2db3d32297c43bfec1ac99b037315ef9a7093803
fix: restore the setup.mjs --ensure build pipeline; revert phase-4a wasm CI
The phase-4a "commit the wasm binaries" experiment broke skia: I had changed
skia's `build` from `setup.mjs --ensure && tsdown` to bare `tsdown`, and wired a
`build:wasm` nx target + commit-artifact CI job that ran `build-wasm.mjs`
DIRECTLY. But build-wasm.mjs assumes setup already ran — setup.mjs is what runs
setup-skia.sh (deps, PATCHES, GN, source extraction that generates
skia_sources.zig for the wasm target). Skipping it made zig compile unpatched,
platform-wrong skia (darwin ports: ApplicationServices.h, malloc/malloc.h) for
wasm32-wasi → the build failed, and the build job's skia test failed for want of
wasm.

Restore the working flow (as main had it):
- skia `build` = `node scripts/setup.mjs --ensure && tsdown` — the full pipeline
  builds the wasm from patched sources, then tsdown.
- Replace the broken `build:wasm` nx target with an explicit `build` target that
  caches `lib/*.wasm` as outputs keyed on the wasm sources (build.zig, src/zig,
  patches, submodule SHA) — so nx rebuilds the binary ONLY when those change
  (the "only produce a new binary when it should" goal, via cache not commits).
- Remove commit-artifact.yml, the ci.yml skia-wasm job, and the changes.yml
  skia_native filter.
- test:skia: `run build:wasm` → `run build` (setup runs first).

Also restore the CI build matrix to lts/* + lts/-1 — the hedge that we still
work on the previous LTS (I wrongly dropped it when bumping to node 24).
Files: .github/workflows/changes.yml, .github/workflows/ci.yml, .github/workflows/commit-artifact.yml, package.json, packages/skia/package.json
Stats: 5 files changed, 13 insertions(+), 180 deletions(-)
