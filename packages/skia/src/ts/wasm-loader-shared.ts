/**
 * Shared WASM loader utilities for both GL and WebGPU variants.
 *
 * Provides env imports (Skia runtime stubs) and WASI stubs that are
 * identical across backends. Each variant loader imports these and
 * adds its own GPU-specific import module ("gl" or "wgpu").
 *
 * @internal
 */

// ── Env imports (Skia runtime) ──

export function createEnvImports(): Record<string, WebAssembly.ImportValue> {
  return {
    // Skia logging — no-op in WASM
    _Z11SkLogVAList13SkLogPriorityPKcPv() {},
    // Flattenable init — no-op (we don't serialize/deserialize)
    _ZN13SkFlattenable18PrivateInitializer11InitEffectsEv() {},
    _ZN13SkFlattenable18PrivateInitializer16InitImageFiltersEv() {},
    // POSIX semaphores — no-op (single-threaded WASM)
    sem_init() { return 0 },
    sem_destroy() { return 0 },
    sem_post() { return 0 },
    sem_wait() { return 0 },
  }
}

// ── WASI stubs ──

export function createWasiImports(): Record<string, WebAssembly.ImportValue> {
  return {
    args_get() { return 0 },
    args_sizes_get(_argc_ptr: number, _argv_buf_size_ptr: number) { return 0 },
    clock_time_get(_id: number, _precision: bigint, _time_ptr: number) { return 0 },
    environ_get() { return 0 },
    environ_sizes_get(_count_ptr: number, _buf_size_ptr: number) { return 0 },
    fd_close() { return 0 },
    fd_prestat_get() { return 8 }, // EBADF
    fd_prestat_dir_name() { return 8 },
    fd_seek() { return 0 },
    fd_write(_fd: number, _iovs: number, _iovs_len: number, _nwritten: number) { return 0 },
    proc_exit() {},
  }
}
