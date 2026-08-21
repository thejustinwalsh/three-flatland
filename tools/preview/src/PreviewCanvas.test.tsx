// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const canvasState = vi.hoisted(() => ({ rendererFails: false }))

vi.mock('@stylexjs/stylex', () => ({
  create: (styles: unknown) => styles,
  props: () => ({}),
}))

vi.mock('@three-flatland/design-system/tokens/vscode-theme.stylex', () => ({
  vscode: { descriptionFg: 'inherit', fontFamily: 'inherit', fontSize: 'inherit' },
}))

vi.mock('@three-flatland/design-system/tokens/space.stylex', () => ({
  space: { lg: 16 },
}))

vi.mock('@react-three/fiber/webgpu', () => ({
  Canvas: ({ fallback }: { fallback?: ReactNode }) =>
    canvasState.rendererFails ? <div data-testid="renderer-failure">{fallback}</div> : <canvas>{fallback}</canvas>,
}))

import { PreviewCanvas } from './PreviewCanvas'

describe('PreviewCanvas', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    canvasState.rendererFails = false
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('keeps healthy canvas fallback content hidden from assistive technology', async () => {
    await act(async () => root.render(<PreviewCanvas />))

    const fallback = host.getElementsByTagName('canvas')[0]?.firstElementChild
    expect(fallback?.textContent).toBe('WebGPU preview unavailable.')
    expect(fallback?.getAttribute('aria-hidden')).toBe('true')
    expect(fallback?.getAttribute('role')).toBeNull()
  })

  it('surfaces a status without unmounting when renderer initialization fails', async () => {
    canvasState.rendererFails = true
    await act(async () => root.render(<PreviewCanvas />))

    const failure = host.querySelector('[data-testid="renderer-failure"]')
    const fallback = failure?.firstElementChild
    expect(fallback?.textContent).toBe('WebGPU preview unavailable.')
    expect(fallback?.getAttribute('role')).toBe('status')
    expect(fallback?.getAttribute('aria-hidden')).toBeNull()
  })
})
