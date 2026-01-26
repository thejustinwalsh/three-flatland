# React Best Practices for three-flatland

> **Core Principle:** Use modern React 19 async patterns with Suspense boundaries.

---

## Async Data Loading

### The Problem with Module-Level Promises

**Never create promises at module level** - this causes side effects on import:

```tsx
// ❌ BAD: Fetch starts immediately when module is imported
// System may not be initialized, paths may be wrong, etc.
const spriteSheetPromise = SpriteSheetLoader.load('/sprites/player.json');
```

### Pattern 1: Static Loader Function + useState Initializer

Create a loader **function** at module level, then call it in `useState` initializer:

```tsx
// ✅ GOOD: Function at module level, called in useState initializer
const loadSpriteSheet = () => SpriteSheetLoader.load('/sprites/player.json').then(
  (sheet) => {
    sheet.texture.minFilter = NearestFilter;
    sheet.texture.magFilter = NearestFilter;
    return sheet;
  }
);

function Player() {
  const [spriteSheetPromise] = useState(loadSpriteSheet);
  const spriteSheet = use(spriteSheetPromise);

  return <animatedSprite2D spriteSheet={spriteSheet} />;
}
```

**Why this works:**
- No side effects on module import
- Fetch starts when component first renders
- Promise is stable across re-renders (useState only calls initializer once)
- Can include transformations in the promise chain

### Pattern 2: Call Loader Directly in useState

For simple cases without transformations:

```tsx
// ✅ GOOD: Loader called directly in useState initializer
function Level() {
  const [mapPromise] = useState(() => TiledLoader.load('/maps/level1.json'));
  const mapData = use(mapPromise);

  return <tileMap2D data={mapData} />;
}
```

**Rules for this pattern:**
- All loader arguments must be static (literals or module-level constants)
- No dependencies on props or state

### Pattern 3: Props-Dependent Resources

For resources that depend on props:

```tsx
// ✅ GOOD: useState initializer with prop dependency + startTransition for updates
function Level({ levelUrl }) {
  const [resourcePromise, setResourcePromise] = useState(
    () => TiledLoader.load(levelUrl)
  );
  const mapData = use(resourcePromise);

  // Update resource with startTransition for smooth transitions
  const handleLevelChange = (newUrl: string) => {
    startTransition(() => {
      setResourcePromise(TiledLoader.load(newUrl));
    });
  };

  return <tileMap2D data={mapData} />;
}
```

### Pattern 4: Parent Passes Promise as Prop

Start fetch in parent, pass promise to child:

```tsx
// ✅ GOOD: Parent creates promise, child consumes it
function GameScreen() {
  const [spriteSheetPromise] = useState(
    () => SpriteSheetLoader.load('/sprites/player.json')
  );

  return (
    <Suspense fallback={<Loading />}>
      <Player spriteSheetPromise={spriteSheetPromise} />
    </Suspense>
  );
}

function Player({ spriteSheetPromise }) {
  const spriteSheet = use(spriteSheetPromise);
  return <animatedSprite2D spriteSheet={spriteSheet} />;
}
```

---

## Anti-Pattern: useEffect + useState

Never use `useEffect` + `useState` for data fetching:

```tsx
// ❌ BAD: useEffect + useState pattern
function Level({ levelUrl }) {
  const [mapData, setMapData] = useState(null);

  useEffect(() => {
    TiledLoader.load(levelUrl).then(setMapData);
  }, [levelUrl]);

  if (!mapData) return null;  // Manual loading state
  return <tileMap2D data={mapData} />;
}
```

**Problems:**
- Extra render cycle (null → data)
- Manual loading state management
- Race conditions with rapid prop changes
- Can't leverage Suspense boundaries

---

## Suspense Boundaries

Always wrap components using `use()` with Suspense:

```tsx
function App() {
  return (
    <Canvas>
      <Suspense fallback={<LoadingSpinner />}>
        <Level />
      </Suspense>
    </Canvas>
  );
}
```

For nested loading states:

```tsx
function Game() {
  return (
    <Canvas>
      <Suspense fallback={<LoadingScreen />}>
        <World />
        <Suspense fallback={null}>
          <Player />
        </Suspense>
      </Suspense>
    </Canvas>
  );
}
```

---

## R3F Integration

### Always use `extend()` for custom elements

```tsx
import { extend } from '@react-three/fiber/webgpu';
import { Sprite2D, Renderer2D, AnimatedSprite2D, TileMap2D } from '@three-flatland/react';

// Register once at module level
extend({ Sprite2D, Renderer2D, AnimatedSprite2D, TileMap2D });
```

### Use refs for imperative updates

```tsx
function AnimatedCharacter({ spriteSheet }) {
  const spriteRef = useRef<AnimatedSprite2D>(null);

  useFrame((_, delta) => {
    spriteRef.current?.update(delta * 1000);
  });

  return <animatedSprite2D ref={spriteRef} spriteSheet={spriteSheet} />;
}
```

---

## Complete Example

```tsx
import { Suspense, useRef, useState, use } from 'react';
import { Canvas, extend, useFrame } from '@react-three/fiber/webgpu';
import { NearestFilter } from 'three';
import { AnimatedSprite2D, SpriteSheetLoader, Layers } from '@three-flatland/react';

// Register with R3F
extend({ AnimatedSprite2D });

// Loader function at module level (no side effects)
const loadPlayerSheet = () => SpriteSheetLoader.load('/sprites/player.json').then(
  (sheet) => {
    sheet.texture.minFilter = NearestFilter;
    sheet.texture.magFilter = NearestFilter;
    return sheet;
  }
);

function Player() {
  // Call loader in useState initializer - starts fetch on first render
  const [spriteSheetPromise] = useState(loadPlayerSheet);
  const spriteSheet = use(spriteSheetPromise);
  const ref = useRef<AnimatedSprite2D>(null);

  useFrame((_, delta) => {
    ref.current?.update(delta * 1000);
  });

  return (
    <animatedSprite2D
      ref={ref}
      spriteSheet={spriteSheet}
      animationSet={{
        animations: {
          idle: { frames: ['idle_0', 'idle_1', 'idle_2', 'idle_3'], fps: 8 },
        },
      }}
      animation="idle"
      layer={Layers.ENTITIES}
      scale={[64, 64, 1]}
    />
  );
}

export default function App() {
  return (
    <Canvas orthographic camera={{ zoom: 5, position: [0, 0, 100] }}>
      <Suspense fallback={null}>
        <Player />
      </Suspense>
    </Canvas>
  );
}
```

---

## Quick Reference

| Pattern | When to Use |
|---------|-------------|
| `useState(() => loader())` | Static resources, no prop dependencies |
| `useState(loadFn)` where `loadFn` is module-level | Reusable loader with transformations |
| `useState(() => loader(prop))` | Props-dependent resources |
| Parent passes promise as prop | Shared resources, coordinated loading |

## Anti-Patterns to Avoid

| ❌ Anti-Pattern | ✅ Correct Pattern |
|----------------|-------------------|
| Promise created at module level | Loader function at module level, called in `useState` |
| `useEffect` + `setState` for data fetching | `use()` with promise from `useState` |
| `if (!data) return null` loading checks | `<Suspense fallback={...}>` |
| Creating promises inside render | Create in `useState` initializer |
| `async function` inside `useEffect` | Promise chain with `.then()` in loader function |
| Multiple `useState` for loading/error/data | Single promise + Suspense + ErrorBoundary |
