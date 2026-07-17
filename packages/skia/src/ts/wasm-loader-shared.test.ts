import { describe, it, expect, vi, afterEach } from 'vitest'
import { instantiateWasm } from './wasm-loader-shared'

/**
 * A minimal stand-in for the browser `Response` that enforces the real
 * single-read body semantics: reading the body twice throws
 * "body stream already read", and `clone()` yields an independent body.
 *
 * happy-dom / node `Response` implementations are not guaranteed to enforce
 * this, so we model it explicitly to make the regression deterministic.
 */
function makeFakeResponse(bytes: ArrayBuffer): Response {
  const make = (): Response => {
    let consumed = false
    return {
      get bodyUsed() {
        return consumed
      },
      async arrayBuffer() {
        if (consumed) {
          throw new TypeError("Failed to execute 'arrayBuffer' on 'Response': body stream already read")
        }
        consumed = true
        return bytes
      },
      clone() {
        if (consumed) {
          throw new TypeError("Failed to execute 'clone' on 'Response': Response body is already used")
        }
        return make()
      },
    } as unknown as Response
  }
  return make()
}

// Valid WASM magic + version header — enough for the stubs to accept.
const WASM_HEADER = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]).buffer

describe('instantiateWasm', () => {
  const realStreaming = WebAssembly.instantiateStreaming
  const realInstantiate = WebAssembly.instantiate

  afterEach(() => {
    WebAssembly.instantiateStreaming = realStreaming
    WebAssembly.instantiate = realInstantiate
  })

  it('falls back to arrayBuffer when streaming rejects on a bad MIME type, without double-reading the body', async () => {
    const fakeInstance = {} as WebAssembly.Instance

    // Model real browsers: instantiateStreaming consumes the body it is given,
    // then rejects with a TypeError when the response MIME isn't application/wasm.
    WebAssembly.instantiateStreaming = vi.fn(async (src: Response | PromiseLike<Response>) => {
      const res = await src
      await res.arrayBuffer() // streaming drains the body before it can reject
      throw new TypeError("Incorrect response MIME type. Expected 'application/wasm'.")
    }) as unknown as typeof WebAssembly.instantiateStreaming

    WebAssembly.instantiate = vi.fn(async () => ({
      module: {} as WebAssembly.Module,
      instance: fakeInstance,
    })) as unknown as typeof WebAssembly.instantiate

    const response = makeFakeResponse(WASM_HEADER)
    const result = await instantiateWasm(response, {})

    expect(result.instance).toBe(fakeInstance)
    expect(WebAssembly.instantiate).toHaveBeenCalledOnce()
  })

  it('uses the streaming path when it succeeds', async () => {
    const fakeInstance = {} as WebAssembly.Instance
    WebAssembly.instantiateStreaming = vi.fn(async () => ({
      module: {} as WebAssembly.Module,
      instance: fakeInstance,
    })) as unknown as typeof WebAssembly.instantiateStreaming
    WebAssembly.instantiate = vi.fn() as unknown as typeof WebAssembly.instantiate

    const result = await instantiateWasm(makeFakeResponse(WASM_HEADER), {})

    expect(result.instance).toBe(fakeInstance)
    expect(WebAssembly.instantiate).not.toHaveBeenCalled()
  })
})
