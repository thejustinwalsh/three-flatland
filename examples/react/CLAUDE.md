# React Example Patterns

Patterns every React example follows. Reference when creating or modifying examples.

## File Structure
Every example has: `App.tsx`, `main.tsx`, `index.html`, `package.json`, `tsconfig.json`, `vite.config.ts`, `public/`.

## Canvas Setup
```tsx
<Canvas orthographic camera={{ zoom: 5, position: [0, 0, 100] }} renderer={{ antialias: true }}>
  <color attach="background" args={['#00021c']} />
  <Scene />
</Canvas>
```
- Always `orthographic` camera for 2D
- `<Scene>` component inside Canvas (hooks like `usePane` require Canvas context)

## Imports
```tsx
import { Canvas, extend, useLoader, useFrame, useThree } from '@react-three/fiber/webgpu'
import { Sprite2D, TextureLoader } from 'three-flatland/react'
import { usePane, usePaneInput, usePaneFolder, usePaneButton } from '@three-flatland/tweakpane/react'
```

## extend() Registration
Register library classes at module scope before JSX use:
```tsx
extend({ Sprite2D })
// then: <sprite2D texture={tex} tint="#fff" />
```

## Tweakpane UI Controls
```tsx
const { pane, stats } = usePane()
const folder = usePaneFolder(pane, 'Settings')
const [value] = usePaneInput(folder, 'speed', 1.0, { min: 0, max: 10 })
usePaneButton(folder, 'Reset', () => { /* ... */ })
```

## Stats Monitoring (required in every example)
```tsx
const statsRef = useRef(stats)
statsRef.current = stats

useFrame(() => { statsRef.current.begin() }, { priority: -Infinity })
useFrame(() => {
  statsRef.current.update({
    drawCalls: (gl.info.render as any).drawCalls as number,
    triangles: (gl.info.render as any).triangles as number,
  })
  statsRef.current.end()
}, { priority: Infinity })
```

## useFrame Rules
- Mutate refs directly — never `setState` in the render loop
- Use `delta` from useFrame for time-based updates: `sprite.update(delta * 1000)`
- Use `{ priority: N }` for ordering when needed

## useThree Selectors
Prefer individual selectors to avoid unnecessary re-renders:
```tsx
const gl = useThree((s) => s.gl)
const camera = useThree((s) => s.camera)
```

## Asset Loading
```tsx
const texture = useLoader(TextureLoader, './icon.svg')
const sheet = useLoader(SpriteSheetLoader, './sprites/knight.json')
```

## Ref Pattern for useFrame
Always use a ref wrapper when accessing values that change between renders:
```tsx
const statsRef = useRef(stats)
statsRef.current = stats // update each render
useFrame(() => { statsRef.current.begin() }) // stable reference in callback
```

## Do NOT
- Import from `@react-three/fiber` — always use `@react-three/fiber/webgpu`
- Use `setState` inside `useFrame` — mutate refs directly
- Use GLSL or `onBeforeCompile` — this project uses TSL node materials
- Use Web Awesome components — examples use `@three-flatland/tweakpane`
- Use `Date.now()` for animation timing — use `state.clock.elapsedTime` or `delta`
- Skip stats monitoring — every example must include the begin/end pattern
- Destructure `useThree()` in hot paths — use individual selectors
- Forget `extend()` — R3F won't recognize library classes without it
