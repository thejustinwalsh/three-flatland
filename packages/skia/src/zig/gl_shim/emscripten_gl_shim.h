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
typedef void* GLsync;

#define GL_FALSE 0
#define GL_TRUE 1

#ifdef __cplusplus
extern "C" {
#endif

__attribute__((import_module("gl"), import_name("emscripten_glActiveTexture"))) void emscripten_glActiveTexture(GLenum texture);
__attribute__((import_module("gl"), import_name("emscripten_glAttachShader"))) void emscripten_glAttachShader(GLuint program, GLuint shader);
__attribute__((import_module("gl"), import_name("emscripten_glBeginQuery"))) void emscripten_glBeginQuery(GLenum target, GLuint id);
__attribute__((import_module("gl"), import_name("emscripten_glBindAttribLocation"))) void emscripten_glBindAttribLocation(GLuint program, GLuint index, const GLchar* name);
__attribute__((import_module("gl"), import_name("emscripten_glBindBuffer"))) void emscripten_glBindBuffer(GLenum target, GLuint buffer);
__attribute__((import_module("gl"), import_name("emscripten_glBindFramebuffer"))) void emscripten_glBindFramebuffer(GLenum target, GLuint framebuffer);
__attribute__((import_module("gl"), import_name("emscripten_glBindRenderbuffer"))) void emscripten_glBindRenderbuffer(GLenum target, GLuint renderbuffer);
__attribute__((import_module("gl"), import_name("emscripten_glBindSampler"))) void emscripten_glBindSampler(GLuint unit, GLuint sampler);
__attribute__((import_module("gl"), import_name("emscripten_glBindTexture"))) void emscripten_glBindTexture(GLenum target, GLuint texture);
__attribute__((import_module("gl"), import_name("emscripten_glBindVertexArray"))) void emscripten_glBindVertexArray(GLuint array);
__attribute__((import_module("gl"), import_name("emscripten_glBlendColor"))) void emscripten_glBlendColor(GLfloat red, GLfloat green, GLfloat blue, GLfloat alpha);
__attribute__((import_module("gl"), import_name("emscripten_glBlendEquation"))) void emscripten_glBlendEquation(GLenum mode);
__attribute__((import_module("gl"), import_name("emscripten_glBlendFunc"))) void emscripten_glBlendFunc(GLenum sfactor, GLenum dfactor);
__attribute__((import_module("gl"), import_name("emscripten_glBlitFramebuffer"))) void emscripten_glBlitFramebuffer(GLint srcX0, GLint srcY0, GLint srcX1, GLint srcY1, GLint dstX0, GLint dstY0, GLint dstX1, GLint dstY1, GLbitfield mask, GLenum filter);
__attribute__((import_module("gl"), import_name("emscripten_glBufferData"))) void emscripten_glBufferData(GLenum target, GLsizeiptr size, const void* data, GLenum usage);
__attribute__((import_module("gl"), import_name("emscripten_glBufferSubData"))) void emscripten_glBufferSubData(GLenum target, GLintptr offset, GLsizeiptr size, const void* data);
__attribute__((import_module("gl"), import_name("emscripten_glCheckFramebufferStatus"))) GLenum emscripten_glCheckFramebufferStatus(GLenum target);
__attribute__((import_module("gl"), import_name("emscripten_glClear"))) void emscripten_glClear(GLbitfield mask);
__attribute__((import_module("gl"), import_name("emscripten_glClearColor"))) void emscripten_glClearColor(GLfloat red, GLfloat green, GLfloat blue, GLfloat alpha);
__attribute__((import_module("gl"), import_name("emscripten_glClearStencil"))) void emscripten_glClearStencil(GLint s);
__attribute__((import_module("gl"), import_name("emscripten_glClientWaitSync"))) GLenum emscripten_glClientWaitSync(GLsync sync, GLbitfield flags, GLuint64 timeout);
__attribute__((import_module("gl"), import_name("emscripten_glColorMask"))) void emscripten_glColorMask(GLboolean red, GLboolean green, GLboolean blue, GLboolean alpha);
__attribute__((import_module("gl"), import_name("emscripten_glCompileShader"))) void emscripten_glCompileShader(GLuint shader);
__attribute__((import_module("gl"), import_name("emscripten_glCompressedTexImage2D"))) void emscripten_glCompressedTexImage2D(GLenum target, GLint level, GLenum internalformat, GLsizei width, GLsizei height, GLint border, GLsizei imageSize, const void* data);
__attribute__((import_module("gl"), import_name("emscripten_glCompressedTexSubImage2D"))) void emscripten_glCompressedTexSubImage2D(GLenum target, GLint level, GLint xoffset, GLint yoffset, GLsizei width, GLsizei height, GLenum format, GLsizei imageSize, const void* data);
__attribute__((import_module("gl"), import_name("emscripten_glCopyBufferSubData"))) void emscripten_glCopyBufferSubData(GLenum readTarget, GLenum writeTarget, GLintptr readOffset, GLintptr writeOffset, GLsizeiptr size);
__attribute__((import_module("gl"), import_name("emscripten_glCopyTexSubImage2D"))) void emscripten_glCopyTexSubImage2D(GLenum target, GLint level, GLint xoffset, GLint yoffset, GLint x, GLint y, GLsizei width, GLsizei height);
__attribute__((import_module("gl"), import_name("emscripten_glCreateProgram"))) GLuint emscripten_glCreateProgram(void);
__attribute__((import_module("gl"), import_name("emscripten_glCreateShader"))) GLuint emscripten_glCreateShader(GLenum type);
__attribute__((import_module("gl"), import_name("emscripten_glCullFace"))) void emscripten_glCullFace(GLenum mode);
__attribute__((import_module("gl"), import_name("emscripten_glDeleteBuffers"))) void emscripten_glDeleteBuffers(GLsizei n, const GLuint* buffers);
__attribute__((import_module("gl"), import_name("emscripten_glDeleteFramebuffers"))) void emscripten_glDeleteFramebuffers(GLsizei n, const GLuint* framebuffers);
__attribute__((import_module("gl"), import_name("emscripten_glDeleteProgram"))) void emscripten_glDeleteProgram(GLuint program);
__attribute__((import_module("gl"), import_name("emscripten_glDeleteQueries"))) void emscripten_glDeleteQueries(GLsizei n, const GLuint* ids);
__attribute__((import_module("gl"), import_name("emscripten_glDeleteRenderbuffers"))) void emscripten_glDeleteRenderbuffers(GLsizei n, const GLuint* renderbuffers);
__attribute__((import_module("gl"), import_name("emscripten_glDeleteSamplers"))) void emscripten_glDeleteSamplers(GLsizei n, const GLuint* samplers);
__attribute__((import_module("gl"), import_name("emscripten_glDeleteShader"))) void emscripten_glDeleteShader(GLuint shader);
__attribute__((import_module("gl"), import_name("emscripten_glDeleteSync"))) void emscripten_glDeleteSync(GLsync sync);
__attribute__((import_module("gl"), import_name("emscripten_glDeleteTextures"))) void emscripten_glDeleteTextures(GLsizei n, const GLuint* textures);
__attribute__((import_module("gl"), import_name("emscripten_glDeleteVertexArrays"))) void emscripten_glDeleteVertexArrays(GLsizei n, const GLuint* arrays);
__attribute__((import_module("gl"), import_name("emscripten_glDepthMask"))) void emscripten_glDepthMask(GLboolean flag);
__attribute__((import_module("gl"), import_name("emscripten_glDisable"))) void emscripten_glDisable(GLenum cap);
__attribute__((import_module("gl"), import_name("emscripten_glDisableVertexAttribArray"))) void emscripten_glDisableVertexAttribArray(GLuint index);
__attribute__((import_module("gl"), import_name("emscripten_glDrawArrays"))) void emscripten_glDrawArrays(GLenum mode, GLint first, GLsizei count);
__attribute__((import_module("gl"), import_name("emscripten_glDrawArraysInstanced"))) void emscripten_glDrawArraysInstanced(GLenum mode, GLint first, GLsizei count, GLsizei instancecount);
__attribute__((import_module("gl"), import_name("emscripten_glDrawArraysInstancedBaseInstance"))) void emscripten_glDrawArraysInstancedBaseInstance(GLenum mode, GLint first, GLsizei count, GLsizei instancecount, GLuint baseinstance);
__attribute__((import_module("gl"), import_name("emscripten_glDrawBuffers"))) void emscripten_glDrawBuffers(GLsizei n, const GLenum* bufs);
__attribute__((import_module("gl"), import_name("emscripten_glDrawElements"))) void emscripten_glDrawElements(GLenum mode, GLsizei count, GLenum type, const void* indices);
__attribute__((import_module("gl"), import_name("emscripten_glDrawElementsInstanced"))) void emscripten_glDrawElementsInstanced(GLenum mode, GLsizei count, GLenum type, const void* indices, GLsizei instancecount);
__attribute__((import_module("gl"), import_name("emscripten_glDrawElementsInstancedBaseVertexBaseInstance"))) void emscripten_glDrawElementsInstancedBaseVertexBaseInstance(GLenum mode, GLsizei count, GLenum type, const void* indices, GLsizei instancecount, GLint basevertex, GLuint baseinstance);
__attribute__((import_module("gl"), import_name("emscripten_glDrawRangeElements"))) void emscripten_glDrawRangeElements(GLenum mode, GLuint start, GLuint end, GLsizei count, GLenum type, const void* indices);
__attribute__((import_module("gl"), import_name("emscripten_glEnable"))) void emscripten_glEnable(GLenum cap);
__attribute__((import_module("gl"), import_name("emscripten_glEnableVertexAttribArray"))) void emscripten_glEnableVertexAttribArray(GLuint index);
__attribute__((import_module("gl"), import_name("emscripten_glEndQuery"))) void emscripten_glEndQuery(GLenum target);
__attribute__((import_module("gl"), import_name("emscripten_glFenceSync"))) GLsync emscripten_glFenceSync(GLenum condition, GLbitfield flags);
__attribute__((import_module("gl"), import_name("emscripten_glFinish"))) void emscripten_glFinish(void);
__attribute__((import_module("gl"), import_name("emscripten_glFlush"))) void emscripten_glFlush(void);
__attribute__((import_module("gl"), import_name("emscripten_glFramebufferRenderbuffer"))) void emscripten_glFramebufferRenderbuffer(GLenum target, GLenum attachment, GLenum renderbuffertarget, GLuint renderbuffer);
__attribute__((import_module("gl"), import_name("emscripten_glFramebufferTexture2D"))) void emscripten_glFramebufferTexture2D(GLenum target, GLenum attachment, GLenum textarget, GLuint texture, GLint level);
__attribute__((import_module("gl"), import_name("emscripten_glFrontFace"))) void emscripten_glFrontFace(GLenum mode);
__attribute__((import_module("gl"), import_name("emscripten_glGenBuffers"))) void emscripten_glGenBuffers(GLsizei n, GLuint* buffers);
__attribute__((import_module("gl"), import_name("emscripten_glGenFramebuffers"))) void emscripten_glGenFramebuffers(GLsizei n, GLuint* framebuffers);
__attribute__((import_module("gl"), import_name("emscripten_glGenQueries"))) void emscripten_glGenQueries(GLsizei n, GLuint* ids);
__attribute__((import_module("gl"), import_name("emscripten_glGenRenderbuffers"))) void emscripten_glGenRenderbuffers(GLsizei n, GLuint* renderbuffers);
__attribute__((import_module("gl"), import_name("emscripten_glGenSamplers"))) void emscripten_glGenSamplers(GLsizei n, GLuint* samplers);
__attribute__((import_module("gl"), import_name("emscripten_glGenTextures"))) void emscripten_glGenTextures(GLsizei n, GLuint* textures);
__attribute__((import_module("gl"), import_name("emscripten_glGenVertexArrays"))) void emscripten_glGenVertexArrays(GLsizei n, GLuint* arrays);
__attribute__((import_module("gl"), import_name("emscripten_glGenerateMipmap"))) void emscripten_glGenerateMipmap(GLenum target);
__attribute__((import_module("gl"), import_name("emscripten_glGetBufferParameteriv"))) void emscripten_glGetBufferParameteriv(GLenum target, GLenum pname, GLint* params);
__attribute__((import_module("gl"), import_name("emscripten_glGetError"))) GLenum emscripten_glGetError(void);
__attribute__((import_module("gl"), import_name("emscripten_glGetFloatv"))) void emscripten_glGetFloatv(GLenum pname, GLfloat* data);
__attribute__((import_module("gl"), import_name("emscripten_glGetFramebufferAttachmentParameteriv"))) void emscripten_glGetFramebufferAttachmentParameteriv(GLenum target, GLenum attachment, GLenum pname, GLint* params);
__attribute__((import_module("gl"), import_name("emscripten_glGetIntegerv"))) void emscripten_glGetIntegerv(GLenum pname, GLint* data);
__attribute__((import_module("gl"), import_name("emscripten_glGetProgramInfoLog"))) void emscripten_glGetProgramInfoLog(GLuint program, GLsizei bufSize, GLsizei* length, GLchar* infoLog);
__attribute__((import_module("gl"), import_name("emscripten_glGetProgramiv"))) void emscripten_glGetProgramiv(GLuint program, GLenum pname, GLint* params);
__attribute__((import_module("gl"), import_name("emscripten_glGetQueryObjecti64v"))) void emscripten_glGetQueryObjecti64v(GLuint id, GLenum pname, GLint64* params);
__attribute__((import_module("gl"), import_name("emscripten_glGetQueryObjectui64v"))) void emscripten_glGetQueryObjectui64v(GLuint id, GLenum pname, GLuint64* params);
__attribute__((import_module("gl"), import_name("emscripten_glGetQueryObjectuiv"))) void emscripten_glGetQueryObjectuiv(GLuint id, GLenum pname, GLuint* params);
__attribute__((import_module("gl"), import_name("emscripten_glGetQueryiv"))) void emscripten_glGetQueryiv(GLenum target, GLenum pname, GLint* params);
__attribute__((import_module("gl"), import_name("emscripten_glGetRenderbufferParameteriv"))) void emscripten_glGetRenderbufferParameteriv(GLenum target, GLenum pname, GLint* params);
__attribute__((import_module("gl"), import_name("emscripten_glGetShaderInfoLog"))) void emscripten_glGetShaderInfoLog(GLuint shader, GLsizei bufSize, GLsizei* length, GLchar* infoLog);
__attribute__((import_module("gl"), import_name("emscripten_glGetShaderPrecisionFormat"))) void emscripten_glGetShaderPrecisionFormat(GLenum shadertype, GLenum precisiontype, GLint* range, GLint* precision);
__attribute__((import_module("gl"), import_name("emscripten_glGetShaderiv"))) void emscripten_glGetShaderiv(GLuint shader, GLenum pname, GLint* params);
__attribute__((import_module("gl"), import_name("emscripten_glGetString"))) const GLubyte* emscripten_glGetString(GLenum name);
__attribute__((import_module("gl"), import_name("emscripten_glGetStringi"))) const GLubyte* emscripten_glGetStringi(GLenum name, GLuint index);
__attribute__((import_module("gl"), import_name("emscripten_glGetUniformLocation"))) GLint emscripten_glGetUniformLocation(GLuint program, const GLchar* name);
__attribute__((import_module("gl"), import_name("emscripten_glInvalidateFramebuffer"))) void emscripten_glInvalidateFramebuffer(GLenum target, GLsizei numAttachments, const GLenum* attachments);
__attribute__((import_module("gl"), import_name("emscripten_glInvalidateSubFramebuffer"))) void emscripten_glInvalidateSubFramebuffer(GLenum target, GLsizei numAttachments, const GLenum* attachments, GLint x, GLint y, GLsizei width, GLsizei height);
__attribute__((import_module("gl"), import_name("emscripten_glIsSync"))) GLboolean emscripten_glIsSync(GLsync sync);
__attribute__((import_module("gl"), import_name("emscripten_glIsTexture"))) GLboolean emscripten_glIsTexture(GLuint texture);
__attribute__((import_module("gl"), import_name("emscripten_glLineWidth"))) void emscripten_glLineWidth(GLfloat width);
__attribute__((import_module("gl"), import_name("emscripten_glLinkProgram"))) void emscripten_glLinkProgram(GLuint program);
__attribute__((import_module("gl"), import_name("emscripten_glMultiDrawArraysInstancedBaseInstance"))) void emscripten_glMultiDrawArraysInstancedBaseInstance(GLenum mode, const GLint* firsts, const GLsizei* counts, const GLsizei* instanceCounts, const GLuint* baseInstances, GLsizei drawcount);
__attribute__((import_module("gl"), import_name("emscripten_glMultiDrawElementsInstancedBaseVertexBaseInstance"))) void emscripten_glMultiDrawElementsInstancedBaseVertexBaseInstance(GLenum mode, const GLsizei* counts, GLenum type, const void* const* offsets, const GLsizei* instanceCounts, const GLint* baseVertices, const GLuint* baseInstances, GLsizei drawcount);
__attribute__((import_module("gl"), import_name("emscripten_glPixelStorei"))) void emscripten_glPixelStorei(GLenum pname, GLint param);
__attribute__((import_module("gl"), import_name("emscripten_glQueryCounter"))) void emscripten_glQueryCounter(GLuint id, GLenum target);
__attribute__((import_module("gl"), import_name("emscripten_glReadBuffer"))) void emscripten_glReadBuffer(GLenum src);
__attribute__((import_module("gl"), import_name("emscripten_glReadPixels"))) void emscripten_glReadPixels(GLint x, GLint y, GLsizei width, GLsizei height, GLenum format, GLenum type, void* pixels);
__attribute__((import_module("gl"), import_name("emscripten_glRenderbufferStorage"))) void emscripten_glRenderbufferStorage(GLenum target, GLenum internalformat, GLsizei width, GLsizei height);
__attribute__((import_module("gl"), import_name("emscripten_glRenderbufferStorageMultisample"))) void emscripten_glRenderbufferStorageMultisample(GLenum target, GLsizei samples, GLenum internalformat, GLsizei width, GLsizei height);
__attribute__((import_module("gl"), import_name("emscripten_glSamplerParameterf"))) void emscripten_glSamplerParameterf(GLuint sampler, GLenum pname, GLfloat param);
__attribute__((import_module("gl"), import_name("emscripten_glSamplerParameteri"))) void emscripten_glSamplerParameteri(GLuint sampler, GLenum pname, GLint param);
__attribute__((import_module("gl"), import_name("emscripten_glSamplerParameteriv"))) void emscripten_glSamplerParameteriv(GLuint sampler, GLenum pname, const GLint* param);
__attribute__((import_module("gl"), import_name("emscripten_glScissor"))) void emscripten_glScissor(GLint x, GLint y, GLsizei width, GLsizei height);
__attribute__((import_module("gl"), import_name("emscripten_glShaderSource"))) void emscripten_glShaderSource(GLuint shader, GLsizei count, const GLchar* const* string, const GLint* length);
__attribute__((import_module("gl"), import_name("emscripten_glStencilFunc"))) void emscripten_glStencilFunc(GLenum func, GLint ref, GLuint mask);
__attribute__((import_module("gl"), import_name("emscripten_glStencilFuncSeparate"))) void emscripten_glStencilFuncSeparate(GLenum face, GLenum func, GLint ref, GLuint mask);
__attribute__((import_module("gl"), import_name("emscripten_glStencilMask"))) void emscripten_glStencilMask(GLuint mask);
__attribute__((import_module("gl"), import_name("emscripten_glStencilMaskSeparate"))) void emscripten_glStencilMaskSeparate(GLenum face, GLuint mask);
__attribute__((import_module("gl"), import_name("emscripten_glStencilOp"))) void emscripten_glStencilOp(GLenum fail, GLenum zfail, GLenum zpass);
__attribute__((import_module("gl"), import_name("emscripten_glStencilOpSeparate"))) void emscripten_glStencilOpSeparate(GLenum face, GLenum sfail, GLenum dpfail, GLenum dppass);
__attribute__((import_module("gl"), import_name("emscripten_glTexImage2D"))) void emscripten_glTexImage2D(GLenum target, GLint level, GLint internalformat, GLsizei width, GLsizei height, GLint border, GLenum format, GLenum type, const void* pixels);
__attribute__((import_module("gl"), import_name("emscripten_glTexParameterf"))) void emscripten_glTexParameterf(GLenum target, GLenum pname, GLfloat param);
__attribute__((import_module("gl"), import_name("emscripten_glTexParameterfv"))) void emscripten_glTexParameterfv(GLenum target, GLenum pname, const GLfloat* params);
__attribute__((import_module("gl"), import_name("emscripten_glTexParameteri"))) void emscripten_glTexParameteri(GLenum target, GLenum pname, GLint param);
__attribute__((import_module("gl"), import_name("emscripten_glTexParameteriv"))) void emscripten_glTexParameteriv(GLenum target, GLenum pname, const GLint* params);
__attribute__((import_module("gl"), import_name("emscripten_glTexStorage2D"))) void emscripten_glTexStorage2D(GLenum target, GLsizei levels, GLenum internalformat, GLsizei width, GLsizei height);
__attribute__((import_module("gl"), import_name("emscripten_glTexSubImage2D"))) void emscripten_glTexSubImage2D(GLenum target, GLint level, GLint xoffset, GLint yoffset, GLsizei width, GLsizei height, GLenum format, GLenum type, const void* pixels);
__attribute__((import_module("gl"), import_name("emscripten_glUniform1f"))) void emscripten_glUniform1f(GLint location, GLfloat v0);
__attribute__((import_module("gl"), import_name("emscripten_glUniform1fv"))) void emscripten_glUniform1fv(GLint location, GLsizei count, const GLfloat* value);
__attribute__((import_module("gl"), import_name("emscripten_glUniform1i"))) void emscripten_glUniform1i(GLint location, GLint v0);
__attribute__((import_module("gl"), import_name("emscripten_glUniform1iv"))) void emscripten_glUniform1iv(GLint location, GLsizei count, const GLint* value);
__attribute__((import_module("gl"), import_name("emscripten_glUniform2f"))) void emscripten_glUniform2f(GLint location, GLfloat v0, GLfloat v1);
__attribute__((import_module("gl"), import_name("emscripten_glUniform2fv"))) void emscripten_glUniform2fv(GLint location, GLsizei count, const GLfloat* value);
__attribute__((import_module("gl"), import_name("emscripten_glUniform2i"))) void emscripten_glUniform2i(GLint location, GLint v0, GLint v1);
__attribute__((import_module("gl"), import_name("emscripten_glUniform2iv"))) void emscripten_glUniform2iv(GLint location, GLsizei count, const GLint* value);
__attribute__((import_module("gl"), import_name("emscripten_glUniform3f"))) void emscripten_glUniform3f(GLint location, GLfloat v0, GLfloat v1, GLfloat v2);
__attribute__((import_module("gl"), import_name("emscripten_glUniform3fv"))) void emscripten_glUniform3fv(GLint location, GLsizei count, const GLfloat* value);
__attribute__((import_module("gl"), import_name("emscripten_glUniform3i"))) void emscripten_glUniform3i(GLint location, GLint v0, GLint v1, GLint v2);
__attribute__((import_module("gl"), import_name("emscripten_glUniform3iv"))) void emscripten_glUniform3iv(GLint location, GLsizei count, const GLint* value);
__attribute__((import_module("gl"), import_name("emscripten_glUniform4f"))) void emscripten_glUniform4f(GLint location, GLfloat v0, GLfloat v1, GLfloat v2, GLfloat v3);
__attribute__((import_module("gl"), import_name("emscripten_glUniform4fv"))) void emscripten_glUniform4fv(GLint location, GLsizei count, const GLfloat* value);
__attribute__((import_module("gl"), import_name("emscripten_glUniform4i"))) void emscripten_glUniform4i(GLint location, GLint v0, GLint v1, GLint v2, GLint v3);
__attribute__((import_module("gl"), import_name("emscripten_glUniform4iv"))) void emscripten_glUniform4iv(GLint location, GLsizei count, const GLint* value);
__attribute__((import_module("gl"), import_name("emscripten_glUniformMatrix2fv"))) void emscripten_glUniformMatrix2fv(GLint location, GLsizei count, GLboolean transpose, const GLfloat* value);
__attribute__((import_module("gl"), import_name("emscripten_glUniformMatrix3fv"))) void emscripten_glUniformMatrix3fv(GLint location, GLsizei count, GLboolean transpose, const GLfloat* value);
__attribute__((import_module("gl"), import_name("emscripten_glUniformMatrix4fv"))) void emscripten_glUniformMatrix4fv(GLint location, GLsizei count, GLboolean transpose, const GLfloat* value);
__attribute__((import_module("gl"), import_name("emscripten_glUseProgram"))) void emscripten_glUseProgram(GLuint program);
__attribute__((import_module("gl"), import_name("emscripten_glVertexAttrib1f"))) void emscripten_glVertexAttrib1f(GLuint index, GLfloat x);
__attribute__((import_module("gl"), import_name("emscripten_glVertexAttrib2fv"))) void emscripten_glVertexAttrib2fv(GLuint index, const GLfloat* v);
__attribute__((import_module("gl"), import_name("emscripten_glVertexAttrib3fv"))) void emscripten_glVertexAttrib3fv(GLuint index, const GLfloat* v);
__attribute__((import_module("gl"), import_name("emscripten_glVertexAttrib4fv"))) void emscripten_glVertexAttrib4fv(GLuint index, const GLfloat* v);
__attribute__((import_module("gl"), import_name("emscripten_glVertexAttribDivisor"))) void emscripten_glVertexAttribDivisor(GLuint index, GLuint divisor);
__attribute__((import_module("gl"), import_name("emscripten_glVertexAttribIPointer"))) void emscripten_glVertexAttribIPointer(GLuint index, GLint size, GLenum type, GLsizei stride, const void* pointer);
__attribute__((import_module("gl"), import_name("emscripten_glVertexAttribPointer"))) void emscripten_glVertexAttribPointer(GLuint index, GLint size, GLenum type, GLboolean normalized, GLsizei stride, const void* pointer);
__attribute__((import_module("gl"), import_name("emscripten_glViewport"))) void emscripten_glViewport(GLint x, GLint y, GLsizei width, GLsizei height);
__attribute__((import_module("gl"), import_name("emscripten_glWaitSync"))) void emscripten_glWaitSync(GLsync sync, GLbitfield flags, GLuint64 timeout);

#ifdef __cplusplus
}
#endif
