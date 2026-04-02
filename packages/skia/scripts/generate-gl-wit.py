#!/usr/bin/env python3
"""
Generate WIT interface declarations and JS implementation templates for
the GL functions Skia's WebGL backend needs.

Parses GrGLAssembleWebGLInterfaceAutogen.cpp to extract function names,
then maps them to WebGL API signatures.

Usage:
    python3 scripts/generate-gl-wit.py

Outputs:
    wit/gl.wit         — WIT interface with GL function imports
    src/ts/gl-shim.ts  — JS implementation template for jco imports
"""

import os
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PKG_ROOT = SCRIPT_DIR.parent
SKIA_DIR = PKG_ROOT / "third_party" / "skia"
AUTOGEN = SKIA_DIR / "src" / "gpu" / "ganesh" / "gl" / "GrGLAssembleWebGLInterfaceAutogen.cpp"

# ── GL function signature database ──
# Maps GL function name to (return_type, [(param_name, wit_type), ...])
# These match the WebGL 2.0 spec signatures.

GL_SIGS = {
    # Texture
    "ActiveTexture": ("void", [("texture", "u32")]),
    "BindTexture": ("void", [("target", "u32"), ("texture", "u32")]),
    "DeleteTextures": ("void", [("textures", "list<u32>")]),
    "GenTextures": ("void", [("n", "s32"), ("textures-out", "u32")]),  # special: returns via pointer
    "GenerateMipmap": ("void", [("target", "u32")]),
    "IsTexture": ("bool", [("texture", "u32")]),
    "TexImage2D": ("void", [("target", "u32"), ("level", "s32"), ("internal-format", "s32"), ("width", "s32"), ("height", "s32"), ("border", "s32"), ("format", "u32"), ("type", "u32"), ("pixels", "u32")]),
    "TexSubImage2D": ("void", [("target", "u32"), ("level", "s32"), ("xoffset", "s32"), ("yoffset", "s32"), ("width", "s32"), ("height", "s32"), ("format", "u32"), ("type", "u32"), ("pixels", "u32")]),
    "TexParameteri": ("void", [("target", "u32"), ("pname", "u32"), ("param", "s32")]),
    "TexParameterf": ("void", [("target", "u32"), ("pname", "u32"), ("param", "f32")]),
    "TexParameteriv": ("void", [("target", "u32"), ("pname", "u32"), ("params", "u32")]),
    "TexParameterfv": ("void", [("target", "u32"), ("pname", "u32"), ("params", "u32")]),
    "CompressedTexImage2D": ("void", [("target", "u32"), ("level", "s32"), ("internal-format", "u32"), ("width", "s32"), ("height", "s32"), ("border", "s32"), ("image-size", "s32"), ("data", "u32")]),
    "CompressedTexSubImage2D": ("void", [("target", "u32"), ("level", "s32"), ("xoffset", "s32"), ("yoffset", "s32"), ("width", "s32"), ("height", "s32"), ("format", "u32"), ("image-size", "s32"), ("data", "u32")]),
    "CopyTexSubImage2D": ("void", [("target", "u32"), ("level", "s32"), ("xoffset", "s32"), ("yoffset", "s32"), ("x", "s32"), ("y", "s32"), ("width", "s32"), ("height", "s32")]),
    "TexStorage2D": ("void", [("target", "u32"), ("levels", "s32"), ("internal-format", "u32"), ("width", "s32"), ("height", "s32")]),
    "PixelStorei": ("void", [("pname", "u32"), ("param", "s32")]),

    # Framebuffer
    "BindFramebuffer": ("void", [("target", "u32"), ("framebuffer", "u32")]),
    "BindRenderbuffer": ("void", [("target", "u32"), ("renderbuffer", "u32")]),
    "CheckFramebufferStatus": ("u32", [("target", "u32")]),
    "DeleteFramebuffers": ("void", [("framebuffers", "list<u32>")]),
    "DeleteRenderbuffers": ("void", [("renderbuffers", "list<u32>")]),
    "FramebufferRenderbuffer": ("void", [("target", "u32"), ("attachment", "u32"), ("renderbuffer-target", "u32"), ("renderbuffer", "u32")]),
    "FramebufferTexture2D": ("void", [("target", "u32"), ("attachment", "u32"), ("tex-target", "u32"), ("texture", "u32"), ("level", "s32")]),
    "GenFramebuffers": ("void", [("n", "s32"), ("framebuffers-out", "u32")]),
    "GenRenderbuffers": ("void", [("n", "s32"), ("renderbuffers-out", "u32")]),
    "GetFramebufferAttachmentParameteriv": ("void", [("target", "u32"), ("attachment", "u32"), ("pname", "u32"), ("params-out", "u32")]),
    "GetRenderbufferParameteriv": ("void", [("target", "u32"), ("pname", "u32"), ("params-out", "u32")]),
    "RenderbufferStorage": ("void", [("target", "u32"), ("internal-format", "u32"), ("width", "s32"), ("height", "s32")]),
    "RenderbufferStorageMultisample": ("void", [("target", "u32"), ("samples", "s32"), ("internal-format", "u32"), ("width", "s32"), ("height", "s32")]),
    "BlitFramebuffer": ("void", [("src-x0", "s32"), ("src-y0", "s32"), ("src-x1", "s32"), ("src-y1", "s32"), ("dst-x0", "s32"), ("dst-y0", "s32"), ("dst-x1", "s32"), ("dst-y1", "s32"), ("mask", "u32"), ("filter", "u32")]),
    "InvalidateFramebuffer": ("void", [("target", "u32"), ("num-attachments", "s32"), ("attachments", "u32")]),
    "InvalidateSubFramebuffer": ("void", [("target", "u32"), ("num-attachments", "s32"), ("attachments", "u32"), ("x", "s32"), ("y", "s32"), ("width", "s32"), ("height", "s32")]),
    "ReadBuffer": ("void", [("src", "u32")]),
    "ReadPixels": ("void", [("x", "s32"), ("y", "s32"), ("width", "s32"), ("height", "s32"), ("format", "u32"), ("type", "u32"), ("pixels", "u32")]),
    "DrawBuffers": ("void", [("n", "s32"), ("bufs", "u32")]),

    # Shader/Program
    "AttachShader": ("void", [("program", "u32"), ("shader", "u32")]),
    "BindAttribLocation": ("void", [("program", "u32"), ("index", "u32"), ("name", "string")]),
    "CompileShader": ("void", [("shader", "u32")]),
    "CreateProgram": ("u32", []),
    "CreateShader": ("u32", [("type", "u32")]),
    "DeleteProgram": ("void", [("program", "u32")]),
    "DeleteShader": ("void", [("shader", "u32")]),
    "GetProgramInfoLog": ("void", [("program", "u32"), ("buf-size", "s32"), ("length-out", "u32"), ("info-log-out", "u32")]),
    "GetProgramiv": ("void", [("program", "u32"), ("pname", "u32"), ("params-out", "u32")]),
    "GetShaderInfoLog": ("void", [("shader", "u32"), ("buf-size", "s32"), ("length-out", "u32"), ("info-log-out", "u32")]),
    "GetShaderPrecisionFormat": ("void", [("shader-type", "u32"), ("precision-type", "u32"), ("range-out", "u32"), ("precision-out", "u32")]),
    "GetShaderiv": ("void", [("shader", "u32"), ("pname", "u32"), ("params-out", "u32")]),
    "GetUniformLocation": ("s32", [("program", "u32"), ("name", "string")]),
    "LinkProgram": ("void", [("program", "u32")]),
    "ShaderSource": ("void", [("shader", "u32"), ("count", "s32"), ("strings", "u32"), ("lengths", "u32")]),
    "UseProgram": ("void", [("program", "u32")]),

    # Uniforms
    "Uniform1f": ("void", [("location", "s32"), ("v0", "f32")]),
    "Uniform1fv": ("void", [("location", "s32"), ("count", "s32"), ("value", "u32")]),
    "Uniform1i": ("void", [("location", "s32"), ("v0", "s32")]),
    "Uniform1iv": ("void", [("location", "s32"), ("count", "s32"), ("value", "u32")]),
    "Uniform2f": ("void", [("location", "s32"), ("v0", "f32"), ("v1", "f32")]),
    "Uniform2fv": ("void", [("location", "s32"), ("count", "s32"), ("value", "u32")]),
    "Uniform2i": ("void", [("location", "s32"), ("v0", "s32"), ("v1", "s32")]),
    "Uniform2iv": ("void", [("location", "s32"), ("count", "s32"), ("value", "u32")]),
    "Uniform3f": ("void", [("location", "s32"), ("v0", "f32"), ("v1", "f32"), ("v2", "f32")]),
    "Uniform3fv": ("void", [("location", "s32"), ("count", "s32"), ("value", "u32")]),
    "Uniform3i": ("void", [("location", "s32"), ("v0", "s32"), ("v1", "s32"), ("v2", "s32")]),
    "Uniform3iv": ("void", [("location", "s32"), ("count", "s32"), ("value", "u32")]),
    "Uniform4f": ("void", [("location", "s32"), ("v0", "f32"), ("v1", "f32"), ("v2", "f32"), ("v3", "f32")]),
    "Uniform4fv": ("void", [("location", "s32"), ("count", "s32"), ("value", "u32")]),
    "Uniform4i": ("void", [("location", "s32"), ("v0", "s32"), ("v1", "s32"), ("v2", "s32"), ("v3", "s32")]),
    "Uniform4iv": ("void", [("location", "s32"), ("count", "s32"), ("value", "u32")]),
    "UniformMatrix2fv": ("void", [("location", "s32"), ("count", "s32"), ("transpose", "bool"), ("value", "u32")]),
    "UniformMatrix3fv": ("void", [("location", "s32"), ("count", "s32"), ("transpose", "bool"), ("value", "u32")]),
    "UniformMatrix4fv": ("void", [("location", "s32"), ("count", "s32"), ("transpose", "bool"), ("value", "u32")]),

    # Vertex
    "BindVertexArray": ("void", [("array", "u32")]),
    "DeleteVertexArrays": ("void", [("arrays", "list<u32>")]),
    "DisableVertexAttribArray": ("void", [("index", "u32")]),
    "DrawArrays": ("void", [("mode", "u32"), ("first", "s32"), ("count", "s32")]),
    "DrawArraysInstanced": ("void", [("mode", "u32"), ("first", "s32"), ("count", "s32"), ("instance-count", "s32")]),
    "DrawElements": ("void", [("mode", "u32"), ("count", "s32"), ("type", "u32"), ("offset", "u32")]),
    "DrawElementsInstanced": ("void", [("mode", "u32"), ("count", "s32"), ("type", "u32"), ("offset", "u32"), ("instance-count", "s32")]),
    "DrawRangeElements": ("void", [("mode", "u32"), ("start", "u32"), ("end", "u32"), ("count", "s32"), ("type", "u32"), ("offset", "u32")]),
    "EnableVertexAttribArray": ("void", [("index", "u32")]),
    "GenVertexArrays": ("void", [("n", "s32"), ("arrays-out", "u32")]),
    "VertexAttrib1f": ("void", [("index", "u32"), ("x", "f32")]),
    "VertexAttrib2fv": ("void", [("index", "u32"), ("v", "u32")]),
    "VertexAttrib3fv": ("void", [("index", "u32"), ("v", "u32")]),
    "VertexAttrib4fv": ("void", [("index", "u32"), ("v", "u32")]),
    "VertexAttribDivisor": ("void", [("index", "u32"), ("divisor", "u32")]),
    "VertexAttribIPointer": ("void", [("index", "u32"), ("size", "s32"), ("type", "u32"), ("stride", "s32"), ("offset", "u32")]),
    "VertexAttribPointer": ("void", [("index", "u32"), ("size", "s32"), ("type", "u32"), ("normalized", "bool"), ("stride", "s32"), ("offset", "u32")]),

    # Buffer
    "BindBuffer": ("void", [("target", "u32"), ("buffer", "u32")]),
    "BufferData": ("void", [("target", "u32"), ("size", "u32"), ("data", "u32"), ("usage", "u32")]),
    "BufferSubData": ("void", [("target", "u32"), ("offset", "u32"), ("size", "u32"), ("data", "u32")]),
    "CopyBufferSubData": ("void", [("read-target", "u32"), ("write-target", "u32"), ("read-offset", "u32"), ("write-offset", "u32"), ("size", "u32")]),
    "DeleteBuffers": ("void", [("buffers", "list<u32>")]),
    "GenBuffers": ("void", [("n", "s32"), ("buffers-out", "u32")]),
    "GetBufferParameteriv": ("void", [("target", "u32"), ("pname", "u32"), ("params-out", "u32")]),

    # State
    "BlendColor": ("void", [("red", "f32"), ("green", "f32"), ("blue", "f32"), ("alpha", "f32")]),
    "BlendEquation": ("void", [("mode", "u32")]),
    "BlendFunc": ("void", [("sfactor", "u32"), ("dfactor", "u32")]),
    "Clear": ("void", [("mask", "u32")]),
    "ClearColor": ("void", [("red", "f32"), ("green", "f32"), ("blue", "f32"), ("alpha", "f32")]),
    "ClearStencil": ("void", [("s", "s32")]),
    "ColorMask": ("void", [("red", "bool"), ("green", "bool"), ("blue", "bool"), ("alpha", "bool")]),
    "CullFace": ("void", [("mode", "u32")]),
    "DepthMask": ("void", [("flag", "bool")]),
    "Disable": ("void", [("cap", "u32")]),
    "Enable": ("void", [("cap", "u32")]),
    "Finish": ("void", []),
    "Flush": ("void", []),
    "FrontFace": ("void", [("mode", "u32")]),
    "GetError": ("u32", []),
    "GetFloatv": ("void", [("pname", "u32"), ("data-out", "u32")]),
    "GetIntegerv": ("void", [("pname", "u32"), ("data-out", "u32")]),
    "GetString": ("u32", [("name", "u32")]),
    "GetStringi": ("u32", [("name", "u32"), ("index", "u32")]),
    "LineWidth": ("void", [("width", "f32")]),
    "Scissor": ("void", [("x", "s32"), ("y", "s32"), ("width", "s32"), ("height", "s32")]),
    "StencilFunc": ("void", [("func", "u32"), ("ref", "s32"), ("mask", "u32")]),
    "StencilFuncSeparate": ("void", [("face", "u32"), ("func", "u32"), ("ref", "s32"), ("mask", "u32")]),
    "StencilMask": ("void", [("mask", "u32")]),
    "StencilMaskSeparate": ("void", [("face", "u32"), ("mask", "u32")]),
    "StencilOp": ("void", [("fail", "u32"), ("zfail", "u32"), ("zpass", "u32")]),
    "StencilOpSeparate": ("void", [("face", "u32"), ("sfail", "u32"), ("dpfail", "u32"), ("dppass", "u32")]),
    "Viewport": ("void", [("x", "s32"), ("y", "s32"), ("width", "s32"), ("height", "s32")]),

    # Sampler (WebGL 2)
    "BindSampler": ("void", [("unit", "u32"), ("sampler", "u32")]),
    "DeleteSamplers": ("void", [("samplers", "list<u32>")]),
    "GenSamplers": ("void", [("n", "s32"), ("samplers-out", "u32")]),
    "SamplerParameterf": ("void", [("sampler", "u32"), ("pname", "u32"), ("param", "f32")]),
    "SamplerParameteri": ("void", [("sampler", "u32"), ("pname", "u32"), ("param", "s32")]),
    "SamplerParameteriv": ("void", [("sampler", "u32"), ("pname", "u32"), ("params", "u32")]),

    # Query (WebGL 2)
    "BeginQuery": ("void", [("target", "u32"), ("id", "u32")]),
    "DeleteQueries": ("void", [("queries", "list<u32>")]),
    "EndQuery": ("void", [("target", "u32")]),
    "GenQueries": ("void", [("n", "s32"), ("ids-out", "u32")]),
    "GetQueryObjectuiv": ("void", [("id", "u32"), ("pname", "u32"), ("params-out", "u32")]),
    "GetQueryObjectui64v": ("void", [("id", "u32"), ("pname", "u32"), ("params-out", "u32")]),
    "GetQueryObjecti64v": ("void", [("id", "u32"), ("pname", "u32"), ("params-out", "u32")]),
    "GetQueryiv": ("void", [("target", "u32"), ("pname", "u32"), ("params-out", "u32")]),
    "QueryCounter": ("void", [("id", "u32"), ("target", "u32")]),

    # Sync (WebGL 2)
    "ClientWaitSync": ("u32", [("sync", "u32"), ("flags", "u32"), ("timeout", "u64")]),
    "DeleteSync": ("void", [("sync", "u32")]),
    "FenceSync": ("u32", [("condition", "u32"), ("flags", "u32")]),
    "IsSync": ("bool", [("sync", "u32")]),
    "WaitSync": ("void", [("sync", "u32"), ("flags", "u32"), ("timeout", "u64")]),

    # Multi-draw (extensions)
    "DrawArraysInstancedBaseInstance": ("void", [("mode", "u32"), ("first", "s32"), ("count", "s32"), ("instance-count", "s32"), ("base-instance", "u32")]),
    "DrawElementsInstancedBaseVertexBaseInstance": ("void", [("mode", "u32"), ("count", "s32"), ("type", "u32"), ("offset", "u32"), ("instance-count", "s32"), ("base-vertex", "s32"), ("base-instance", "u32")]),
    "MultiDrawArraysInstancedBaseInstance": ("void", [("mode", "u32"), ("firsts", "u32"), ("counts", "u32"), ("instance-counts", "u32"), ("base-instances", "u32"), ("drawcount", "s32")]),
    "MultiDrawElementsInstancedBaseVertexBaseInstance": ("void", [("mode", "u32"), ("counts", "u32"), ("type", "u32"), ("offsets", "u32"), ("instance-counts", "u32"), ("base-vertices", "u32"), ("base-instances", "u32"), ("drawcount", "s32")]),
}


def to_wit_name(gl_name: str) -> str:
    """Convert GL function name to WIT kebab-case: ActiveTexture -> active-texture"""
    result = re.sub(r'([A-Z])', r'-\1', gl_name).lower().lstrip('-')
    # Fix double dashes from consecutive caps like "2D"
    result = re.sub(r'-(\d)', r'\1', result)
    return result


WIT_KEYWORDS = {"type", "use", "world", "interface", "resource", "func", "enum",
                 "record", "variant", "flags", "import", "export", "package",
                 "include", "self", "static", "constructor", "result", "option",
                 "list", "string", "bool", "tuple"}


def escape_wit_param(name: str) -> str:
    """Escape WIT keyword params by prefixing with the GL context."""
    if name in WIT_KEYWORDS:
        return f"gl-{name}"
    return name


def generate_wit(required: list[str], optional: list[str]) -> str:
    """Generate WIT interface for GL functions."""
    lines = [
        "// Auto-generated by generate-gl-wit.py — do not edit",
        "// GL functions required by Skia's WebGL Ganesh backend",
        "",
        "interface gl {",
        "    // ── Required (107 functions, always used) ──",
        "",
    ]

    for fn in required:
        if fn not in GL_SIGS:
            lines.append(f"    // TODO: {fn} — signature not mapped yet")
            continue
        ret_type, params = GL_SIGS[fn]
        wit_name = to_wit_name(fn)
        param_str = ", ".join(f"{escape_wit_param(p)}: {t}" for p, t in params)
        if ret_type == "void":
            lines.append(f"    {wit_name}: func({param_str});")
        else:
            lines.append(f"    {wit_name}: func({param_str}) -> {ret_type};")

    lines.extend([
        "",
        "    // ── Optional (41 functions, extension-gated) ──",
        "",
    ])

    for fn in optional:
        if fn not in GL_SIGS:
            lines.append(f"    // TODO: {fn} — signature not mapped yet")
            continue
        ret_type, params = GL_SIGS[fn]
        wit_name = to_wit_name(fn)
        param_str = ", ".join(f"{escape_wit_param(p)}: {t}" for p, t in params)
        if ret_type == "void":
            lines.append(f"    {wit_name}: func({param_str});")
        else:
            lines.append(f"    {wit_name}: func({param_str}) -> {ret_type};")

    lines.append("}")
    return "\n".join(lines) + "\n"


def main():
    # Parse the autogenerated file
    with open(AUTOGEN) as f:
        content = f.read()

    lines = content.split('\n')
    in_conditional = False
    conditional_stack = []
    required = []
    optional = []

    for line in lines:
        stripped = line.strip()
        if stripped.startswith('if (') or stripped.startswith('if('):
            in_conditional = True
            conditional_stack.append(stripped)
        elif stripped == '}':
            if conditional_stack:
                conditional_stack.pop()
            if not conditional_stack:
                in_conditional = False

        m = re.search(r'GET_PROC\((\w+)\)', stripped)
        if not m:
            m = re.search(r'GET_PROC_SUFFIX\((\w+),', stripped)
        if m:
            fn = m.group(1)
            if fn == 'F':  # parsing artifact
                continue
            if in_conditional:
                optional.append(fn)
            else:
                required.append(fn)

    required = sorted(set(required))
    optional = sorted(set(optional))

    # Generate WIT
    wit_content = generate_wit(required, optional)
    wit_path = PKG_ROOT / "wit" / "gl.wit"
    with open(wit_path, 'w') as f:
        f.write(wit_content)

    print(f"Generated {wit_path}")
    print(f"  Required: {len(required)} functions")
    print(f"  Optional: {len(optional)} functions")

    # Check for unmapped functions
    all_fns = required + optional
    unmapped = [fn for fn in all_fns if fn not in GL_SIGS]
    if unmapped:
        print(f"\n  WARNING: {len(unmapped)} unmapped functions:")
        for fn in unmapped:
            print(f"    {fn}")


if __name__ == "__main__":
    main()
