// wasi_stub.c — flatland-patch
// Zig's linkLibC() provides crt1-command.o which already exports _start.
// We only need stubs for symbols that wasi-libc may not export.
//
// __cxa_atexit: C++ static destructors call this. If the wasi-libc build
// bundled by Zig does not provide it, linking fails. Provide a no-op that
// satisfies the linker; static destructors are never called in a WASI reactor.
int __cxa_atexit(void (*fn)(void *), void *arg, void *dso) {
    (void)fn; (void)arg; (void)dso;
    return 0;
}
