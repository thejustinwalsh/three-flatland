# Design System — `@three-flatland/vscode-design-system`

## Base library

**VSCode Elements** (`@vscode-elements/elements` + `@vscode-elements/react-elements`). Microsoft's `@vscode/webview-ui-toolkit` was archived 2025-01-06 with no first-party replacement. The community rallied around Adam Bender's (`bendera`) library, which was Lit-based from the start — dodging the FAST Foundation deprecation that killed the Microsoft toolkit.

Status (April 2026):
- `@vscode-elements/elements` v2.5.1 — Lit web components, actively maintained.
- `@vscode-elements/react-elements` v2.4.0 — Lit-to-React wrappers via `@lit/react`.
- React 19's native custom-element support also works directly; wrappers are still nicer for typed event handlers.

Component coverage: Badge, Button, Checkbox, CheckboxGroup, Collapsible, ContextMenu, Divider, FormGroup/FormLabel/FormHelper, Icon, Inputbox, Label, MultiSelect, Radio/RadioGroup, Scrollable, SingleSelect, SplitLayout, Table, Tabs, Textarea, Textfield, **Tree** (full-featured). No Dialog/Modal — we fill that gap ourselves.

## Gaps we fill

- **Dialog/Modal** — native `<dialog>` element styled against `--vscode-*` tokens.
- **Toolbar** — horizontal flex with codicon buttons, separators, overflow menu.
- **Slider** + **NumberField composite** — atlas/baker tools need coupled slider+numeric for float params (0–1, arbitrary ranges). Build on top of `vscode-textfield`.
- **SplitPane** — resizable horizontal/vertical split with draggable gutter; `vscode-split-layout` is close but its API is awkward for React; may wrap.
- **ThemeProvider** — MutationObserver on `<body>` class; exposes `useThemeKind()`: `'light' | 'dark' | 'hc' | 'hc-light'`.
- **Codicon loader** — helper to generate the CSP snippet + resource URIs for `@vscode/codicons`.

## Theme tokens

All `--vscode-*` CSS variables are pre-injected by the webview host. No runtime theme switching code required for color — CSS vars update live on theme change.

Canonical token families we consume:
- `--vscode-button-{background,foreground,hoverBackground,border}`
- `--vscode-input-{background,foreground,border,placeholderForeground}`
- `--vscode-dropdown-{background,foreground,border}`
- `--vscode-list-{activeSelectionBackground,hoverBackground,focusOutline}`
- `--vscode-editor-{background,foreground,selectionBackground,lineHighlightBackground}`
- `--vscode-focusBorder`
- `--vscode-foreground`, `--vscode-descriptionForeground`
- `--vscode-font-family`, `--vscode-font-size`, `--vscode-editor-font-family`

Reference primitive (what wraps become):

```tsx
export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      style={{
        background: 'var(--vscode-button-background)',
        color: 'var(--vscode-button-foreground)',
        border: '1px solid var(--vscode-button-border, transparent)',
        padding: '4px 11px',
        fontFamily: 'var(--vscode-font-family)',
        fontSize: 'var(--vscode-font-size)',
        cursor: 'pointer',
        ...props.style,
      }}
    />
  )
}
```

For most controls prefer the VSCode Elements wrapper; roll-your-own only for primitives that don't exist.

## Tailwind pairing

Optional. `@githubocto/tailwind-vscode` maps every `--vscode-*` token to a Tailwind utility (`bg-vscode-button-background`, `text-vscode-foreground`). Useful for layout around R3F canvases. Add when/if we pick up Tailwind in a given webview.

Not starting with Tailwind globally — inline style + Lit components is sufficient and avoids a build-time dependency.

## Codicons

`@vscode/codicons` package provides `codicon.css` + `codicon.ttf`. Ship them in the webview:

1. Copy `node_modules/@vscode/codicons/dist/codicon.{css,ttf}` into `dist/webview/<tool>/` during build.
2. Resolve with `webview.asWebviewUri()`.
3. Whitelist font in CSP: `font-src ${webview.cspSource}`.
4. Use via `<i class="codicon codicon-add" />` or `<vscode-icon name="add" />`.

Package provides a helper:

```ts
// packages/vscode-design-system/src/codicon.ts
export function codiconAssets(webview: vscode.Webview, extensionUri: vscode.Uri) {
  const base = vscode.Uri.joinPath(extensionUri, 'dist', 'codicons')
  return {
    cssUri: webview.asWebviewUri(vscode.Uri.joinPath(base, 'codicon.css')),
    fontUri: webview.asWebviewUri(vscode.Uri.joinPath(base, 'codicon.ttf')),
  }
}
```

## Theme detection

```ts
// from inside a webview
type Kind = 'light' | 'dark' | 'hc' | 'hc-light'

function readKind(): Kind {
  const b = document.body.classList
  if (b.contains('vscode-high-contrast-light')) return 'hc-light'
  if (b.contains('vscode-high-contrast')) return 'hc'
  if (b.contains('vscode-light')) return 'light'
  return 'dark'
}

export function useThemeKind(): Kind {
  const [kind, setKind] = useState(readKind)
  useEffect(() => {
    const obs = new MutationObserver(() => setKind(readKind()))
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return kind
}
```

Extension-host side uses `vscode.window.activeColorTheme.kind` + `window.onDidChangeActiveColorTheme`. Usually unnecessary — CSS vars cover most cases. Use only when preview backgrounds or R3F lighting should adapt.

## Package structure

```
packages/vscode-design-system/
  package.json          # private: true, peer: react@^19
  src/
    index.ts            # re-exports
    theme/
      ThemeProvider.tsx
      useThemeKind.ts
      tokens.ts         # typed helpers to read CSS vars
    codicon/
      index.ts
      codicon.ts        # asset URI helper (host side)
    primitives/
      Button.tsx        # wraps vscode-button with react/ref
      TextField.tsx     # wraps vscode-textfield
      Slider.tsx        # NumberField + <input type=range>
      NumberField.tsx
      Select.tsx        # vscode-single-select / multi-select
      Tabs.tsx
      Tree.tsx
      Checkbox.tsx
      Toggle.tsx
      Dialog.tsx        # roll-your-own, <dialog>
    composites/
      Toolbar.tsx       # flex row with codicon actions
      SplitPane.tsx     # draggable split
      FormRow.tsx       # label + control + helper
      Panel.tsx         # section with title bar
  dist/                 # built by tsup for dual ESM/CJS; consumed by Vite
```

## Do not adopt

- **shadcn/ui** — theme mismatch, no high-contrast story.
- **vscrui** (Elio Struyf) — thinner than VSCode Elements, no Tree/Dialog. Fine for tiny webviews, insufficient as our base.
- **`@vscode/webview-ui-toolkit/react`**, GitHub Next's React Webview UI Toolkit — both tied to deprecated FAST stack.

## References

- [vscode-elements/elements](https://github.com/vscode-elements/elements)
- [@vscode-elements/react-elements](https://www.npmjs.com/package/@vscode-elements/react-elements)
- [Sunsetting Webview UI Toolkit (#561)](https://github.com/microsoft/vscode-webview-ui-toolkit/issues/561)
- [vscrui](https://github.com/estruyf/vscrui)
- [Elio Struyf — code-driven theme approach](https://www.eliostruyf.com/code-driven-approach-theme-vscode-webview/)
- [microsoft/vscode-codicons](https://github.com/microsoft/vscode-codicons)
- [webview-codicons-sample](https://github.com/microsoft/vscode-extension-samples/tree/main/webview-codicons-sample)
- [@githubocto/tailwind-vscode](https://github.com/githubocto/tailwind-vscode)
