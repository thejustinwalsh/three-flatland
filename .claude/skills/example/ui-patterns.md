# Tweakpane UI Patterns

Component-level patterns for `@three-flatland/devtools`. Three.js examples use the helper API; React examples use the hooks. Both apply the project's `FLATLAND_THEME` automatically — no per-pane styling needed.

## Setup

**Three.js — `createPane()`**
```ts
import { createPane } from '@three-flatland/devtools'

const { pane, stats } = createPane()
// pane: tweakpane Pane instance
// stats: { begin(), end(), update({ drawCalls, triangles }) }
```

**React — `usePane()` (call inside `<Canvas>`)**
```tsx
import { usePane } from '@three-flatland/devtools/react'

function Scene() {
  const { pane, stats } = usePane()
  // ...
}
```

Both return a stable `PaneBundle`. The pane includes a collapsible header titled "Controls", an FPS/MS/MEM graph, and a "Stats" folder with renderer info (draws, tris).

## Folders

```ts
// Three.js
const folder = pane.addFolder({ title: 'Animation', expanded: false })
```

```tsx
// React
import { usePaneFolder } from '@three-flatland/devtools/react'
const folder = usePaneFolder(pane, 'Animation')  // expanded by default
```

## Number Input / Slider

```ts
// Three.js — bind a params object
const params = { speed: 1.0 }
folder.addBinding(params, 'speed', { min: 0, max: 10, step: 0.1 })
// Later: read params.speed
```

```tsx
// React — returns [value, setValue]
import { usePaneInput } from '@three-flatland/devtools/react'
const [speed] = usePaneInput(folder, 'speed', 1.0, { min: 0, max: 10, step: 0.1 })
```

## Color Picker

```ts
const params = { tint: '#99d9ef' }
folder.addBinding(params, 'tint')  // string keys auto-detect color
```

```tsx
const [tint] = usePaneInput(folder, 'tint', '#99d9ef')
```

For float-color (`[r, g, b, a]`) bindings pass `color: { type: 'float' }` in options.

## Boolean Toggle

```ts
const params = { enabled: true }
folder.addBinding(params, 'enabled')
```

```tsx
const [enabled] = usePaneInput(folder, 'enabled', true)
```

## Dropdown / Named Options

```ts
const params = { mode: 'idle' }
folder.addBinding(params, 'mode', { options: { Idle: 'idle', Run: 'run', Attack: 'attack' } })
```

```tsx
const [mode] = usePaneInput(folder, 'mode', 'idle', {
  options: { Idle: 'idle', Run: 'run', Attack: 'attack' },
})
```

## Button (Action)

```ts
folder.addButton({ title: 'Reset' }).on('click', () => {
  // ...
})
```

```tsx
import { usePaneButton } from '@three-flatland/devtools/react'
usePaneButton(folder, 'Reset', () => {
  // ...
})
```

## Listening to Changes (Three.js)

For Three.js, when you need a callback (rather than just polling `params.x` each frame):

```ts
folder.on('change', () => {
  // any binding in this folder changed; re-read params
})
// Or per-binding:
const binding = folder.addBinding(params, 'speed', { min: 0, max: 10 })
binding.on('change', (ev) => { console.log(ev.value) })
```

React's `usePaneInput` does this internally — `[value, setValue]` updates trigger React re-render automatically.

## Stats Wiring

Every example must wire up stats via `begin()` / `end()` / `update()`. The pane already shows the FPS graph and a stats folder; this just feeds the renderer info each frame.

**Three.js:**
```ts
function animate() {
  requestAnimationFrame(animate)
  stats.begin()
  // ...render...
  renderer.render(scene, camera)
  stats.update({
    drawCalls: renderer.info.render.drawCalls,
    triangles: renderer.info.render.triangles,
  })
  stats.end()
}
```

**React** — bracket `useFrame` calls with `priority: -Infinity` and `Infinity` so they run first and last:
```tsx
const statsRef = useRef(stats)
statsRef.current = stats
const gl = useThree((s) => s.gl)

useFrame(() => { statsRef.current.begin() }, { priority: -Infinity })
useFrame(() => {
  statsRef.current.update({
    drawCalls: (gl.info.render as any).drawCalls,
    triangles: (gl.info.render as any).triangles,
  })
  statsRef.current.end()
}, { priority: Infinity })
```

Always wrap `stats` in a ref before using it inside `useFrame` — the bundle reference is stable but the rule of refs in render loops still applies.

## Quick Reference

| Need | Three.js | React |
|------|----------|-------|
| Number / slider | `folder.addBinding(params, key, { min, max, step })` | `usePaneInput(folder, key, init, { min, max, step })` |
| Color | `folder.addBinding(params, key)` (string) | `usePaneInput(folder, key, '#hex')` |
| Boolean | `folder.addBinding(params, key)` (bool) | `usePaneInput(folder, key, true)` |
| Dropdown | `folder.addBinding(params, key, { options })` | `usePaneInput(folder, key, init, { options })` |
| Button | `folder.addButton({ title }).on('click', fn)` | `usePaneButton(folder, title, fn)` |
| Folder | `pane.addFolder({ title, expanded })` | `usePaneFolder(pane, title)` |
| Stats begin | `stats.begin()` | `useFrame(() => stats.begin(), { priority: -Infinity })` |
| Stats end | `stats.update(info); stats.end()` | `useFrame(() => { stats.update(info); stats.end() }, { priority: Infinity })` |

## Do NOT

- Style the pane manually — `createPane` / `usePane` already apply `FLATLAND_THEME`
- Call `usePane` outside `<Canvas>` — it relies on Canvas context for stable mounting
- Create multiple panes per example — one is enough; use folders to organize
- Skip stats wiring — every example surfaces draws/tris in the Stats folder
- Use `setState` inside `useFrame` for animation values — mutate refs directly
