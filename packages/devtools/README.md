<p align="center">
  <img src="https://raw.githubusercontent.com/thejustinwalsh/three-flatland/main/assets/repo-banner.png" alt="three-flatland" width="100%" />
</p>

# @three-flatland/devtools

Tweakpane v4 integration for [three-flatland](https://www.npmjs.com/package/three-flatland). Themed `Pane` factory, render-stats wiring, and React hooks for declarative panes in R3F scenes. Used across the three-flatland examples and demos.

> **Alpha Release** — this package is in active development and is transitioning into a broader devtools package. The API will evolve and breaking changes are expected between releases. Pin your version and check the [changelog](https://github.com/thejustinwalsh/three-flatland/releases) before upgrading.

[![npm](https://img.shields.io/npm/v/@three-flatland/devtools)](https://www.npmjs.com/package/@three-flatland/devtools)
[![license](https://img.shields.io/npm/l/@three-flatland/devtools)](https://github.com/thejustinwalsh/three-flatland/blob/main/LICENSE)

## Install

```bash
npm install @three-flatland/devtools@alpha
```

### Requirements

- **tweakpane** >= 4.0.5
- **@tweakpane/plugin-essentials** >= 0.2.1
- **three** >= 0.183.1
- **React** >= 19.0.0 (for `@three-flatland/devtools/react`)
- **@react-three/fiber** >= 10.0.0-alpha.2 (for React hooks)

## What's in the box

### Core (`@three-flatland/tweakpane`)

- `createPane(options)` — returns a themed `PaneBundle` (Pane + auto-mounted container + plugin registration).
- `wireSceneStats(pane, renderer, scene)` — attaches a live render-stats folder (draw calls, triangles, programs) to a Pane.
- `addStatsGraph(pane, key, options)` — push-value FPS/ms graph backed by `@tweakpane/plugin-essentials`.
- `applyTheme(pane)` + `FLATLAND_THEME` — theme tokens that match the three-flatland palette.
- `registerPlugins(pane)` + `EssentialsPlugin` — pre-registered plugin bundle.

### React (`@three-flatland/tweakpane/react`)

- `usePane(options)` — pane lifecycle bound to a component.
- `usePaneInput(pane, target, key, options)` — bind a Pane input to component state.
- `usePaneFolder(pane, options)` — folder lifecycle.
- `usePaneButton(pane, label, onClick)` — button binding.
- `useFpsGraph(pane, options)` — live FPS graph hook.
- `useStatsMonitor(pane, renderer, scene)` — render-stats hook for R3F.

## Quick Start

```typescript
import { createPane, wireSceneStats, addStatsGraph } from '@three-flatland/tweakpane'

const { pane } = createPane({ title: 'Scene' })
wireSceneStats(pane, renderer, scene)
const fps = addStatsGraph(pane, 'fps', { label: 'FPS' })

function tick(delta: number) {
  fps.push(1 / delta)
}
```

### React Three Fiber

```tsx
import { usePane, useFpsGraph, useStatsMonitor } from '@three-flatland/tweakpane/react'

function DevPanel() {
  const renderer = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const pane = usePane({ title: 'Scene' })
  useFpsGraph(pane, { label: 'FPS' })
  useStatsMonitor(pane, renderer, scene)
  return null
}
```

## Documentation

Full docs at **[thejustinwalsh.com/three-flatland](https://thejustinwalsh.com/three-flatland/)**.

## License

[MIT](./LICENSE)
