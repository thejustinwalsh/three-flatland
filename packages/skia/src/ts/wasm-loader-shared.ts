/**
 * Shared WASM loader utilities for both GL and WebGPU variants.
 *
 * Provides env imports (Skia runtime stubs) and WASI stubs that are
 * identical across backends. Each variant loader imports these and
 * adds its own GPU-specific import module ("gl" or "wgpu").
 *
 * Both env and WASI use Proxy objects to dynamically handle any import
 * name — the WASM binary can add new imports across Skia versions
 * without requiring changes here.
 *
 * @internal
 */

// ── Env imports (Skia runtime) ──

/**
 * Create a Proxy-based env import object that stubs all Skia runtime
 * imports (logging, flattenable init, POSIX semaphores, etc.).
 * Returns 0 for everything by default.
 */
export function createEnvImports(): Record<string, WebAssembly.ImportValue> {
  return new Proxy({} as Record<string, WebAssembly.ImportValue>, {
    get: (_target, _name) => {
      return (..._args: unknown[]) => 0
    },
  })
}

// ── WASM instantiation with MIME fallback ──

/**
 * Instantiate a WASM module, falling back to ArrayBuffer when
 * `instantiateStreaming` fails due to incorrect MIME type.
 *
 * Vite's dev server (and some CDNs) may serve `.wasm` files from
 * `node_modules` or workspace packages without `application/wasm`,
 * causing `instantiateStreaming` to reject. The fallback fetches
 * the raw bytes and uses the synchronous `instantiate` path.
 */
export async function instantiateWasm(
  response: Response | Promise<Response>,
  imports: WebAssembly.Imports,
): Promise<WebAssembly.WebAssemblyInstantiatedSource> {
  const res = await response
  try {
    return await WebAssembly.instantiateStreaming(res, imports)
  } catch (e) {
    // Only fall back for MIME errors, not genuine WASM validation failures
    if (e instanceof TypeError || (e instanceof Error && /mime/i.test(e.message))) {
      const bytes = await res.arrayBuffer()
      return WebAssembly.instantiate(bytes, imports)
    }
    throw e
  }
}

// ── WASI stubs ──

/**
 * Create a Proxy-based WASI import object.
 *
 * Most calls return 0 (success). File descriptor operations that would
 * require real FS access return EBADF (8) or ENOENT (44).
 *
 * `environ_sizes_get` and `args_sizes_get` write 0 to both output
 * pointers so the caller sees "no environment / no args".
 *
 * The `memory` parameter is resolved lazily (after instantiation)
 * via a getter, since WASM memory isn't available until the instance
 * is created.
 */
export function createWasiImports(
  getMemory: () => WebAssembly.Memory,
): Record<string, WebAssembly.ImportValue> {
  const fdErrors: Record<string, number> = {
    fd_prestat_get: 8,      // EBADF
    fd_prestat_dir_name: 8, // EBADF
    fd_fdstat_get: 8,       // EBADF
    fd_filestat_get: 8,     // EBADF
    path_open: 44,          // ENOENT
    path_filestat_get: 44,  // ENOENT
  }

  return new Proxy({} as Record<string, WebAssembly.ImportValue>, {
    get: (_target, name) => {
      if (typeof name !== 'string') return undefined

      // FD/path operations that need specific error codes
      if (name in fdErrors) return () => fdErrors[name]

      // proc_exit — throw so we notice if it's called
      if (name === 'proc_exit') {
        return () => { throw new Error('WASI proc_exit called') }
      }

      // environ_sizes_get(count_ptr, size_ptr) — write 0 to both
      if (name === 'environ_sizes_get') {
        return (countPtr: number, sizePtr: number) => {
          const view = new DataView(getMemory().buffer)
          view.setUint32(countPtr, 0, true)
          view.setUint32(sizePtr, 0, true)
          return 0
        }
      }

      // args_sizes_get(argc_ptr, argv_buf_size_ptr) — write 0 to both
      if (name === 'args_sizes_get') {
        return (argcPtr: number, sizePtr: number) => {
          const view = new DataView(getMemory().buffer)
          view.setUint32(argcPtr, 0, true)
          view.setUint32(sizePtr, 0, true)
          return 0
        }
      }

      // Everything else returns 0 (success)
      return (..._args: unknown[]) => 0
    },
  })
}
