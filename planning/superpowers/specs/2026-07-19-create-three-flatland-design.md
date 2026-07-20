# `create-three-flatland` — starter CLI design

**Date:** 2026-07-19
**Status:** Approved, ready for implementation planning

## Problem

There is no way to start a three-flatland project. The only starting points are
the monorepo examples, which cannot be copied out: each one carries workspace-only
wiring (`resolve.conditions: ['source']`, `customConditions` in tsconfig, an MFE
`base` path, `TURBO_MFE_PORT` in the dev script) that produces a broken project
outside the repo.

We want `npm create three-flatland@latest my-game` to produce a working, minimal,
version-correct project — and we want Vite itself to be able to offer us as a
template.

## Prior art: how `create-vite` works

Read from the published `create-vite@9.1.1` tarball, not from memory.

- **Zero runtime dependencies.** `@clack/prompts`, `cross-spawn`, and `picocolors`
  are bundled into a single ~45KB `dist/index.js`. `bin` is a two-line ESM shim.
- **Templates ship inside the tarball.** `files: ["index.js", "template-*", "dist"]`.
  There is no degit, no network fetch, no git dependency. Scaffolding is a
  filesystem copy out of `node_modules/create-vite/template-<name>/`.
- **A rename map is mandatory.** `{ _gitignore: '.gitignore', '_oxlintrc.json': '.oxlintrc.json' }`.
  npm strips a real `.gitignore` from published tarballs, so templates must store
  it prefixed and rename on copy.
- **`package.json` is rewritten after copy.** Name comes from `basename(resolve(targetDir))`,
  validated against the npm name regex, prompted for if invalid. A generic
  `editFile(path, transform)` helper handles optional feature injection.
- **Target-directory safety.** Empty check, then overwrite / ignore / cancel, with
  `.git` preserved when emptying.
- **Package manager** is inferred from `npm_config_user_agent`.
- **Foreign templates are delegated via `customCommand`.** Entries in the framework
  list can carry e.g. `customCommand: "npm create electron-vite@latest TARGET_DIR"`,
  where `TARGET_DIR` is substituted. This is the mechanism that lets Vite offer a
  template it does not own.

## Decisions

### Package

Published as **`create-three-flatland`**. (`create-flatland` is already taken on
npm; `create-three-flatland` was confirmed available.)

```
npm  create three-flatland@latest my-game
pnpm create three-flatland my-game
```

Zero runtime dependencies, bundled. `files: ["dist", "templates"]`.

### Vite interoperability

To be listable in `create-vite`'s framework array via `customCommand`, the CLI
must honor create-vite's contract:

- positional target directory
- `--template three | react`, aliased `-t`
- `--overwrite`
- **fully non-interactive when target dir and template are both supplied**;
  prompt only for what is missing

Same flags, same semantics, same `_gitignore` rename behavior. This costs one
upstream PR adding a single entry to create-vite's framework list, and gets us
both our own branded flow and the Vite listing from one binary.

### Two templates, hand-authored

`packages/create-three-flatland/templates/{three,react}/`.

These are written by hand, not generated from `examples/`. Because they are
bespoke minimal starters rather than transformed examples, no bake or transform
pipeline is needed.

Both are registered as pnpm workspace packages, so `turbo run typecheck`,
`oxlint`, and `build` cover them like any other package.

`_gitignore` is stored prefixed on disk and renamed by the CLI on copy. The root
`.gitignore` already covers nested `node_modules`/`dist`, so nothing breaks
locally.

### `examples/*/template` stays separate

`examples/three/template` and `examples/react/template` keep their current job:
the *example-authoring* scaffold, and the source of truth for `sync:examples`'
`GemBackground` propagation. They deliberately carry gem branding, the MFE `base`
path, and devtools.

The user-facing starter has the opposite requirements. Merging the two would force
one to compromise. Two artifacts, two jobs.

### Version freshness

Templates author dependencies as `catalog:` (third-party) and `workspace:*`
(ours), exactly as examples do. `scripts/sync-pack.ts` rewrites them into real
npm ranges. No dependency version is ever hand-tuned.

A pre-commit hook fires on any `{pnpm-workspace.yaml,packages/*/package.json}`
change — which includes the version bumps `changeset version` writes. A release
bump therefore propagates into the templates at commit time, automatically.

**Which hook file depends on merge state.** `1879b5ff build(hooks): replace
lefthook with a native worktree-safe pre-commit` deletes `lefthook.yml` in favor
of a tracked `.githooks/pre-commit`, because lefthook cannot install or run in
linked git worktrees. As of this writing that commit is on `feat/nx-migration`
and `ci/release-smoke-gate` but **not on `main`**. Implementation should target
whichever is live at the time:

- **Post-merge (preferred):** `.githooks/pre-commit` steps 1–2 — add the
  templates dir to the `pnpm sync:pack examples minis` invocation and its
  `git add`, and to the `^(examples|minis)/.*/package\.json$` match pattern.
- **Pre-merge:** the equivalent edits at `lefthook.yml:14` and `lefthook.yml:17`.

Either way, `.github/workflows/build.yml:58` must also add the templates dir to
`sync:pack:verify`. That step is not optional: hooks only run on local commits,
so a CI release job that bumps versions without them could otherwise publish a
stale template. The `sync:pack:verify` gate turns that into a red build.

This is the one part of the design coupled to the hooks merge, so it is worth
sequencing that merge first.

## Template contents

Both follow Vite's layout convention (`src/`, `public/`, `_gitignore`) rather than
the examples' flat layout — it is what users expect and what create-vite emits.

Scaffolded `package.json` is `private: true`, version `0.0.0`, with `name` set
from the target directory.

### `templates/three/` — `src/main.ts`, ~70 lines

- `new Flatland({ viewSize: 400, clearColor })` — the stage, including the
  orthographic camera. This is the library's front door; `basic-sprite` is long
  precisely because it avoids `Flatland` to demonstrate the low-level path.
- `WebGPURenderer` + `await renderer.init()`
- **Loading state:** a `#loader` element in `index.html`, removed once `init()`
  and the texture resolve. The honest vanilla pattern.
- `TextureLoader.load()` → `Sprite2D`
- **Interactivity:** a standard three `Raycaster` against the sprite (supported via
  `events` / `HitTestMode`), driving hover scale + tint lerp. Explicitly not the
  hand-rolled AABB math in `basic-sprite`.
- **Fullscreen:** a button calling `requestFullscreen()` on the canvas container;
  the `resize` handler drives `flatland.resize()` + `renderer.setSize()`.
- HMR dispose block, matching every example.

### `templates/react/` — `src/App.tsx` + `src/main.tsx`, ~60 lines

- `<Canvas>` from `@react-three/fiber/webgpu`, `extend({ Sprite2D, Flatland })`
- `<flatland viewSize={400}>` wrapping the sprite
- **Loading state:** `<Suspense fallback={<Loading />}>` placed *outside* `<Canvas>`,
  so `useLoader(TextureLoader, …)` suspending inside the canvas renders a DOM
  overlay. This pattern is hard to discover independently and is worth showing.
- **Interactivity:** `onPointerOver/Out/Down/Up`, free from R3F raycasting
- **Fullscreen:** same button; R3F handles resize

### Scene

One interactive sprite: hover/press scale + tint lerp, slow rotation. Matches
Vite templates' restraint — small enough to read top to bottom, and every line
teaches something, so users delete less before starting their own work.

### Required peer that is easy to miss

`three-flatland` declares a **`koota` peer dependency** (an ECS). It is not
obvious from the API surface and a missing peer produces a confusing failure.
Both templates must declare it.

### Excluded from both

Devtools, Tweakpane, `GemBackground`/`gem.ts`, MFE `base` path, atlas, presets,
alphamap.

### Known asymmetry

The three.js template hand-writes its loading overlay and its raycasting; React
gets both nearly free. This is real and is shown rather than papered over. It
makes the vanilla template roughly 15% longer.

## Agent guidance

The starter kit ships agent guidance so an agent dropped into a fresh project is
immediately effective. This section also governs the repo's own agent guides —
the routing map below is the same content in both places.

### File shape

Each template ships:

- **`AGENTS.md`** — all the content. Read natively by Codex.
- **`CLAUDE.md`** — a single line, `@AGENTS.md`. Claude Code resolves the import.

One source of truth, no drift, both agents served.

### What `AGENTS.md` must contain

1. **Build and dev commands** for that template.
2. **The opinionated default:** a `Flatland` root. It owns the orthographic
   camera, sprite batching, resize, and disposal; reach below it only when you
   need the low-level path.
3. **Reference links**, including the exact llms.txt URL:
   `https://tjw.dev/three-flatland/llms.txt` (also `llms-full.txt`,
   `llms-small.txt`). Note explicitly that these are **not** served at the origin
   root — `https://tjw.dev/llms.txt` 404s, and origin root is what agents
   habitually probe.
4. The **renderer rule** below — this is the single most important thing in the
   file and belongs near the top.
5. The **package routing map**, **bake decision rule**, and **asset-authoring
   workflow** below.

### The renderer rule (agents get this wrong constantly)

**Always construct `WebGPURenderer` and always write TSL. Never `WebGLRenderer`,
never GLSL, never `onBeforeCompile`.**

`WebGPURenderer` is the three.js renderer class imported from `three/webgpu`
(R3F: `@react-three/fiber/webgpu`). **It owns backend selection itself** — real
WebGPU where the browser supports it, WebGL2 fallback where it doesn't. TSL
compiles to both.

So "three-flatland requires `WebGPURenderer`" is a statement about *which class
you construct*. It is **not** a hardware or browser requirement, and it does not
mean WebGPU-only. Everything works in either backend. Route through
`WebGPURenderer` + TSL and you get the right thing on both.

The failure mode to guard against: an agent reads "requires WebGPURenderer,"
infers "WebGPU-only," and either adds a `WebGLRenderer` fallback path (wrong —
that's a different, unsupported renderer) or gates features on WebGPU detection
(also wrong). The agent guidance must state the rule affirmatively rather than
listing what is unsupported, because the negative framing is what produces the
bad inference.

WebGL 1 is not a target and should be ignored entirely.

### Package routing map

Only publishable packages may be recommended to users. Verified against each
`package.json`'s `private` field:

| Package | Reach for it when |
| --- | --- |
| `three-flatland` | Default entry. Sprites, animation, tilemaps, materials, lights, events, everyday loaders. |
| `@three-flatland/nodes` | You want a specific 2D shader effect (retro/CRT, blur, distortion, color, upscale) without writing TSL by hand. |
| `@three-flatland/presets` | You want lit sprites working immediately. Thin — two symbols (`DefaultLightEffect`, `NormalMapProvider`). |
| `@three-flatland/normals` | Dynamic lighting on flat 2D art without hand-authoring normal maps. |
| `@three-flatland/atlas` | Loose sprite PNGs that should become one draw-call-friendly atlas, optionally polygon-trimmed for overdraw. |
| `@three-flatland/alphamap` | Pixel-perfect pointer hit testing on transparent sprites (`hitTestMode: "alpha"`) instead of bounding-box hits. |
| `@three-flatland/bake` | Authoring a new baker, or you just need the `flatland-bake` binary. |
| `@three-flatland/devtools` | Live inspection of scene/material/sprite state. Seven required peers — heaviest install in the ecosystem. |
| `@three-flatland/skia` | A general immediate-mode 2D canvas in the scene: arbitrary paths, boolean ops, filters, gradients, images. |
| `@three-flatland/slug` | Text that must stay sharp at any zoom or perspective, or thousands of glyphs in one draw call. |

**Never recommend installing these — they are `private: true` and unpublished:**
`@three-flatland/image` (so KTX2 is not reachable by consumers today),
`@three-flatland/schemas`, `@three-flatland/io`.

Version numbers are not maturity signals: `@three-flatland/presets` sits at
`0.1.0-alpha.7` because of a changesets `linked` group, and `@three-flatland/schemas`
at `1.0.0` despite never being released.

### Skia vs Slug

They are not alternatives with an overlap to pick between — they solve different
problems and touch at exactly one point.

- **Skia** is an immediate-mode 2D canvas rasterized into a texture. Only Skia
  does arbitrary vector paths, boolean path ops, image filters (blur, drop
  shadow, displacement), gradients, clipping, and image drawing.
- **Slug** is a text primitive. Glyph outlines are solved per-fragment, so there
  is no resolution ceiling; thousands of glyphs batch into one instanced draw
  call, with real layout (`measureText`, `wrapText`, style spans, font fallback
  chains).

Both follow the renderer rule above — `WebGPURenderer`, either backend. Neither
is WebGPU-only.

Skia's WASM ships as two builds (`skia-gl.wasm`, `skia-wgpu.wasm`) matching the
backend the renderer resolved to. **This is an internal detail on a different
axis from the renderer rule** and must not be presented to agents as a renderer
choice — the copy step (`npx skia-wasm public/skia`, or `--gl-only` / `--wgpu-only`
to ship just one) is the only place it surfaces.

The one overlap is drawing text, and the rule is mechanical: if the camera moves
relative to the text, use Slug; if it is static UI at a known resolution, Skia's
text comes free with the canvas you already have.

Skia gotcha worth stating in the guidance: WASM assets are zero-config in Vite
dev, but any other production build needs `npx skia-wasm public/skia` plus a
`wasmUrl`.

### Baking

Baking moves a *derived* asset computation from browser-runtime to build-time. It
is never about capability — if you ask for the data you always get it. Baking
chooses only **where the cost lands**.

Bakers self-register via a `flatland.bake` field and are run through the
`flatland-bake` dispatcher: `alpha` (`@three-flatland/alphamap`), `normal`
(`@three-flatland/normals`), `encode` (`@three-flatland/image`, private), and
`slug` (`@three-flatland/slug`, once registered — see defect 1 below). Packages
may also expose a direct bin: `slug-bake`, `flatland-atlas`. `flatland-atlas` is
standalone-only. `skia-wasm` is **not** a baker — it is an asset-copy step, and
agent guidance should say so, because the name reads like one.

Bake when shipping to production, always for fonts with a known glyph set (ASCII
+ Brotli is 32 KB vs 724 KB, and it drops opentype.js from the bundle), and for
textures under GPU memory pressure. Don't bake procedurally-varied content or
throwaway prototypes. `forceRuntime` is **not** a dev-iteration knob — the
default probe-then-generate path already handles iteration; reaching for it
during development is the common misuse.

### Asset authoring workflow

Stated to match what actually exists:

- **Tilemaps:** author in **LDtk** or **Tiled**, load with `LDtkLoader` /
  `TiledLoader`. There is **no LDtk or tilemap tooling in the VSCode extension** —
  agents must not be pointed at one.
- **Sprites and animation:** author in **Aseprite**, round-trip through the
  VSCode atlas editor. Aseprite is supported losslessly as an atlas
  serialization format (`AtlasFormat = 'native' | 'texturepacker' | 'aseprite'`),
  including frame tags.
- **VSCode extension surface:** atlas, merge, encode, normal-baker, zzfx audio.
  That is the whole list.

### Skills

Distributed as a **devDependency on `@three-flatland/skills`**, not copied into
scaffolded projects. Copied skills fork on day one and have no upgrade path; a
versioned dependency is `sync-pack`'d like everything else and moves with a bump.
`AGENTS.md` documents wiring them up via `npx skills add`.

Skills to ship for the starter kit:

1. **`flatland-r3f`** — promote from `.claude/skills/` into `skills/`. It is
   already 302 lines of genuine consumer documentation against the published API
   (`extend()` registration, declarative JSX, Flatland routing, post-processing,
   anti-patterns). Work needed: add YAML frontmatter (it has none, so it fails
   the package's own `agentskills validate`) and strip its one repo-internal leak
   (a `// packages/react/src/types.ts` comment at line 291).
2. **`flatland-bake`** — new. The deepest undocumented surface: every CLI's flag
   set currently exists only in source. Covers the bake decision rule, all
   subcommands and bins, and the baked → runtime fallback contract.

Skia/Slug routing and the tilemap workflow stay as `AGENTS.md` prose rather than
separate skills — both areas are still moving (slug shape rendering is in flight,
skia is alpha), and prose is cheaper to keep honest than a skill.

### Folded-in defect fixes

Three of these are instructions that would actively mislead an agent, which is
precisely what this work exists to prevent:

1. **Slug is bakeable but not discoverable.** `slug-bake` works and is in active
   use; what's missing is registration. `flatland-bake` self-discovery keys off a
   `flatland.bake` field, declared by exactly three packages — `alphamap`
   (`alpha`), `normals` (`normal`), and `image` (`encode`, private). `packages/slug/package.json`
   has only the bin, so `flatland-bake --list` never shows slug. Meanwhile
   `packages/bake/src/cli.ts:23` and `:66` name `@three-flatland/slug` as *the
   example* of a package contributing a baker — pointing at the one publishable
   baker that doesn't register. **Fix: register slug with `flatland.bake`** so
   discovery finds it and the help text becomes true; keep the `slug-bake` bin for
   direct use. Also investigate why `pnpm exec slug-bake` silently no-ops in this
   workspace (requiring a direct `packages/slug/dist/cli.js` call) — likely the
   same bin-resolution cruft.
2. **`planning/bake/loader-pattern.md`** documents a dead format (`.slug.json` +
   `.slug.bin`); the code emits a single `.slug.glb` (`packages/slug/src/baked.ts:115`).
3. **`packages/skia/bin/copy-wasm.mjs`** usage comment documents a `copy-wasm`
   subcommand the script does not parse — it would be consumed as the target
   directory, writing WASM into `./copy-wasm/`. The README is correct.
4. **`skills/README.md`** lists only `tsl` under "Included skills" while
   `codemod` also ships via `files: ["*/"]`.

### Corrected during design

`@three-flatland/image` was flagged as a hard dependency of `three-flatland`,
which would have broken `npm install` for every consumer. Verified false:
`three-flatland`'s dependencies are only `@three-flatland/bake` and
`@three-flatland/normals`, and nothing under `packages/*/src` imports it. The
architecture doc describes it as Layer-0; the code never wired it. Doc drift, not
a release blocker — but `@three-flatland/image` being private does mean KTX2 is
genuinely unreachable by consumers today.

## Validation

Two layers, because neither is sufficient alone:

1. **Always** — workspace membership typechecks and lints the templates against
   library *source*, so an API break fails CI the same day it lands.
2. **Release gate** — a scaffold smoke test: run the built CLI into a temp
   directory, install from the registry, `vite build`. This is the only layer that
   can catch a workspace-only field leaking into the published template, which
   layer 1 structurally cannot see.

## Rejected alternatives

**degit / GitHub tarball fetch.** Requires network at scaffold time, and fetched
`main` templates drift from whatever library version the user installs — actively
harmful at `0.1.0-alpha`. It also still needs every file rewrite, so it buys
nothing structurally.

**Ship raw examples and transform at runtime.** Same output as baking, but the
transforms become untested runtime code paths and the generated project is never
visible in a PR diff.

**Transform examples into templates at build time.** This was the original
recommendation and was correct while the plan was "many templates derived from
examples." Once the direction narrowed to two hand-authored minimal starters, the
transform pipeline had nothing left to transform.

**Unify `examples/*/template` with the user-facing starter.** See above — opposing
requirements.

## Open items for the implementation plan

- Exact `create-vite` upstream PR shape and timing (can ship our CLI first,
  upstream after)
- Whether the scaffold smoke test runs per-PR or only on release
- Asset choice for the starter sprite (currently `icon.svg` in examples)
- Sequencing against the `1879b5ff` hooks merge (see "Version freshness")
- Whether the repo's own root `CLAUDE.md` adopts the same routing map, and
  whether it should also become an `AGENTS.md` + `@AGENTS.md` pair for parity
  with what the templates ship
- Whether `@three-flatland/image` should be published, which would make KTX2
  reachable by consumers and complete the Tier-1 texture dispatch story
