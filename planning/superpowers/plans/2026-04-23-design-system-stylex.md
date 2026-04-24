# Design System StyleX Adoption — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt StyleX across `tools/design-system` and the Atlas webview, with VSCode `--vscode-*` CSS vars as the authoritative theme source bridged through `stylex.defineVars`.

**Architecture:** One Vite-time StyleX compile pass extracts atomic CSS for both webview code and source-imported design-system code. `design-system` becomes a source-only private package. `--vscode-*` vars are bridged once via `stylex.defineVars` so theme switching happens through CSS-var cascade with no React re-render.

**Tech Stack:** `@stylexjs/stylex` (runtime), `@stylexjs/unplugin` (Vite plugin), Vite 6, React 19, `@vscode-elements/react-elements` (Lit web-component bindings).

**Spec:** [planning/superpowers/specs/2026-04-23-design-system-stylex-design.md](../specs/2026-04-23-design-system-stylex-design.md)

**Skill:** `.claude/skills/stylex/SKILL.md` (consult for any authoring question)

---

## Conventions used throughout this plan

- All commands run from the worktree root: `/Users/tjw/.claude/worktrees/vscode-tools`.
- The repo formatter is Prettier with no semicolons, single quotes, trailing commas. Type-only imports use the `type` keyword.
- After each task, the change set must compile and (where applicable) build cleanly. Commit on each green checkpoint.
- Commit messages use Conventional Commits: `feat(design-system): …`, `refactor(atlas): …`, `chore(deps): …`.
- Do **not** use `--no-verify` or `--no-gpg-sign` to bypass commit hooks. If a hook fails, fix the underlying issue.

---

## File structure

**Created**

| File | Responsibility |
|---|---|
| `tools/design-system/src/tokens/vscode-theme.stylex.ts` | `vscode` defineVars group — bridges `--vscode-*` to StyleX tokens |
| `tools/design-system/src/tokens/space.stylex.ts` | `space` defineConsts — pixel scale |
| `tools/design-system/src/tokens/radius.stylex.ts` | `radius` defineConsts — border-radius scale |
| `tools/design-system/src/tokens/z.stylex.ts` | `z` defineConsts — z-index scale |
| `tools/vscode/webview/styles.css` | Single-line `@stylex;` directive (CSS entrypoint) |

**Modified**

| File | Change |
|---|---|
| `pnpm-workspace.yaml` | Add `@stylexjs/stylex` + `@stylexjs/unplugin` to catalog |
| `tools/design-system/package.json` | Add `@stylexjs/stylex` runtime dep; remove tsup dep + scripts; switch exports to `source`; `files: ["src"]` |
| `tools/vscode/package.json` | Add `@stylexjs/stylex` runtime dep + `@stylexjs/unplugin` dev dep |
| `tools/vscode/vite.config.ts` | Register `stylex.vite({...})` plugin **before** `react()` |
| `tools/vscode/webview/atlas/main.tsx` | Add `import '../styles.css'` |
| `tools/design-system/src/index.ts` | Re-export `vscode`/`space`/`radius`/`z`; remove `vscodeTokens` export |
| `tools/design-system/src/primitives/Panel.tsx` | Convert inline styles → `stylex.create`; new `style?: StyleXStyles` API |
| `tools/design-system/src/primitives/Toolbar.tsx` | Convert inline padding → `stylex.create`; new `style?: StyleXStyles` API |
| `tools/design-system/src/primitives/DevReloadToast.tsx` | Convert both inline blocks → `stylex.create`; no public `style` prop |
| `tools/vscode/webview/atlas/App.tsx` | Remove every `style={{...}}` and every direct `var(--vscode-*)`; replace with `stylex.create` blocks at the top of the file |

**Deleted**

| File | Reason |
|---|---|
| `tools/design-system/src/tokens.ts` | Replaced by `tokens/*.stylex.ts` |
| `tools/design-system/tsup.config.ts` | Source-only package; no bundle step |

---

## Task 1: Add deps + workspace catalog entries

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `tools/design-system/package.json`
- Modify: `tools/vscode/package.json`

- [ ] **Step 1.1: Look up the latest stable @stylexjs/stylex + @stylexjs/unplugin versions**

```bash
npm view @stylexjs/stylex version
npm view @stylexjs/unplugin version
```

Use the printed versions in the next step (e.g. `^0.16.0` — substitute the actual numbers). Caret-pin both.

- [ ] **Step 1.2: Add both packages to the workspace catalog**

Edit `pnpm-workspace.yaml` — append to the `catalog:` block, alphabetically:

```yaml
  '@stylexjs/stylex': <version-from-step-1.1>
  '@stylexjs/unplugin': <version-from-step-1.1>
```

- [ ] **Step 1.3: Add @stylexjs/stylex to design-system as a runtime dep**

Edit `tools/design-system/package.json` — add a `dependencies` block (if missing) with:

```json
"dependencies": {
  "@stylexjs/stylex": "catalog:"
}
```

(Leave `peerDependencies` and `devDependencies` untouched for now — tsup will be removed in Task 3.)

- [ ] **Step 1.4: Add @stylexjs/stylex (runtime) and @stylexjs/unplugin (dev) to the vscode package**

Edit `tools/vscode/package.json`:

```json
"dependencies": {
  ...,
  "@stylexjs/stylex": "catalog:"
},
"devDependencies": {
  ...,
  "@stylexjs/unplugin": "catalog:"
}
```

- [ ] **Step 1.5: Install**

```bash
pnpm install
```

Expected: lockfile updates, no warnings about missing peers from stylex packages.

- [ ] **Step 1.6: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml tools/design-system/package.json tools/vscode/package.json
git commit -m "chore(deps): add @stylexjs/stylex + @stylexjs/unplugin to catalog"
```

---

## Task 2: Wire Vite StyleX plugin + CSS entrypoint

**Files:**
- Modify: `tools/vscode/vite.config.ts`
- Create: `tools/vscode/webview/styles.css`
- Modify: `tools/vscode/webview/atlas/main.tsx`

- [ ] **Step 2.1: Register the StyleX Vite plugin BEFORE @vitejs/plugin-react**

The current plugin registration is `plugins: [react(), tokenizeAssetBase()]`. StyleX must come first so React Fast Refresh isn't broken (skill rule).

Edit `tools/vscode/vite.config.ts` — top imports:

```ts
import stylex from '@stylexjs/unplugin'
```

(`resolve` from `node:path` is already imported — leave it alone.)

Then update the `plugins` array:

```ts
export default defineConfig({
  plugins: [
    stylex.vite({ useCSSLayers: true }),
    react(),
    tokenizeAssetBase(),
  ],
  root: resolve(__dirname, 'webview'),
  ...
})
```

`@stylexjs/unplugin` does **not** accept an `include` option (TS will error with `TS2353: 'include' does not exist on UserOptions`). It auto-transforms any `.{ts,tsx,js,jsx}` file the bundler hands it that imports `@stylexjs/stylex`. Workspace symlinks (e.g. `node_modules/@three-flatland/design-system → tools/design-system`) follow the package's `exports`; once Task 3 switches design-system to source-only exports, the unplugin will pick those up automatically.

- [ ] **Step 2.2: Create the CSS entrypoint**

Create `tools/vscode/webview/styles.css` with exactly:

```css
@stylex;
```

One line, no other content. The unplugin appends extracted atomic CSS to this file at build time.

- [ ] **Step 2.3: Import the CSS from the atlas main entry**

Edit `tools/vscode/webview/atlas/main.tsx` — add as the very first import (before any TSX):

```ts
import '../styles.css'
```

- [ ] **Step 2.4: Verify the build still passes (no styles to extract yet — should be a no-op)**

```bash
pnpm --filter @three-flatland/vscode build
```

Expected: clean build. The emitted CSS file (`dist/webview/assets/*.css`) exists but contains only what existed before plus the `@stylex` directive expanded to nothing (since no source file calls `stylex.create` yet).

- [ ] **Step 2.5: Commit**

```bash
git add tools/vscode/vite.config.ts tools/vscode/webview/styles.css tools/vscode/webview/atlas/main.tsx
git commit -m "feat(vscode): wire @stylexjs/unplugin into Vite + CSS entrypoint"
```

---

## Task 3: Convert design-system to source-only

**Files:**
- Delete: `tools/design-system/tsup.config.ts`
- Modify: `tools/design-system/package.json`

- [ ] **Step 3.1: Delete the tsup config**

```bash
rm tools/design-system/tsup.config.ts
```

- [ ] **Step 3.2: Switch package.json exports to source-only and drop tsup**

Edit `tools/design-system/package.json` to look like:

```json
{
  "name": "@three-flatland/design-system",
  "version": "0.0.0",
  "private": true,
  "description": "Shared UI primitives for three-flatland editor tools — thin wrappers over @vscode-elements/react-elements",
  "type": "module",
  "exports": {
    ".": {
      "source": "./src/index.ts",
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "module": "./src/index.ts",
  "types": "./src/index.ts",
  "files": ["src"],
  "sideEffects": false,
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@stylexjs/stylex": "catalog:"
  },
  "peerDependencies": {
    "@vscode-elements/react-elements": "^2.4.0",
    "react": "catalog:"
  },
  "devDependencies": {
    "@types/react": "catalog:",
    "@vscode-elements/react-elements": "^2.4.0",
    "react": "catalog:"
  }
}
```

Removed: `build`, `dev`, `clean` scripts; `tsup` dev dep (was implicit through `tsup.config.ts`). Added: `dependencies."@stylexjs/stylex"`. Changed: `module`/`types`/`exports` all point at `src/`. `files: ["src"]` (was `["dist"]`).

- [ ] **Step 3.3: Drop the dist directory**

```bash
rm -rf tools/design-system/dist
```

- [ ] **Step 3.4: Re-resolve workspace deps + remove tsup if hoisted**

```bash
pnpm install
```

Expected: lockfile shows tsup removed from `tools/design-system`. No errors.

- [ ] **Step 3.5: Verify typecheck + build still green**

```bash
pnpm --filter @three-flatland/design-system typecheck
pnpm --filter @three-flatland/vscode build
```

Both expected: clean. The webview now resolves design-system imports against `src/` directly.

- [ ] **Step 3.6: Commit**

```bash
git add tools/design-system/package.json tools/design-system/tsup.config.ts pnpm-lock.yaml
git commit -m "refactor(design-system): private source-only package, drop tsup"
```

(`git add` on the deleted file path stages the deletion.)

---

## Task 4: Create token files + re-exports + delete legacy tokens.ts

**Files:**
- Create: `tools/design-system/src/tokens/vscode-theme.stylex.ts`
- Create: `tools/design-system/src/tokens/space.stylex.ts`
- Create: `tools/design-system/src/tokens/radius.stylex.ts`
- Create: `tools/design-system/src/tokens/z.stylex.ts`
- Modify: `tools/design-system/src/index.ts`
- Delete: `tools/design-system/src/tokens.ts`

Token-file rules (from the StyleX skill):
- Filename MUST end in `.stylex.ts`.
- Named exports only. Nothing else may be exported from the file.

- [ ] **Step 4.1: Create vscode-theme.stylex.ts**

Create `tools/design-system/src/tokens/vscode-theme.stylex.ts` with:

```ts
import * as stylex from '@stylexjs/stylex'

export const vscode = stylex.defineVars({
  // surfaces
  fg: 'var(--vscode-foreground)',
  bg: 'var(--vscode-editor-background)',
  panelBg: 'var(--vscode-editorWidget-background)',
  panelBorder: 'var(--vscode-panel-border, var(--vscode-editorGroup-border, transparent))',
  panelTitleFg: 'var(--vscode-panelTitle-activeForeground, var(--vscode-foreground))',
  // state
  focusRing: 'var(--vscode-focusBorder)',
  descriptionFg: 'var(--vscode-descriptionForeground)',
  // buttons (kept for any custom Button extension; the thin wrapper itself doesn't read these)
  btnBg: 'var(--vscode-button-background)',
  btnFg: 'var(--vscode-button-foreground)',
  btnHoverBg: 'var(--vscode-button-hoverBackground)',
  btnBorder: 'var(--vscode-button-border, transparent)',
  // inputs
  inputBg: 'var(--vscode-input-background)',
  inputFg: 'var(--vscode-input-foreground)',
  inputBorder: 'var(--vscode-input-border, var(--vscode-editorWidget-border))',
  // notifications (DevReloadToast)
  notifyBg: 'var(--vscode-notifications-background, var(--vscode-editorWidget-background))',
  notifyFg: 'var(--vscode-notifications-foreground, var(--vscode-foreground))',
  notifyBorder: 'var(--vscode-notifications-border, var(--vscode-focusBorder, transparent))',
  // list / tree (Atlas frame list selection)
  listActiveSelectionBg: 'var(--vscode-list-activeSelectionBackground, transparent)',
  listActiveSelectionFg: 'var(--vscode-list-activeSelectionForeground, var(--vscode-foreground))',
  // input validation (Atlas save error toast)
  errorBg: 'var(--vscode-inputValidation-errorBackground, #5a1d1d)',
  errorFg: 'var(--vscode-inputValidation-errorForeground, #ffb3b3)',
  errorBorder: 'var(--vscode-inputValidation-errorBorder, transparent)',
  // type
  fontFamily: 'var(--vscode-font-family)',
  fontSize: 'var(--vscode-font-size)',
  monoFontFamily: 'var(--vscode-editor-font-family)',
})
```

- [ ] **Step 4.2: Create space.stylex.ts**

Create `tools/design-system/src/tokens/space.stylex.ts`:

```ts
import * as stylex from '@stylexjs/stylex'

export const space = stylex.defineConsts({
  xs: '2px',
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '10px',
  xxl: '12px',
  xxxl: '16px',
})
```

- [ ] **Step 4.3: Create radius.stylex.ts**

Create `tools/design-system/src/tokens/radius.stylex.ts`:

```ts
import * as stylex from '@stylexjs/stylex'

export const radius = stylex.defineConsts({
  none: '0',
  sm: '2px',
  md: '3px',
  lg: '4px',
})
```

- [ ] **Step 4.4: Create z.stylex.ts**

Create `tools/design-system/src/tokens/z.stylex.ts`:

```ts
import * as stylex from '@stylexjs/stylex'

export const z = stylex.defineConsts({
  toast: '999',
  overlay: '500',
  dropdown: '100',
})
```

- [ ] **Step 4.5: Update src/index.ts — add token re-exports, drop vscodeTokens**

Edit `tools/design-system/src/index.ts`. Replace its current content with:

```ts
export { Button, type ButtonProps } from './primitives/Button'
export { Panel, type PanelProps } from './primitives/Panel'
export { Toolbar, type ToolbarProps } from './primitives/Toolbar'
export { DevReloadToast } from './primitives/DevReloadToast'
export { useThemeKind, type ThemeKind } from './theme/useThemeKind'
export { useCssVar } from './theme/useCssVar'
export { useDevReload } from './theme/useDevReload'

export { vscode } from './tokens/vscode-theme.stylex'
export { space } from './tokens/space.stylex'
export { radius } from './tokens/radius.stylex'
export { z } from './tokens/z.stylex'

// Re-export common VSCode Elements so tools don't need to depend on the
// package directly. Add more as needed.
export {
  VscodeBadge as Badge,
  VscodeDivider as Divider,
  VscodeIcon as Icon,
  VscodeLabel as Label,
  VscodeScrollable as Scrollable,
  VscodeSingleSelect as SingleSelect,
  VscodeOption as Option,
  VscodeTabs as Tabs,
  VscodeTabHeader as TabHeader,
  VscodeTabPanel as TabPanel,
  VscodeTextfield as TextField,
  VscodeTree as Tree,
  VscodeTreeItem as TreeItem,
  VscodeCheckbox as Checkbox,
  VscodeCollapsible as Collapsible,
  VscodeToolbarButton as ToolbarButton,
} from '@vscode-elements/react-elements'
```

(Removed: `export { vscodeTokens } from './tokens'`. Added: four token re-exports.)

- [ ] **Step 4.6: Delete the legacy tokens.ts**

```bash
rm tools/design-system/src/tokens.ts
```

- [ ] **Step 4.7: Verify typecheck + build**

```bash
pnpm --filter @three-flatland/design-system typecheck
pnpm --filter @three-flatland/vscode build
```

Expected: typecheck reports an error in any file still importing `vscodeTokens` — the only such file is the now-deleted `tokens.ts`. If a primitive references `vscodeTokens` it will fail here; that's fine, Tasks 5-7 fix the primitives. If the build also fails for the same reason, that's also expected.

If typecheck reports an error from anywhere outside `src/primitives/`, stop and investigate before continuing.

- [ ] **Step 4.8: Commit**

```bash
git add tools/design-system/src/tokens/ tools/design-system/src/index.ts tools/design-system/src/tokens.ts
git commit -m "feat(design-system): stylex token files + drop vscodeTokens JS export"
```

---

## Task 5: Migrate Panel (canonical primitive)

**Files:**
- Modify: `tools/design-system/src/primitives/Panel.tsx`

- [ ] **Step 5.1: Replace Panel.tsx wholesale**

Overwrite `tools/design-system/src/primitives/Panel.tsx` with:

```tsx
import * as stylex from '@stylexjs/stylex'
import type { StyleXStyles } from '@stylexjs/stylex'
import type { HTMLAttributes, ReactNode } from 'react'
import { vscode } from '../tokens/vscode-theme.stylex'
import { space } from '../tokens/space.stylex'
import { radius } from '../tokens/radius.stylex'

const s = stylex.create({
  shell: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    backgroundColor: vscode.bg,
    color: vscode.fg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.panelBorder,
    borderRadius: radius.sm,
  },
  header: {
    paddingInline: space.xl,
    paddingBlock: space.sm,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: vscode.panelBorder,
    fontFamily: vscode.fontFamily,
    fontSize: '11px',
    color: vscode.panelTitleFg,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    backgroundColor: vscode.panelBg,
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    padding: space.lg,
  },
})

export type PanelProps = Omit<HTMLAttributes<HTMLDivElement>, 'style' | 'className'> & {
  title?: ReactNode
  style?: StyleXStyles
}

/**
 * Simple titled container using VSCode panel-area tokens. VSCode Elements
 * doesn't ship a generic "Panel" primitive, so this is hand-built against
 * the same tokens VSCode uses for the editor/panel chrome.
 */
export function Panel({ title, children, style, ...rest }: PanelProps) {
  return (
    <div {...rest} {...stylex.props(s.shell, style)}>
      {title != null ? <div {...stylex.props(s.header)}>{title}</div> : null}
      <div {...stylex.props(s.body)}>{children}</div>
    </div>
  )
}
```

- [ ] **Step 5.2: Verify typecheck**

```bash
pnpm --filter @three-flatland/design-system typecheck
```

Expected: clean (Panel is now StyleX-pure; the other primitives are still inline-styled but don't reference `vscodeTokens`).

- [ ] **Step 5.3: Verify build**

```bash
pnpm --filter @three-flatland/vscode build
```

Expected: clean. The emitted CSS now contains atomic classes for the Panel styles — confirm by inspecting `tools/vscode/dist/webview/assets/*.css` and grepping for `--vscode-foreground` (it should appear inside a defineVars-generated rule).

- [ ] **Step 5.4: Commit**

```bash
git add tools/design-system/src/primitives/Panel.tsx
git commit -m "refactor(design-system): migrate Panel to StyleX"
```

---

## Task 6: Migrate Toolbar

**Files:**
- Modify: `tools/design-system/src/primitives/Toolbar.tsx`

- [ ] **Step 6.1: Replace Toolbar.tsx wholesale**

Overwrite `tools/design-system/src/primitives/Toolbar.tsx` with:

```tsx
import * as stylex from '@stylexjs/stylex'
import type { StyleXStyles } from '@stylexjs/stylex'
import type { ComponentProps } from 'react'
import { VscodeToolbarContainer } from '@vscode-elements/react-elements'
import { space } from '../tokens/space.stylex'

const s = stylex.create({
  shell: {
    paddingInline: space.lg,
    paddingBlock: space.md,
  },
})

export type ToolbarProps = Omit<
  ComponentProps<typeof VscodeToolbarContainer>,
  'style' | 'className'
> & {
  style?: StyleXStyles
}

/**
 * VSCode-native toolbar container. Matches editor/panel toolbars.
 * Adds standard inset padding so children don't sit flush against the
 * viewport edges.
 */
export function Toolbar({ style, ...rest }: ToolbarProps) {
  return <VscodeToolbarContainer {...rest} {...stylex.props(s.shell, style)} />
}
```

- [ ] **Step 6.2: Verify build**

```bash
pnpm --filter @three-flatland/vscode build
```

Expected: clean.

- [ ] **Step 6.3: Commit**

```bash
git add tools/design-system/src/primitives/Toolbar.tsx
git commit -m "refactor(design-system): migrate Toolbar to StyleX"
```

---

## Task 7: Migrate DevReloadToast

**Files:**
- Modify: `tools/design-system/src/primitives/DevReloadToast.tsx`

- [ ] **Step 7.1: Replace DevReloadToast.tsx wholesale**

Overwrite `tools/design-system/src/primitives/DevReloadToast.tsx` with:

```tsx
import * as stylex from '@stylexjs/stylex'
import { Button } from './Button'
import { useDevReload } from '../theme/useDevReload'
import { vscode } from '../tokens/vscode-theme.stylex'
import { space } from '../tokens/space.stylex'
import { radius } from '../tokens/radius.stylex'
import { z } from '../tokens/z.stylex'

const s = stylex.create({
  toast: {
    position: 'fixed',
    right: space.xxl,
    bottom: space.xxl,
    zIndex: z.toast,
    display: 'flex',
    alignItems: 'center',
    gap: space.lg,
    paddingBlock: space.md,
    paddingRight: space.xl,
    paddingLeft: space.xxl,
    borderRadius: radius.md,
    backgroundColor: vscode.notifyBg,
    color: vscode.notifyFg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.notifyBorder,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
    fontFamily: vscode.fontFamily,
    fontSize: vscode.fontSize,
  },
  label: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.md,
    paddingRight: space.sm,
  },
})

/**
 * Small corner toast that appears when the webview dev-watcher reports a
 * rebuild. Click Reload to pick up the new bundle, or Dismiss to keep
 * hacking. No auto-reload — user controls it.
 *
 * Place once at the top of each tool's <App /> so every webview in the
 * suite gets the same affordance.
 */
export function DevReloadToast() {
  const { pending, reload, dismiss } = useDevReload()
  if (!pending) return null
  return (
    <div {...stylex.props(s.toast)} role="status" aria-live="polite">
      <span {...stylex.props(s.label)}>
        <i className="codicon codicon-zap" aria-hidden="true" />
        Webview rebuilt
      </span>
      <Button onClick={reload}>Reload</Button>
      <Button secondary onClick={dismiss}>
        Dismiss
      </Button>
    </div>
  )
}
```

- [ ] **Step 7.2: Verify build**

```bash
pnpm --filter @three-flatland/vscode build
```

Expected: clean.

- [ ] **Step 7.3: Commit**

```bash
git add tools/design-system/src/primitives/DevReloadToast.tsx
git commit -m "refactor(design-system): migrate DevReloadToast to StyleX"
```

---

## Task 8: Migrate Atlas App.tsx

**Files:**
- Modify: `tools/vscode/webview/atlas/App.tsx`

This task is one big edit because `App.tsx` is one file with cross-cutting style usage. The substitutions are mechanical: every `style={{...}}` block becomes a namespace in a single `stylex.create({...})` block at the top of the file; every direct `var(--vscode-*)` becomes a `vscode.*` token.

Two things stay as inline non-style props:
- `useCssVar('--vscode-editor-background', '#1e1e1e')` — feeds Three.js's `background` prop on `CanvasStage` as a resolved string (Three.js doesn't read CSS classes). Leave as-is.
- `dumpThemeTokens()` reads raw `--vscode-*` via `getComputedStyle` for diagnostics. Leave as-is.

- [ ] **Step 8.1: Add token + StyleX imports at the top of App.tsx**

Edit `tools/vscode/webview/atlas/App.tsx`. Below the existing `@three-flatland/preview` import (around line 19), add:

```ts
import * as stylex from '@stylexjs/stylex'
import { vscode, space, radius, z } from '@three-flatland/design-system'
```

- [ ] **Step 8.2: Add the styles block right before `export function App()`**

Insert above line 81 (`export function App() {`):

```ts
const s = stylex.create({
  root: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    outline: 'none',
    backgroundColor: vscode.bg,
    color: vscode.fg,
    fontFamily: vscode.fontFamily,
    fontSize: vscode.fontSize,
  },
  toolbarSpacer: { flex: 1 },
  workArea: {
    flex: 1,
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 280px',
    gap: space.lg,
    padding: space.lg,
  },
  previewWrap: { flex: 1, minHeight: 0 },
  emptyState: { color: vscode.descriptionFg },
  hintDim: { opacity: 0.6 },
  frameList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    overflowY: 'auto',
    fontFamily: vscode.monoFontFamily,
    fontSize: '12px',
  },
  frameItem: {
    paddingInline: space.md,
    paddingBlock: space.sm,
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: vscode.fg,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: vscode.panelBorder,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.lg,
  },
  frameItemSelected: {
    backgroundColor: vscode.listActiveSelectionBg,
    color: vscode.listActiveSelectionFg,
  },
  frameItemEditing: { cursor: 'text' },
  frameName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  frameCoords: { opacity: 0.7, flex: '0 0 auto' },
  inlineRenameInput: {
    flex: 1,
    minWidth: 0,
    paddingInline: space.sm,
    paddingBlock: space.xs,
    backgroundColor: vscode.inputBg,
    color: vscode.inputFg,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.focusRing,
    outlineStyle: 'none',
    fontFamily: vscode.monoFontFamily,
    fontSize: '12px',
  },
  saveStatusBase: {
    position: 'fixed',
    left: space.xxl,
    bottom: space.xxl,
    zIndex: z.overlay,
    paddingInline: space.xl,
    paddingBlock: space.md,
    borderRadius: radius.md,
    fontFamily: vscode.fontFamily,
    fontSize: vscode.fontSize,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: vscode.panelBorder,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
    maxWidth: '60%',
  },
  saveStatusInfo: {
    backgroundColor: vscode.panelBg,
    color: vscode.fg,
  },
  saveStatusError: {
    backgroundColor: vscode.errorBg,
    color: vscode.errorFg,
    borderColor: vscode.errorBorder,
  },
  prefixBar: {
    display: 'flex',
    gap: space.md,
    alignItems: 'center',
    paddingInline: space.sm,
    paddingBlock: space.md,
    marginBottom: space.lg,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: vscode.panelBorder,
  },
  prefixLabel: {
    color: vscode.descriptionFg,
    whiteSpace: 'nowrap',
  },
  prefixSuffix: {
    opacity: 0.65,
    whiteSpace: 'nowrap',
  },
})
```

This block sits between the `readingOrder` helper (ends ~line 79) and `export function App() {`.

- [ ] **Step 8.3: Replace the root <div> style**

In `App()`, replace the root `<div ref={rootRef} tabIndex={-1} ... style={{ height: '100vh', ... }}>` with:

```tsx
<div
  ref={rootRef}
  tabIndex={-1}
  onPointerDown={handleRootPointerDown}
  {...stylex.props(s.root)}
>
```

(Remove the `style={{...}}` block entirely.)

- [ ] **Step 8.4: Replace the toolbar spacer**

Replace `<div style={{ flex: 1 }} />` with:

```tsx
<div {...stylex.props(s.toolbarSpacer)} />
```

- [ ] **Step 8.5: Replace the work-area grid**

Replace `<div style={{ flex: 1, minHeight: 0, display: 'grid', ... }}>` with:

```tsx
<div {...stylex.props(s.workArea)}>
```

- [ ] **Step 8.6: Replace the preview wrapper**

Replace `<div style={{ flex: 1, minHeight: 0 }}>` (inside `<Panel title="Preview">`) with:

```tsx
<div {...stylex.props(s.previewWrap)}>
```

- [ ] **Step 8.7: Replace the empty-state block**

Replace:

```tsx
<div style={{ color: 'var(--vscode-descriptionForeground)' }}>
  Draw rects with the <i className="codicon codicon-add" /> tool{' '}
  <span style={{ opacity: 0.6 }}>(R)</span>.
</div>
```

with:

```tsx
<div {...stylex.props(s.emptyState)}>
  Draw rects with the <i className="codicon codicon-add" /> tool{' '}
  <span {...stylex.props(s.hintDim)}>(R)</span>.
</div>
```

- [ ] **Step 8.8: Replace the frame list <ul>**

Replace `<ul style={{ listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto', fontFamily: 'var(--vscode-editor-font-family)', fontSize: 12 }}>` with:

```tsx
<ul {...stylex.props(s.frameList)}>
```

- [ ] **Step 8.9: Replace the per-frame <li>**

The current `<li>` has a `style={{...}}` block whose `background`/`color`/`cursor` branch on `sel` and `editing`. Replace the entire `style={{...}}` prop with:

```tsx
<li
  key={r.id}
  onClick={(e) => { /* unchanged */ }}
  onDoubleClick={() => { /* unchanged */ }}
  {...stylex.props(
    s.frameItem,
    sel && s.frameItemSelected,
    editing && s.frameItemEditing,
  )}
>
```

(Keep the existing `onClick`/`onDoubleClick` handler bodies exactly as they are — they reference `editing`, `selectedIds`, etc.)

- [ ] **Step 8.10: Replace the inline frame name + coords spans**

Replace `<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>` with:

```tsx
<span {...stylex.props(s.frameName)}>
```

And replace `<span style={{ opacity: 0.7, flex: '0 0 auto' }}>` with:

```tsx
<span {...stylex.props(s.frameCoords)}>
```

- [ ] **Step 8.11: Replace the InlineRenameInput <input> style**

Inside `InlineRenameInput`, replace the `<input ... style={{...}} />` with:

```tsx
<input
  ref={ref}
  value={value}
  placeholder={placeholder}
  spellCheck={false}
  onChange={(e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
  onBlur={() => onCommit(value)}
  onKeyDown={handleKey}
  {...stylex.props(s.inlineRenameInput)}
/>
```

- [ ] **Step 8.12: Replace SaveStatusLine — remove the `base` CSSProperties block**

Inside `SaveStatusLine`, **delete** the local `const base: React.CSSProperties = {...}` declaration entirely. Then update the three branch returns:

For `status.kind === 'saving'`:

```tsx
return (
  <div {...stylex.props(s.saveStatusBase, s.saveStatusInfo)}>
    <i className="codicon codicon-loading codicon-modifier-spin" /> &nbsp;Saving atlas…
  </div>
)
```

For `status.kind === 'error'`:

```tsx
return (
  <div {...stylex.props(s.saveStatusBase, s.saveStatusError)}>
    <i className="codicon codicon-error" /> &nbsp;Save failed: {status.message}
  </div>
)
```

For the saved branch:

```tsx
return (
  <div {...stylex.props(s.saveStatusBase, s.saveStatusInfo)}>
    <i className="codicon codicon-check" /> &nbsp;Saved {status.count} frame
    {status.count === 1 ? '' : 's'} → <strong>{fileName}</strong>
  </div>
)
```

- [ ] **Step 8.13: Replace PrefixRenameBar styles**

Inside `PrefixRenameBar`, replace the wrapper `<div style={{ display: 'flex', gap: 6, ... }}>` with:

```tsx
<div {...stylex.props(s.prefixBar)}>
```

Replace the label `<span style={{ color: 'var(--vscode-descriptionForeground)', whiteSpace: 'nowrap' }}>` with:

```tsx
<span {...stylex.props(s.prefixLabel)}>
```

Replace the input `style={{...}}` (same shape as the inline-rename input) with the shared `s.inlineRenameInput`:

```tsx
<input
  ref={ref}
  value={value}
  placeholder="prefix"
  spellCheck={false}
  onChange={(e: ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
  onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onCommit(value)
      e.preventDefault()
    } else if (e.key === 'Escape') {
      onCancel()
      e.preventDefault()
    }
  }}
  {...stylex.props(s.inlineRenameInput)}
/>
```

Replace the suffix `<span style={{ opacity: 0.65, whiteSpace: 'nowrap' }}>` with:

```tsx
<span {...stylex.props(s.prefixSuffix)}>
```

- [ ] **Step 8.14: Verify typecheck + build**

```bash
pnpm --filter @three-flatland/vscode typecheck
pnpm --filter @three-flatland/vscode build
```

Both expected: clean.

- [ ] **Step 8.15: Run the grep checks (must pass before commit)**

```bash
grep -rn "style={{" tools/vscode/webview tools/design-system/src
```

Expected: no output.

```bash
grep -rn "var(--vscode-" tools/vscode/webview tools/design-system/src
```

Expected: matches **only** inside `tools/design-system/src/tokens/vscode-theme.stylex.ts`. The `useCssVar` calls and `dumpThemeTokens` use a different syntax (`--vscode-...` as a string literal without `var()`) — those don't match this grep and are intentionally left in place.

- [ ] **Step 8.16: Commit**

```bash
git add tools/vscode/webview/atlas/App.tsx
git commit -m "refactor(atlas): migrate App.tsx to StyleX"
```

---

## Task 9: Final verification (manual + automated)

**Files:** none modified — verification only.

- [ ] **Step 9.1: Full typecheck across both touched packages**

```bash
pnpm --filter @three-flatland/design-system typecheck
pnpm --filter @three-flatland/vscode typecheck
```

Both: clean.

- [ ] **Step 9.2: Full build**

```bash
pnpm --filter @three-flatland/vscode build
```

Clean. Inspect `tools/vscode/dist/webview/assets/*.css` — should contain the `@layer` wrapper (because `useCSSLayers: true`) and StyleX-emitted custom properties whose values are `var(--vscode-*)`.

- [ ] **Step 9.3: F5 launch**

In VSCode, with this worktree open, press F5 to start the Extension Development Host. In the launched window:

1. Right-click any `.png` in the Explorer → "Open in FL Sprite Atlas" → editor opens.
2. Confirm the Panel chrome, Toolbar, frame list, and DevReloadToast all render with VSCode-correct colors and spacing.
3. Draw a rect, select it, rename it, save the atlas. All atlas behaviour should be unchanged from before this PR.
4. Switch the host's color theme: `Cmd+K Cmd+T` → Light → Dark → High Contrast Dark. Each switch: the atlas chrome recolors instantly with **no editor reopen and no React unmount log**. Watch the Webview Developer Tools console — no warnings/errors.

- [ ] **Step 9.4: Confirm the spec's two grep checks again**

```bash
grep -rn "style={{" tools/vscode/webview tools/design-system/src
grep -rn "var(--vscode-" tools/vscode/webview tools/design-system/src
```

First: no output. Second: only matches inside `tools/design-system/src/tokens/vscode-theme.stylex.ts`.

- [ ] **Step 9.5: Update SESSION-STATE.md handoff**

Edit `planning/vscode-tools/SESSION-STATE.md`:
- Bump `last-commit` to the current HEAD.
- Under "What's landed", add a `### StyleX adoption (T18)` subsection summarising the work: token bridge, source-only design-system, primitives + Atlas migrated.
- In "Open threads", remove "StyleX adoption" from candidate directions (it's now done).

- [ ] **Step 9.6: Commit the session-state bump**

```bash
git add planning/vscode-tools/SESSION-STATE.md
git commit -m "docs(session): record StyleX adoption landing"
```

---

## Done

After Task 9, the design system is fully on StyleX, the Atlas tool is fully on StyleX, and the VSCode theme drives every color/font through one bridged token group. Adding a new tool or new custom primitive follows the conventions in the spec — token-first, longhand properties, `style?: StyleXStyles` API, variant-namespace pattern.
