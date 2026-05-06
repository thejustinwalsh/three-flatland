# starlight-theme

Internal Starlight theme for the three-flatland docs. Workspace-private (never published to npm).

## Attribution

This package is **forked from [`lucode-starlight`](https://github.com/lucas-labs/lucode-starlight-theme)** by lucas-labs (MIT, master branch as of 2026-05-06). Lucode itself credits [`adrian-ub/starlight-theme-black`](https://github.com/adrian-ub/starlight-theme-black) and recreates the design language of [`shadcn/ui`](https://ui.shadcn.com/) docs (April 2026).

The fork retains lucode's plugin scaffolding — Starlight component overrides, expressive-code config, vite config, schema extension — and rethemes the token layer to base16 Materia + the three-flatland typography stack. See `planning/issues/32/` in the repo for the design rationale.

## Why a fork instead of `npm install lucode-starlight`?

- Lucode is at `0.1.x`; breaking changes are likely. We want stable infrastructure.
- The three-flatland aesthetic (Linear/Radix-leaning minimalism, Crafted/Expressive/Performant per `CLAUDE.md > Design Context`) diverges from lucode's shadcn-derivative starting point. Component overrides will progressively drift.
- This is *our* design system; ownership matters more than upstream-update-for-free.

## Structure

```
packages/starlight-theme/
  core/                   plugin entry, expressive-code config, vite config
  components/
    overrides/            Starlight component overrides (Header, Sidebar, …)
    custom/               Theme-system primitives (LinkButton, ContainerSection, dropdown)
  styles/
    base.css              Element-level resets
    layers.css            Cascade-layer setup
    theme.css             Tokens + light/dark variants (base16 Materia)
  schema.ts               ExtendDocsSchema for splash-page frontmatter
  user-components.ts      Re-exports for content authors
  index.ts                Plugin entry (default export)
```

## Usage

```js
// docs/astro.config.mjs
import starlightTheme from 'starlight-theme'

Icons({
  starlight: {
    plugins: [
      // … other Starlight plugins
      starlightTheme(), // last so its overrides win
    ],
  },
})
```

## License

MIT — see [LICENSE](./LICENSE). Includes attribution to all upstream sources.
