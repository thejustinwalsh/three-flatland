# Driller code-quality audit

Status: complete for the Driller visual/gameplay refresh branch

## Scope

This audit covers `minis/driller`, the workspace configuration required to build and test it, and the small `three-flatland` lighting API changes consumed by the mini. It does not broaden the refresh into a repository-wide strictness migration.

## React lifecycle

- React Compiler remains enabled through `babel-plugin-react-compiler` in the app and library Vite configurations.
- `eslint-plugin-react-you-might-not-need-an-effect` runs its strict rules over Driller source.
- Mount effects that only repeated initial sprite scale values were removed.
- Pointer handlers use `useEffectEvent` to read current canvas metrics without resubscribing DOM listeners.
- World mode and seed are installed during world construction instead of synchronized by an effect after mount.
- The mini has no asynchronous data-fetching or promise-driven render flow, so there is no current Suspense or `use()` migration target.

References:

- [React Compiler](https://react.dev/learn/react-compiler)
- [React `useEffectEvent`](https://react.dev/reference/react/useEffectEvent)
- [`eslint-plugin-react-you-might-not-need-an-effect`](https://github.com/NickvanDyke/eslint-plugin-react-you-might-not-need-an-effect)

## TypeScript and structure

- Removed unsafe entity-ID, renderer, query, frame-map, and sign assertions from Driller source.
- Koota enum defaults now use typed initializer functions, preserving their unions without assertions.
- ZzFX parameter literals use `satisfies`, preserving tuple checking without widening or casting.
- Shared atlas rectangle conversion replaces repeated UV calculations across overlay renderers.
- Gem and world-tile frame maps are constructed as explicit typed records rather than asserted `Object.fromEntries` results.
- Historical phase labels were removed from runtime comments; remaining comments explain invariants, timing, performance, or compatibility behavior.
- The obsolete no-op hero fall system and redundant compatibility expressions were removed.

An audit run with `exactOptionalPropertyTypes` and `noImplicitOverride` reports no Driller-local errors. It still reports errors from source-conditioned workspace packages, so those flags are not enabled globally by this change.

## Core API follow-ups

These findings belong in core because solving them inside Driller would duplicate policy or reintroduce casts:

1. Source packages are not yet clean under `exactOptionalPropertyTypes`; optional assignments need a coordinated package migration.
2. Several core class hierarchies need explicit `override` modifiers before `noImplicitOverride` can be enabled repository-wide.
3. React Three Fiber's WebGPU root state exposes a loosely typed renderer. A core `renderFlatland` adapter or renderer type guard would give minis a stable, cast-free boundary.
4. TSL `Fn()` currently leaks unsafe node types into consumer callbacks. A typed core helper would remove the two narrow ESLint suppressions in Driller's compositor and biome-gradient material.

## Verification

- Driller TypeScript check: pass
- Driller ESLint, including strict effect rules: pass
- Driller Prettier check: pass
- Driller unit suite: 35 files, 232 tests pass
- `three-flatland` TypeScript check: pass
- Focused core lighting and shadow tests: 22 tests pass
- `three-flatland` build: pass
- Driller application and library builds: pass
- Controlled Chrome full-mode start: real canvas click removes the attract screen; debug overlay holds 60 FPS with no page errors
- Vitexec WebGPU run: title transition, Flatland handle, Koota world, render instrumentation, and 1280×720 canvas confirmed
- Application bundle: 657.38 kB gzip versus the 657.29 kB audit baseline; the 0.09 kB change is immaterial

Web Audio remains browser-gesture gated by design. Vitexec's synthetic events therefore produce expected autoplay warnings; the controlled Chrome click exercises the trusted interaction path.
