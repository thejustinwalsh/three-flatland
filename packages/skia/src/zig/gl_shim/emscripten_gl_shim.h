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

#define GL_IMPORT __attribute__((import_module("gl")))

GL_IMPORT void emscripten_glActiveTexture(GLenum texture);
GL_IMPORT void emscripten_glAttachShader(GLuint program, GLuint shader);
GL_IMPORT void emscripten_glBeginQuery(GLenum target, GLuint id);
GL_IMPORT void emscripten_glBindAttribLocation(GLuint program, GLuint index, const GLchar* name);
GL_IMPORT void emscripten_glBindBuffer(GLenum target, GLuint buffer);
GL_IMPORT void emscripten_glBindFramebuffer(GLenum target, GLuint framebuffer);
GL_IMPORT void emscripten_glBindRenderbuffer(GLenum target, GLuint renderbuffer);
GL_IMPORT void emscripten_glBindSampler(GLuint unit, GLuint sampler);
GL_IMPORT void emscripten_glBindTexture(GLenum target, GLuint texture);
GL_IMPORT void emscripten_glBindVertexArray(GLuint array);
GL_IMPORT void emscripten_glBlendColor(GLfloat red, GLfloat green, GLfloat blue, GLfloat alpha);
GL_IMPORT void emscripten_glBlendEquation(GLenum mode);
GL_IMPORT void emscripten_glBlendFunc(GLenum sfactor, GLenum dfactor);
GL_IMPORT void emscripten_glBlitFramebuffer(GLint srcX0, GLint srcY0, GLint srcX1, GLint srcY1, GLint dstX0, GLint dstY0, GLint dstX1, GLint dstY1, GLbitfield mask, GLenum filter);
GL_IMPORT void emscripten_glBufferData(GLenum target, GLsizeiptr size, const void* data, GLenum usage);
GL_IMPORT void emscripten_glBufferSubData(GLenum target, GLintptr offset, GLsizeiptr size, const void* data);
GL_IMPORT GLenum emscripten_glCheckFramebufferStatus(GLenum target);
GL_IMPORT void emscripten_glClear(GLbitfield mask);
GL_IMPORT void emscripten_glClearColor(GLfloat red, GLfloat green, GLfloat blue, GLfloat alpha);
GL_IMPORT void emscripten_glClearStencil(GLint s);
GL_IMPORT GLenum emscripten_glClientWaitSync(GLsync sync, GLbitfield flags, GLuint64 timeout);
GL_IMPORT void emscripten_glColorMask(GLboolean red, GLboolean green, GLboolean blue, GLboolean alpha);
GL_IMPORT void emscripten_glCompileShader(GLuint shader);
GL_IMPORT void emscripten_glCompressedTexImage2D(GLenum target, GLint level, GLenum internalformat, GLsizei width, GLsizei height, GLint border, GLsizei imageSize, const void* data);
GL_IMPORT void emscripten_glCompressedTexSubImage2D(GLenum target, GLint level, GLint xoffset, GLint yoffset, GLsizei width, GLsizei height, GLenum format, GLsizei imageSize, const void* data);
GL_IMPORT void emscripten_glCopyBufferSubData(GLenum readTarget, GLenum writeTarget, GLintptr readOffset, GLintptr writeOffset, GLsizeiptr size);
GL_IMPORT void emscripten_glCopyTexSubImage2D(GLenum target, GLint level, GLint xoffset, GLint yoffset, GLint x, GLint y, GLsizei width, GLsizei height);
GL_IMPORT GLuint emscripten_glCreateProgram(void);
GL_IMPORT GLuint emscripten_glCreateShader(GLenum type);
GL_IMPORT void emscripten_glCullFace(GLenum mode);
GL_IMPORT void emscripten_glDeleteBuffers(GLsizei n, const GLuint* buffers);
GL_IMPORT void emscripten_glDeleteFramebuffers(GLsizei n, const GLuint* framebuffers);
GL_IMPORT void emscripten_glDeleteProgram(GLuint program);
GL_IMPORT void emscripten_glDeleteQueries(GLsizei n, const GLuint* ids);
GL_IMPORT void emscripten_glDeleteRenderbuffers(GLsizei n, const GLuint* renderbuffers);
GL_IMPORT void emscripten_glDeleteSamplers(GLsizei n, const GLuint* samplers);
GL_IMPORT void emscripten_glDeleteShader(GLuint shader);
GL_IMPORT void emscripten_glDeleteSync(GLsync sync);
GL_IMPORT void emscripten_glDeleteTextures(GLsizei n, const GLuint* textures);
GL_IMPORT void emscripten_glDeleteVertexArrays(GLsizei n, const GLuint* arrays);
GL_IMPORT void emscripten_glDepthMask(GLboolean flag);
GL_IMPORT void emscripten_glDisable(GLenum cap);
GL_IMPORT void emscripten_glDisableVertexAttribArray(GLuint index);
GL_IMPORT void emscripten_glDrawArrays(GLenum mode, GLint first, GLsizei count);
GL_IMPORT void emscripten_glDrawArraysInstanced(GLenum mode, GLint first, GLsizei count, GLsizei instancecount);
GL_IMPORT void emscripten_glDrawArraysInstancedBaseInstance(GLenum mode, GLint first, GLsizei count, GLsizei instancecount, GLuint baseinstance);
GL_IMPORT void emscripten_glDrawBuffers(GLsizei n, const GLenum* bufs);
GL_IMPORT void emscripten_glDrawElements(GLenum mode, GLsizei count, GLenum type, const void* indices);
GL_IMPORT void emscripten_glDrawElementsInstanced(GLenum mode, GLsizei count, GLenum type, const void* indices, GLsizei instancecount);
GL_IMPORT void emscripten_glDrawElementsInstancedBaseVertexBaseInstance(GLenum mode, GLsizei count, GLenum type, const void* indices, GLsizei instancecount, GLint basevertex, GLuint baseinstance);
GL_IMPORT void emscripten_glDrawRangeElements(GLenum mode, GLuint start, GLuint end, GLsizei count, GLenum type, const void* indices);
GL_IMPORT void emscripten_glEnable(GLenum cap);
GL_IMPORT void emscripten_glEnableVertexAttribArray(GLuint index);
GL_IMPORT void emscripten_glEndQuery(GLenum target);
GL_IMPORT GLsync emscripten_glFenceSync(GLenum condition, GLbitfield flags);
GL_IMPORT void emscripten_glFinish(void);
GL_IMPORT void emscripten_glFlush(void);
GL_IMPORT void emscripten_glFramebufferRenderbuffer(GLenum target, GLenum attachment, GLenum renderbuffertarget, GLuint renderbuffer);
GL_IMPORT void emscripten_glFramebufferTexture2D(GLenum target, GLenum attachment, GLenum textarget, GLuint texture, GLint level);
GL_IMPORT void emscripten_glFrontFace(GLenum mode);
GL_IMPORT void emscripten_glGenBuffers(GLsizei n, GLuint* buffers);
GL_IMPORT void emscripten_glGenFramebuffers(GLsizei n, GLuint* framebuffers);
GL_IMPORT void emscripten_glGenQueries(GLsizei n, GLuint* ids);
GL_IMPORT void emscripten_glGenRenderbuffers(GLsizei n, GLuint* renderbuffers);
GL_IMPORT void emscripten_glGenSamplers(GLsizei n, GLuint* samplers);
GL_IMPORT void emscripten_glGenTextures(GLsizei n, GLuint* textures);
GL_IMPORT void emscripten_glGenVertexArrays(GLsizei n, GLuint* arrays);
GL_IMPORT void emscripten_glGenerateMipmap(GLenum target);
GL_IMPORT void emscripten_glGetBufferParameteriv(GLenum target, GLenum pname, GLint* params);
GL_IMPORT GLenum emscripten_glGetError(void);
GL_IMPORT void emscripten_glGetFloatv(GLenum pname, GLfloat* data);
GL_IMPORT void emscripten_glGetFramebufferAttachmentParameteriv(GLenum target, GLenum attachment, GLenum pname, GLint* params);
GL_IMPORT void emscripten_glGetIntegerv(GLenum pname, GLint* data);
GL_IMPORT void emscripten_glGetProgramInfoLog(GLuint program, GLsizei bufSize, GLsizei* length, GLchar* infoLog);
GL_IMPORT void emscripten_glGetProgramiv(GLuint program, GLenum pname, GLint* params);
GL_IMPORT void emscripten_glGetQueryObjecti64v(GLuint id, GLenum pname, GLint64* params);
GL_IMPORT void emscripten_glGetQueryObjectui64v(GLuint id, GLenum pname, GLuint64* params);
GL_IMPORT void emscripten_glGetQueryObjectuiv(GLuint id, GLenum pname, GLuint* params);
GL_IMPORT void emscripten_glGetQueryiv(GLenum target, GLenum pname, GLint* params);
GL_IMPORT void emscripten_glGetRenderbufferParameteriv(GLenum target, GLenum pname, GLint* params);
GL_IMPORT void emscripten_glGetShaderInfoLog(GLuint shader, GLsizei bufSize, GLsizei* length, GLchar* infoLog);
GL_IMPORT void emscripten_glGetShaderPrecisionFormat(GLenum shadertype, GLenum precisiontype, GLint* range, GLint* precision);
GL_IMPORT void emscripten_glGetShaderiv(GLuint shader, GLenum pname, GLint* params);
GL_IMPORT const GLubyte* emscripten_glGetString(GLenum name);
GL_IMPORT const GLubyte* emscripten_glGetStringi(GLenum name, GLuint index);
GL_IMPORT GLint emscripten_glGetUniformLocation(GLuint program, const GLchar* name);
GL_IMPORT void emscripten_glInvalidateFramebuffer(GLenum target, GLsizei numAttachments, const GLenum* attachments);
GL_IMPORT void emscripten_glInvalidateSubFramebuffer(GLenum target, GLsizei numAttachments, const GLenum* attachments, GLint x, GLint y, GLsizei width, GLsizei height);
GL_IMPORT GLboolean emscripten_glIsSync(GLsync sync);
GL_IMPORT GLboolean emscripten_glIsTexture(GLuint texture);
GL_IMPORT void emscripten_glLineWidth(GLfloat width);
GL_IMPORT void emscripten_glLinkProgram(GLuint program);
GL_IMPORT void emscripten_glMultiDrawArraysInstancedBaseInstance(GLenum mode, const GLint* firsts, const GLsizei* counts, const GLsizei* instanceCounts, const GLuint* baseInstances, GLsizei drawcount);
GL_IMPORT void emscripten_glMultiDrawElementsInstancedBaseVertexBaseInstance(GLenum mode, const GLsizei* counts, GLenum type, const void* const* offsets, const GLsizei* instanceCounts, const GLint* baseVertices, const GLuint* baseInstances, GLsizei drawcount);
GL_IMPORT void emscripten_glPixelStorei(GLenum pname, GLint param);
GL_IMPORT void emscripten_glQueryCounter(GLuint id, GLenum target);
GL_IMPORT void emscripten_glReadBuffer(GLenum src);
GL_IMPORT void emscripten_glReadPixels(GLint x, GLint y, GLsizei width, GLsizei height, GLenum format, GLenum type, void* pixels);
GL_IMPORT void emscripten_glRenderbufferStorage(GLenum target, GLenum internalformat, GLsizei width, GLsizei height);
GL_IMPORT void emscripten_glRenderbufferStorageMultisample(GLenum target, GLsizei samples, GLenum internalformat, GLsizei width, GLsizei height);
GL_IMPORT void emscripten_glSamplerParameterf(GLuint sampler, GLenum pname, GLfloat param);
GL_IMPORT void emscripten_glSamplerParameteri(GLuint sampler, GLenum pname, GLint param);
GL_IMPORT void emscripten_glSamplerParameteriv(GLuint sampler, GLenum pname, const GLint* param);
GL_IMPORT void emscripten_glScissor(GLint x, GLint y, GLsizei width, GLsizei height);
GL_IMPORT void emscripten_glShaderSource(GLuint shader, GLsizei count, const GLchar* const* string, const GLint* length);
GL_IMPORT void emscripten_glStencilFunc(GLenum func, GLint ref, GLuint mask);
GL_IMPORT void emscripten_glStencilFuncSeparate(GLenum face, GLenum func, GLint ref, GLuint mask);
GL_IMPORT void emscripten_glStencilMask(GLuint mask);
GL_IMPORT void emscripten_glStencilMaskSeparate(GLenum face, GLuint mask);
GL_IMPORT void emscripten_glStencilOp(GLenum fail, GLenum zfail, GLenum zpass);
GL_IMPORT void emscripten_glStencilOpSeparate(GLenum face, GLenum sfail, GLenum dpfail, GLenum dppass);
GL_IMPORT void emscripten_glTexImage2D(GLenum target, GLint level, GLint internalformat, GLsizei width, GLsizei height, GLint border, GLenum format, GLenum type, const void* pixels);
GL_IMPORT void emscripten_glTexParameterf(GLenum target, GLenum pname, GLfloat param);
GL_IMPORT void emscripten_glTexParameterfv(GLenum target, GLenum pname, const GLfloat* params);
GL_IMPORT void emscripten_glTexParameteri(GLenum target, GLenum pname, GLint param);
GL_IMPORT void emscripten_glTexParameteriv(GLenum target, GLenum pname, const GLint* params);
GL_IMPORT void emscripten_glTexStorage2D(GLenum target, GLsizei levels, GLenum internalformat, GLsizei width, GLsizei height);
GL_IMPORT void emscripten_glTexSubImage2D(GLenum target, GLint level, GLint xoffset, GLint yoffset, GLsizei width, GLsizei height, GLenum format, GLenum type, const void* pixels);
GL_IMPORT void emscripten_glUniform1f(GLint location, GLfloat v0);
GL_IMPORT void emscripten_glUniform1fv(GLint location, GLsizei count, const GLfloat* value);
GL_IMPORT void emscripten_glUniform1i(GLint location, GLint v0);
GL_IMPORT void emscripten_glUniform1iv(GLint location, GLsizei count, const GLint* value);
GL_IMPORT void emscripten_glUniform2f(GLint location, GLfloat v0, GLfloat v1);
GL_IMPORT void emscripten_glUniform2fv(GLint location, GLsizei count, const GLfloat* value);
GL_IMPORT void emscripten_glUniform2i(GLint location, GLint v0, GLint v1);
GL_IMPORT void emscripten_glUniform2iv(GLint location, GLsizei count, const GLint* value);
GL_IMPORT void emscripten_glUniform3f(GLint location, GLfloat v0, GLfloat v1, GLfloat v2);
GL_IMPORT void emscripten_glUniform3fv(GLint location, GLsizei count, const GLfloat* value);
GL_IMPORT void emscripten_glUniform3i(GLint location, GLint v0, GLint v1, GLint v2);
GL_IMPORT void emscripten_glUniform3iv(GLint location, GLsizei count, const GLint* value);
GL_IMPORT void emscripten_glUniform4f(GLint location, GLfloat v0, GLfloat v1, GLfloat v2, GLfloat v3);
GL_IMPORT void emscripten_glUniform4fv(GLint location, GLsizei count, const GLfloat* value);
GL_IMPORT void emscripten_glUniform4i(GLint location, GLint v0, GLint v1, GLint v2, GLint v3);
GL_IMPORT void emscripten_glUniform4iv(GLint location, GLsizei count, const GLint* value);
GL_IMPORT void emscripten_glUniformMatrix2fv(GLint location, GLsizei count, GLboolean transpose, const GLfloat* value);
GL_IMPORT void emscripten_glUniformMatrix3fv(GLint location, GLsizei count, GLboolean transpose, const GLfloat* value);
GL_IMPORT void emscripten_glUniformMatrix4fv(GLint location, GLsizei count, GLboolean transpose, const GLfloat* value);
GL_IMPORT void emscripten_glUseProgram(GLuint program);
GL_IMPORT void emscripten_glVertexAttrib1f(GLuint index, GLfloat x);
GL_IMPORT void emscripten_glVertexAttrib2fv(GLuint index, const GLfloat* v);
GL_IMPORT void emscripten_glVertexAttrib3fv(GLuint index, const GLfloat* v);
GL_IMPORT void emscripten_glVertexAttrib4fv(GLuint index, const GLfloat* v);
GL_IMPORT void emscripten_glVertexAttribDivisor(GLuint index, GLuint divisor);
GL_IMPORT void emscripten_glVertexAttribIPointer(GLuint index, GLint size, GLenum type, GLsizei stride, const void* pointer);
GL_IMPORT void emscripten_glVertexAttribPointer(GLuint index, GLint size, GLenum type, GLboolean normalized, GLsizei stride, const void* pointer);
GL_IMPORT void emscripten_glViewport(GLint x, GLint y, GLsizei width, GLsizei height);
GL_IMPORT void emscripten_glWaitSync(GLsync sync, GLbitfield flags, GLuint64 timeout);

#undef GL_IMPORT
