---
name: stylex
description: Use when authoring styles with @stylexjs/stylex — creating styles via stylex.create, applying with stylex.props, defining tokens with defineVars/defineConsts, building themes with createTheme, or migrating inline-styled / CSS / styled-components / Tailwind code to StyleX. Covers the Do/Don't rules and links to the full authoring + installation references.
---

# StyleX

Atomic CSS-in-JS compiler. The build plugin extracts `stylex.create({...})` objects into atomic CSS classes; the runtime is just `stylex.create()` + `stylex.props()`. No emotion-style runtime style injection in production.

## When to use

- Writing or editing components in a project that already has `@stylexjs/stylex` installed.
- Migrating inline `style={{...}}`, CSS modules, Tailwind, or styled-components to StyleX.
- Defining design tokens or theming a component subtree.
- Wiring StyleX into a new bundler (Vite/Next/Webpack/esbuild/Rspack/Rollup) — see [installation.md](./installation.md).

## When not to use

- Project uses a different CSS strategy and the user hasn't asked to migrate.
- Authoring third-party CSS that consumers will override (StyleX classes are atomic + harder to override from outside).
- Native (React Native) work — StyleX targets the web.

## Core rules — DO

- **Use `stylex.create()`** for every style block. Always destructure into namespaces (`base`, `active`, ...).
- **Use longhand properties** and single-value shorthands. Prefer `paddingInline: 16` over `padding: '0 16px 0 16px'`.
- **Lengths default to pixels** when a number is given (`padding: 16` → `16px`).
- **Apply with `{...stylex.props(...)}`** — spread the result onto the element. Multiple args merge left-to-right; later wins.
- **Conditionals are JS expressions:** `stylex.props(styles.base, isActive && styles.active, variant === 'primary' ? styles.primary : styles.secondary)`.
- **Local styles first, then prop styles:** `stylex.props(styles.card, style)` so callers can override.
- **Nest pseudo-classes / media queries / `@supports` / `@container` inside the property value** with a required `default` key:
  ```ts
  backgroundColor: { default: 'blue', ':hover': 'navy', '@media (min-width: 768px)': 'royalblue' }
  ```
- **Pseudo-elements (`::placeholder`, `::selection`) are top-level keys** inside a namespace, not nested in property values.
- **Use `null` to unset** a property: `{ margin: null, padding: null }`.
- **Token files MUST be `*.stylex.ts` / `*.stylex.js`**, named exports only, nothing else exported from the file.
- **`defineConsts`** for non-themable static values (breakpoints, z-indices, durations).
- **`defineVars`** for themable tokens (colors, spacing, font sizes that vary by theme).
- **Override tokens with `stylex.createTheme(vars, {...})`** and apply via `stylex.props(theme)` on a wrapper element.
- **Type style props with `StyleXStyles` / `StyleXStylesWithout`** (not the deprecated `StaticStyles*`).
- **Dynamic styles** use arrow-function namespaces: `bar: (w: number) => ({ width: w })`, then `stylex.props(styles.bar(100))`.
- **Animations:** `stylex.keyframes({...})` returns a name to put in `animationName`.

## Core rules — DON'T

- **Don't put `style` or `className` on the same element as `stylex.props(...)`.** They will not merge cleanly.
  ```tsx
  // BAD
  <div className="m-10" style={style} {...stylex.props(styles.x)} />
  // GOOD
  <div {...stylex.props(styles.x, conditional && styles.y)} />
  ```
- **Don't put media queries or pseudo-classes at the top level** of a namespace. They go inside the *property value*.
  ```ts
  // BAD
  container: { '@media (min-width: 768px)': { padding: 16 } }
  // GOOD
  container: { padding: { default: 8, '@media (min-width: 768px)': 16 } }
  ```
- **Don't import non-StyleX values into style objects.** Plain JS constants get inlined per call site instead of becoming atomic.
  ```ts
  // BAD: import { PADDING } from './constants'  → padding: PADDING
  // GOOD: import { spacing } from './tokens.stylex'  → padding: spacing.md
  ```
- **Don't put non-token exports in `*.stylex.ts` files** — only `defineVars` / `defineConsts` exports allowed.
- **Don't use `:first-child` / `:nth-child`** — use a JS condition that branches on index. Reduces atomic CSS bloat.
- **Don't use `::before` / `::after` for content** — use a real element. Better a11y, smaller CSS.
- **Don't mutate or extend a returned style namespace at runtime** — pass extras through `stylex.props(base, extra)` instead.
- **Don't omit the `default` key** when a property uses nested conditions. Use `null` if there should be no default.

## Quick reference

| Need | API |
|---|---|
| Define styles | `const s = stylex.create({ base: {...}, active: {...} })` |
| Apply to element | `<div {...stylex.props(s.base, cond && s.active)} />` |
| Merge with caller styles | `stylex.props(s.local, props.style)` |
| Unset a property | `{ margin: null }` |
| Pseudo-class | nest inside value: `color: { default: 'x', ':hover': 'y' }` |
| Pseudo-element | top-level key: `'::placeholder': { color: 'gray' }` |
| Media query | nest inside value: `padding: { default: 8, '@media (min-width: 768px)': 16 }` |
| Constant tokens (non-themable) | `stylex.defineConsts({ ... })` in `*.stylex.ts` |
| Themable tokens | `stylex.defineVars({ ... })` in `*.stylex.ts` |
| Theme override | `export const dark = stylex.createTheme(tokens, { ... })`, apply on wrapper |
| Dynamic / runtime styles | `bar: (w: number) => ({ width: w })`, then `stylex.props(s.bar(100))` |
| Keyframes | `const k = stylex.keyframes({ from:{...}, to:{...} })` → `animationName: k` |
| Browser fallback | `position: stylex.firstThatWorks('sticky', '-webkit-sticky', 'fixed')` |
| Style props from parent | `style?: StyleXStyles` (or constrained: `StyleXStyles<{ color?: string }>`) |
| Exclude properties from prop | `style?: StyleXStylesWithout<{ margin: unknown }>` |

## Minimal example

```tsx
import * as stylex from '@stylexjs/stylex'
import type { StyleXStyles } from '@stylexjs/stylex'
import { colors, spacing } from './tokens.stylex'

const s = stylex.create({
  base: {
    display: 'flex',
    alignItems: 'center',
    paddingInline: spacing.md,
    paddingBlock: spacing.sm,
    color: colors.text,
    backgroundColor: { default: colors.bg, ':hover': colors.bgHover },
    cursor: { default: 'pointer', ':disabled': 'not-allowed' },
  },
  active: { backgroundColor: colors.accent },
})

type Props = { active?: boolean; style?: StyleXStyles }

export function Chip({ active, style }: Props) {
  return <div {...stylex.props(s.base, active && s.active, style)} />
}
```

```ts
// tokens.stylex.ts — named exports only, no other exports allowed
import * as stylex from '@stylexjs/stylex'

export const colors = stylex.defineVars({
  text: 'black',
  bg: 'white',
  bgHover: '#f3f3f3',
  accent: '#0a84ff',
})

export const spacing = stylex.defineVars({
  sm: '8px',
  md: '16px',
  lg: '24px',
})
```

## Theming a subtree

```ts
// theme.ts (regular .ts file — createTheme can live anywhere)
import * as stylex from '@stylexjs/stylex'
import { colors } from './tokens.stylex'

export const dark = stylex.createTheme(colors, {
  text: 'white',
  bg: '#1a1a1a',
  bgHover: '#2a2a2a',
  accent: '#7cc4ff',
})
```

```tsx
<div {...stylex.props(isDark && dark)}>
  {/* every descendant resolves colors.* to the dark values */}
</div>
```

## Mapping host-defined CSS variables (e.g. VSCode `--vscode-*`)

When the host injects CSS custom properties you don't control (VSCode webviews, design-system shells, host-provided themes), bridge them through a `defineVars` group so component code stays decoupled from the host:

```ts
// vscode-theme.stylex.ts
import * as stylex from '@stylexjs/stylex'

export const vscode = stylex.defineVars({
  fg:        'var(--vscode-foreground)',
  bg:        'var(--vscode-editor-background)',
  border:    'var(--vscode-panel-border)',
  focusRing: 'var(--vscode-focusBorder)',
})
```

Components reference `vscode.fg`, never `var(--vscode-foreground)` directly. Theme switches (light / dark / high-contrast) come from the host updating its own CSS vars; no `createTheme` swap needed.

## Red flags (stop and fix)

- You see `style={{...}}` or `className="..."` next to `{...stylex.props(...)}` → remove the inline/className, fold into `stylex.create`.
- A property's value is an object whose keys start with `'@media'` or `':'` but there's no `default` key → add `default` (or `null`).
- A `*.stylex.ts` file exports a function, component, type, or const that isn't from `defineVars`/`defineConsts` → move it elsewhere.
- A style references `var(--something)` directly inside `stylex.create` → wrap it in a `defineVars` token first.
- `stylex.create({ ':hover': {...} })` at the top level → move to `prop: { default, ':hover' }`.
- Importing a plain JS constant for use inside `stylex.create` → convert to `defineConsts` / `defineVars` in a `.stylex.ts` file.

## Reference files

- [installation.md](./installation.md) — bundler-specific setup (Vite, Next, Webpack, esbuild, Rspack, Rollup), Babel/PostCSS plugin options, ESLint plugin rules, CLI, troubleshooting (`useCSSLayers`, missing styles, build perf).
- [authoring.md](./authoring.md) — full authoring detail: relational selectors (`stylex.when.*` + markers), view transitions (`viewTransitionClass`), anchor positioning (`positionTry`), `firstThatWorks`, `VarGroup` types, every code example from the upstream guide.

## More resources

- Official docs: https://stylexjs.com
- API reference: https://stylexjs.com/docs/api
- Examples: https://github.com/facebook/stylex/tree/main/examples
