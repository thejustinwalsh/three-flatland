// Auto-generated GL function wrappers for WASM.
// WASM imported functions cannot have their address taken (not in indirect call table).
// These non-inline wrappers ensure addressable function pointers.

#include "emscripten_gl_shim.h"

void emscripten_glActiveTexture(GLenum texture) { __wasm_import_gl_ActiveTexture(texture); }
void emscripten_glAttachShader(GLuint program, GLuint shader) { __wasm_import_gl_AttachShader(program, shader); }
void emscripten_glBeginQuery(GLenum target, GLuint id) { __wasm_import_gl_BeginQuery(target, id); }
void emscripten_glBindAttribLocation(GLuint program, GLuint index, const GLchar* name) { __wasm_import_gl_BindAttribLocation(program, index, name); }
void emscripten_glBindBuffer(GLenum target, GLuint buffer) { __wasm_import_gl_BindBuffer(target, buffer); }
void emscripten_glBindFramebuffer(GLenum target, GLuint framebuffer) { __wasm_import_gl_BindFramebuffer(target, framebuffer); }
void emscripten_glBindRenderbuffer(GLenum target, GLuint renderbuffer) { __wasm_import_gl_BindRenderbuffer(target, renderbuffer); }
void emscripten_glBindSampler(GLuint unit, GLuint sampler) { __wasm_import_gl_BindSampler(unit, sampler); }
void emscripten_glBindTexture(GLenum target, GLuint texture) { __wasm_import_gl_BindTexture(target, texture); }
void emscripten_glBindVertexArray(GLuint array) { __wasm_import_gl_BindVertexArray(array); }
void emscripten_glBlendColor(GLfloat red, GLfloat green, GLfloat blue, GLfloat alpha) { __wasm_import_gl_BlendColor(red, green, blue, alpha); }
void emscripten_glBlendEquation(GLenum mode) { __wasm_import_gl_BlendEquation(mode); }
void emscripten_glBlendFunc(GLenum sfactor, GLenum dfactor) { __wasm_import_gl_BlendFunc(sfactor, dfactor); }
void emscripten_glBlitFramebuffer(GLint srcX0, GLint srcY0, GLint srcX1, GLint srcY1, GLint dstX0, GLint dstY0, GLint dstX1, GLint dstY1, GLbitfield mask, GLenum filter) { __wasm_import_gl_BlitFramebuffer(srcX0, srcY0, srcX1, srcY1, dstX0, dstY0, dstX1, dstY1, mask, filter); }
void emscripten_glBufferData(GLenum target, GLsizeiptr size, const void* data, GLenum usage) { __wasm_import_gl_BufferData(target, size, data, usage); }
void emscripten_glBufferSubData(GLenum target, GLintptr offset, GLsizeiptr size, const void* data) { __wasm_import_gl_BufferSubData(target, offset, size, data); }
GLenum emscripten_glCheckFramebufferStatus(GLenum target) { return __wasm_import_gl_CheckFramebufferStatus(target); }
void emscripten_glClear(GLbitfield mask) { __wasm_import_gl_Clear(mask); }
void emscripten_glClearColor(GLfloat red, GLfloat green, GLfloat blue, GLfloat alpha) { __wasm_import_gl_ClearColor(red, green, blue, alpha); }
void emscripten_glClearStencil(GLint s) { __wasm_import_gl_ClearStencil(s); }
GLenum emscripten_glClientWaitSync(GLsync sync, GLbitfield flags, GLuint64 timeout) { return __wasm_import_gl_ClientWaitSync(sync, flags, timeout); }
void emscripten_glColorMask(GLboolean red, GLboolean green, GLboolean blue, GLboolean alpha) { __wasm_import_gl_ColorMask(red, green, blue, alpha); }
void emscripten_glCompileShader(GLuint shader) { __wasm_import_gl_CompileShader(shader); }
void emscripten_glCompressedTexImage2D(GLenum target, GLint level, GLenum internalformat, GLsizei width, GLsizei height, GLint border, GLsizei imageSize, const void* data) { __wasm_import_gl_CompressedTexImage2D(target, level, internalformat, width, height, border, imageSize, data); }
void emscripten_glCompressedTexSubImage2D(GLenum target, GLint level, GLint xoffset, GLint yoffset, GLsizei width, GLsizei height, GLenum format, GLsizei imageSize, const void* data) { __wasm_import_gl_CompressedTexSubImage2D(target, level, xoffset, yoffset, width, height, format, imageSize, data); }
void emscripten_glCopyBufferSubData(GLenum readTarget, GLenum writeTarget, GLintptr readOffset, GLintptr writeOffset, GLsizeiptr size) { __wasm_import_gl_CopyBufferSubData(readTarget, writeTarget, readOffset, writeOffset, size); }
void emscripten_glCopyTexSubImage2D(GLenum target, GLint level, GLint xoffset, GLint yoffset, GLint x, GLint y, GLsizei width, GLsizei height) { __wasm_import_gl_CopyTexSubImage2D(target, level, xoffset, yoffset, x, y, width, height); }
GLuint emscripten_glCreateProgram(void) { return __wasm_import_gl_CreateProgram(); }
GLuint emscripten_glCreateShader(GLenum type) { return __wasm_import_gl_CreateShader(type); }
void emscripten_glCullFace(GLenum mode) { __wasm_import_gl_CullFace(mode); }
void emscripten_glDeleteBuffers(GLsizei n, const GLuint* buffers) { __wasm_import_gl_DeleteBuffers(n, buffers); }
void emscripten_glDeleteFramebuffers(GLsizei n, const GLuint* framebuffers) { __wasm_import_gl_DeleteFramebuffers(n, framebuffers); }
void emscripten_glDeleteProgram(GLuint program) { __wasm_import_gl_DeleteProgram(program); }
void emscripten_glDeleteQueries(GLsizei n, const GLuint* ids) { __wasm_import_gl_DeleteQueries(n, ids); }
void emscripten_glDeleteRenderbuffers(GLsizei n, const GLuint* renderbuffers) { __wasm_import_gl_DeleteRenderbuffers(n, renderbuffers); }
void emscripten_glDeleteSamplers(GLsizei n, const GLuint* samplers) { __wasm_import_gl_DeleteSamplers(n, samplers); }
void emscripten_glDeleteShader(GLuint shader) { __wasm_import_gl_DeleteShader(shader); }
void emscripten_glDeleteSync(GLsync sync) { __wasm_import_gl_DeleteSync(sync); }
void emscripten_glDeleteTextures(GLsizei n, const GLuint* textures) { __wasm_import_gl_DeleteTextures(n, textures); }
void emscripten_glDeleteVertexArrays(GLsizei n, const GLuint* arrays) { __wasm_import_gl_DeleteVertexArrays(n, arrays); }
void emscripten_glDepthMask(GLboolean flag) { __wasm_import_gl_DepthMask(flag); }
void emscripten_glDisable(GLenum cap) { __wasm_import_gl_Disable(cap); }
void emscripten_glDisableVertexAttribArray(GLuint index) { __wasm_import_gl_DisableVertexAttribArray(index); }
void emscripten_glDrawArrays(GLenum mode, GLint first, GLsizei count) { __wasm_import_gl_DrawArrays(mode, first, count); }
void emscripten_glDrawArraysInstanced(GLenum mode, GLint first, GLsizei count, GLsizei instancecount) { __wasm_import_gl_DrawArraysInstanced(mode, first, count, instancecount); }
void emscripten_glDrawArraysInstancedBaseInstance(GLenum mode, GLint first, GLsizei count, GLsizei instancecount, GLuint baseinstance) { __wasm_import_gl_DrawArraysInstancedBaseInstance(mode, first, count, instancecount, baseinstance); }
void emscripten_glDrawBuffers(GLsizei n, const GLenum* bufs) { __wasm_import_gl_DrawBuffers(n, bufs); }
void emscripten_glDrawElements(GLenum mode, GLsizei count, GLenum type, const void* indices) { __wasm_import_gl_DrawElements(mode, count, type, indices); }
void emscripten_glDrawElementsInstanced(GLenum mode, GLsizei count, GLenum type, const void* indices, GLsizei instancecount) { __wasm_import_gl_DrawElementsInstanced(mode, count, type, indices, instancecount); }
void emscripten_glDrawElementsInstancedBaseVertexBaseInstance(GLenum mode, GLsizei count, GLenum type, const void* indices, GLsizei instancecount, GLint basevertex, GLuint baseinstance) { __wasm_import_gl_DrawElementsInstancedBaseVertexBaseInstance(mode, count, type, indices, instancecount, basevertex, baseinstance); }
void emscripten_glDrawRangeElements(GLenum mode, GLuint start, GLuint end, GLsizei count, GLenum type, const void* indices) { __wasm_import_gl_DrawRangeElements(mode, start, end, count, type, indices); }
void emscripten_glEnable(GLenum cap) { __wasm_import_gl_Enable(cap); }
void emscripten_glEnableVertexAttribArray(GLuint index) { __wasm_import_gl_EnableVertexAttribArray(index); }
void emscripten_glEndQuery(GLenum target) { __wasm_import_gl_EndQuery(target); }
GLsync emscripten_glFenceSync(GLenum condition, GLbitfield flags) { return __wasm_import_gl_FenceSync(condition, flags); }
void emscripten_glFinish(void) { __wasm_import_gl_Finish(); }
void emscripten_glFlush(void) { __wasm_import_gl_Flush(); }
void emscripten_glFramebufferRenderbuffer(GLenum target, GLenum attachment, GLenum renderbuffertarget, GLuint renderbuffer) { __wasm_import_gl_FramebufferRenderbuffer(target, attachment, renderbuffertarget, renderbuffer); }
void emscripten_glFramebufferTexture2D(GLenum target, GLenum attachment, GLenum textarget, GLuint texture, GLint level) { __wasm_import_gl_FramebufferTexture2D(target, attachment, textarget, texture, level); }
void emscripten_glFrontFace(GLenum mode) { __wasm_import_gl_FrontFace(mode); }
void emscripten_glGenBuffers(GLsizei n, GLuint* buffers) { __wasm_import_gl_GenBuffers(n, buffers); }
void emscripten_glGenFramebuffers(GLsizei n, GLuint* framebuffers) { __wasm_import_gl_GenFramebuffers(n, framebuffers); }
void emscripten_glGenQueries(GLsizei n, GLuint* ids) { __wasm_import_gl_GenQueries(n, ids); }
void emscripten_glGenRenderbuffers(GLsizei n, GLuint* renderbuffers) { __wasm_import_gl_GenRenderbuffers(n, renderbuffers); }
void emscripten_glGenSamplers(GLsizei n, GLuint* samplers) { __wasm_import_gl_GenSamplers(n, samplers); }
void emscripten_glGenTextures(GLsizei n, GLuint* textures) { __wasm_import_gl_GenTextures(n, textures); }
void emscripten_glGenVertexArrays(GLsizei n, GLuint* arrays) { __wasm_import_gl_GenVertexArrays(n, arrays); }
void emscripten_glGenerateMipmap(GLenum target) { __wasm_import_gl_GenerateMipmap(target); }
void emscripten_glGetBufferParameteriv(GLenum target, GLenum pname, GLint* params) { __wasm_import_gl_GetBufferParameteriv(target, pname, params); }
GLenum emscripten_glGetError(void) { return __wasm_import_gl_GetError(); }
void emscripten_glGetFloatv(GLenum pname, GLfloat* data) { __wasm_import_gl_GetFloatv(pname, data); }
void emscripten_glGetFramebufferAttachmentParameteriv(GLenum target, GLenum attachment, GLenum pname, GLint* params) { __wasm_import_gl_GetFramebufferAttachmentParameteriv(target, attachment, pname, params); }
void emscripten_glGetIntegerv(GLenum pname, GLint* data) { __wasm_import_gl_GetIntegerv(pname, data); }
void emscripten_glGetProgramInfoLog(GLuint program, GLsizei bufSize, GLsizei* length, GLchar* infoLog) { __wasm_import_gl_GetProgramInfoLog(program, bufSize, length, infoLog); }
void emscripten_glGetProgramiv(GLuint program, GLenum pname, GLint* params) { __wasm_import_gl_GetProgramiv(program, pname, params); }
void emscripten_glGetQueryObjecti64v(GLuint id, GLenum pname, GLint64* params) { __wasm_import_gl_GetQueryObjecti64v(id, pname, params); }
void emscripten_glGetQueryObjectui64v(GLuint id, GLenum pname, GLuint64* params) { __wasm_import_gl_GetQueryObjectui64v(id, pname, params); }
void emscripten_glGetQueryObjectuiv(GLuint id, GLenum pname, GLuint* params) { __wasm_import_gl_GetQueryObjectuiv(id, pname, params); }
void emscripten_glGetQueryiv(GLenum target, GLenum pname, GLint* params) { __wasm_import_gl_GetQueryiv(target, pname, params); }
void emscripten_glGetRenderbufferParameteriv(GLenum target, GLenum pname, GLint* params) { __wasm_import_gl_GetRenderbufferParameteriv(target, pname, params); }
void emscripten_glGetShaderInfoLog(GLuint shader, GLsizei bufSize, GLsizei* length, GLchar* infoLog) { __wasm_import_gl_GetShaderInfoLog(shader, bufSize, length, infoLog); }
void emscripten_glGetShaderPrecisionFormat(GLenum shadertype, GLenum precisiontype, GLint* range, GLint* precision) { __wasm_import_gl_GetShaderPrecisionFormat(shadertype, precisiontype, range, precision); }
void emscripten_glGetShaderiv(GLuint shader, GLenum pname, GLint* params) { __wasm_import_gl_GetShaderiv(shader, pname, params); }
const GLubyte* emscripten_glGetString(GLenum name) { return __wasm_import_gl_GetString(name); }
const GLubyte* emscripten_glGetStringi(GLenum name, GLuint index) { return __wasm_import_gl_GetStringi(name, index); }
GLint emscripten_glGetUniformLocation(GLuint program, const GLchar* name) { return __wasm_import_gl_GetUniformLocation(program, name); }
void emscripten_glInvalidateFramebuffer(GLenum target, GLsizei numAttachments, const GLenum* attachments) { __wasm_import_gl_InvalidateFramebuffer(target, numAttachments, attachments); }
void emscripten_glInvalidateSubFramebuffer(GLenum target, GLsizei numAttachments, const GLenum* attachments, GLint x, GLint y, GLsizei width, GLsizei height) { __wasm_import_gl_InvalidateSubFramebuffer(target, numAttachments, attachments, x, y, width, height); }
GLboolean emscripten_glIsSync(GLsync sync) { return __wasm_import_gl_IsSync(sync); }
GLboolean emscripten_glIsTexture(GLuint texture) { return __wasm_import_gl_IsTexture(texture); }
void emscripten_glLineWidth(GLfloat width) { __wasm_import_gl_LineWidth(width); }
void emscripten_glLinkProgram(GLuint program) { __wasm_import_gl_LinkProgram(program); }
void emscripten_glMultiDrawArraysInstancedBaseInstance(GLenum mode, const GLint* firsts, const GLsizei* counts, const GLsizei* instanceCounts, const GLuint* baseInstances, GLsizei drawcount) { __wasm_import_gl_MultiDrawArraysInstancedBaseInstance(mode, firsts, counts, instanceCounts, baseInstances, drawcount); }
void emscripten_glMultiDrawElementsInstancedBaseVertexBaseInstance(GLenum mode, const GLsizei* counts, GLenum type, const void* const* offsets, const GLsizei* instanceCounts, const GLint* baseVertices, const GLuint* baseInstances, GLsizei drawcount) { __wasm_import_gl_MultiDrawElementsInstancedBaseVertexBaseInstance(mode, counts, type, offsets, instanceCounts, baseVertices, baseInstances, drawcount); }
void emscripten_glPixelStorei(GLenum pname, GLint param) { __wasm_import_gl_PixelStorei(pname, param); }
void emscripten_glQueryCounter(GLuint id, GLenum target) { __wasm_import_gl_QueryCounter(id, target); }
void emscripten_glReadBuffer(GLenum src) { __wasm_import_gl_ReadBuffer(src); }
void emscripten_glReadPixels(GLint x, GLint y, GLsizei width, GLsizei height, GLenum format, GLenum type, void* pixels) { __wasm_import_gl_ReadPixels(x, y, width, height, format, type, pixels); }
void emscripten_glRenderbufferStorage(GLenum target, GLenum internalformat, GLsizei width, GLsizei height) { __wasm_import_gl_RenderbufferStorage(target, internalformat, width, height); }
void emscripten_glRenderbufferStorageMultisample(GLenum target, GLsizei samples, GLenum internalformat, GLsizei width, GLsizei height) { __wasm_import_gl_RenderbufferStorageMultisample(target, samples, internalformat, width, height); }
void emscripten_glSamplerParameterf(GLuint sampler, GLenum pname, GLfloat param) { __wasm_import_gl_SamplerParameterf(sampler, pname, param); }
void emscripten_glSamplerParameteri(GLuint sampler, GLenum pname, GLint param) { __wasm_import_gl_SamplerParameteri(sampler, pname, param); }
void emscripten_glSamplerParameteriv(GLuint sampler, GLenum pname, const GLint* param) { __wasm_import_gl_SamplerParameteriv(sampler, pname, param); }
void emscripten_glScissor(GLint x, GLint y, GLsizei width, GLsizei height) { __wasm_import_gl_Scissor(x, y, width, height); }
void emscripten_glShaderSource(GLuint shader, GLsizei count, const GLchar* const* string, const GLint* length) { __wasm_import_gl_ShaderSource(shader, count, string, length); }
void emscripten_glStencilFunc(GLenum func, GLint ref, GLuint mask) { __wasm_import_gl_StencilFunc(func, ref, mask); }
void emscripten_glStencilFuncSeparate(GLenum face, GLenum func, GLint ref, GLuint mask) { __wasm_import_gl_StencilFuncSeparate(face, func, ref, mask); }
void emscripten_glStencilMask(GLuint mask) { __wasm_import_gl_StencilMask(mask); }
void emscripten_glStencilMaskSeparate(GLenum face, GLuint mask) { __wasm_import_gl_StencilMaskSeparate(face, mask); }
void emscripten_glStencilOp(GLenum fail, GLenum zfail, GLenum zpass) { __wasm_import_gl_StencilOp(fail, zfail, zpass); }
void emscripten_glStencilOpSeparate(GLenum face, GLenum sfail, GLenum dpfail, GLenum dppass) { __wasm_import_gl_StencilOpSeparate(face, sfail, dpfail, dppass); }
void emscripten_glTexImage2D(GLenum target, GLint level, GLint internalformat, GLsizei width, GLsizei height, GLint border, GLenum format, GLenum type, const void* pixels) { __wasm_import_gl_TexImage2D(target, level, internalformat, width, height, border, format, type, pixels); }
void emscripten_glTexParameterf(GLenum target, GLenum pname, GLfloat param) { __wasm_import_gl_TexParameterf(target, pname, param); }
void emscripten_glTexParameterfv(GLenum target, GLenum pname, const GLfloat* params) { __wasm_import_gl_TexParameterfv(target, pname, params); }
void emscripten_glTexParameteri(GLenum target, GLenum pname, GLint param) { __wasm_import_gl_TexParameteri(target, pname, param); }
void emscripten_glTexParameteriv(GLenum target, GLenum pname, const GLint* params) { __wasm_import_gl_TexParameteriv(target, pname, params); }
void emscripten_glTexStorage2D(GLenum target, GLsizei levels, GLenum internalformat, GLsizei width, GLsizei height) { __wasm_import_gl_TexStorage2D(target, levels, internalformat, width, height); }
void emscripten_glTexSubImage2D(GLenum target, GLint level, GLint xoffset, GLint yoffset, GLsizei width, GLsizei height, GLenum format, GLenum type, const void* pixels) { __wasm_import_gl_TexSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixels); }
void emscripten_glUniform1f(GLint location, GLfloat v0) { __wasm_import_gl_Uniform1f(location, v0); }
void emscripten_glUniform1fv(GLint location, GLsizei count, const GLfloat* value) { __wasm_import_gl_Uniform1fv(location, count, value); }
void emscripten_glUniform1i(GLint location, GLint v0) { __wasm_import_gl_Uniform1i(location, v0); }
void emscripten_glUniform1iv(GLint location, GLsizei count, const GLint* value) { __wasm_import_gl_Uniform1iv(location, count, value); }
void emscripten_glUniform2f(GLint location, GLfloat v0, GLfloat v1) { __wasm_import_gl_Uniform2f(location, v0, v1); }
void emscripten_glUniform2fv(GLint location, GLsizei count, const GLfloat* value) { __wasm_import_gl_Uniform2fv(location, count, value); }
void emscripten_glUniform2i(GLint location, GLint v0, GLint v1) { __wasm_import_gl_Uniform2i(location, v0, v1); }
void emscripten_glUniform2iv(GLint location, GLsizei count, const GLint* value) { __wasm_import_gl_Uniform2iv(location, count, value); }
void emscripten_glUniform3f(GLint location, GLfloat v0, GLfloat v1, GLfloat v2) { __wasm_import_gl_Uniform3f(location, v0, v1, v2); }
void emscripten_glUniform3fv(GLint location, GLsizei count, const GLfloat* value) { __wasm_import_gl_Uniform3fv(location, count, value); }
void emscripten_glUniform3i(GLint location, GLint v0, GLint v1, GLint v2) { __wasm_import_gl_Uniform3i(location, v0, v1, v2); }
void emscripten_glUniform3iv(GLint location, GLsizei count, const GLint* value) { __wasm_import_gl_Uniform3iv(location, count, value); }
void emscripten_glUniform4f(GLint location, GLfloat v0, GLfloat v1, GLfloat v2, GLfloat v3) { __wasm_import_gl_Uniform4f(location, v0, v1, v2, v3); }
void emscripten_glUniform4fv(GLint location, GLsizei count, const GLfloat* value) { __wasm_import_gl_Uniform4fv(location, count, value); }
void emscripten_glUniform4i(GLint location, GLint v0, GLint v1, GLint v2, GLint v3) { __wasm_import_gl_Uniform4i(location, v0, v1, v2, v3); }
void emscripten_glUniform4iv(GLint location, GLsizei count, const GLint* value) { __wasm_import_gl_Uniform4iv(location, count, value); }
void emscripten_glUniformMatrix2fv(GLint location, GLsizei count, GLboolean transpose, const GLfloat* value) { __wasm_import_gl_UniformMatrix2fv(location, count, transpose, value); }
void emscripten_glUniformMatrix3fv(GLint location, GLsizei count, GLboolean transpose, const GLfloat* value) { __wasm_import_gl_UniformMatrix3fv(location, count, transpose, value); }
void emscripten_glUniformMatrix4fv(GLint location, GLsizei count, GLboolean transpose, const GLfloat* value) { __wasm_import_gl_UniformMatrix4fv(location, count, transpose, value); }
void emscripten_glUseProgram(GLuint program) { __wasm_import_gl_UseProgram(program); }
void emscripten_glVertexAttrib1f(GLuint index, GLfloat x) { __wasm_import_gl_VertexAttrib1f(index, x); }
void emscripten_glVertexAttrib2fv(GLuint index, const GLfloat* v) { __wasm_import_gl_VertexAttrib2fv(index, v); }
void emscripten_glVertexAttrib3fv(GLuint index, const GLfloat* v) { __wasm_import_gl_VertexAttrib3fv(index, v); }
void emscripten_glVertexAttrib4fv(GLuint index, const GLfloat* v) { __wasm_import_gl_VertexAttrib4fv(index, v); }
void emscripten_glVertexAttribDivisor(GLuint index, GLuint divisor) { __wasm_import_gl_VertexAttribDivisor(index, divisor); }
void emscripten_glVertexAttribIPointer(GLuint index, GLint size, GLenum type, GLsizei stride, const void* pointer) { __wasm_import_gl_VertexAttribIPointer(index, size, type, stride, pointer); }
void emscripten_glVertexAttribPointer(GLuint index, GLint size, GLenum type, GLboolean normalized, GLsizei stride, const void* pointer) { __wasm_import_gl_VertexAttribPointer(index, size, type, normalized, stride, pointer); }
void emscripten_glViewport(GLint x, GLint y, GLsizei width, GLsizei height) { __wasm_import_gl_Viewport(x, y, width, height); }
void emscripten_glWaitSync(GLsync sync, GLbitfield flags, GLuint64 timeout) { __wasm_import_gl_WaitSync(sync, flags, timeout); }
