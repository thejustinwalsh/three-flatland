# starlight-theme

Internal Starlight theme for the three-flatland docs. Workspace-private (never published to npm).

## Attribution

This package is **forked from [`lucode-starlight`](https://github.com/lucas-labs/lucode-starlight-theme)** by lucas-labs (MIT, master branch as of 2026-05-06). Lucode itself credits [`adrian-ub/starlight-theme-black`](https://github.com/adrian-ub/starlight-theme-black) and recreates the design language of [`shadcn/ui`](https://ui.shadcn.com/) docs (April 2026).

The fork retains lucode's plugin scaffolding (Starlight component overrides, expressive-code config, vite config, schema extension) and rethemes the token layer to the bearded-theme-inspired gem palette (gold / ruby / emerald / diamond / amethyst / pink / salmon / turquoize on near-black) and the three-flatland typography stack. See `planning/issues/32/` in the repo for the design rationale and the `CLAUDE.md > Design Context` section for the current aesthetic direction.

## Why a fork instead of `npm install lucode-starlight`?

- Lucode is at `0.1.x`; breaking changes are likely. The infrastructure here is stable on purpose.
- The three-flatland aesthetic (technicolor gem palette on near-black, Crafted/Expressive/Performant per `CLAUDE.md > Design Context`) diverges from lucode's shadcn-derivative starting point. Component overrides will progressively drift.
- Ownership of the design system matters more than upstream-update-for-free.

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
    theme.css             Tokens + light/dark variants (gem palette + soft variants)
  schema.ts               ExtendDocsSchema for splash-page frontmatter
  user-components.ts      Re-exports for content authors
  index.ts                Plugin entry (default export)
```

## Usage

```js
// docs/astro.config.mjs
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import starlightTheme from 'starlight-theme'

export default defineConfig({
  integrations: [
    starlight({
      plugins: [
        // … other Starlight plugins
        starlightTheme(), // last so its overrides win
      ],
    }),
  ],
})
```

## License

MIT — see [LICENSE](./LICENSE). Includes attribution to all upstream sources.
