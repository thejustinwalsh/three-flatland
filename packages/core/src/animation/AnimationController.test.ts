import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AnimationController } from './AnimationController'
import type { Animation, AnimationFrame } from './types'

describe('AnimationController', () => {
  let controller: AnimationController
  let mockFrames: AnimationFrame[]
  let animation: Animation

  beforeEach(() => {
    controller = new AnimationController()
    mockFrames = [
      {
        frame: {
          name: 'frame0',
          x: 0,
          y: 0,
          width: 0.25,
          height: 0.25,
          sourceWidth: 32,
          sourceHeight: 32,
        },
      },
      {
        frame: {
          name: 'frame1',
          x: 0.25,
          y: 0,
          width: 0.25,
          height: 0.25,
          sourceWidth: 32,
          sourceHeight: 32,
        },
      },
      {
        frame: {
          name: 'frame2',
          x: 0.5,
          y: 0,
          width: 0.25,
          height: 0.25,
          sourceWidth: 32,
          sourceHeight: 32,
        },
      },
      {
        frame: {
          name: 'frame3',
          x: 0.75,
          y: 0,
          width: 0.25,
          height: 0.25,
          sourceWidth: 32,
          sourceHeight: 32,
        },
      },
    ]
    animation = {
      name: 'test',
      frames: mockFrames,
      fps: 10, // 100ms per frame
      loop: true,
    }
    controller.addAnimation(animation)
  })

  it('should add and retrieve animations', () => {
    expect(controller.getAnimation('test')).toBe(animation)
    expect(controller.getAnimationNames()).toContain('test')
  })

  it('should play an animation', () => {
    controller.play('test')
    expect(controller.isPlaying('test')).toBe(true)
    expect(controller.currentAnimation).toBe('test')
  })

  it('should warn when playing non-existent animation', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    controller.play('nonexistent')
    expect(warnSpy).toHaveBeenCalledWith('Animation not found: nonexistent')
    warnSpy.mockRestore()
  })

  it('should advance frames over time', () => {
    const onFrame = vi.fn()
    controller.play('test')

    // Frame 0 -> 1 (after 100ms)
    controller.update(100, onFrame)
    expect(onFrame).toHaveBeenCalledTimes(1)
    expect(controller.getState().frameIndex).toBe(1)

    // Frame 1 -> 2 (after another 100ms)
    controller.update(100, onFrame)
    expect(onFrame).toHaveBeenCalledTimes(2)
    expect(controller.getState().frameIndex).toBe(2)
  })

  it('should loop correctly', () => {
    const onLoop = vi.fn()
    controller.play('test', { onLoop })

    // Advance through all 4 frames (400ms total at 10fps)
    controller.update(400)
    expect(controller.getState().frameIndex).toBe(0) // Looped back
    expect(onLoop).toHaveBeenCalledWith(1)
  })

  it('should stop at end when not looping', () => {
    const onComplete = vi.fn()
    controller.play('test', { loop: false, onComplete })

    controller.update(400)
    expect(controller.isPlaying()).toBe(false)
    expect(onComplete).toHaveBeenCalled()
  })

  it('should pause and resume', () => {
    controller.play('test')
    controller.pause()
    expect(controller.getState().paused).toBe(true)

    // Should not advance while paused
    const onFrame = vi.fn()
    controller.update(100, onFrame)
    expect(onFrame).not.toHaveBeenCalled()

    controller.resume()
    expect(controller.getState().paused).toBe(false)

    // Should advance now
    controller.update(100, onFrame)
    expect(onFrame).toHaveBeenCalled()
  })

  it('should handle speed multiplier', () => {
    const onFrame = vi.fn()
    controller.play('test', { speed: 2 })

    // At 2x speed, 50ms should advance a frame
    controller.update(50, onFrame)
    expect(onFrame).toHaveBeenCalledTimes(1)
  })

  it('should support ping-pong animation', () => {
    const pingPongAnim: Animation = {
      name: 'pingpong',
      frames: mockFrames,
      fps: 10,
      loop: true,
      pingPong: true,
    }
    controller.addAnimation(pingPongAnim)
    controller.play('pingpong')

    // Forward: 0 -> 1 -> 2 -> 3
    controller.update(300)
    expect(controller.getState().frameIndex).toBe(3)

    // Backward: 3 -> 2 -> 1
    controller.update(200)
    expect(controller.getState().frameIndex).toBe(1)
  })

  it('should fire frame events', () => {
    const onEvent = vi.fn()
    const eventAnim: Animation = {
      name: 'events',
      frames: [
        { frame: mockFrames[0]!.frame },
        { frame: mockFrames[1]!.frame, event: 'footstep' },
        { frame: mockFrames[2]!.frame },
      ],
      fps: 10,
      loop: false,
    }
    controller.addAnimation(eventAnim)
    controller.play('events', { onEvent })

    controller.update(100) // Frame 1 with event
    expect(onEvent).toHaveBeenCalledWith('footstep', 1)
  })

  it('should stop the animation', () => {
    controller.play('test')
    expect(controller.isPlaying()).toBe(true)

    controller.stop()
    expect(controller.isPlaying()).toBe(false)
    expect(controller.currentAnimation).toBeNull()
  })

  it('should go to a specific frame', () => {
    controller.play('test')
    controller.gotoFrame(2)
    expect(controller.getState().frameIndex).toBe(2)
  })

  it('should not go to invalid frame', () => {
    controller.play('test')
    controller.gotoFrame(10) // Out of bounds
    expect(controller.getState().frameIndex).toBe(0) // Unchanged
  })

  it('should remove animations', () => {
    controller.removeAnimation('test')
    expect(controller.getAnimation('test')).toBeUndefined()
  })

  it('should stop when current animation is removed', () => {
    controller.play('test')
    controller.removeAnimation('test')
    expect(controller.isPlaying()).toBe(false)
  })

  it('should get/set playback speed', () => {
    expect(controller.getSpeed()).toBe(1)
    controller.setSpeed(2)
    expect(controller.getSpeed()).toBe(2)
  })

  it('should calculate animation duration', () => {
    // 4 frames at 10fps = 400ms
    expect(controller.getAnimationDuration('test')).toBe(400)
  })

  it('should handle per-frame durations', () => {
    const customDurationAnim: Animation = {
      name: 'custom',
      frames: [
        { frame: mockFrames[0]!.frame, duration: 200 },
        { frame: mockFrames[1]!.frame, duration: 100 },
        { frame: mockFrames[2]!.frame }, // Uses fps default
      ],
      fps: 10, // 100ms default
      loop: false,
    }
    controller.addAnimation(customDurationAnim)

    // Total duration: 200 + 100 + 100 = 400ms
    expect(controller.getAnimationDuration('custom')).toBe(400)
  })

  it('should respect loop count', () => {
    const loopCountAnim: Animation = {
      name: 'loopcount',
      frames: mockFrames,
      fps: 10,
      loop: true,
      loopCount: 2,
    }
    controller.addAnimation(loopCountAnim)

    const onComplete = vi.fn()
    controller.play('loopcount', { onComplete })

    // First loop
    controller.update(400)
    expect(controller.getState().loopCount).toBe(1)

    // Second loop - should complete
    controller.update(400)
    expect(onComplete).toHaveBeenCalled()
    expect(controller.isPlaying()).toBe(false)
  })

  it('should continue playing same animation without restart', () => {
    controller.play('test')
    controller.update(100)
    expect(controller.getState().frameIndex).toBe(1)

    // Play same animation again without startFrame
    controller.play('test')
    expect(controller.getState().frameIndex).toBe(1) // Should continue
  })

  it('should restart animation with startFrame', () => {
    controller.play('test')
    controller.update(100)
    expect(controller.getState().frameIndex).toBe(1)

    // Play same animation with startFrame
    controller.play('test', { startFrame: 0 })
    expect(controller.getState().frameIndex).toBe(0) // Should restart
  })

  it('should dispose correctly', () => {
    controller.play('test')
    controller.dispose()

    expect(controller.getAnimationNames()).toHaveLength(0)
    expect(controller.currentAnimation).toBeNull()
  })
})
