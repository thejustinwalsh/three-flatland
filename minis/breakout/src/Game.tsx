import { useRef, useEffect, useCallback, useState } from 'react'
import { Canvas, useFrame, extend, useThree } from '@react-three/fiber/webgpu'
import {
  Sprite2D,
  Sprite2DMaterial,
  Flatland,
  type Flatland as FlatlandType,
  type EffectElement,
} from '@three-flatland/react'
import type { WebGPURenderer } from 'three/webgpu'

import { FlashEffect, BlockDissolveEffect } from './materials'

// Extend R3F with three-flatland classes + effects
extend({ Flatland, Sprite2D, Sprite2DMaterial, FlashEffect, BlockDissolveEffect })

// Type augmentation for effect JSX elements
declare module '@react-three/fiber' {
  interface ThreeElements {
    flashEffect: EffectElement<typeof FlashEffect>
    blockDissolveEffect: EffectElement<typeof BlockDissolveEffect>
  }
}
import { WorldProvider, useWorld } from 'koota/react'
import { getWorld } from './world'
import type { MiniGameProps, PlaySoundFn, GameMode } from './types'
import { GameState as GameStateTrait } from './traits'
import { BallRenderer } from './components/Ball'
import { PaddleRenderer } from './components/Paddle'
import { BlocksRenderer } from './components/Blocks'
import { WallsRenderer } from './components/Walls'
import { GameUI } from './components/UI'
import { createSoundPlayer, type SoundPlayer } from './systems/sounds'
import { useGameMaterials } from './materials'
import {
  initWorld,
  handleMouseEnter,
  handleMouseMove,
  handleMouseClick,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  updateElapsed,
  updateReady,
  shouldReturnToAttract,
  returnToAttract,
  getBlockCount,
  levelClear,
  loseLife,
  attractResetBall,
  attractLevelClear,
} from './systems/game'
import { moveBall, updatePaddle, updateAttractAI } from './systems/physics'
import { wallCollision, paddleCollision, blockCollision, checkBallLost, updateDissolving, updateBallFlash } from './systems/collision'
import { WORLD_WIDTH, WORLD_LEFT } from './systems/constants'


// Default zzfx for standalone mode - no-op until loaded
const noopZzfx: PlaySoundFn = () => {}

interface BatchStats {
  spriteCount: number
  batchCount: number
  drawCalls: number
  fps: number
}

interface GameState {
  mode: GameMode
  score: number
  highScore: number
  highScoreLevel: number
  level: number
  lives: number
  multiplier: number
  batchStats?: BatchStats
}

// FPS tracking (only in dev)
let fpsFrames = 0
let fpsTime = 0
let currentFps = 60

interface GameSceneProps {
  sounds: SoundPlayer | null
  isVisible: boolean
  onStateChange: (state: GameState) => void
}

function GameScene({ sounds, isVisible, onStateChange }: GameSceneProps) {
  const world = useWorld()
  const flatlandRef = useRef<FlatlandType>(null)
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)

  // Create materials with TSL effects
  const { uniforms, materials } = useGameMaterials()

  // Game logic runs in 'update' phase (default) — same as child useFrames (Ball, Blocks)
  // which sync effect values from ECS traits to MaterialEffect instances.
  useFrame((_, delta) => {
    if (!isVisible) return

    // Cap delta to prevent large jumps
    const dt = Math.min(delta, 0.05)

    // Track FPS in dev mode
    if (import.meta.env.DEV) {
      fpsFrames++
      fpsTime += delta
      if (fpsTime >= 0.5) {
        currentFps = Math.round(fpsFrames / fpsTime)
        fpsFrames = 0
        fpsTime = 0
      }
    }

    // Update effect uniforms
    uniforms.time.value += dt

    if (!world.has(GameStateTrait)) return

    const state = world.get(GameStateTrait)!

    // Update React state for UI
    const stats = flatlandRef.current?.stats
    onStateChange({
      mode: state.mode,
      score: state.score,
      highScore: state.highScore,
      highScoreLevel: state.highScoreLevel,
      level: state.level,
      lives: state.lives,
      multiplier: state.multiplier,
      batchStats: stats ? {
        spriteCount: stats.spriteCount,
        batchCount: stats.batchCount,
        drawCalls: stats.drawCalls,
        fps: currentFps,
      } : undefined,
    })

    // Update elapsed time
    updateElapsed(world, dt)

    switch (state.mode) {
      case 'attract':
        // Attract mode: AI writes virtual mouse → updatePaddle moves paddle (same as player)
        updateAttractAI(world, dt)
        updatePaddle(world, dt, null)
        moveBall(world, dt)
        wallCollision(world, null)
        paddleCollision(world, null)
        blockCollision(world, null, () => {
          if (getBlockCount(world) === 0) {
            attractLevelClear(world)
          }
        })

        // Update visual effects
        updateDissolving(world, dt)
        updateBallFlash(world, dt)

        // Ball lost — just reset instantly (no lives, no game over)
        if (checkBallLost(world)) {
          attractResetBall(world)
        }
        break

      case 'ready':
        // Ready countdown: paddle movable, ball tracks paddle, flash pulses
        updatePaddle(world, dt, sounds)
        updateReady(world, dt, sounds)
        updateDissolving(world, dt)
        updateBallFlash(world, dt)
        break

      case 'playing':
        // Playing mode systems
        updatePaddle(world, dt, sounds)
        moveBall(world, dt)
        wallCollision(world, sounds)
        paddleCollision(world, sounds)
        blockCollision(world, sounds, () => {
          // Check for level clear (count non-dissolving blocks)
          if (getBlockCount(world) === 0) {
            levelClear(world, sounds)
          }
        })
        // Update visual effects
        updateDissolving(world, dt)
        updateBallFlash(world, dt)

        // Check for ball lost
        if (checkBallLost(world)) {
          loseLife(world, sounds)
        }
        break

      case 'gameover':
        // Update visual effects (dissolving blocks may still be active)
        updateDissolving(world, dt)
        updateBallFlash(world, dt)

        // Check if should return to attract
        if (shouldReturnToAttract(world)) {
          returnToAttract(world)
        }
        break
    }
  })

  // Flatland.render() runs in 'render' phase — AFTER all update-phase useFrames
  // have synced effect values from ECS traits to MaterialEffect instances.
  // Registering in the render phase tells R3F to skip its own system render.
  useFrame(() => {
    if (!isVisible) return
    const flatland = flatlandRef.current
    if (!flatland) return
    flatland.resize(size.width, size.height)
    flatland.render(gl as unknown as WebGPURenderer)
  }, { phase: 'render' })

  return (
    <>
      {/* All sprites batched via Flatland */}
      <flatland ref={flatlandRef} viewSize={5} clearColor={0x0a0a23}>
        <WallsRenderer
          wallMaterial={materials.wall}
          bgMaterial={materials.background}
        />
        <BlocksRenderer material={materials.blocks[0]!} />
        <BallRenderer material={materials.ball} />
        <PaddleRenderer material={materials.paddle} />
      </flatland>
    </>
  )
}

export default function MiniBreakout({
  zzfx = noopZzfx,
  isVisible = true,
  className,
  onInteraction,
}: MiniGameProps & { onInteraction?: () => void }) {
  const soundsRef = useRef<SoundPlayer | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [gameState, setGameState] = useState<GameState>({
    mode: 'attract',
    score: 0,
    highScore: 0,
    highScoreLevel: 0,
    level: 1,
    lives: 3,
    multiplier: 1,
  })

  // Get world lazily on client only
  const world = typeof window !== 'undefined' ? getWorld() : null

  // Update sound player when zzfx changes
  useEffect(() => {
    soundsRef.current = createSoundPlayer(zzfx)
  }, [zzfx])

  // Convert screen X coordinate to world X coordinate
  const screenToWorldX = useCallback((clientX: number): number => {
    if (!containerRef.current) return 0
    const rect = containerRef.current.getBoundingClientRect()
    // Normalize to 0-1, then map to world coordinates
    const normalizedX = (clientX - rect.left) / rect.width
    return WORLD_LEFT + normalizedX * WORLD_WIDTH
  }, [])

  // Global mouse tracking — once engaged, track mouse even outside canvas
  const trackingMouse = useRef(false)

  useEffect(() => {
    const onGlobalMouseMove = (e: MouseEvent) => {
      if (trackingMouse.current && world) {
        handleMouseMove(world, screenToWorldX(e.clientX))
      }
    }
    window.addEventListener('mousemove', onGlobalMouseMove)
    return () => window.removeEventListener('mousemove', onGlobalMouseMove)
  }, [world, screenToWorldX])

  const onMouseEnter = useCallback(() => {
    if (world) {
      handleMouseEnter(world)
      trackingMouse.current = true
    }
  }, [])

  const onMouseClick = useCallback(
    (clientX: number) => {
      onInteraction?.()
      if (world) {
        trackingMouse.current = true
        handleMouseClick(world, screenToWorldX(clientX), soundsRef.current)
      }
    },
    [onInteraction, screenToWorldX]
  )

  // Touch handlers - drag to move paddle
  const onTouchStart = useCallback(
    (clientX: number) => {
      onInteraction?.()
      if (world) {
        handleTouchStart(world, screenToWorldX(clientX), soundsRef.current)
      }
    },
    [onInteraction, screenToWorldX]
  )

  const onTouchMove = useCallback(
    (clientX: number) => {
      if (world) {
        handleTouchMove(world, screenToWorldX(clientX))
      }
    },
    [screenToWorldX]
  )

  const onTouchEnd = useCallback(() => {
    if (world) {
      handleTouchEnd(world)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        cursor: gameState.mode === 'ready' || gameState.mode === 'playing' ? 'default' : 'pointer',
        touchAction: 'none', // Prevent browser touch gestures
      }}
      // Mouse: enter starts tracking, click starts game; global mousemove handles paddle
      onMouseEnter={onMouseEnter}
      onClick={(e) => onMouseClick(e.clientX)}
      // Touch events - drag to move paddle, tap for game start / double-tap for bump
      onTouchStart={(e) => {
        e.preventDefault()
        if (e.touches[0]) {
          onTouchStart(e.touches[0].clientX)
        }
      }}
      onTouchMove={(e) => {
        e.preventDefault()
        if (e.touches[0]) {
          onTouchMove(e.touches[0].clientX)
        }
      }}
      onTouchEnd={(e) => {
        e.preventDefault()
        onTouchEnd()
      }}
    >
      {world && (
        <WorldProvider world={world}>
          <Canvas
            renderer={{ antialias: false }}
          >
            <GameScene
              sounds={soundsRef.current}
              isVisible={isVisible}
              onStateChange={setGameState}
            />
          </Canvas>
          <GameUI
            mode={gameState.mode}
            score={gameState.score}
            highScore={gameState.highScore}
            highScoreLevel={gameState.highScoreLevel}
            level={gameState.level}
            lives={gameState.lives}
            multiplier={gameState.multiplier}
          />
          {/* Dev stats overlay */}
          {import.meta.env.DEV && gameState.batchStats && (
            <div
              style={{
                position: 'absolute',
                bottom: 4,
                left: 4,
                fontSize: 10,
                fontFamily: 'monospace',
                color: 'rgba(255, 255, 255, 0.5)',
                pointerEvents: 'none',
              }}
            >
              {gameState.batchStats.fps} fps • {gameState.batchStats.spriteCount} sprites • {gameState.batchStats.batchCount} batches • {gameState.batchStats.drawCalls} draws
            </div>
          )}
        </WorldProvider>
      )}
    </div>
  )
}
