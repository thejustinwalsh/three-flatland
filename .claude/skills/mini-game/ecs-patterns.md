# Koota ECS Patterns for Mini-Games

This document covers the ECS (Entity Component System) patterns used in three-flatland mini-games using Koota.

---

## Core Concepts

Koota uses **traits** (components) that attach to entities, and **systems** that query and update entities with specific traits.

### World Setup - CRITICAL: Static Module Pattern

**The Koota world MUST be created in a separate module statically** to avoid HMR issues. Creating the world inside a component or hook will cause "Too many worlds created" errors during development.

```typescript
// ❌ WRONG - World in component (breaks on HMR)
function Game() {
  const world = useMemo(() => createWorld(), [])
}

// ❌ WRONG - World at module level without HMR guard
const world = createWorld() // Recreated on every HMR update!
```

```typescript
// ✅ CORRECT - world.ts (separate module with HMR guard)
import { createWorld, type World } from 'koota'
import { GameState } from './traits'

// Use globalThis to survive HMR
declare global {
  var __myGameWorld: World | undefined
}

export function getWorld(): World {
  // Client-only check
  if (typeof window === 'undefined') {
    throw new Error('World can only be accessed on the client')
  }

  // Reuse existing world if valid (survives HMR)
  if (globalThis.__myGameWorld && globalThis.__myGameWorld.has(GameState)) {
    return globalThis.__myGameWorld
  }

  // Create new world
  const world = createWorld()
  initWorld(world) // Initialize entities, spawn blocks, etc.
  globalThis.__myGameWorld = world
  return world
}

function initWorld(world: World) {
  // Add singleton game state as world trait
  world.add(GameState)
  world.set(GameState, {
    mode: 'attract',
    score: 0,
    lives: 3,
  })

  // Spawn initial entities...
}
```

```typescript
// Game.tsx - Use getWorld() lazily
import { getWorld } from './world'

export default function MiniGame() {
  // Get world lazily on client only
  const world = typeof window !== 'undefined' ? getWorld() : null

  return (
    <div>
      {world && (
        <WorldProvider world={world}>
          <Canvas>
            <GameScene />
          </Canvas>
        </WorldProvider>
      )}
    </div>
  )
}
```

---

## Trait Definitions

### Position and Physics

```typescript
import { trait } from 'koota'
import type { Vector2 } from 'three'

// Position trait - stores x, y coordinates
export const Position = trait({ x: 0, y: 0 })

// Velocity trait - for moving entities
export const Velocity = trait({ x: 0, y: 0 })

// Bounds trait - for collision boxes
export const Bounds = trait({ width: 1, height: 1 })
```

### Game Mode

```typescript
// Game mode enum
export type GameModeType = 'attract' | 'playing' | 'gameover'

// Singleton trait for global game state
export const GameState = trait({
  mode: 'attract' as GameModeType,
  score: 0,
  lives: 3,
  elapsed: 0,        // Time in current mode
  highScore: 0,
})
```

### Input State

```typescript
// Input trait for tracking user interaction
export const Input = trait({
  pressed: false,      // Currently pressed
  justPressed: false,  // Pressed this frame
  justReleased: false, // Released this frame
  x: 0,                // Pointer x position
  y: 0,                // Pointer y position
})
```

### Entity Type Tags

```typescript
// Tag traits - no data, just identity
export const Ball = trait()
export const Paddle = trait()
export const Block = trait()
export const Wall = trait()
```

### SpriteRef Pattern

For connecting Koota entities to Three.js objects:

```typescript
import type { Sprite2D } from 'three-flatland/react'
import type { RefObject } from 'react'

// Store a ref callback to sync position
export const SpriteRef = trait({
  ref: null as RefObject<Sprite2D> | null,
})
```

---

## Entity Creation

### Spawning Entities

```typescript
import { world } from './world'
import { Position, Velocity, Ball, Bounds } from './traits'

// Create ball entity
function spawnBall(x: number, y: number) {
  return world.spawn(
    Ball,
    Position({ x, y }),
    Velocity({ x: 2, y: 3 }),
    Bounds({ width: 0.5, height: 0.5 }),
  )
}

// Create block entity
function spawnBlock(x: number, y: number) {
  return world.spawn(
    Block,
    Position({ x, y }),
    Bounds({ width: 1, height: 0.5 }),
  )
}
```

### World Traits for Singletons

**Use world traits for singleton data** instead of spawning singleton entities. World traits are cleaner and more efficient:

```typescript
// ✅ CORRECT - World trait (preferred for singletons)
// In initWorld():
world.add(GameState)
world.set(GameState, { mode: 'attract', score: 0, lives: 3 })

// Access anywhere:
if (world.has(GameState)) {
  const state = world.get(GameState)
  world.set(GameState, { ...state, score: state.score + 10 })
}
```

```typescript
// ❌ LESS IDEAL - Singleton entity
const gameStateEntity = world.spawn(GameState, Input)

// Requires query to access:
function getGameState() {
  const [entity] = world.query(GameState)
  return entity?.get(GameState)
}
```

World traits (`world.add/get/set/has`) are better for:
- Game state (mode, score, lives)
- Input state (mouse position, pressed)
- Configuration (world bounds, game settings)

Entity traits are better for:
- Multiple instances (balls, blocks, particles)
- Things that can be destroyed
- Things with position/velocity

---

## Systems

### System Structure

Systems are functions that query entities and update them:

```typescript
import { useWorld } from 'koota/react'
import { useFrame } from '@react-three/fiber'

function useMovementSystem() {
  const world = useWorld()

  useFrame((_, delta) => {
    // Query all entities with Position and Velocity
    for (const entity of world.query(Position, Velocity)) {
      const pos = entity.get(Position)
      const vel = entity.get(Velocity)

      // Update position
      entity.set(Position, {
        x: pos.x + vel.x * delta,
        y: pos.y + vel.y * delta,
      })
    }
  })
}
```

### Mode-Conditional Systems

Run different logic based on game mode:

```typescript
function useGameSystems() {
  const world = useWorld()

  useFrame((_, delta) => {
    const gameState = getGameState()

    switch (gameState.mode) {
      case 'attract':
        runAttractSystems(world, delta)
        break
      case 'playing':
        runPlayingSystems(world, delta)
        break
      case 'gameover':
        runGameOverSystems(world, delta)
        break
    }
  })
}
```

### Attract Mode System

```typescript
function runAttractSystems(world: World, delta: number) {
  // Update elapsed time
  const [stateEntity] = world.query(GameState)
  const state = stateEntity.get(GameState)
  stateEntity.set(GameState, { elapsed: state.elapsed + delta })

  // Animate paddle with sine wave
  for (const entity of world.query(Paddle, Position)) {
    const pos = entity.get(Position)
    entity.set(Position, {
      x: Math.sin(state.elapsed * 2) * 2, // Sway left/right
      y: pos.y,
    })
  }

  // Ball bounces autonomously
  for (const entity of world.query(Ball, Position, Velocity)) {
    // Normal movement + wall bounce logic
  }
}
```

### Collision System

```typescript
function checkCollision(
  aPos: { x: number; y: number },
  aBounds: { width: number; height: number },
  bPos: { x: number; y: number },
  bBounds: { width: number; height: number },
): boolean {
  return (
    aPos.x - aBounds.width / 2 < bPos.x + bBounds.width / 2 &&
    aPos.x + aBounds.width / 2 > bPos.x - bBounds.width / 2 &&
    aPos.y - aBounds.height / 2 < bPos.y + bBounds.height / 2 &&
    aPos.y + aBounds.height / 2 > bPos.y - bBounds.height / 2
  )
}

function runCollisionSystem(world: World, onBallHit: () => void) {
  const balls = [...world.query(Ball, Position, Velocity, Bounds)]
  const blocks = [...world.query(Block, Position, Bounds)]

  for (const ball of balls) {
    const ballPos = ball.get(Position)
    const ballBounds = ball.get(Bounds)
    const ballVel = ball.get(Velocity)

    for (const block of blocks) {
      const blockPos = block.get(Position)
      const blockBounds = block.get(Bounds)

      if (checkCollision(ballPos, ballBounds, blockPos, blockBounds)) {
        // Destroy block
        block.destroy()

        // Bounce ball
        ball.set(Velocity, { x: ballVel.x, y: -ballVel.y })

        // Play sound
        onBallHit()
        break
      }
    }
  }
}
```

---

## React Integration

### useQuery Hook

```typescript
import { useQuery } from 'koota/react'

function BlockRenderer() {
  // Reactively get all blocks
  const blocks = useQuery(Block, Position, Bounds)

  return (
    <>
      {blocks.map((entity) => {
        const pos = entity.get(Position)
        const bounds = entity.get(Bounds)
        return (
          <sprite2D
            key={entity.id()}
            position={[pos.x, pos.y]}
            scale={[bounds.width, bounds.height]}
          />
        )
      })}
    </>
  )
}
```

### Actions Pattern

```typescript
import { createActions } from 'koota'

export const gameActions = createActions((world) => ({
  startGame() {
    const [stateEntity] = world.query(GameState)
    stateEntity.set(GameState, {
      mode: 'playing',
      score: 0,
      lives: 3,
      elapsed: 0,
    })
  },

  gameOver() {
    const [stateEntity] = world.query(GameState)
    const state = stateEntity.get(GameState)
    stateEntity.set(GameState, {
      mode: 'gameover',
      elapsed: 0,
      highScore: Math.max(state.highScore, state.score),
    })
  },

  returnToAttract() {
    const [stateEntity] = world.query(GameState)
    stateEntity.set(GameState, {
      mode: 'attract',
      elapsed: 0,
    })
    // Reset entities...
  },

  addScore(points: number) {
    const [stateEntity] = world.query(GameState)
    const state = stateEntity.get(GameState)
    stateEntity.set(GameState, {
      score: state.score + points,
    })
  },
}))

// Use in components
function GameUI() {
  const actions = useActions(gameActions)

  const handleTap = () => {
    const state = getGameState()
    if (state.mode === 'attract' || state.mode === 'gameover') {
      actions.startGame()
    }
  }

  return <div onClick={handleTap}>...</div>
}
```

---

## Syncing with Three.js

### Position Sync System

```typescript
function useSpriteSync() {
  const world = useWorld()

  useFrame(() => {
    for (const entity of world.query(Position, SpriteRef)) {
      const pos = entity.get(Position)
      const { ref } = entity.get(SpriteRef)

      if (ref?.current) {
        ref.current.position.x = pos.x
        ref.current.position.y = pos.y
      }
    }
  })
}
```

### Entity-Component Binding

```typescript
function BallSprite({ entity }: { entity: Entity }) {
  const spriteRef = useRef<Sprite2D>(null)

  useEffect(() => {
    // Bind sprite ref to entity
    entity.set(SpriteRef, { ref: spriteRef })
    return () => entity.set(SpriteRef, { ref: null })
  }, [entity])

  return (
    <sprite2D
      ref={spriteRef}
      texture={ballTexture}
      scale={[0.5, 0.5]}
    />
  )
}
```

---

## Best Practices

1. **Trait granularity** - Keep traits small and focused
2. **Query caching** - Don't create new queries every frame
3. **System ordering** - Input → Physics → Collision → Render sync
4. **Mode isolation** - Different systems for different game modes
5. **Entity pooling** - Reuse entities for frequently spawned objects
6. **Avoid allocations** - Pre-allocate vectors, reuse objects
7. **Fixed timestep** - Use accumulator for physics consistency

### Fixed Timestep Example

```typescript
const FIXED_DT = 1 / 60
let accumulator = 0

useFrame((_, delta) => {
  accumulator += Math.min(delta, 0.1) // Cap to prevent spiral

  while (accumulator >= FIXED_DT) {
    runPhysicsSystems(world, FIXED_DT)
    accumulator -= FIXED_DT
  }

  // Interpolate for smooth rendering
  runRenderSync(world, accumulator / FIXED_DT)
})
```
