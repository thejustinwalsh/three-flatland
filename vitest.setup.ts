import { vi } from 'vitest'

// Mock WebGL context
const mockWebGLContext = {
  getExtension: vi.fn(() => null),
  getParameter: vi.fn(() => null),
  createShader: vi.fn(() => ({})),
  shaderSource: vi.fn(),
  compileShader: vi.fn(),
  getShaderParameter: vi.fn(() => true),
  createProgram: vi.fn(() => ({})),
  attachShader: vi.fn(),
  linkProgram: vi.fn(),
  getProgramParameter: vi.fn(() => true),
  useProgram: vi.fn(),
  createBuffer: vi.fn(() => ({})),
  bindBuffer: vi.fn(),
  bufferData: vi.fn(),
  createTexture: vi.fn(() => ({})),
  bindTexture: vi.fn(),
  texImage2D: vi.fn(),
  texParameteri: vi.fn(),
  viewport: vi.fn(),
  clearColor: vi.fn(),
  clear: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
  blendFunc: vi.fn(),
  drawArrays: vi.fn(),
  drawElements: vi.fn(),
  getUniformLocation: vi.fn(() => ({})),
  getAttribLocation: vi.fn(() => 0),
  enableVertexAttribArray: vi.fn(),
  vertexAttribPointer: vi.fn(),
  uniform1f: vi.fn(),
  uniform1i: vi.fn(),
  uniform2f: vi.fn(),
  uniform3f: vi.fn(),
  uniform4f: vi.fn(),
  uniformMatrix4fv: vi.fn(),
}

// Mock canvas getContext
vi.stubGlobal(
  'HTMLCanvasElement',
  class {
    getContext(type: string) {
      if (type === 'webgl' || type === 'webgl2') {
        return mockWebGLContext
      }
      return null
    }
    width = 800
    height = 600
  }
)

// Mock requestAnimationFrame
vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
  return setTimeout(() => callback(performance.now()), 16)
})

vi.stubGlobal('cancelAnimationFrame', (id: number) => {
  clearTimeout(id)
})

// Mock ResizeObserver
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  }
)

// Mock GPU (WebGPU)
vi.stubGlobal('navigator', {
  ...globalThis.navigator,
  gpu: {
    requestAdapter: vi.fn().mockResolvedValue({
      requestDevice: vi.fn().mockResolvedValue({
        createBuffer: vi.fn(),
        createTexture: vi.fn(),
        createShaderModule: vi.fn(),
        createPipelineLayout: vi.fn(),
        createRenderPipeline: vi.fn(),
        createBindGroup: vi.fn(),
        queue: {
          submit: vi.fn(),
          writeBuffer: vi.fn(),
          writeTexture: vi.fn(),
        },
      }),
    }),
  },
})
