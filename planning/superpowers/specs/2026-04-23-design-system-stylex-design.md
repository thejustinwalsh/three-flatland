---
date: 2026-04-23
branch: feat-vscode-tools
status: approved
authors: tjw
related:
  - planning/vscode-tools/SESSION-STATE.md
  - planning/vscode-tools/design-system.md
  - .claude/skills/stylex/SKILL.md
---

# Design System — StyleX adoption

## Problem

`tools/design-system` ships hand-styled primitives that hardcode `var(--vscode-*)` strings inside `CSSProperties` objects. Atlas's `App.tsx` does the same in ~17 inline `style={{...}}` blocks. There is no central tokens layer, no compile-time style validation, and no consistent override convention. We want every line of UI we author to flow through StyleX, with the VSCode theme as the authoritative source of color and type.

## Goals

- All custom UI authored in this monorepo (design-system primitives, tool-level webview code) goes through StyleX.
- VSCode `--vscode-*` CSS variables remain the single source of truth for color/type. Light / dark / high-contrast theme switching happens through the host updating those vars — no React re-render, no `createTheme` swap.
- VSCode Elements (`@vscode-elements/react-elements`) wrappers stay; we never re-style their internals or duplicate components VSCode already ships.
- Every consumer (every tool's webview) compiles StyleX in **one** pass for atomic-CSS dedupe.
- Going-forward conventions are codified so the next custom component lands cleanly without rediscovery.

## Non-goals

- Migrating Atlas `App.tsx` to StyleX. Tracked separately as a follow-up. The pattern this spec establishes is the input to that ticket.
- Custom-theming the suite (e.g. a "FL dark" palette that diverges from the user's VSCode theme). Not desired, not in scope.
- Touching `@three-flatland/preview`, `@three-flatland/bridge`, `@three-flatland/io`. They have no styled UI today.
- Replacing `@vscode-elements/react-elements`. We extend, never re-implement.

## Architecture

### Compile location — Vite-only

`@stylexjs/unplugin` runs once in each tool's Vite build (currently just `@three-flatland/vscode`). Its `include` glob is computed with absolute paths resolved from the workspace root and covers:

- the webview source: `tools/vscode/webview/**/*.{ts,tsx}`
- every workspace package we author styles in: `tools/design-system/src/**/*.{ts,tsx}` (extend the list as new tool packages start authoring StyleX styles).

The implementation builds these absolute paths via `path.resolve(__dirname, '../<pkg>/src/...')` rather than relative globs, because Vite's `root` is set to `webview/` and relative globs become brittle.

The plugin must be registered **before** `@vitejs/plugin-react` to preserve Fast Refresh (skill rule).

### `design-system` becomes a source-only private package

- Delete `tsup.config.ts`. Drop `tsup` dev dep. Drop `build` / `dev` / `clean` scripts.
- `package.json#exports` resolves to source:
  ```json
  "exports": {
    ".": {
      "source": "./src/index.ts",
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  }
  ```
- `files: ["src"]`. No `dist/`. Keep `typecheck` script. Package stays `"private": true`.
- Consumers (Vite) import source TSX directly; one StyleX compile pass owns all atomic CSS extraction + dedupe across packages.
- Trade-off accepted: `design-system` requires a StyleX-aware bundler. We own all consumers.

### CSS entrypoint

- Add `tools/vscode/webview/styles.css` containing exactly:
  ```css
  @stylex;
  ```
- Each tool's `webview/<tool>/main.tsx` imports it: `import '../styles.css'`. The unplugin appends extracted atomic CSS into that file at build time. No other CSS files in the suite.

### VSCode theme bridge

VSCode owns the truth. `--vscode-*` are set on `<body>` and updated on theme switch. We bridge once via `defineVars` so component code never references raw `var(--vscode-*)`.

```ts
// tools/design-system/src/tokens/vscode-theme.stylex.ts
export const vscode = stylex.defineVars({
  fg:             'var(--vscode-foreground)',
  bg:             'var(--vscode-editor-background)',
  panelBg:        'var(--vscode-editorWidget-background)',
  panelBorder:    'var(--vscode-panel-border, var(--vscode-editorGroup-border, transparent))',
  panelTitleFg:   'var(--vscode-panelTitle-activeForeground, var(--vscode-foreground))',
  focusRing:      'var(--vscode-focusBorder)',
  descriptionFg:  'var(--vscode-descriptionForeground)',
  btnBg:          'var(--vscode-button-background)',
  btnFg:          'var(--vscode-button-foreground)',
  btnHoverBg:     'var(--vscode-button-hoverBackground)',
  btnBorder:      'var(--vscode-button-border, transparent)',
  inputBg:        'var(--vscode-input-background)',
  inputFg:        'var(--vscode-input-foreground)',
  inputBorder:    'var(--vscode-input-border, var(--vscode-editorWidget-border))',
  notifyBg:       'var(--vscode-notifications-background, var(--vscode-editorWidget-background))',
  notifyFg:       'var(--vscode-notifications-foreground, var(--vscode-foreground))',
  notifyBorder:   'var(--vscode-notifications-border, var(--vscode-focusBorder, transparent))',
  fontFamily:     'var(--vscode-font-family)',
  fontSize:       'var(--vscode-font-size)',
  monoFontFamily: 'var(--vscode-editor-font-family)',
})
```

`defineVars` emits its own custom properties whose values are `var(--vscode-*)`. One indirection. When VSCode swaps a theme, the `--vscode-*` cascade updates → already-applied atomic CSS classes resolve to new values on next paint. **Theme switching is automatic.** No `createTheme`, no React state.

### Non-themable token groups (`defineConsts`)

Static values VSCode doesn't expose. Each in its own `*.stylex.ts` file (skill rule: named exports only, no other exports).

```ts
// tokens/space.stylex.ts
export const space = stylex.defineConsts({
  xs: '2px', sm: '4px', md: '6px', lg: '8px', xl: '10px', xxl: '12px', xxxl: '16px',
})

// tokens/radius.stylex.ts
export const radius = stylex.defineConsts({ none: '0', sm: '2px', md: '3px', lg: '4px' })

// tokens/z.stylex.ts
export const z = stylex.defineConsts({ toast: '999', overlay: '500', dropdown: '100' })
```

### Token re-exports

`src/index.ts` adds:

```ts
export { vscode } from './tokens/vscode-theme.stylex'
export { space }  from './tokens/space.stylex'
export { radius } from './tokens/radius.stylex'
export { z }      from './tokens/z.stylex'
```

The legacy `src/tokens.ts` `vscodeTokens` JS object is **deleted**. The `vscodeTokens` named export is removed from the package. Nothing outside `tools/design-system` reads it today (verified: only the four primitives reference VSCode vars, and they reference them as raw strings, not via the JS object).

## Component conventions

### Style-prop API

`style?: StyleXStyles`. We `Omit<HTMLAttributes<...>, 'style' | 'className'>` from inherited types so the prop accepts only StyleX styles, never `CSSProperties`. `stylex.props(...)` returns `{ className, style }` and stomps both — allowing raw inline styles alongside is unsafe (skill red-flag list).

### Four primitive categories

| Category | Pattern | Examples |
|---|---|---|
| **Custom primitive** (we own the markup) | `Omit<HTMLAttributes<...>, 'style' \| 'className'> & { style?: StyleXStyles }`. Author with `stylex.create`, merge caller `style` last. | `Panel`, future custom |
| **VSCode wrapper needing layout** | Same as above but `Omit` from `ComponentProps<typeof VscodeXxx>`. Forward `stylex.props` to the React binding (the host element accepts `className` + `style`; shadow-DOM internals stay VSCode-owned). | `Toolbar` |
| **Thin pass-through** | No `style`/`className` at all. If a consumer needs positioning, they wrap it themselves. | `Button` and the re-exports in `index.ts` (`Badge`, `Divider`, `Icon`, `TextField`, `Tabs`, …) |
| **Locked utility** | No `style` prop, fully owned. | `DevReloadToast` |

### Variant pattern (for any custom primitive that needs more than one shape/tone/size)

**Boolean flag (1-2 states):** inline conditional.
```tsx
stylex.props(s.base, selected && s.selected, disabled && s.disabled, style)
```

**Enum axis (3+ values):** namespace-per-variant + an `as const` lookup map.
```tsx
const sizeMap = { sm: s.sizeSm, md: s.sizeMd } as const
const toneMap = { primary: s.tonePrimary, neutral: s.toneNeutral } as const

type Props = {
  size?: keyof typeof sizeMap
  tone?: keyof typeof toneMap
  selected?: boolean
  style?: StyleXStyles
}
```

**Variant rules:**
1. One variant axis per namespace prefix (`sizeSm/sizeMd`, `tonePrimary/toneNeutral`). Never combine axes into a single key (combinatorial blowup, defeats atomic CSS).
2. Lookup map for enums. Type the prop with `keyof typeof xMap` so adding a variant updates the type automatically.
3. Spread order: base → axis(es) → state → caller `style`. Last wins, caller always wins.
4. Booleans stay inline. Don't build a map for booleans.
5. **Don't extend a VSCode wrapper to add variants.** If `Button` needs a destructive or icon-only variant VSCode doesn't ship, build a *new* custom primitive (`IconButton`) that internally renders `<VscodeButton>` and applies our wrapper styles. VSCode owns its variants; we own ours.

### Authoring rules (codifying skill defaults)

These are blocking review comments if seen in our code:

- Raw `'var(--vscode-*)'` string inside `stylex.create` → use `vscode.*`, extend the bridge if missing.
- `style={{...}}` or `className="..."` next to `{...stylex.props(...)}` → fold into the `stylex.create` block.
- `@media`/pseudo-class as a top-level key → nest inside the property value with a required `default`.
- `*.stylex.ts` file exporting anything other than `defineVars`/`defineConsts` → move it.
- `border: '1px solid X'` → split into `borderWidth` / `borderStyle` / `borderColor`.
- `padding: '4px 10px'` → `paddingInline` / `paddingBlock`.
- Plain JS constant imported into `stylex.create` for a length/color → promote to `defineConsts`/`defineVars`.

## Migration scope (this PR)

In scope:

1. Build wiring: `@stylexjs/unplugin` in Vite, source-only design-system, CSS entrypoint.
2. Token files: `vscode-theme.stylex.ts`, `space.stylex.ts`, `radius.stylex.ts`, `z.stylex.ts`. Re-exports from `src/index.ts`. Delete `src/tokens.ts`.
3. Migrate 4 primitives:
   - `Panel` — full migration (canonical example).
   - `Toolbar` — convert inline padding to `stylex.create`; adopt `style?: StyleXStyles` API.
   - `DevReloadToast` — convert both inline style blocks to `stylex.create`. No public `style` prop.
   - `Button` — leave alone (thin pass-through, no styles to migrate).
4. Verify build clean: `pnpm --filter @three-flatland/vscode build` green; F5 in VSCode renders the Atlas tool with VSCode-themed primitives correctly across light/dark/high-contrast.

Out of scope (follow-up tickets):

- Atlas `App.tsx` migration (~17 inline-style sites + direct `var(--vscode-*)` refs).
- Other tools (none exist yet).
- ESLint plugin (`@stylexjs/eslint-plugin`) wiring — defer until we have enough StyleX surface to benefit.

## Risks

- **Source-only export breaks if a non-StyleX consumer ever appears.** Mitigated by keeping `design-system` `private: true`. If the package ever needs to leave the monorepo, switch to a tsup build with `@stylexjs/unplugin/esbuild`.
- **`@stylexjs/unplugin` `include` paths are workspace-relative.** Requires the Vite config to know about the repo layout. Acceptable — only one Vite config in the suite.
- **Lit web-component bindings + `stylex.props`.** Setting `className`/`style` on a VSCode element wrapper affects the host element, not shadow-DOM internals. Confirmed acceptable for layout/spacing use cases (Toolbar). If we ever need to style a wrapper's *internals*, that's a signal to build a custom primitive instead.
- **Theme switch repaint.** When VSCode swaps `--vscode-*`, the cascade triggers a full repaint of styled elements. This is identical to the current behaviour (we already use `var(--vscode-*)` everywhere); the indirection through `defineVars` adds no perf penalty.

## Verification

- `pnpm --filter @three-flatland/design-system typecheck` — clean.
- `pnpm --filter @three-flatland/vscode build` — clean (Vite emits one CSS bundle with extracted atomic styles).
- F5 in VSCode → open a `.png` → Atlas opens, VSCode-themed primitives (`Panel`, `Toolbar`, `DevReloadToast`) render with correct colors/spacing.
- Switch VSCode theme (light → dark → high-contrast) without reopening the editor → primitives recolor instantly with no React rerender.
- Atlas `App.tsx` — inline styles still in place but rendering correctly (out-of-scope migration).

## Ordering hint for the implementation plan

Tokens before consumers, infra before migration. Rough order:

1. Add `@stylexjs/stylex` + `@stylexjs/unplugin` deps.
2. Wire Vite plugin + CSS entrypoint.
3. Create the four token files + re-exports.
4. Migrate `Panel` (canonical) and verify build.
5. Migrate `Toolbar` and `DevReloadToast`.
6. Delete `tokens.ts`, drop `tsup.config.ts`, switch `package.json` exports to source-only.
7. Final build + F5 verify across themes.
