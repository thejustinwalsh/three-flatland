// Tiny wrapper over `uwasi` that bundles only the WASI features our
// basisu wasm modules actually reach: clock, environ, random, proc.
// Everything else (fd_*, path_*, args_*) defaults to ENOSYS, which is
// what we want — basisu's printf/file paths are reachable in the
// dependency graph but never exercise meaningful behavior at runtime,
// and an ENOSYS return propagates as a benign error through their
// error-checking branches.
//
// Why uwasi instead of a hand-rolled shim:
//   - Maintained, tested implementations of clock_time_get (uses
//     performance.now() for monotonic, which is more honest than
//     Date.now()) and random_get.
//   - WASIProcExit is a structured exception that callers can catch
//     and inspect; replaces our ad-hoc `throw new Error(...)`.
//   - Per-feature opt-in keeps the shim minimal — only ~3 KB of JS
//     ships even with all four features enabled, comparable to the
//     hand-rolled shim it replaced.

import { WASI, useClock, useEnviron, useRandom, useProc, type WASIFeatureProvider } from 'uwasi'

export { WASIProcExit } from 'uwasi'

// WASI errno values used in the no-FS feature below. wasi-libc's stdio
// initializer scans preopens via fd_prestat_get and STOPS when it gets
// EBADF; returning ENOSYS (uwasi's default) is read as a hard error and
// triggers proc_exit(71) before any of our fl_* exports run. Numbers
// match wasi-libc/include/wasi/api.h `__WASI_ERRNO_*`.
const WASI_ERRNO_BADF = 8
const WASI_ERRNO_NOENT = 44

/**
 * Feature that returns appropriate "no filesystem" errno values for
 * the fd_/path_ surface basisu's libc can reach. uwasi has full FS
 * features (`useFS`/`useMemoryFS`) but we don't want any actual file
 * I/O; we just need wasi-libc's init to finish gracefully. Mirrors
 * the error codes the previous hand-rolled shim returned.
 */
const useNoFs: WASIFeatureProvider = () => ({
  // EBADF: caller treats this as "no more preopens" / "fd not open".
  // wasi-libc's preopen scan stops here; basisu's stdio checks bail
  // cleanly without trying to abort.
  fd_prestat_get: () => WASI_ERRNO_BADF,
  fd_prestat_dir_name: () => WASI_ERRNO_BADF,
  fd_fdstat_get: () => WASI_ERRNO_BADF,
  fd_fdstat_set_flags: () => WASI_ERRNO_BADF,
  fd_filestat_get: () => WASI_ERRNO_BADF,
  fd_close: () => WASI_ERRNO_BADF,
  fd_seek: () => WASI_ERRNO_BADF,
  fd_read: () => WASI_ERRNO_BADF,
  // fd_write is reached by the printf chain. Returning 0 (ESUCCESS)
  // and pretending we wrote everything keeps libc's buffered I/O
  // happy without actually emitting any bytes — there's no console
  // in the WASI sandbox to receive them anyway.
  fd_write: (_fd: number, _iovs: number, _iovsLen: number, nwrittenPtr: number) => {
    // We can't easily compute total bytes without a memory view;
    // claiming 0 written is fine — basisu doesn't act on the count,
    // only on the success/error code.
    return 0
  },
  // ENOENT: caller treats this as "path not found".
  path_open: () => WASI_ERRNO_NOENT,
  path_filestat_get: () => WASI_ERRNO_NOENT,
})

/**
 * Build a `wasi_snapshot_preview1` import object backed by uwasi.
 * `getMemory` is invoked lazily after instantiation; uwasi expects
 * the same contract for its `view()` accessor under the hood.
 *
 * The returned object is paired with a `wasi.initialize(instance)`
 * call that runs the wasm's `_initialize` (reactor mode). Use the
 * `instantiateWithWasi` helper below to keep the two in lockstep.
 */
function makeWasi(): WASI {
  return new WASI({
    // env / args default to empty; useEnviron / useArgs (if added)
    // will read 0/0 sizes which is what basisu sees.
    features: [useClock, useEnviron, useRandom(), useProc, useNoFs],
  })
}

/**
 * Instantiate a wasm reactor module with uwasi-backed WASI imports
 * and run its `_initialize` automatically. Returns the instantiated
 * exports so the caller can immediately invoke any `fl_*` setup.
 */
export async function instantiateWithWasi<T>(
  bytes: ArrayBuffer,
): Promise<T> {
  const wasi = makeWasi()
  const result = await (WebAssembly.instantiate as (
    bytes: BufferSource,
    imports: WebAssembly.Imports,
  ) => Promise<WebAssembly.WebAssemblyInstantiatedSource>)(bytes, {
    wasi_snapshot_preview1: wasi.wasiImport,
  })
  // Reactor mode: uwasi runs _initialize for us via initialize(),
  // which also guards against double-init.
  wasi.initialize(result.instance)
  return result.instance.exports as unknown as T
}
