// Stub GLES3/gl32.h for Zig/WASM build.
#pragma once
#include "../emscripten_gl_shim.h"

// GrGLMakeNativeInterface_webgl.cpp uses glGetString directly
#define glGetString emscripten_glGetString
