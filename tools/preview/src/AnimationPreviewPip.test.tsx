// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

vi.mock('@stylexjs/stylex', () => ({
  create: (styles: unknown) => styles,
  keyframes: (frames: unknown) => frames,
  props: () => ({}),
}))

vi.mock('@three-flatland/design-system/tokens/vscode-theme.stylex', () => ({
  vscode: {
    bg: 'inherit',
    fg: 'inherit',
    focusRing: 'inherit',
    monoFontFamily: 'inherit',
  },
}))

vi.mock('@three-flatland/design-system/tokens/space.stylex', () => ({
  space: { xs: 2, sm: 4 },
}))

vi.mock('@three-flatland/design-system/tokens/radius.stylex', () => ({
  radius: { sm: 2 },
}))

vi.mock('@react-three/fiber/webgpu', () => ({
  extend: vi.fn(),
  useLoader: vi.fn(),
  useThree: vi.fn(),
}))

vi.mock('three-flatland/react', () => ({
  Sprite2D: class {},
  TextureLoader: class {},
}))

vi.mock('./PreviewCanvas', () => ({
  PreviewCanvas: () => <div data-testid="preview-canvas" />,
}))

import { AnimationPreviewPip, type AnimationPreviewPipProps } from './AnimationPreviewPip'

const hiddenProps: AnimationPreviewPipProps = {
  animationName: null,
  frames: [],
  rectsByName: {},
  atlasImageUri: null,
  atlasSize: null,
  playhead: 0,
  isPlaying: false,
  onTogglePlay: vi.fn(),
}

const visibleProps: AnimationPreviewPipProps = {
  ...hiddenProps,
  animationName: 'idle',
  frames: ['idle-0'],
  rectsByName: { 'idle-0': { id: 'idle-0', x: 0, y: 0, w: 16, h: 16 } },
  atlasImageUri: 'atlas.png',
  atlasSize: { w: 16, h: 16 },
}

describe('AnimationPreviewPip', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('can become visible and hidden without changing its hook order', async () => {
    await act(async () => root.render(<AnimationPreviewPip {...hiddenProps} />))
    expect(host.querySelector('[data-testid="preview-canvas"]')).toBeNull()

    await act(async () => root.render(<AnimationPreviewPip {...visibleProps} />))
    expect(host.querySelector('[data-testid="preview-canvas"]')).not.toBeNull()

    await act(async () => root.render(<AnimationPreviewPip {...hiddenProps} />))
    expect(host.querySelector('[data-testid="preview-canvas"]')).toBeNull()
  })
})
