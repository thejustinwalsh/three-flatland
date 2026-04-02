// Auto-generated stub Emscripten WebGL header for Zig/WASM build.
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
typedef struct __GLsync* GLsync;

#define GL_FALSE 0
#define GL_TRUE 1

#ifdef __cplusplus
extern "C" {
#endif

// ── WASM imports (internal names) ──
// Imported functions cannot have their address taken in WASM
// (not in the indirect function table). We import with internal
// names and provide inline wrappers below.

__attribute__((import_module("gl"), import_name("emscripten_glActiveTexture"))) void __wasm_import_gl_ActiveTexture(GLenum texture);
__attribute__((import_module("gl"), import_name("emscripten_glAttachShader"))) void __wasm_import_gl_AttachShader(GLuint program, GLuint shader);
__attribute__((import_module("gl"), import_name("emscripten_glBeginQuery"))) void __wasm_import_gl_BeginQuery(GLenum target, GLuint id);
__attribute__((import_module("gl"), import_name("emscripten_glBindAttribLocation"))) void __wasm_import_gl_BindAttribLocation(GLuint program, GLuint index, const GLchar* name);
__attribute__((import_module("gl"), import_name("emscripten_glBindBuffer"))) void __wasm_import_gl_BindBuffer(GLenum target, GLuint buffer);
__attribute__((import_module("gl"), import_name("emscripten_glBindFramebuffer"))) void __wasm_import_gl_BindFramebuffer(GLenum target, GLuint framebuffer);
__attribute__((import_module("gl"), import_name("emscripten_glBindRenderbuffer"))) void __wasm_import_gl_BindRenderbuffer(GLenum target, GLuint renderbuffer);
__attribute__((import_module("gl"), import_name("emscripten_glBindSampler"))) void __wasm_import_gl_BindSampler(GLuint unit, GLuint sampler);
__attribute__((import_module("gl"), import_name("emscripten_glBindTexture"))) void __wasm_import_gl_BindTexture(GLenum target, GLuint texture);
__attribute__((import_module("gl"), import_name("emscripten_glBindVertexArray"))) void __wasm_import_gl_BindVertexArray(GLuint array);
__attribute__((import_module("gl"), import_name("emscripten_glBlendColor"))) void __wasm_import_gl_BlendColor(GLfloat red, GLfloat green, GLfloat blue, GLfloat alpha);
__attribute__((import_module("gl"), import_name("emscripten_glBlendEquation"))) void __wasm_import_gl_BlendEquation(GLenum mode);
__attribute__((import_module("gl"), import_name("emscripten_glBlendFunc"))) void __wasm_import_gl_BlendFunc(GLenum sfactor, GLenum dfactor);
__attribute__((import_module("gl"), import_name("emscripten_glBlitFramebuffer"))) void __wasm_import_gl_BlitFramebuffer(GLint srcX0, GLint srcY0, GLint srcX1, GLint srcY1, GLint dstX0, GLint dstY0, GLint dstX1, GLint dstY1, GLbitfield mask, GLenum filter);
__attribute__((import_module("gl"), import_name("emscripten_glBufferData"))) void __wasm_import_gl_BufferData(GLenum target, GLsizeiptr size, const void* data, GLenum usage);
__attribute__((import_module("gl"), import_name("emscripten_glBufferSubData"))) void __wasm_import_gl_BufferSubData(GLenum target, GLintptr offset, GLsizeiptr size, const void* data);
__attribute__((import_module("gl"), import_name("emscripten_glCheckFramebufferStatus"))) GLenum __wasm_import_gl_CheckFramebufferStatus(GLenum target);
__attribute__((import_module("gl"), import_name("emscripten_glClear"))) void __wasm_import_gl_Clear(GLbitfield mask);
__attribute__((import_module("gl"), import_name("emscripten_glClearColor"))) void __wasm_import_gl_ClearColor(GLfloat red, GLfloat green, GLfloat blue, GLfloat alpha);
__attribute__((import_module("gl"), import_name("emscripten_glClearStencil"))) void __wasm_import_gl_ClearStencil(GLint s);
__attribute__((import_module("gl"), import_name("emscripten_glClientWaitSync"))) GLenum __wasm_import_gl_ClientWaitSync(GLsync sync, GLbitfield flags, GLuint64 timeout);
__attribute__((import_module("gl"), import_name("emscripten_glColorMask"))) void __wasm_import_gl_ColorMask(GLboolean red, GLboolean green, GLboolean blue, GLboolean alpha);
__attribute__((import_module("gl"), import_name("emscripten_glCompileShader"))) void __wasm_import_gl_CompileShader(GLuint shader);
__attribute__((import_module("gl"), import_name("emscripten_glCompressedTexImage2D"))) void __wasm_import_gl_CompressedTexImage2D(GLenum target, GLint level, GLenum internalformat, GLsizei width, GLsizei height, GLint border, GLsizei imageSize, const void* data);
__attribute__((import_module("gl"), import_name("emscripten_glCompressedTexSubImage2D"))) void __wasm_import_gl_CompressedTexSubImage2D(GLenum target, GLint level, GLint xoffset, GLint yoffset, GLsizei width, GLsizei height, GLenum format, GLsizei imageSize, const void* data);
__attribute__((import_module("gl"), import_name("emscripten_glCopyBufferSubData"))) void __wasm_import_gl_CopyBufferSubData(GLenum readTarget, GLenum writeTarget, GLintptr readOffset, GLintptr writeOffset, GLsizeiptr size);
__attribute__((import_module("gl"), import_name("emscripten_glCopyTexSubImage2D"))) void __wasm_import_gl_CopyTexSubImage2D(GLenum target, GLint level, GLint xoffset, GLint yoffset, GLint x, GLint y, GLsizei width, GLsizei height);
__attribute__((import_module("gl"), import_name("emscripten_glCreateProgram"))) GLuint __wasm_import_gl_CreateProgram(void);
__attribute__((import_module("gl"), import_name("emscripten_glCreateShader"))) GLuint __wasm_import_gl_CreateShader(GLenum type);
__attribute__((import_module("gl"), import_name("emscripten_glCullFace"))) void __wasm_import_gl_CullFace(GLenum mode);
__attribute__((import_module("gl"), import_name("emscripten_glDeleteBuffers"))) void __wasm_import_gl_DeleteBuffers(GLsizei n, const GLuint* buffers);
__attribute__((import_module("gl"), import_name("emscripten_glDeleteFramebuffers"))) void __wasm_import_gl_DeleteFramebuffers(GLsizei n, const GLuint* framebuffers);
__attribute__((import_module("gl"), import_name("emscripten_glDeleteProgram"))) void __wasm_import_gl_DeleteProgram(GLuint program);
__attribute__((import_module("gl"), import_name("emscripten_glDeleteQueries"))) void __wasm_import_gl_DeleteQueries(GLsizei n, const GLuint* ids);
__attribute__((import_module("gl"), import_name("emscripten_glDeleteRenderbuffers"))) void __wasm_import_gl_DeleteRenderbuffers(GLsizei n, const GLuint* renderbuffers);
__attribute__((import_module("gl"), import_name("emscripten_glDeleteSamplers"))) void __wasm_import_gl_DeleteSamplers(GLsizei n, const GLuint* samplers);
__attribute__((import_module("gl"), import_name("emscripten_glDeleteShader"))) void __wasm_import_gl_DeleteShader(GLuint shader);
__attribute__((import_module("gl"), import_name("emscripten_glDeleteSync"))) void __wasm_import_gl_DeleteSync(GLsync sync);
__attribute__((import_module("gl"), import_name("emscripten_glDeleteTextures"))) void __wasm_import_gl_DeleteTextures(GLsizei n, const GLuint* textures);
__attribute__((import_module("gl"), import_name("emscripten_glDeleteVertexArrays"))) void __wasm_import_gl_DeleteVertexArrays(GLsizei n, const GLuint* arrays);
__attribute__((import_module("gl"), import_name("emscripten_glDepthMask"))) void __wasm_import_gl_DepthMask(GLboolean flag);
__attribute__((import_module("gl"), import_name("emscripten_glDisable"))) void __wasm_import_gl_Disable(GLenum cap);
__attribute__((import_module("gl"), import_name("emscripten_glDisableVertexAttribArray"))) void __wasm_import_gl_DisableVertexAttribArray(GLuint index);
__attribute__((import_module("gl"), import_name("emscripten_glDrawArrays"))) void __wasm_import_gl_DrawArrays(GLenum mode, GLint first, GLsizei count);
__attribute__((import_module("gl"), import_name("emscripten_glDrawArraysInstanced"))) void __wasm_import_gl_DrawArraysInstanced(GLenum mode, GLint first, GLsizei count, GLsizei instancecount);
__attribute__((import_module("gl"), import_name("emscripten_glDrawArraysInstancedBaseInstance"))) void __wasm_import_gl_DrawArraysInstancedBaseInstance(GLenum mode, GLint first, GLsizei count, GLsizei instancecount, GLuint baseinstance);
__attribute__((import_module("gl"), import_name("emscripten_glDrawBuffers"))) void __wasm_import_gl_DrawBuffers(GLsizei n, const GLenum* bufs);
__attribute__((import_module("gl"), import_name("emscripten_glDrawElements"))) void __wasm_import_gl_DrawElements(GLenum mode, GLsizei count, GLenum type, const void* indices);
__attribute__((import_module("gl"), import_name("emscripten_glDrawElementsInstanced"))) void __wasm_import_gl_DrawElementsInstanced(GLenum mode, GLsizei count, GLenum type, const void* indices, GLsizei instancecount);
__attribute__((import_module("gl"), import_name("emscripten_glDrawElementsInstancedBaseVertexBaseInstance"))) void __wasm_import_gl_DrawElementsInstancedBaseVertexBaseInstance(GLenum mode, GLsizei count, GLenum type, const void* indices, GLsizei instancecount, GLint basevertex, GLuint baseinstance);
__attribute__((import_module("gl"), import_name("emscripten_glDrawRangeElements"))) void __wasm_import_gl_DrawRangeElements(GLenum mode, GLuint start, GLuint end, GLsizei count, GLenum type, const void* indices);
__attribute__((import_module("gl"), import_name("emscripten_glEnable"))) void __wasm_import_gl_Enable(GLenum cap);
__attribute__((import_module("gl"), import_name("emscripten_glEnableVertexAttribArray"))) void __wasm_import_gl_EnableVertexAttribArray(GLuint index);
__attribute__((import_module("gl"), import_name("emscripten_glEndQuery"))) void __wasm_import_gl_EndQuery(GLenum target);
__attribute__((import_module("gl"), import_name("emscripten_glFenceSync"))) GLsync __wasm_import_gl_FenceSync(GLenum condition, GLbitfield flags);
__attribute__((import_module("gl"), import_name("emscripten_glFinish"))) void __wasm_import_gl_Finish(void);
__attribute__((import_module("gl"), import_name("emscripten_glFlush"))) void __wasm_import_gl_Flush(void);
__attribute__((import_module("gl"), import_name("emscripten_glFramebufferRenderbuffer"))) void __wasm_import_gl_FramebufferRenderbuffer(GLenum target, GLenum attachment, GLenum renderbuffertarget, GLuint renderbuffer);
__attribute__((import_module("gl"), import_name("emscripten_glFramebufferTexture2D"))) void __wasm_import_gl_FramebufferTexture2D(GLenum target, GLenum attachment, GLenum textarget, GLuint texture, GLint level);
__attribute__((import_module("gl"), import_name("emscripten_glFrontFace"))) void __wasm_import_gl_FrontFace(GLenum mode);
__attribute__((import_module("gl"), import_name("emscripten_glGenBuffers"))) void __wasm_import_gl_GenBuffers(GLsizei n, GLuint* buffers);
__attribute__((import_module("gl"), import_name("emscripten_glGenFramebuffers"))) void __wasm_import_gl_GenFramebuffers(GLsizei n, GLuint* framebuffers);
__attribute__((import_module("gl"), import_name("emscripten_glGenQueries"))) void __wasm_import_gl_GenQueries(GLsizei n, GLuint* ids);
__attribute__((import_module("gl"), import_name("emscripten_glGenRenderbuffers"))) void __wasm_import_gl_GenRenderbuffers(GLsizei n, GLuint* renderbuffers);
__attribute__((import_module("gl"), import_name("emscripten_glGenSamplers"))) void __wasm_import_gl_GenSamplers(GLsizei n, GLuint* samplers);
__attribute__((import_module("gl"), import_name("emscripten_glGenTextures"))) void __wasm_import_gl_GenTextures(GLsizei n, GLuint* textures);
__attribute__((import_module("gl"), import_name("emscripten_glGenVertexArrays"))) void __wasm_import_gl_GenVertexArrays(GLsizei n, GLuint* arrays);
__attribute__((import_module("gl"), import_name("emscripten_glGenerateMipmap"))) void __wasm_import_gl_GenerateMipmap(GLenum target);
__attribute__((import_module("gl"), import_name("emscripten_glGetBufferParameteriv"))) void __wasm_import_gl_GetBufferParameteriv(GLenum target, GLenum pname, GLint* params);
__attribute__((import_module("gl"), import_name("emscripten_glGetError"))) GLenum __wasm_import_gl_GetError(void);
__attribute__((import_module("gl"), import_name("emscripten_glGetFloatv"))) void __wasm_import_gl_GetFloatv(GLenum pname, GLfloat* data);
__attribute__((import_module("gl"), import_name("emscripten_glGetFramebufferAttachmentParameteriv"))) void __wasm_import_gl_GetFramebufferAttachmentParameteriv(GLenum target, GLenum attachment, GLenum pname, GLint* params);
__attribute__((import_module("gl"), import_name("emscripten_glGetIntegerv"))) void __wasm_import_gl_GetIntegerv(GLenum pname, GLint* data);
__attribute__((import_module("gl"), import_name("emscripten_glGetProgramInfoLog"))) void __wasm_import_gl_GetProgramInfoLog(GLuint program, GLsizei bufSize, GLsizei* length, GLchar* infoLog);
__attribute__((import_module("gl"), import_name("emscripten_glGetProgramiv"))) void __wasm_import_gl_GetProgramiv(GLuint program, GLenum pname, GLint* params);
__attribute__((import_module("gl"), import_name("emscripten_glGetQueryObjecti64v"))) void __wasm_import_gl_GetQueryObjecti64v(GLuint id, GLenum pname, GLint64* params);
__attribute__((import_module("gl"), import_name("emscripten_glGetQueryObjectui64v"))) void __wasm_import_gl_GetQueryObjectui64v(GLuint id, GLenum pname, GLuint64* params);
__attribute__((import_module("gl"), import_name("emscripten_glGetQueryObjectuiv"))) void __wasm_import_gl_GetQueryObjectuiv(GLuint id, GLenum pname, GLuint* params);
__attribute__((import_module("gl"), import_name("emscripten_glGetQueryiv"))) void __wasm_import_gl_GetQueryiv(GLenum target, GLenum pname, GLint* params);
__attribute__((import_module("gl"), import_name("emscripten_glGetRenderbufferParameteriv"))) void __wasm_import_gl_GetRenderbufferParameteriv(GLenum target, GLenum pname, GLint* params);
__attribute__((import_module("gl"), import_name("emscripten_glGetShaderInfoLog"))) void __wasm_import_gl_GetShaderInfoLog(GLuint shader, GLsizei bufSize, GLsizei* length, GLchar* infoLog);
__attribute__((import_module("gl"), import_name("emscripten_glGetShaderPrecisionFormat"))) void __wasm_import_gl_GetShaderPrecisionFormat(GLenum shadertype, GLenum precisiontype, GLint* range, GLint* precision);
__attribute__((import_module("gl"), import_name("emscripten_glGetShaderiv"))) void __wasm_import_gl_GetShaderiv(GLuint shader, GLenum pname, GLint* params);
__attribute__((import_module("gl"), import_name("emscripten_glGetString"))) const GLubyte* __wasm_import_gl_GetString(GLenum name);
__attribute__((import_module("gl"), import_name("emscripten_glGetStringi"))) const GLubyte* __wasm_import_gl_GetStringi(GLenum name, GLuint index);
__attribute__((import_module("gl"), import_name("emscripten_glGetUniformLocation"))) GLint __wasm_import_gl_GetUniformLocation(GLuint program, const GLchar* name);
__attribute__((import_module("gl"), import_name("emscripten_glInvalidateFramebuffer"))) void __wasm_import_gl_InvalidateFramebuffer(GLenum target, GLsizei numAttachments, const GLenum* attachments);
__attribute__((import_module("gl"), import_name("emscripten_glInvalidateSubFramebuffer"))) void __wasm_import_gl_InvalidateSubFramebuffer(GLenum target, GLsizei numAttachments, const GLenum* attachments, GLint x, GLint y, GLsizei width, GLsizei height);
__attribute__((import_module("gl"), import_name("emscripten_glIsSync"))) GLboolean __wasm_import_gl_IsSync(GLsync sync);
__attribute__((import_module("gl"), import_name("emscripten_glIsTexture"))) GLboolean __wasm_import_gl_IsTexture(GLuint texture);
__attribute__((import_module("gl"), import_name("emscripten_glLineWidth"))) void __wasm_import_gl_LineWidth(GLfloat width);
__attribute__((import_module("gl"), import_name("emscripten_glLinkProgram"))) void __wasm_import_gl_LinkProgram(GLuint program);
__attribute__((import_module("gl"), import_name("emscripten_glMultiDrawArraysInstancedBaseInstance"))) void __wasm_import_gl_MultiDrawArraysInstancedBaseInstance(GLenum mode, const GLint* firsts, const GLsizei* counts, const GLsizei* instanceCounts, const GLuint* baseInstances, GLsizei drawcount);
__attribute__((import_module("gl"), import_name("emscripten_glMultiDrawElementsInstancedBaseVertexBaseInstance"))) void __wasm_import_gl_MultiDrawElementsInstancedBaseVertexBaseInstance(GLenum mode, const GLsizei* counts, GLenum type, const void* const* offsets, const GLsizei* instanceCounts, const GLint* baseVertices, const GLuint* baseInstances, GLsizei drawcount);
__attribute__((import_module("gl"), import_name("emscripten_glPixelStorei"))) void __wasm_import_gl_PixelStorei(GLenum pname, GLint param);
__attribute__((import_module("gl"), import_name("emscripten_glQueryCounter"))) void __wasm_import_gl_QueryCounter(GLuint id, GLenum target);
__attribute__((import_module("gl"), import_name("emscripten_glReadBuffer"))) void __wasm_import_gl_ReadBuffer(GLenum src);
__attribute__((import_module("gl"), import_name("emscripten_glReadPixels"))) void __wasm_import_gl_ReadPixels(GLint x, GLint y, GLsizei width, GLsizei height, GLenum format, GLenum type, void* pixels);
__attribute__((import_module("gl"), import_name("emscripten_glRenderbufferStorage"))) void __wasm_import_gl_RenderbufferStorage(GLenum target, GLenum internalformat, GLsizei width, GLsizei height);
__attribute__((import_module("gl"), import_name("emscripten_glRenderbufferStorageMultisample"))) void __wasm_import_gl_RenderbufferStorageMultisample(GLenum target, GLsizei samples, GLenum internalformat, GLsizei width, GLsizei height);
__attribute__((import_module("gl"), import_name("emscripten_glSamplerParameterf"))) void __wasm_import_gl_SamplerParameterf(GLuint sampler, GLenum pname, GLfloat param);
__attribute__((import_module("gl"), import_name("emscripten_glSamplerParameteri"))) void __wasm_import_gl_SamplerParameteri(GLuint sampler, GLenum pname, GLint param);
__attribute__((import_module("gl"), import_name("emscripten_glSamplerParameteriv"))) void __wasm_import_gl_SamplerParameteriv(GLuint sampler, GLenum pname, const GLint* param);
__attribute__((import_module("gl"), import_name("emscripten_glScissor"))) void __wasm_import_gl_Scissor(GLint x, GLint y, GLsizei width, GLsizei height);
__attribute__((import_module("gl"), import_name("emscripten_glShaderSource"))) void __wasm_import_gl_ShaderSource(GLuint shader, GLsizei count, const GLchar* const* string, const GLint* length);
__attribute__((import_module("gl"), import_name("emscripten_glStencilFunc"))) void __wasm_import_gl_StencilFunc(GLenum func, GLint ref, GLuint mask);
__attribute__((import_module("gl"), import_name("emscripten_glStencilFuncSeparate"))) void __wasm_import_gl_StencilFuncSeparate(GLenum face, GLenum func, GLint ref, GLuint mask);
__attribute__((import_module("gl"), import_name("emscripten_glStencilMask"))) void __wasm_import_gl_StencilMask(GLuint mask);
__attribute__((import_module("gl"), import_name("emscripten_glStencilMaskSeparate"))) void __wasm_import_gl_StencilMaskSeparate(GLenum face, GLuint mask);
__attribute__((import_module("gl"), import_name("emscripten_glStencilOp"))) void __wasm_import_gl_StencilOp(GLenum fail, GLenum zfail, GLenum zpass);
__attribute__((import_module("gl"), import_name("emscripten_glStencilOpSeparate"))) void __wasm_import_gl_StencilOpSeparate(GLenum face, GLenum sfail, GLenum dpfail, GLenum dppass);
__attribute__((import_module("gl"), import_name("emscripten_glTexImage2D"))) void __wasm_import_gl_TexImage2D(GLenum target, GLint level, GLint internalformat, GLsizei width, GLsizei height, GLint border, GLenum format, GLenum type, const void* pixels);
__attribute__((import_module("gl"), import_name("emscripten_glTexParameterf"))) void __wasm_import_gl_TexParameterf(GLenum target, GLenum pname, GLfloat param);
__attribute__((import_module("gl"), import_name("emscripten_glTexParameterfv"))) void __wasm_import_gl_TexParameterfv(GLenum target, GLenum pname, const GLfloat* params);
__attribute__((import_module("gl"), import_name("emscripten_glTexParameteri"))) void __wasm_import_gl_TexParameteri(GLenum target, GLenum pname, GLint param);
__attribute__((import_module("gl"), import_name("emscripten_glTexParameteriv"))) void __wasm_import_gl_TexParameteriv(GLenum target, GLenum pname, const GLint* params);
__attribute__((import_module("gl"), import_name("emscripten_glTexStorage2D"))) void __wasm_import_gl_TexStorage2D(GLenum target, GLsizei levels, GLenum internalformat, GLsizei width, GLsizei height);
__attribute__((import_module("gl"), import_name("emscripten_glTexSubImage2D"))) void __wasm_import_gl_TexSubImage2D(GLenum target, GLint level, GLint xoffset, GLint yoffset, GLsizei width, GLsizei height, GLenum format, GLenum type, const void* pixels);
__attribute__((import_module("gl"), import_name("emscripten_glUniform1f"))) void __wasm_import_gl_Uniform1f(GLint location, GLfloat v0);
__attribute__((import_module("gl"), import_name("emscripten_glUniform1fv"))) void __wasm_import_gl_Uniform1fv(GLint location, GLsizei count, const GLfloat* value);
__attribute__((import_module("gl"), import_name("emscripten_glUniform1i"))) void __wasm_import_gl_Uniform1i(GLint location, GLint v0);
__attribute__((import_module("gl"), import_name("emscripten_glUniform1iv"))) void __wasm_import_gl_Uniform1iv(GLint location, GLsizei count, const GLint* value);
__attribute__((import_module("gl"), import_name("emscripten_glUniform2f"))) void __wasm_import_gl_Uniform2f(GLint location, GLfloat v0, GLfloat v1);
__attribute__((import_module("gl"), import_name("emscripten_glUniform2fv"))) void __wasm_import_gl_Uniform2fv(GLint location, GLsizei count, const GLfloat* value);
__attribute__((import_module("gl"), import_name("emscripten_glUniform2i"))) void __wasm_import_gl_Uniform2i(GLint location, GLint v0, GLint v1);
__attribute__((import_module("gl"), import_name("emscripten_glUniform2iv"))) void __wasm_import_gl_Uniform2iv(GLint location, GLsizei count, const GLint* value);
__attribute__((import_module("gl"), import_name("emscripten_glUniform3f"))) void __wasm_import_gl_Uniform3f(GLint location, GLfloat v0, GLfloat v1, GLfloat v2);
__attribute__((import_module("gl"), import_name("emscripten_glUniform3fv"))) void __wasm_import_gl_Uniform3fv(GLint location, GLsizei count, const GLfloat* value);
__attribute__((import_module("gl"), import_name("emscripten_glUniform3i"))) void __wasm_import_gl_Uniform3i(GLint location, GLint v0, GLint v1, GLint v2);
__attribute__((import_module("gl"), import_name("emscripten_glUniform3iv"))) void __wasm_import_gl_Uniform3iv(GLint location, GLsizei count, const GLint* value);
__attribute__((import_module("gl"), import_name("emscripten_glUniform4f"))) void __wasm_import_gl_Uniform4f(GLint location, GLfloat v0, GLfloat v1, GLfloat v2, GLfloat v3);
__attribute__((import_module("gl"), import_name("emscripten_glUniform4fv"))) void __wasm_import_gl_Uniform4fv(GLint location, GLsizei count, const GLfloat* value);
__attribute__((import_module("gl"), import_name("emscripten_glUniform4i"))) void __wasm_import_gl_Uniform4i(GLint location, GLint v0, GLint v1, GLint v2, GLint v3);
__attribute__((import_module("gl"), import_name("emscripten_glUniform4iv"))) void __wasm_import_gl_Uniform4iv(GLint location, GLsizei count, const GLint* value);
__attribute__((import_module("gl"), import_name("emscripten_glUniformMatrix2fv"))) void __wasm_import_gl_UniformMatrix2fv(GLint location, GLsizei count, GLboolean transpose, const GLfloat* value);
__attribute__((import_module("gl"), import_name("emscripten_glUniformMatrix3fv"))) void __wasm_import_gl_UniformMatrix3fv(GLint location, GLsizei count, GLboolean transpose, const GLfloat* value);
__attribute__((import_module("gl"), import_name("emscripten_glUniformMatrix4fv"))) void __wasm_import_gl_UniformMatrix4fv(GLint location, GLsizei count, GLboolean transpose, const GLfloat* value);
__attribute__((import_module("gl"), import_name("emscripten_glUseProgram"))) void __wasm_import_gl_UseProgram(GLuint program);
__attribute__((import_module("gl"), import_name("emscripten_glVertexAttrib1f"))) void __wasm_import_gl_VertexAttrib1f(GLuint index, GLfloat x);
__attribute__((import_module("gl"), import_name("emscripten_glVertexAttrib2fv"))) void __wasm_import_gl_VertexAttrib2fv(GLuint index, const GLfloat* v);
__attribute__((import_module("gl"), import_name("emscripten_glVertexAttrib3fv"))) void __wasm_import_gl_VertexAttrib3fv(GLuint index, const GLfloat* v);
__attribute__((import_module("gl"), import_name("emscripten_glVertexAttrib4fv"))) void __wasm_import_gl_VertexAttrib4fv(GLuint index, const GLfloat* v);
__attribute__((import_module("gl"), import_name("emscripten_glVertexAttribDivisor"))) void __wasm_import_gl_VertexAttribDivisor(GLuint index, GLuint divisor);
__attribute__((import_module("gl"), import_name("emscripten_glVertexAttribIPointer"))) void __wasm_import_gl_VertexAttribIPointer(GLuint index, GLint size, GLenum type, GLsizei stride, const void* pointer);
__attribute__((import_module("gl"), import_name("emscripten_glVertexAttribPointer"))) void __wasm_import_gl_VertexAttribPointer(GLuint index, GLint size, GLenum type, GLboolean normalized, GLsizei stride, const void* pointer);
__attribute__((import_module("gl"), import_name("emscripten_glViewport"))) void __wasm_import_gl_Viewport(GLint x, GLint y, GLsizei width, GLsizei height);
__attribute__((import_module("gl"), import_name("emscripten_glWaitSync"))) void __wasm_import_gl_WaitSync(GLsync sync, GLbitfield flags, GLuint64 timeout);

// ── Extern declarations (defined in emscripten_gl_shim.c) ──


void emscripten_glActiveTexture(GLenum texture);
void emscripten_glAttachShader(GLuint program, GLuint shader);
void emscripten_glBeginQuery(GLenum target, GLuint id);
void emscripten_glBindAttribLocation(GLuint program, GLuint index, const GLchar* name);
void emscripten_glBindBuffer(GLenum target, GLuint buffer);
void emscripten_glBindFramebuffer(GLenum target, GLuint framebuffer);
void emscripten_glBindRenderbuffer(GLenum target, GLuint renderbuffer);
void emscripten_glBindSampler(GLuint unit, GLuint sampler);
void emscripten_glBindTexture(GLenum target, GLuint texture);
void emscripten_glBindVertexArray(GLuint array);
void emscripten_glBlendColor(GLfloat red, GLfloat green, GLfloat blue, GLfloat alpha);
void emscripten_glBlendEquation(GLenum mode);
void emscripten_glBlendFunc(GLenum sfactor, GLenum dfactor);
void emscripten_glBlitFramebuffer(GLint srcX0, GLint srcY0, GLint srcX1, GLint srcY1, GLint dstX0, GLint dstY0, GLint dstX1, GLint dstY1, GLbitfield mask, GLenum filter);
void emscripten_glBufferData(GLenum target, GLsizeiptr size, const void* data, GLenum usage);
void emscripten_glBufferSubData(GLenum target, GLintptr offset, GLsizeiptr size, const void* data);
GLenum emscripten_glCheckFramebufferStatus(GLenum target);
void emscripten_glClear(GLbitfield mask);
void emscripten_glClearColor(GLfloat red, GLfloat green, GLfloat blue, GLfloat alpha);
void emscripten_glClearStencil(GLint s);
GLenum emscripten_glClientWaitSync(GLsync sync, GLbitfield flags, GLuint64 timeout);
void emscripten_glColorMask(GLboolean red, GLboolean green, GLboolean blue, GLboolean alpha);
void emscripten_glCompileShader(GLuint shader);
void emscripten_glCompressedTexImage2D(GLenum target, GLint level, GLenum internalformat, GLsizei width, GLsizei height, GLint border, GLsizei imageSize, const void* data);
void emscripten_glCompressedTexSubImage2D(GLenum target, GLint level, GLint xoffset, GLint yoffset, GLsizei width, GLsizei height, GLenum format, GLsizei imageSize, const void* data);
void emscripten_glCopyBufferSubData(GLenum readTarget, GLenum writeTarget, GLintptr readOffset, GLintptr writeOffset, GLsizeiptr size);
void emscripten_glCopyTexSubImage2D(GLenum target, GLint level, GLint xoffset, GLint yoffset, GLint x, GLint y, GLsizei width, GLsizei height);
GLuint emscripten_glCreateProgram(void);
GLuint emscripten_glCreateShader(GLenum type);
void emscripten_glCullFace(GLenum mode);
void emscripten_glDeleteBuffers(GLsizei n, const GLuint* buffers);
void emscripten_glDeleteFramebuffers(GLsizei n, const GLuint* framebuffers);
void emscripten_glDeleteProgram(GLuint program);
void emscripten_glDeleteQueries(GLsizei n, const GLuint* ids);
void emscripten_glDeleteRenderbuffers(GLsizei n, const GLuint* renderbuffers);
void emscripten_glDeleteSamplers(GLsizei n, const GLuint* samplers);
void emscripten_glDeleteShader(GLuint shader);
void emscripten_glDeleteSync(GLsync sync);
void emscripten_glDeleteTextures(GLsizei n, const GLuint* textures);
void emscripten_glDeleteVertexArrays(GLsizei n, const GLuint* arrays);
void emscripten_glDepthMask(GLboolean flag);
void emscripten_glDisable(GLenum cap);
void emscripten_glDisableVertexAttribArray(GLuint index);
void emscripten_glDrawArrays(GLenum mode, GLint first, GLsizei count);
void emscripten_glDrawArraysInstanced(GLenum mode, GLint first, GLsizei count, GLsizei instancecount);
void emscripten_glDrawArraysInstancedBaseInstance(GLenum mode, GLint first, GLsizei count, GLsizei instancecount, GLuint baseinstance);
void emscripten_glDrawBuffers(GLsizei n, const GLenum* bufs);
void emscripten_glDrawElements(GLenum mode, GLsizei count, GLenum type, const void* indices);
void emscripten_glDrawElementsInstanced(GLenum mode, GLsizei count, GLenum type, const void* indices, GLsizei instancecount);
void emscripten_glDrawElementsInstancedBaseVertexBaseInstance(GLenum mode, GLsizei count, GLenum type, const void* indices, GLsizei instancecount, GLint basevertex, GLuint baseinstance);
void emscripten_glDrawRangeElements(GLenum mode, GLuint start, GLuint end, GLsizei count, GLenum type, const void* indices);
void emscripten_glEnable(GLenum cap);
void emscripten_glEnableVertexAttribArray(GLuint index);
void emscripten_glEndQuery(GLenum target);
GLsync emscripten_glFenceSync(GLenum condition, GLbitfield flags);
void emscripten_glFinish(void);
void emscripten_glFlush(void);
void emscripten_glFramebufferRenderbuffer(GLenum target, GLenum attachment, GLenum renderbuffertarget, GLuint renderbuffer);
void emscripten_glFramebufferTexture2D(GLenum target, GLenum attachment, GLenum textarget, GLuint texture, GLint level);
void emscripten_glFrontFace(GLenum mode);
void emscripten_glGenBuffers(GLsizei n, GLuint* buffers);
void emscripten_glGenFramebuffers(GLsizei n, GLuint* framebuffers);
void emscripten_glGenQueries(GLsizei n, GLuint* ids);
void emscripten_glGenRenderbuffers(GLsizei n, GLuint* renderbuffers);
void emscripten_glGenSamplers(GLsizei n, GLuint* samplers);
void emscripten_glGenTextures(GLsizei n, GLuint* textures);
void emscripten_glGenVertexArrays(GLsizei n, GLuint* arrays);
void emscripten_glGenerateMipmap(GLenum target);
void emscripten_glGetBufferParameteriv(GLenum target, GLenum pname, GLint* params);
GLenum emscripten_glGetError(void);
void emscripten_glGetFloatv(GLenum pname, GLfloat* data);
void emscripten_glGetFramebufferAttachmentParameteriv(GLenum target, GLenum attachment, GLenum pname, GLint* params);
void emscripten_glGetIntegerv(GLenum pname, GLint* data);
void emscripten_glGetProgramInfoLog(GLuint program, GLsizei bufSize, GLsizei* length, GLchar* infoLog);
void emscripten_glGetProgramiv(GLuint program, GLenum pname, GLint* params);
void emscripten_glGetQueryObjecti64v(GLuint id, GLenum pname, GLint64* params);
void emscripten_glGetQueryObjectui64v(GLuint id, GLenum pname, GLuint64* params);
void emscripten_glGetQueryObjectuiv(GLuint id, GLenum pname, GLuint* params);
void emscripten_glGetQueryiv(GLenum target, GLenum pname, GLint* params);
void emscripten_glGetRenderbufferParameteriv(GLenum target, GLenum pname, GLint* params);
void emscripten_glGetShaderInfoLog(GLuint shader, GLsizei bufSize, GLsizei* length, GLchar* infoLog);
void emscripten_glGetShaderPrecisionFormat(GLenum shadertype, GLenum precisiontype, GLint* range, GLint* precision);
void emscripten_glGetShaderiv(GLuint shader, GLenum pname, GLint* params);
const GLubyte* emscripten_glGetString(GLenum name);
const GLubyte* emscripten_glGetStringi(GLenum name, GLuint index);
GLint emscripten_glGetUniformLocation(GLuint program, const GLchar* name);
void emscripten_glInvalidateFramebuffer(GLenum target, GLsizei numAttachments, const GLenum* attachments);
void emscripten_glInvalidateSubFramebuffer(GLenum target, GLsizei numAttachments, const GLenum* attachments, GLint x, GLint y, GLsizei width, GLsizei height);
GLboolean emscripten_glIsSync(GLsync sync);
GLboolean emscripten_glIsTexture(GLuint texture);
void emscripten_glLineWidth(GLfloat width);
void emscripten_glLinkProgram(GLuint program);
void emscripten_glMultiDrawArraysInstancedBaseInstance(GLenum mode, const GLint* firsts, const GLsizei* counts, const GLsizei* instanceCounts, const GLuint* baseInstances, GLsizei drawcount);
void emscripten_glMultiDrawElementsInstancedBaseVertexBaseInstance(GLenum mode, const GLsizei* counts, GLenum type, const void* const* offsets, const GLsizei* instanceCounts, const GLint* baseVertices, const GLuint* baseInstances, GLsizei drawcount);
void emscripten_glPixelStorei(GLenum pname, GLint param);
void emscripten_glQueryCounter(GLuint id, GLenum target);
void emscripten_glReadBuffer(GLenum src);
void emscripten_glReadPixels(GLint x, GLint y, GLsizei width, GLsizei height, GLenum format, GLenum type, void* pixels);
void emscripten_glRenderbufferStorage(GLenum target, GLenum internalformat, GLsizei width, GLsizei height);
void emscripten_glRenderbufferStorageMultisample(GLenum target, GLsizei samples, GLenum internalformat, GLsizei width, GLsizei height);
void emscripten_glSamplerParameterf(GLuint sampler, GLenum pname, GLfloat param);
void emscripten_glSamplerParameteri(GLuint sampler, GLenum pname, GLint param);
void emscripten_glSamplerParameteriv(GLuint sampler, GLenum pname, const GLint* param);
void emscripten_glScissor(GLint x, GLint y, GLsizei width, GLsizei height);
void emscripten_glShaderSource(GLuint shader, GLsizei count, const GLchar* const* string, const GLint* length);
void emscripten_glStencilFunc(GLenum func, GLint ref, GLuint mask);
void emscripten_glStencilFuncSeparate(GLenum face, GLenum func, GLint ref, GLuint mask);
void emscripten_glStencilMask(GLuint mask);
void emscripten_glStencilMaskSeparate(GLenum face, GLuint mask);
void emscripten_glStencilOp(GLenum fail, GLenum zfail, GLenum zpass);
void emscripten_glStencilOpSeparate(GLenum face, GLenum sfail, GLenum dpfail, GLenum dppass);
void emscripten_glTexImage2D(GLenum target, GLint level, GLint internalformat, GLsizei width, GLsizei height, GLint border, GLenum format, GLenum type, const void* pixels);
void emscripten_glTexParameterf(GLenum target, GLenum pname, GLfloat param);
void emscripten_glTexParameterfv(GLenum target, GLenum pname, const GLfloat* params);
void emscripten_glTexParameteri(GLenum target, GLenum pname, GLint param);
void emscripten_glTexParameteriv(GLenum target, GLenum pname, const GLint* params);
void emscripten_glTexStorage2D(GLenum target, GLsizei levels, GLenum internalformat, GLsizei width, GLsizei height);
void emscripten_glTexSubImage2D(GLenum target, GLint level, GLint xoffset, GLint yoffset, GLsizei width, GLsizei height, GLenum format, GLenum type, const void* pixels);
void emscripten_glUniform1f(GLint location, GLfloat v0);
void emscripten_glUniform1fv(GLint location, GLsizei count, const GLfloat* value);
void emscripten_glUniform1i(GLint location, GLint v0);
void emscripten_glUniform1iv(GLint location, GLsizei count, const GLint* value);
void emscripten_glUniform2f(GLint location, GLfloat v0, GLfloat v1);
void emscripten_glUniform2fv(GLint location, GLsizei count, const GLfloat* value);
void emscripten_glUniform2i(GLint location, GLint v0, GLint v1);
void emscripten_glUniform2iv(GLint location, GLsizei count, const GLint* value);
void emscripten_glUniform3f(GLint location, GLfloat v0, GLfloat v1, GLfloat v2);
void emscripten_glUniform3fv(GLint location, GLsizei count, const GLfloat* value);
void emscripten_glUniform3i(GLint location, GLint v0, GLint v1, GLint v2);
void emscripten_glUniform3iv(GLint location, GLsizei count, const GLint* value);
void emscripten_glUniform4f(GLint location, GLfloat v0, GLfloat v1, GLfloat v2, GLfloat v3);
void emscripten_glUniform4fv(GLint location, GLsizei count, const GLfloat* value);
void emscripten_glUniform4i(GLint location, GLint v0, GLint v1, GLint v2, GLint v3);
void emscripten_glUniform4iv(GLint location, GLsizei count, const GLint* value);
void emscripten_glUniformMatrix2fv(GLint location, GLsizei count, GLboolean transpose, const GLfloat* value);
void emscripten_glUniformMatrix3fv(GLint location, GLsizei count, GLboolean transpose, const GLfloat* value);
void emscripten_glUniformMatrix4fv(GLint location, GLsizei count, GLboolean transpose, const GLfloat* value);
void emscripten_glUseProgram(GLuint program);
void emscripten_glVertexAttrib1f(GLuint index, GLfloat x);
void emscripten_glVertexAttrib2fv(GLuint index, const GLfloat* v);
void emscripten_glVertexAttrib3fv(GLuint index, const GLfloat* v);
void emscripten_glVertexAttrib4fv(GLuint index, const GLfloat* v);
void emscripten_glVertexAttribDivisor(GLuint index, GLuint divisor);
void emscripten_glVertexAttribIPointer(GLuint index, GLint size, GLenum type, GLsizei stride, const void* pointer);
void emscripten_glVertexAttribPointer(GLuint index, GLint size, GLenum type, GLboolean normalized, GLsizei stride, const void* pointer);
void emscripten_glViewport(GLint x, GLint y, GLsizei width, GLsizei height);
void emscripten_glWaitSync(GLsync sync, GLbitfield flags, GLuint64 timeout);

// ── OES/EXT/WEBGL suffix aliases ──
// GrGLAssembleWebGLInterfaceAutogen.cpp uses GET_PROC_SUFFIX which expands
// to e.g. emscripten_glBindVertexArrayOES. Map these to the base functions.
#define emscripten_glBindVertexArrayOES emscripten_glBindVertexArray
#define emscripten_glDeleteVertexArraysOES emscripten_glDeleteVertexArrays
#define emscripten_glGenVertexArraysOES emscripten_glGenVertexArrays

#define emscripten_glBeginQueryEXT emscripten_glBeginQuery
#define emscripten_glDeleteQueriesEXT emscripten_glDeleteQueries
#define emscripten_glEndQueryEXT emscripten_glEndQuery
#define emscripten_glGenQueriesEXT emscripten_glGenQueries
#define emscripten_glGetQueryObjectuivEXT emscripten_glGetQueryObjectuiv
#define emscripten_glGetQueryivEXT emscripten_glGetQueryiv
#define emscripten_glQueryCounterEXT emscripten_glQueryCounter
#define emscripten_glGetQueryObjecti64vEXT emscripten_glGetQueryObjecti64v
#define emscripten_glGetQueryObjectui64vEXT emscripten_glGetQueryObjectui64v

#define emscripten_glDrawArraysInstancedBaseInstanceWEBGL emscripten_glDrawArraysInstancedBaseInstance
#define emscripten_glDrawElementsInstancedBaseVertexBaseInstanceWEBGL emscripten_glDrawElementsInstancedBaseVertexBaseInstance
#define emscripten_glMultiDrawArraysInstancedBaseInstanceWEBGL emscripten_glMultiDrawArraysInstancedBaseInstance
#define emscripten_glMultiDrawElementsInstancedBaseVertexBaseInstanceWEBGL emscripten_glMultiDrawElementsInstancedBaseVertexBaseInstance

#ifdef __cplusplus
}
#endif

