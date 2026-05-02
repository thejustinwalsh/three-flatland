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

      // clock_time_get(clock_id, precision, time_out_ptr) — write current ns to time_out_ptr
      if (name === 'clock_time_get') {
        return (_clockId: number, _precision: bigint, timeOutPtr: number) => {
          const view = new DataView(getMemory().buffer)
          const ns = BigInt(Date.now()) * 1_000_000n
          view.setBigUint64(timeOutPtr, ns, true)
          return 0
        }
      }

      // random_get(buf_ptr, len) — fill with crypto random bytes
      if (name === 'random_get') {
        return (bufPtr: number, len: number) => {
          const buf = new Uint8Array(getMemory().buffer, bufPtr, len)
          crypto.getRandomValues(buf)
          return 0
        }
      }

      // Everything else returns 0 (success)
      return (..._args: unknown[]) => 0
    },
  })
}
