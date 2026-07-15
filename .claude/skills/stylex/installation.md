# StyleX — Installation Reference

Build-tool setup, plugin options, ESLint, CLI, and troubleshooting. Distilled from the upstream installation guide.

## Packages

```bash
# Runtime — always
npm install @stylexjs/stylex

# Vite / Rollup / Webpack / esbuild / Rspack
npm install --save-dev @stylexjs/unplugin

# Next.js
npm install --save-dev @stylexjs/babel-plugin @stylexjs/postcss-plugin
```

## Bundler setup

### Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import stylex from '@stylexjs/unplugin'

export default defineConfig({
  plugins: [
    stylex.vite({ useCSSLayers: true }),
    react(),
  ],
})
```

**StyleX plugin must come before `@vitejs/plugin-react`** to keep Fast Refresh working.

### Webpack

```js
const stylex = require('@stylexjs/unplugin')
module.exports = { plugins: [stylex.webpack({ useCSSLayers: true })] }
```

### Rspack

```js
const stylex = require('@stylexjs/unplugin')
module.exports = { plugins: [stylex.rspack({ useCSSLayers: true })] }
```

### esbuild

```js
const esbuild = require('esbuild')
const stylex = require('@stylexjs/unplugin')

esbuild.build({
  entryPoints: ['src/index.tsx'],
  bundle: true,
  outdir: 'dist',
  plugins: [stylex.esbuild({ useCSSLayers: true })],
})
```

### Rollup

```js
import stylex from '@stylexjs/unplugin'
export default { plugins: [stylex.rollup({ useCSSLayers: true })] }
```

### Next.js (Babel + PostCSS)

```js
// babel.config.js
const path = require('path')
const dev = process.env.NODE_ENV !== 'production'

module.exports = {
  presets: ['next/babel'],
  plugins: [
    ['@stylexjs/babel-plugin', {
      dev,
      runtimeInjection: false,
      enableInlinedConditionalMerge: true,
      treeshakeCompensation: true,
      aliases: { '@/*': [path.join(__dirname, '*')] },
      unstable_moduleResolution: { type: 'commonJS' },
    }],
  ],
}
```

```js
// postcss.config.js
const babelConfig = require('./babel.config')

module.exports = {
  plugins: {
    '@stylexjs/postcss-plugin': {
      include: [
        'src/**/*.{js,jsx,ts,tsx}',
        'app/**/*.{js,jsx,ts,tsx}',
        'pages/**/*.{js,jsx,ts,tsx}',
        'components/**/*.{js,jsx,ts,tsx}',
      ],
      babelConfig: {
        babelrc: false,
        parserOpts: { plugins: ['typescript', 'jsx'] },
        plugins: babelConfig.plugins,
      },
      useCSSLayers: true,
    },
    autoprefixer: {},
  },
}
```

## CSS entrypoint

Add `@stylex;` to a CSS file imported from your app entry. The plugin appends extracted atomic CSS to that file at build time.

```css
/* src/index.css */
@stylex;
```

```ts
// src/main.tsx
import './index.css'
```

## Plugin options

### Babel plugin (`@stylexjs/babel-plugin`)

| Option | Type | Default | Description |
|---|---|---|---|
| `dev` | boolean | false | Readable class names in dev |
| `runtimeInjection` | boolean | false | Inject styles at runtime (avoid in prod) |
| `treeshakeCompensation` | boolean | false | Stop tree-shaking from removing styles |
| `aliases` | object | `{}` | Path aliases mirroring bundler config |
| `unstable_moduleResolution` | object | – | Module resolution for theming APIs |
| `classNamePrefix` | string | `'x'` | Atomic class prefix |
| `importSources` | string[] | `['@stylexjs/stylex']` | Custom import sources |
| `styleResolution` | string | `'property-specificity'` | `'application-order'` (last wins) or `'property-specificity'` (more specific wins) |

### Unplugin options (Vite / Webpack / Rspack / esbuild / Rollup)

| Option | Type | Default | Description |
|---|---|---|---|
| `useCSSLayers` | boolean | false | Wrap output in `@layer` for cascade control |

`@stylexjs/unplugin` does **not** accept `include` / `exclude` options. File selection is automatic: it transforms any `.js/.jsx/.ts/.tsx` file the host bundler hands it that imports from `@stylexjs/stylex`. Adding `include` to the options object silently breaks TypeScript (`error TS2353: 'include' does not exist`) because it's not in `UserOptions`.

### PostCSS plugin options (`@stylexjs/postcss-plugin`)

| Option | Type | Default | Description |
|---|---|---|---|
| `useCSSLayers` | boolean | false | Wrap output in `@layer` for cascade control |
| `include` | string[] | `['**/*.{js,jsx,ts,tsx}']` | Files to process |
| `exclude` | string[] | `['node_modules/**']` | Files to skip |
| `babelConfig` | object | – | Babel config used when parsing source files |

`include` / `exclude` only apply to the PostCSS plugin (Next.js setup). The unplugin path does not need them.

## TypeScript

Types ship with the packages — no extra setup. Use `StyleXStyles` / `StyleXStylesWithout` for typed style props (see SKILL.md).

## ESLint

```bash
npm install --save-dev @stylexjs/eslint-plugin
```

```js
// eslint.config.js (flat)
import stylexPlugin from '@stylexjs/eslint-plugin'

export default [{
  plugins: { '@stylexjs': stylexPlugin },
  rules: {
    '@stylexjs/valid-styles':      'error',
    '@stylexjs/no-unused':         'error',
    '@stylexjs/valid-shorthands':  'warn',
    '@stylexjs/sort-keys':         'warn',
    // optional: '@stylexjs/enforce-extension': 'error', // requires *.stylex.{js,ts}
  },
}]
```

Available rules:

- `valid-styles` — validates style definitions
- `no-unused` — flags unused style namespaces
- `valid-shorthands` — warns on multi-value shorthands
- `sort-keys` — enforces sorted keys
- `enforce-extension` — requires `.stylex.{js,ts}` for token files

## CLI (no bundler)

```bash
npm install --save-dev @stylexjs/cli
npx stylex --input ./src --output ./dist
```

## Troubleshooting

**Styles missing.** (1) CSS file with `@stylex;` is imported. (2) Source files match `include`. (3) StyleX plugin runs before other transforms (esp. before `@vitejs/plugin-react`).

**Cascade / overriding existing CSS.** `useCSSLayers: false` to let StyleX win over existing CSS without `@layer`. Otherwise leave `true`.

**Build perf.** Tighten `include`/`exclude`. Set `treeshakeCompensation: true` if styles vanish in prod.
