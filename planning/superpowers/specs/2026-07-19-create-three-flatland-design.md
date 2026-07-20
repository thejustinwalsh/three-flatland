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

The existing lefthook rule at `lefthook.yml:12` fires on any
`{pnpm-workspace.yaml,packages/*/package.json}` change — which includes the
version bumps `changeset version` writes. A release bump therefore propagates
into the templates at commit time, automatically.

Wiring is a three-line diff:

1. `lefthook.yml:14` — add the templates dir to the `sync:pack` args and the `git add`
2. `lefthook.yml:17` — add the templates path to the `sync-pack-files` glob
3. `.github/workflows/build.yml:58` — add it to `sync:pack:verify`

Step 3 is not optional: lefthook only runs on local commits, so a CI release job
that bumps versions without hooks could otherwise publish a stale template. The
`sync:pack:verify` gate turns that into a red build.

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

### Excluded from both

Devtools, Tweakpane, `GemBackground`/`gem.ts`, MFE `base` path, atlas, presets,
alphamap.

### Known asymmetry

The three.js template hand-writes its loading overlay and its raycasting; React
gets both nearly free. This is real and is shown rather than papered over. It
makes the vanilla template roughly 15% longer.

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
