import { useRef } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SkiaContextReady } from '../three/SkiaCanvas'
import { useSkiaCanvasContext } from './SkiaCanvas'

vi.mock('@react-three/fiber', () => ({
  extend: vi.fn(),
}))

vi.mock('../three/SkiaCanvas', () => ({
  SkiaCanvas: class MockSkiaCanvas {},
}))

const readyContext = { backend: 'wgpu' } as SkiaContextReady

function EagerContextProbe({ onContextCreate }: { onContextCreate: (ctx: SkiaContextReady) => void }) {
  const invokedRef = useRef(false)
  const [ctx, handleContextCreate] = useSkiaCanvasContext(onContextCreate)

  // Models R3F assigning `renderer` during the child reconciler commit. When
  // the global Skia context is already ready, the Three.js class calls this
  // callback before the wrapper's passive effect has mounted.
  if (!invokedRef.current) {
    invokedRef.current = true
    handleContextCreate(readyContext)
  }

  return <div data-testid="status">{ctx ? 'ready' : 'pending'}</div>
}

describe('useSkiaCanvasContext', () => {
  it('defers an eager context callback until the wrapper has mounted', async () => {
    const onContextCreate = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<EagerContextProbe onContextCreate={onContextCreate} />)

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('ready'))
    expect(onContextCreate).toHaveBeenCalledOnce()
    expect(onContextCreate).toHaveBeenCalledWith(readyContext)
    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining("Can't perform a React state update on a component that hasn't mounted yet")
    )

    consoleError.mockRestore()
  })
})
