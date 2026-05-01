# @three-flatland/design-system

> Agent-facing reference for tool UIs inside VSCode webviews.

## Use these, not raw HTML

For any VSCode-themed chrome inside a webview, use the primitives from this package. Do **not** write raw `<button>`, `<select>`, `<input>`, or `<div style="background: var(--vscode-…)">` — all of that is covered below.

| Primitive | Use case | Key props |
|-----------|----------|-----------|
| `Toolbar` | Top action row | `style` (StyleXStyles); adds standard inset padding automatically |
| `ToolbarButton` | Icon button inside a toolbar | `icon` (codicon name), `title`, `onClick`, `disabled` |
| `Button` | Standalone call-to-action | Full `ComponentProps<VscodeButton>` passthrough |
| `Panel` | Titled region with a header bar | `title`, `headerActions`, `bodyPadding: 'normal'\|'none'` |
| `Splitter` | Resizable divider between sibling panels | `axis: 'vertical'\|'horizontal'`, `onDrag(clientPx)` — parent owns the size state, clamps min/max |
| `CompactSelect` | Inline 18px dropdown; fits in Panel headers | `value`, `options: {value, label?}[]`, `onChange`, `width`, `disabled` |
| `NumberField` | Bounded number input with drag handle | `value`, `onChange`, `min`, `max`, `step`, `disabled` |
| `Tabs` / `TabHeader` / `TabPanel` | Tab strip + content panels | Lit slot auto-promotion; no `slot=` needed on `TabHeader` children |
| `Checkbox` | Boolean toggle with label | `label`, `checked`, `onChange` |
| `SingleSelect` / `Option` | Full-height native-looking dropdown | Use when `CompactSelect` is too compact (< 22 px rows) |
| `TextField` | Single-line text input | Read value via `e.currentTarget.value` (not `e.target`) |
| `Collapsible` | Disclosure section | Replaces `<details>`/`<summary>` |
| `Icon` | Codicon glyph | `name="save"` etc. — requires codicon CSS on the page |
| `Divider` | Horizontal or vertical rule | Default is horizontal |
| `Scrollable` | Themed scroll container | Wraps children with VSCode scrollbar styling |
| `Badge` | Inline count or label chip | Pass content as children |
| `Label` | Form field label | Associates with an input via `for` |
| `Tree` / `TreeItem` | Hierarchical list | Lit data model; set `data` prop on `Tree` |

All of the above are re-exported from `@three-flatland/design-system`. Import from the barrel for components; use subpaths only for tokens (see below).

```ts
import {
  Toolbar, ToolbarButton, Panel, Splitter, CompactSelect, NumberField,
  Checkbox, SingleSelect, Option, TextField, Icon, Divider,
  Scrollable, Badge, Collapsible, Tabs, TabHeader, TabPanel,
} from '@three-flatland/design-system'
```

### Panel layout & spacing rules

- A `Panel` should fill its flex parent via `style={{ flex: 1, minWidth: 0, minHeight: 0 }}` (or stylex equivalent) — the shell sets `display: flex; flex-direction: column` but doesn't grow on its own.
- Fixed-width sidebar panels: `style={{ width: <px>, flexShrink: 0 }}`.
- Use `<Splitter>` between sibling panels; its 4 px width doubles as the visual gap. Do NOT add `gap` on the parent flex container in addition.
- Persist splitter widths on the consumer side (Zustand store + `localStorageStorage` is the established pattern).
- For an artboard / canvas surface: `<Panel bodyPadding="none">` and let the surface own its padding/scroll.

## StyleX

For all StyleX authoring (style creation, token definitions, theme building, migrations from CSS / styled-components / Tailwind / inline styles), invoke the **`stylex`** skill — it carries the upstream Do/Don't rules and authoring + installation references. The notes below cover only project-specific conventions.

## Tokens (StyleX)

**Must** import tokens via subpaths, not the barrel. StyleX's babel plugin cannot follow `defineVars` through re-exports.

```ts
import { vscode } from '@three-flatland/design-system/tokens/vscode-theme.stylex'
import { space }  from '@three-flatland/design-system/tokens/space.stylex'
import { radius } from '@three-flatland/design-system/tokens/radius.stylex'
import { z }      from '@three-flatland/design-system/tokens/z.stylex'
```

### `vscode.*` — theme-adaptive CSS vars

| Token | Maps to |
|-------|---------|
| `bg` | `--vscode-editor-background` |
| `fg` | `--vscode-foreground` |
| `panelBg` | `--vscode-editorWidget-background` (floating chrome, not the dock) |
| `panelBorder` | `--vscode-panel-border` with fallback |
| `panelTitleFg` | `--vscode-panelTitle-activeForeground` |
| `focusRing` | `--vscode-focusBorder` |
| `descriptionFg` | `--vscode-descriptionForeground` |
| `btnBg/btnFg/btnHoverBg/btnBorder` | Button tokens |
| `inputBg/inputFg/inputBorder` | Input tokens |
| `notifyBg/notifyFg/notifyBorder` | Notification/toast tokens |
| `listActiveSelectionBg/Fg` | List selection tokens |
| `errorBg/errorFg/errorBorder` | Input validation error tokens |
| `fontFamily` | `--vscode-font-family` |
| `fontSize` | `--vscode-font-size` |
| `monoFontFamily` | `--vscode-editor-font-family` |

### `space.*` — spacing scale

`xs=2px`, `sm=4px`, `md=6px`, `lg=8px`, `xl=10px`, `xxl=12px`, `xxxl=16px`

### `radius.*` — border-radius scale

`none=0`, `sm=2px`, `md=3px`, `lg=4px`

### `z.*` — z-index layers

`dropdown=100`, `overlay=500`, `toast=999`

## Don'ts

- `style={{ background: 'var(--vscode-editor-background)' }}` — use `vscode.bg` via StyleX.
- `import { vscode } from '@three-flatland/design-system'` — StyleX won't trace tokens through barrel re-exports.
- `<button onClick={…}>Save</button>` — use `<ToolbarButton icon="save" onClick={…} />`.
- `<select>…</select>` — use `<CompactSelect>` (compact) or `<SingleSelect>`/`<Option>` (full height).
- `<details><summary>` — use `<Collapsible>`.

## Lit-element wrappers — gotchas

The VSCode Elements come from Lit and are wrapped via `@lit/react`. A few quirks:

1. **`disabled` attribute**: `@lit/react` strips `disabled` from the React type because it is not part of `React.HTMLAttributes`. The Lit element honors it as a reflected HTML attribute. `ToolbarButton` already works around this by spreading `{ disabled: '' }` as a raw attribute when disabled. For other Lit wrappers you may need the same pattern: `{...(disabled ? { disabled: '' } : {})}`.

2. **Event `currentTarget` type**: Lit-wrapped event types are parameterised on the custom element, not `HTMLElement`. To call DOM methods like `blur()`, cast through `unknown`: `(e.currentTarget as unknown as HTMLElement).blur()`.

3. **Subpath imports only**: import each component from its dedicated subpath (`@vscode-elements/react-elements/dist/components/Vscode<Name>.js`), never the barrel. The barrel's `sideEffects` field forces the whole bundle in and triggers "custom element already registered" warnings on remount.

4. **Codicon CSS**: `@vscode/codicons/dist/codicon.css` must be loaded by the webview's `main.tsx`. Without it, `<Icon>` renders nothing.

5. **`TextField` event shape**: read `e.currentTarget.value`, not `e.target.value` — the Lit binding wraps the native event.

6. **Outside CSS beats shadow CSS on the host, regardless of specificity.** When you override a property like `display` on a Lit host element from `tools/vscode/webview/styles.css`, you can break shadow rules that depend on the original value. Concrete example: `vscode-tab-panel`'s shadow has `:host([hidden]) { display: none }` to hide inactive tabs. Adding an outside rule like `vscode-tab-panel { display: flex }` overrides that — even though the shadow rule has higher specificity — and inactive panels stay visible. Fix: re-assert the conditional rule outside, e.g. `vscode-tab-panel[hidden] { display: none }`. Always check the shadow's `:host([…])` rules before overriding host display/visibility from outside.

## Theme detection

```ts
import { useThemeKind, useCssVar } from '@three-flatland/design-system'
```

- `useThemeKind()` returns `'light' | 'dark' | 'hc' | 'hc-light'`. Reads body class (`vscode-light`, `vscode-high-contrast`, etc.) and updates reactively via `MutationObserver`. Useful for branching three.js textures or icon variants.
- `useCssVar('--vscode-editor-background')` returns the live computed value as a string. Use sparingly — most styling should go through StyleX tokens.

## Bundle size & tree-shaking

This package is wired so consumers can pay for what they import — but only if the wiring stays intact:

- **Component re-exports use dedicated subpaths**, not the `@vscode-elements/react-elements` barrel. The barrel's `sideEffects` field is ambiguous and forces every Lit component into the bundle if imported. The current `tools/design-system/src/index.ts` follows this pattern (`'@vscode-elements/react-elements/dist/components/Vscode<Name>.js'`); preserve it when adding new primitives.
- **`package.json` `sideEffects` field**: `["src/tokens/*.stylex.ts"]` — only the StyleX token files are side-effectful. Unused primitive imports tree-shake out of consumers cleanly. Don't add side-effectful top-level code outside the token files.
- **Token imports use subpaths**, not the barrel — required by StyleX as documented above. As a side benefit, this avoids pulling all four token files into a consumer that only uses one.
- **No top-level `@vscode-elements/elements` imports** in this package. The Lit web-component registration side-effects belong in the consumer's `main.tsx` for the specific elements it uses as raw JSX intrinsics (e.g. `<vscode-progress-ring />`). The React wrappers register their own elements transitively when imported.

When introducing a primitive that needs more than one Lit element (e.g. a composite), still import each from its dedicated subpath. See `tools/vscode/CLAUDE.md` "Bundle size & loading" for the consumer-side picture (lazy chunks, Suspense boundaries, FOUC guard).

## Adding a primitive

1. Create `tools/design-system/src/primitives/<Name>.tsx`.
2. Wrap the Lit element imported from its subpath: `@vscode-elements/react-elements/dist/components/Vscode<Name>.js` (not the barrel).
3. Re-export from `tools/design-system/src/index.ts`: `export { <Name>, type <Name>Props } from './primitives/<Name>'`.
4. Style with StyleX using subpath token imports.

## Reference usage

- `tools/vscode/webview/atlas/App.tsx` — canonical `Toolbar` + `Panel` layout with `CompactSelect` in panel headers and `ToolbarButton` actions.
- `tools/preview/src/AnimationDrawer.tsx` — `Panel` with `bodyPadding="none"` hosting edge-to-edge content.
