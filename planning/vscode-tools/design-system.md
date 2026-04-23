# Design System — `@three-flatland/tools-design-system`

## Stack

- **VSCode Elements** (`@vscode-elements/elements` + `@vscode-elements/react-elements`) for composed controls that already match native VSCode appearance (Tree, Tabs, Table, Inputbox, etc.).
- **StyleX** (`@stylexjs/stylex`) for our own custom primitives (Slider composite, NumberField, Dialog, Toolbar, SplitPane).
- **`--vscode-*` CSS variables** as the sole color/font source. Never hard-code colors.
- **`@vscode/codicons`** for icons.

## Why StyleX

Atomic CSS-in-JS with static extraction at build time. Zero runtime JS cost, dead-code-eliminated styles, type-safe tokens, and clean composition — good fit for multi-webview bundles where bundle size matters. Vite plugin: `@stylexjs/rollup-plugin` or `vite-plugin-stylex`.

Token pattern bridging StyleX to VSCode CSS vars:

```ts
// tools/design-system/src/tokens.stylex.ts
import * as stylex from '@stylexjs/stylex'

export const colors = stylex.defineVars({
  fg:        'var(--vscode-foreground)',
  bg:        'var(--vscode-editor-background)',
  btnBg:     'var(--vscode-button-background)',
  btnFg:     'var(--vscode-button-foreground)',
  btnHover:  'var(--vscode-button-hoverBackground)',
  inputBg:   'var(--vscode-input-background)',
  inputFg:   'var(--vscode-input-foreground)',
  border:    'var(--vscode-input-border)',
  focus:     'var(--vscode-focusBorder)',
  muted:     'var(--vscode-descriptionForeground)',
})

export const fonts = stylex.defineVars({
  ui:   'var(--vscode-font-family)',
  mono: 'var(--vscode-editor-font-family)',
  size: 'var(--vscode-font-size)',
})
```

VSCode updates the CSS vars live on theme change; StyleX consumes them as plain `var()` references — no re-render required, no theme-switch JS.

Primitive example:

```tsx
// tools/design-system/src/primitives/Button.tsx
import * as stylex from '@stylexjs/stylex'
import { colors, fonts } from '../tokens.stylex'

const styles = stylex.create({
  base: {
    background: colors.btnBg,
    color: colors.btnFg,
    border: `1px solid ${colors.border}`,
    padding: '4px 11px',
    fontFamily: fonts.ui,
    fontSize: fonts.size,
    cursor: 'pointer',
    ':hover': { background: colors.btnHover },
    ':focus-visible': { outline: `1px solid ${colors.focus}` },
  },
  iconOnly: { padding: '2px 6px' },
})

export function Button({
  iconOnly,
  style,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { iconOnly?: boolean }) {
  return (
    <button
      {...props}
      {...stylex.props(styles.base, iconOnly && styles.iconOnly)}
    />
  )
}
```

## What we use from VSCode Elements (Lit wrappers)

Stays as-is, no StyleX:

- `vscode-tree` — hierarchical data (atlas frame list, animation list)
- `vscode-table` — tabular data (frame property editor)
- `vscode-tabs` / `vscode-tab-header` / `vscode-tab-panel`
- `vscode-inputbox` — single/multiline text input
- `vscode-single-select` / `vscode-multi-select`
- `vscode-checkbox` / `vscode-radio-group`
- `vscode-scrollable` — native-feeling scroll container
- `vscode-collapsible` — disclosure panels
- `vscode-icon` — codicon wrapper
- `vscode-badge`, `vscode-label`, `vscode-divider`

## What we implement with StyleX (missing primitives)

- **`Button`** — lighter than `vscode-button`, faster to compose in toolbars
- **`Slider`** composite — `<input type="range">` + coupled NumberField, live-updating for atlas/baker parameter panels
- **`NumberField`** — typed number input with clamping, step, and optional unit suffix
- **`Dialog`** — native `<dialog>` with theme-aware styling (VSCode Elements doesn't ship one)
- **`Toolbar`** — flex row with icon-button actions, separators, overflow menu
- **`SplitPane`** — resizable with draggable gutter (vscode-split-layout exists but its API is awkward in React)
- **`Panel`** — titled section frame
- **`FormRow`** — label + control + helper text grid
- **`Timeline`** — frame-duplication timeline editor for the atlas tool (see atlas doc)

## Theme detection

```ts
// tools/design-system/src/theme/useThemeKind.ts
export type ThemeKind = 'light' | 'dark' | 'hc' | 'hc-light'

function read(): ThemeKind {
  const c = document.body.classList
  if (c.contains('vscode-high-contrast-light')) return 'hc-light'
  if (c.contains('vscode-high-contrast')) return 'hc'
  if (c.contains('vscode-light')) return 'light'
  return 'dark'
}

export function useThemeKind(): ThemeKind {
  const [k, setK] = React.useState(read)
  React.useEffect(() => {
    const obs = new MutationObserver(() => setK(read()))
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return k
}
```

Usually unnecessary because colors flow through CSS vars. Use when R3F lighting presets or preview backgrounds need to adapt programmatically.

## Codicons

`@vscode/codicons` ships `codicon.css` + `codicon.ttf`. Build step copies them into `dist/codicons/`; extension host exposes the URIs via `webview.asWebviewUri()`. CSP: `font-src ${cspSource}`.

```ts
export function codiconAssets(webview: vscode.Webview, ctx: vscode.ExtensionContext) {
  const dir = vscode.Uri.joinPath(ctx.extensionUri, 'dist', 'codicons')
  return {
    css:  webview.asWebviewUri(vscode.Uri.joinPath(dir, 'codicon.css')),
    font: webview.asWebviewUri(vscode.Uri.joinPath(dir, 'codicon.ttf')),
  }
}
```

## Package structure

```
tools/design-system/
  package.json              # @three-flatland/tools-design-system, private
  stylex.config.js          # build config
  src/
    index.ts                # re-exports
    tokens.stylex.ts        # CSS-var-backed tokens
    theme/
      ThemeProvider.tsx
      useThemeKind.ts
    codicon/
      index.ts
      codiconAssets.ts
    primitives/
      Button.tsx
      Slider.tsx
      NumberField.tsx
      Dialog.tsx
      Toolbar.tsx
      SplitPane.tsx
      Panel.tsx
      FormRow.tsx
      Timeline.tsx
    composites/
      frame-row.tsx         # atlas-specific layout
      param-group.tsx       # baker-specific layout
    re-exports/
      elements.ts           # curated re-exports from @vscode-elements/react-elements
  dist/
  dist/codicons/            # copied at build; consumed via asWebviewUri
```

## Build

- StyleX compiles to atomic CSS via its Rollup/Vite plugin. Output: one CSS file per webview bundle, inlined or emitted side-by-side.
- VSCode Elements are tree-shaken at import site.
- CSP addition for any StyleX-emitted inline styles: none (StyleX emits real stylesheets, not inline style tags — works with strict CSP once the stylesheet URI is whitelisted via `asWebviewUri` or `localResourceRoots`).

## Do not adopt

- **shadcn/ui** — theme mismatch, no high-contrast story.
- **vscrui** — thinner than VSCode Elements, no Tree/Dialog.
- **`@vscode/webview-ui-toolkit`** / GitHub Next's toolkit — deprecated FAST stack.
- **Tailwind** — not needed alongside StyleX; VSCode-CSS-var theming via Tailwind adds a layer we can avoid.

## References

- [StyleX docs](https://stylexjs.com/)
- [vscode-elements/elements](https://github.com/vscode-elements/elements)
- [@vscode-elements/react-elements](https://www.npmjs.com/package/@vscode-elements/react-elements)
- [microsoft/vscode-codicons](https://github.com/microsoft/vscode-codicons)
- [webview-codicons-sample](https://github.com/microsoft/vscode-extension-samples/tree/main/webview-codicons-sample)
