#!/usr/bin/env python3
"""
Generate a C shim that provides emscripten_gl* functions by delegating
to the WIT-generated skia_gpu_gl_* imports.

This allows Skia's GrGLAssembleWebGLInterfaceAutogen.cpp to work unmodified —
it calls emscripten_glActiveTexture etc., and our shim routes those to the
WIT component model imports.

Also generates stub Emscripten WebGL headers so Skia's #include <webgl/webgl1.h>
compiles.

Usage:
    python3 scripts/generate-gl-shim.py

Outputs:
    src/zig/gl_shim/emscripten_gl_shim.h  — declares emscripten_gl* as externs
    src/zig/gl_shim/emscripten_gl_shim.c  — implements them via skia_gpu_gl_*
    src/zig/gl_shim/webgl/webgl1.h        — stub header
    src/zig/gl_shim/webgl/webgl1_ext.h    — stub header
    src/zig/gl_shim/webgl/webgl2.h        — stub header
    src/zig/gl_shim/webgl/webgl2_ext.h    — stub header
"""

import re
import os
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PKG_ROOT = SCRIPT_DIR.parent
SKIA_DIR = PKG_ROOT / "third_party" / "skia"
AUTOGEN = SKIA_DIR / "src" / "gpu" / "ganesh" / "gl" / "GrGLAssembleWebGLInterfaceAutogen.cpp"
SHIM_DIR = PKG_ROOT / "src" / "zig" / "gl_shim"
GENERATED_H = PKG_ROOT / "src" / "zig" / "bindings" / "generated" / "skia_gl.h"

# GL function signatures: name -> (C return type, [(C type, param name), ...])
# Generated from WebGL2 spec. Types use GL conventions.
GL_SIGS: dict[str, tuple[str, list[tuple[str, str]]]] = {
    "ActiveTexture": ("void", [("GLenum", "texture")]),
    "AttachShader": ("void", [("GLuint", "program"), ("GLuint", "shader")]),
    "BindAttribLocation": ("void", [("GLuint", "program"), ("GLuint", "index"), ("const GLchar*", "name")]),
    "BindBuffer": ("void", [("GLenum", "target"), ("GLuint", "buffer")]),
    "BindFramebuffer": ("void", [("GLenum", "target"), ("GLuint", "framebuffer")]),
    "BindRenderbuffer": ("void", [("GLenum", "target"), ("GLuint", "renderbuffer")]),
    "BindSampler": ("void", [("GLuint", "unit"), ("GLuint", "sampler")]),
    "BindTexture": ("void", [("GLenum", "target"), ("GLuint", "texture")]),
    "BindVertexArray": ("void", [("GLuint", "array")]),
    "BlendColor": ("void", [("GLfloat", "red"), ("GLfloat", "green"), ("GLfloat", "blue"), ("GLfloat", "alpha")]),
    "BlendEquation": ("void", [("GLenum", "mode")]),
    "BlendFunc": ("void", [("GLenum", "sfactor"), ("GLenum", "dfactor")]),
    "BlitFramebuffer": ("void", [("GLint", "srcX0"), ("GLint", "srcY0"), ("GLint", "srcX1"), ("GLint", "srcY1"), ("GLint", "dstX0"), ("GLint", "dstY0"), ("GLint", "dstX1"), ("GLint", "dstY1"), ("GLbitfield", "mask"), ("GLenum", "filter")]),
    "BufferData": ("void", [("GLenum", "target"), ("GLsizeiptr", "size"), ("const void*", "data"), ("GLenum", "usage")]),
    "BufferSubData": ("void", [("GLenum", "target"), ("GLintptr", "offset"), ("GLsizeiptr", "size"), ("const void*", "data")]),
    "CheckFramebufferStatus": ("GLenum", [("GLenum", "target")]),
    "Clear": ("void", [("GLbitfield", "mask")]),
    "ClearColor": ("void", [("GLfloat", "red"), ("GLfloat", "green"), ("GLfloat", "blue"), ("GLfloat", "alpha")]),
    "ClearStencil": ("void", [("GLint", "s")]),
    "ClientWaitSync": ("GLenum", [("GLsync", "sync"), ("GLbitfield", "flags"), ("GLuint64", "timeout")]),
    "ColorMask": ("void", [("GLboolean", "red"), ("GLboolean", "green"), ("GLboolean", "blue"), ("GLboolean", "alpha")]),
    "CompileShader": ("void", [("GLuint", "shader")]),
    "CompressedTexImage2D": ("void", [("GLenum", "target"), ("GLint", "level"), ("GLenum", "internalformat"), ("GLsizei", "width"), ("GLsizei", "height"), ("GLint", "border"), ("GLsizei", "imageSize"), ("const void*", "data")]),
    "CompressedTexSubImage2D": ("void", [("GLenum", "target"), ("GLint", "level"), ("GLint", "xoffset"), ("GLint", "yoffset"), ("GLsizei", "width"), ("GLsizei", "height"), ("GLenum", "format"), ("GLsizei", "imageSize"), ("const void*", "data")]),
    "CopyBufferSubData": ("void", [("GLenum", "readTarget"), ("GLenum", "writeTarget"), ("GLintptr", "readOffset"), ("GLintptr", "writeOffset"), ("GLsizeiptr", "size")]),
    "CopyTexSubImage2D": ("void", [("GLenum", "target"), ("GLint", "level"), ("GLint", "xoffset"), ("GLint", "yoffset"), ("GLint", "x"), ("GLint", "y"), ("GLsizei", "width"), ("GLsizei", "height")]),
    "CreateProgram": ("GLuint", []),
    "CreateShader": ("GLuint", [("GLenum", "type")]),
    "CullFace": ("void", [("GLenum", "mode")]),
    "DeleteBuffers": ("void", [("GLsizei", "n"), ("const GLuint*", "buffers")]),
    "DeleteFramebuffers": ("void", [("GLsizei", "n"), ("const GLuint*", "framebuffers")]),
    "DeleteProgram": ("void", [("GLuint", "program")]),
    "DeleteQueries": ("void", [("GLsizei", "n"), ("const GLuint*", "ids")]),
    "DeleteRenderbuffers": ("void", [("GLsizei", "n"), ("const GLuint*", "renderbuffers")]),
    "DeleteSamplers": ("void", [("GLsizei", "n"), ("const GLuint*", "samplers")]),
    "DeleteShader": ("void", [("GLuint", "shader")]),
    "DeleteSync": ("void", [("GLsync", "sync")]),
    "DeleteTextures": ("void", [("GLsizei", "n"), ("const GLuint*", "textures")]),
    "DeleteVertexArrays": ("void", [("GLsizei", "n"), ("const GLuint*", "arrays")]),
    "DepthMask": ("void", [("GLboolean", "flag")]),
    "Disable": ("void", [("GLenum", "cap")]),
    "DisableVertexAttribArray": ("void", [("GLuint", "index")]),
    "DrawArrays": ("void", [("GLenum", "mode"), ("GLint", "first"), ("GLsizei", "count")]),
    "DrawArraysInstanced": ("void", [("GLenum", "mode"), ("GLint", "first"), ("GLsizei", "count"), ("GLsizei", "instancecount")]),
    "DrawBuffers": ("void", [("GLsizei", "n"), ("const GLenum*", "bufs")]),
    "DrawElements": ("void", [("GLenum", "mode"), ("GLsizei", "count"), ("GLenum", "type"), ("const void*", "indices")]),
    "DrawElementsInstanced": ("void", [("GLenum", "mode"), ("GLsizei", "count"), ("GLenum", "type"), ("const void*", "indices"), ("GLsizei", "instancecount")]),
    "DrawRangeElements": ("void", [("GLenum", "mode"), ("GLuint", "start"), ("GLuint", "end"), ("GLsizei", "count"), ("GLenum", "type"), ("const void*", "indices")]),
    "Enable": ("void", [("GLenum", "cap")]),
    "EnableVertexAttribArray": ("void", [("GLuint", "index")]),
    "BeginQuery": ("void", [("GLenum", "target"), ("GLuint", "id")]),
    "EndQuery": ("void", [("GLenum", "target")]),
    "FenceSync": ("GLsync", [("GLenum", "condition"), ("GLbitfield", "flags")]),
    "Finish": ("void", []),
    "Flush": ("void", []),
    "FramebufferRenderbuffer": ("void", [("GLenum", "target"), ("GLenum", "attachment"), ("GLenum", "renderbuffertarget"), ("GLuint", "renderbuffer")]),
    "FramebufferTexture2D": ("void", [("GLenum", "target"), ("GLenum", "attachment"), ("GLenum", "textarget"), ("GLuint", "texture"), ("GLint", "level")]),
    "FrontFace": ("void", [("GLenum", "mode")]),
    "GenBuffers": ("void", [("GLsizei", "n"), ("GLuint*", "buffers")]),
    "GenFramebuffers": ("void", [("GLsizei", "n"), ("GLuint*", "framebuffers")]),
    "GenQueries": ("void", [("GLsizei", "n"), ("GLuint*", "ids")]),
    "GenRenderbuffers": ("void", [("GLsizei", "n"), ("GLuint*", "renderbuffers")]),
    "GenSamplers": ("void", [("GLsizei", "n"), ("GLuint*", "samplers")]),
    "GenTextures": ("void", [("GLsizei", "n"), ("GLuint*", "textures")]),
    "GenVertexArrays": ("void", [("GLsizei", "n"), ("GLuint*", "arrays")]),
    "GenerateMipmap": ("void", [("GLenum", "target")]),
    "GetBufferParameteriv": ("void", [("GLenum", "target"), ("GLenum", "pname"), ("GLint*", "params")]),
    "GetError": ("GLenum", []),
    "GetFloatv": ("void", [("GLenum", "pname"), ("GLfloat*", "data")]),
    "GetFramebufferAttachmentParameteriv": ("void", [("GLenum", "target"), ("GLenum", "attachment"), ("GLenum", "pname"), ("GLint*", "params")]),
    "GetIntegerv": ("void", [("GLenum", "pname"), ("GLint*", "data")]),
    "GetProgramInfoLog": ("void", [("GLuint", "program"), ("GLsizei", "bufSize"), ("GLsizei*", "length"), ("GLchar*", "infoLog")]),
    "GetProgramiv": ("void", [("GLuint", "program"), ("GLenum", "pname"), ("GLint*", "params")]),
    "GetQueryObjectuiv": ("void", [("GLuint", "id"), ("GLenum", "pname"), ("GLuint*", "params")]),
    "GetQueryiv": ("void", [("GLenum", "target"), ("GLenum", "pname"), ("GLint*", "params")]),
    "GetRenderbufferParameteriv": ("void", [("GLenum", "target"), ("GLenum", "pname"), ("GLint*", "params")]),
    "GetShaderInfoLog": ("void", [("GLuint", "shader"), ("GLsizei", "bufSize"), ("GLsizei*", "length"), ("GLchar*", "infoLog")]),
    "GetShaderPrecisionFormat": ("void", [("GLenum", "shadertype"), ("GLenum", "precisiontype"), ("GLint*", "range"), ("GLint*", "precision")]),
    "GetShaderiv": ("void", [("GLuint", "shader"), ("GLenum", "pname"), ("GLint*", "params")]),
    "GetString": ("const GLubyte*", [("GLenum", "name")]),
    "GetStringi": ("const GLubyte*", [("GLenum", "name"), ("GLuint", "index")]),
    "GetUniformLocation": ("GLint", [("GLuint", "program"), ("const GLchar*", "name")]),
    "InvalidateFramebuffer": ("void", [("GLenum", "target"), ("GLsizei", "numAttachments"), ("const GLenum*", "attachments")]),
    "InvalidateSubFramebuffer": ("void", [("GLenum", "target"), ("GLsizei", "numAttachments"), ("const GLenum*", "attachments"), ("GLint", "x"), ("GLint", "y"), ("GLsizei", "width"), ("GLsizei", "height")]),
    "IsSync": ("GLboolean", [("GLsync", "sync")]),
    "IsTexture": ("GLboolean", [("GLuint", "texture")]),
    "LineWidth": ("void", [("GLfloat", "width")]),
    "LinkProgram": ("void", [("GLuint", "program")]),
    "PixelStorei": ("void", [("GLenum", "pname"), ("GLint", "param")]),
    "ReadBuffer": ("void", [("GLenum", "src")]),
    "ReadPixels": ("void", [("GLint", "x"), ("GLint", "y"), ("GLsizei", "width"), ("GLsizei", "height"), ("GLenum", "format"), ("GLenum", "type"), ("void*", "pixels")]),
    "RenderbufferStorage": ("void", [("GLenum", "target"), ("GLenum", "internalformat"), ("GLsizei", "width"), ("GLsizei", "height")]),
    "RenderbufferStorageMultisample": ("void", [("GLenum", "target"), ("GLsizei", "samples"), ("GLenum", "internalformat"), ("GLsizei", "width"), ("GLsizei", "height")]),
    "SamplerParameterf": ("void", [("GLuint", "sampler"), ("GLenum", "pname"), ("GLfloat", "param")]),
    "SamplerParameteri": ("void", [("GLuint", "sampler"), ("GLenum", "pname"), ("GLint", "param")]),
    "SamplerParameteriv": ("void", [("GLuint", "sampler"), ("GLenum", "pname"), ("const GLint*", "param")]),
    "Scissor": ("void", [("GLint", "x"), ("GLint", "y"), ("GLsizei", "width"), ("GLsizei", "height")]),
    "ShaderSource": ("void", [("GLuint", "shader"), ("GLsizei", "count"), ("const GLchar* const*", "string"), ("const GLint*", "length")]),
    "StencilFunc": ("void", [("GLenum", "func"), ("GLint", "ref"), ("GLuint", "mask")]),
    "StencilFuncSeparate": ("void", [("GLenum", "face"), ("GLenum", "func"), ("GLint", "ref"), ("GLuint", "mask")]),
    "StencilMask": ("void", [("GLuint", "mask")]),
    "StencilMaskSeparate": ("void", [("GLenum", "face"), ("GLuint", "mask")]),
    "StencilOp": ("void", [("GLenum", "fail"), ("GLenum", "zfail"), ("GLenum", "zpass")]),
    "StencilOpSeparate": ("void", [("GLenum", "face"), ("GLenum", "sfail"), ("GLenum", "dpfail"), ("GLenum", "dppass")]),
    "TexImage2D": ("void", [("GLenum", "target"), ("GLint", "level"), ("GLint", "internalformat"), ("GLsizei", "width"), ("GLsizei", "height"), ("GLint", "border"), ("GLenum", "format"), ("GLenum", "type"), ("const void*", "pixels")]),
    "TexParameterf": ("void", [("GLenum", "target"), ("GLenum", "pname"), ("GLfloat", "param")]),
    "TexParameterfv": ("void", [("GLenum", "target"), ("GLenum", "pname"), ("const GLfloat*", "params")]),
    "TexParameteri": ("void", [("GLenum", "target"), ("GLenum", "pname"), ("GLint", "param")]),
    "TexParameteriv": ("void", [("GLenum", "target"), ("GLenum", "pname"), ("const GLint*", "params")]),
    "TexStorage2D": ("void", [("GLenum", "target"), ("GLsizei", "levels"), ("GLenum", "internalformat"), ("GLsizei", "width"), ("GLsizei", "height")]),
    "TexSubImage2D": ("void", [("GLenum", "target"), ("GLint", "level"), ("GLint", "xoffset"), ("GLint", "yoffset"), ("GLsizei", "width"), ("GLsizei", "height"), ("GLenum", "format"), ("GLenum", "type"), ("const void*", "pixels")]),
    "Uniform1f": ("void", [("GLint", "location"), ("GLfloat", "v0")]),
    "Uniform1fv": ("void", [("GLint", "location"), ("GLsizei", "count"), ("const GLfloat*", "value")]),
    "Uniform1i": ("void", [("GLint", "location"), ("GLint", "v0")]),
    "Uniform1iv": ("void", [("GLint", "location"), ("GLsizei", "count"), ("const GLint*", "value")]),
    "Uniform2f": ("void", [("GLint", "location"), ("GLfloat", "v0"), ("GLfloat", "v1")]),
    "Uniform2fv": ("void", [("GLint", "location"), ("GLsizei", "count"), ("const GLfloat*", "value")]),
    "Uniform2i": ("void", [("GLint", "location"), ("GLint", "v0"), ("GLint", "v1")]),
    "Uniform2iv": ("void", [("GLint", "location"), ("GLsizei", "count"), ("const GLint*", "value")]),
    "Uniform3f": ("void", [("GLint", "location"), ("GLfloat", "v0"), ("GLfloat", "v1"), ("GLfloat", "v2")]),
    "Uniform3fv": ("void", [("GLint", "location"), ("GLsizei", "count"), ("const GLfloat*", "value")]),
    "Uniform3i": ("void", [("GLint", "location"), ("GLint", "v0"), ("GLint", "v1"), ("GLint", "v2")]),
    "Uniform3iv": ("void", [("GLint", "location"), ("GLsizei", "count"), ("const GLint*", "value")]),
    "Uniform4f": ("void", [("GLint", "location"), ("GLfloat", "v0"), ("GLfloat", "v1"), ("GLfloat", "v2"), ("GLfloat", "v3")]),
    "Uniform4fv": ("void", [("GLint", "location"), ("GLsizei", "count"), ("const GLfloat*", "value")]),
    "Uniform4i": ("void", [("GLint", "location"), ("GLint", "v0"), ("GLint", "v1"), ("GLint", "v2"), ("GLint", "v3")]),
    "Uniform4iv": ("void", [("GLint", "location"), ("GLsizei", "count"), ("const GLint*", "value")]),
    "UniformMatrix2fv": ("void", [("GLint", "location"), ("GLsizei", "count"), ("GLboolean", "transpose"), ("const GLfloat*", "value")]),
    "UniformMatrix3fv": ("void", [("GLint", "location"), ("GLsizei", "count"), ("GLboolean", "transpose"), ("const GLfloat*", "value")]),
    "UniformMatrix4fv": ("void", [("GLint", "location"), ("GLsizei", "count"), ("GLboolean", "transpose"), ("const GLfloat*", "value")]),
    "UseProgram": ("void", [("GLuint", "program")]),
    "VertexAttrib1f": ("void", [("GLuint", "index"), ("GLfloat", "x")]),
    "VertexAttrib2fv": ("void", [("GLuint", "index"), ("const GLfloat*", "v")]),
    "VertexAttrib3fv": ("void", [("GLuint", "index"), ("const GLfloat*", "v")]),
    "VertexAttrib4fv": ("void", [("GLuint", "index"), ("const GLfloat*", "v")]),
    "VertexAttribDivisor": ("void", [("GLuint", "index"), ("GLuint", "divisor")]),
    "VertexAttribIPointer": ("void", [("GLuint", "index"), ("GLint", "size"), ("GLenum", "type"), ("GLsizei", "stride"), ("const void*", "pointer")]),
    "VertexAttribPointer": ("void", [("GLuint", "index"), ("GLint", "size"), ("GLenum", "type"), ("GLboolean", "normalized"), ("GLsizei", "stride"), ("const void*", "pointer")]),
    "Viewport": ("void", [("GLint", "x"), ("GLint", "y"), ("GLsizei", "width"), ("GLsizei", "height")]),
    "WaitSync": ("void", [("GLsync", "sync"), ("GLbitfield", "flags"), ("GLuint64", "timeout")]),
    # Multi-draw extensions — these have non-standard signatures
    "DrawArraysInstancedBaseInstance": ("void", [("GLenum", "mode"), ("GLint", "first"), ("GLsizei", "count"), ("GLsizei", "instancecount"), ("GLuint", "baseinstance")]),
    "DrawElementsInstancedBaseVertexBaseInstance": ("void", [("GLenum", "mode"), ("GLsizei", "count"), ("GLenum", "type"), ("const void*", "indices"), ("GLsizei", "instancecount"), ("GLint", "basevertex"), ("GLuint", "baseinstance")]),
    "MultiDrawArraysInstancedBaseInstance": ("void", [("GLenum", "mode"), ("const GLint*", "firsts"), ("const GLsizei*", "counts"), ("const GLsizei*", "instanceCounts"), ("const GLuint*", "baseInstances"), ("GLsizei", "drawcount")]),
    "MultiDrawElementsInstancedBaseVertexBaseInstance": ("void", [("GLenum", "mode"), ("const GLsizei*", "counts"), ("GLenum", "type"), ("const void* const*", "offsets"), ("const GLsizei*", "instanceCounts"), ("const GLint*", "baseVertices"), ("const GLuint*", "baseInstances"), ("GLsizei", "drawcount")]),
    "GetQueryObjecti64v": ("void", [("GLuint", "id"), ("GLenum", "pname"), ("GLint64*", "params")]),
    "GetQueryObjectui64v": ("void", [("GLuint", "id"), ("GLenum", "pname"), ("GLuint64*", "params")]),
    "QueryCounter": ("void", [("GLuint", "id"), ("GLenum", "target")]),
}


def main():
    os.makedirs(SHIM_DIR / "webgl", exist_ok=True)

    # Extract function names from autogenerated file
    with open(AUTOGEN) as f:
        content = f.read()

    procs = []
    for m in re.finditer(r'GET_PROC\((\w+)\)', content):
        procs.append(m.group(1))
    for m in re.finditer(r'GET_PROC_SUFFIX\((\w+),\s*(\w+)\)', content):
        procs.append(m.group(1))
    procs = sorted(set(p for p in procs if p != 'F'))

    # ── Generate stub Emscripten WebGL headers ──
    # These declare emscripten_gl* functions that Skia's autogenerated file expects
    header_content = """// Auto-generated stub Emscripten WebGL header for Zig/WASM build.
// Declares emscripten_gl* functions that Skia's GrGLAssembleWebGLInterfaceAutogen.cpp expects.
// Implementations are in emscripten_gl_shim.c, which delegates to WIT imports.

#pragma once

#include <stdint.h>
#include <stddef.h>

// GL type definitions (matching OpenGL ES 3.2)
typedef unsigned int GLenum;
typedef unsigned char GLboolean;
typedef unsigned int GLbitfield;
typedef void GLvoid;
typedef int GLint;
typedef unsigned int GLuint;
typedef int GLsizei;
typedef float GLfloat;
typedef float GLclampf;
typedef char GLchar;
typedef unsigned char GLubyte;
typedef intptr_t GLintptr;
typedef size_t GLsizeiptr;
typedef int64_t GLint64;
typedef uint64_t GLuint64;
typedef void* GLsync;

#define GL_FALSE 0
#define GL_TRUE 1

"""

    # Declare all emscripten_gl* functions
    for fn in procs:
        if fn not in GL_SIGS:
            header_content += f"// TODO: emscripten_gl{fn} — signature unknown\n"
            continue
        ret, params = GL_SIGS[fn]
        if params:
            param_str = ", ".join(f"{t} {n}" for t, n in params)
        else:
            param_str = "void"
        header_content += f"extern {ret} emscripten_gl{fn}({param_str});\n"

    # Write all 4 stub headers pointing to the same declarations
    for h in ["webgl1.h", "webgl1_ext.h", "webgl2.h", "webgl2_ext.h"]:
        with open(SHIM_DIR / "webgl" / h, 'w') as f:
            f.write(f'// Stub: #include <webgl/{h}>\n')
            f.write(f'#include "../emscripten_gl_shim.h"\n')

    with open(SHIM_DIR / "emscripten_gl_shim.h", 'w') as f:
        f.write(header_content)

    # ── Generate shim .c file ──
    # Each emscripten_gl* function delegates to skia_gpu_gl_* (WIT import)
    shim_c = """// Auto-generated GL shim: emscripten_gl* -> skia_gpu_gl_* (WIT imports)
// Generated by generate-gl-shim.py — do not edit

#include "emscripten_gl_shim.h"
#include "../bindings/generated/skia_gl.h"

"""

    for fn in procs:
        if fn not in GL_SIGS:
            continue
        ret, params = GL_SIGS[fn]
        if params:
            param_str = ", ".join(f"{t} {n}" for t, n in params)
            arg_str = ", ".join(f"({n})" for _, n in params)
        else:
            param_str = "void"
            arg_str = ""

        # Convert CamelCase GL name to snake_case for WIT import name
        wit_name = re.sub(r'([A-Z])', r'_\1', fn).lower().lstrip('_')

        call = f"skia_gpu_gl_{wit_name}({arg_str})"
        if ret == "void":
            shim_c += f"{ret} emscripten_gl{fn}({param_str}) {{ {call}; }}\n"
        else:
            shim_c += f"{ret} emscripten_gl{fn}({param_str}) {{ return ({ret}){call}; }}\n"

    with open(SHIM_DIR / "emscripten_gl_shim.c", 'w') as f:
        f.write(shim_c)

    print(f"Generated GL shim in {SHIM_DIR}/")
    print(f"  {len(procs)} emscripten_gl* functions")
    print(f"  Stub headers: webgl/webgl{{1,1_ext,2,2_ext}}.h")

    unmapped = [fn for fn in procs if fn not in GL_SIGS]
    if unmapped:
        print(f"\n  WARNING: {len(unmapped)} unmapped functions:")
        for fn in unmapped:
            print(f"    {fn}")


if __name__ == "__main__":
    main()
