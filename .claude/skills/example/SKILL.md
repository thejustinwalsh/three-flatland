# /example — Create a New Example

Creates a new three-flatland example with both Three.js and React variants.

## Philosophy

- Examples are **self-contained** and **copy-paste-able** — real npm version strings, not `workspace:*` or `catalog:`
- Always create **both** Three.js AND React variants simultaneously (project rule, not optional)
- Root `pnpm.overrides` maps `@three-flatland/*` to workspace packages during development
- Examples use `@three-flatland/tweakpane` for UI controls — never Web Awesome
- Run `pnpm syncpack:examples` after catalog version changes to keep examples in sync

## Discovery, Not Registration

Examples are an **MPA discovered from the filesystem** by `examples/vite.config.ts`. Adding a new example folder is enough — there is no central index, no per-example port allocation, and no `microfrontends.json` entry to update.

The parent dev server (`pnpm --filter=examples dev`, port 5174) serves every example at `/three/{name}/` and `/react/{name}/`. Per-example `vite.config.ts` only sets `base` for production builds.

## Checklist

1. Create `examples/three/{name}/` and `examples/react/{name}/`
2. Copy from `examples/three/template/` and `examples/react/template/`
3. Update `name` in both `package.json` files to `example-three-{name}` / `example-react-{name}`
4. Update `base` in both `vite.config.ts` files to `/three/{name}/` and `/react/{name}/`
5. Implement `main.ts` (Three.js) and `App.tsx` (React) — keep them functionally equivalent
6. Run `pnpm install` then `pnpm syncpack:examples`
7. Test both: `pnpm --filter=example-three-{name} dev` and `pnpm --filter=example-react-{name} dev`
8. Or run the full MPA: `pnpm --filter=examples dev` then visit `http://localhost:5174/three/{name}/`

## Project Structure

```
examples/
├── package.json            # Parent MPA package
├── vite.config.ts          # Discovers all examples, MPA routing
├── three/{name}/
│   ├── package.json        # name: example-three-{name}, real npm versions
│   ├── vite.config.ts      # base: '/three/{name}/' on serve, './' on build
│   ├── tsconfig.json       # Self-contained, no extends
│   ├── index.html          # Inline <style>, #root not used
│   ├── main.ts             # Entry point
│   ├── public/             # Per-example assets (textures, sheets)
│   └── README.md
└── react/{name}/
    ├── package.json        # name: example-react-{name}
    ├── vite.config.ts      # base: '/react/{name}/' on serve
    ├── tsconfig.json
    ├── index.html          # <div id="root">
    ├── main.tsx            # React root mount
    ├── App.tsx             # Main component
    ├── public/
    └── README.md
```

## Package.json

**Three.js example:**
```json
{
  "name": "example-three-{name}",
  "version": "0.0.1-alpha.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev --port ${TURBO_MFE_PORT:-5179}",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@three-flatland/tweakpane": "^0.1.0-alpha.1",
    "@tweakpane/plugin-essentials": "^0.2.1",
    "three-flatland": "^0.1.0-alpha.2",
    "three": "^0.183.1",
    "tweakpane": "^4.0.5"
  },
  "devDependencies": {
    "@types/three": "^0.183.1",
    "typescript": "^5.7.3",
    "vite": "^6.0.7"
  }
}
```

**React example** adds: `@react-three/fiber@^10.0.0-alpha.2`, `react@^19.0.0`, `react-dom@^19.0.0`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`.

Real version strings — never `catalog:` or `workspace:*`. `pnpm syncpack:examples` keeps these in sync with the workspace catalog.

## index.html

Three.js example — minimal, no UI framework chrome:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{Example Title} - Three.js</title>
    <style>
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #1a1a2e; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

React example uses `<div id="root">` and mounts via `main.tsx`.

## Tweakpane UI Controls

Both variants use `@three-flatland/tweakpane`. The Three.js path uses the `createPane()` helper; React uses hooks. Both apply the project's `FLATLAND_THEME` automatically.

**Three.js (`main.ts`):**
```ts
import { createPane } from '@three-flatland/tweakpane'

const { pane, stats } = createPane()

const params = { speed: 1.0, color: '#99d9ef' }
const folder = pane.addFolder({ title: 'Settings', expanded: false })
folder.addBinding(params, 'speed', { min: 0, max: 10, step: 0.1 })
folder.addBinding(params, 'color')

// Per frame:
function animate() {
  stats.begin()
  // ...render...
  stats.update({ drawCalls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles })
  stats.end()
}
```

**React (`App.tsx`):**
```tsx
import { usePane, usePaneFolder, usePaneInput, usePaneButton } from '@three-flatland/tweakpane/react'

function Scene() {
  const { pane, stats } = usePane()
  const folder = usePaneFolder(pane, 'Settings')
  const [speed] = usePaneInput(folder, 'speed', 1.0, { min: 0, max: 10, step: 0.1 })
  const [color] = usePaneInput(folder, 'color', '#99d9ef')
  usePaneButton(folder, 'Reset', () => { /* ... */ })

  // Stats wiring — see examples/react/CLAUDE.md for the full pattern
  const statsRef = useRef(stats)
  statsRef.current = stats
  useFrame(() => { statsRef.current.begin() }, { priority: -Infinity })
  useFrame(() => {
    statsRef.current.update({
      drawCalls: (gl.info.render as any).drawCalls,
      triangles: (gl.info.render as any).triangles,
    })
    statsRef.current.end()
  }, { priority: Infinity })
}
```

`usePane` must be called inside `<Canvas>` (e.g. in a `<Scene>` child component). See [ui-patterns.md](ui-patterns.md) for component-level patterns and [examples/react/CLAUDE.md](../../../examples/react/CLAUDE.md) for the canonical React example structure.

See [design-tokens.md](design-tokens.md) for overlay layout and CSS design tokens.

## Pair Discipline

> Examples always exist in pairs — Three.js + React. Create both or neither. (CLAUDE.md)

Functional parity matters: same controls, same defaults, same visual output. Differences should be limited to idiomatic concerns (event handling, lifecycle, asset loading).

## Do NOT

- Use `@awesome.me/webawesome` — examples use Tweakpane
- Add a `microfrontends.json` entry — examples are filesystem-discovered
- Use `WebGLRenderer` — always `WebGPURenderer` from `three/webgpu`
- Import from `@react-three/fiber` — always `@react-three/fiber/webgpu`
- Use `catalog:` or `workspace:*` in example `package.json` — use real versions
- Skip the React variant when the Three.js one exists, or vice versa
