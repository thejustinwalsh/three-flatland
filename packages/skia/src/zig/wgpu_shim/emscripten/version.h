// Stub emscripten/version.h — satisfies #include in Skia's Emscripten code paths.
// We're not actually using Emscripten, but we define __EMSCRIPTEN__ to select
// browser-compatible WebGPU code paths in Skia's Graphite Dawn backend.

#ifndef EMSCRIPTEN_VERSION_H_
#define EMSCRIPTEN_VERSION_H_

#define __EMSCRIPTEN_major__ 3
#define __EMSCRIPTEN_minor__ 1
#define __EMSCRIPTEN_tiny__ 70

#endif // EMSCRIPTEN_VERSION_H_
