/**
 * WASM loader for the Skia GL variant.
 *
 * Instantiates skia-gl.wasm with:
 *   - "gl" module: WebGL2 function imports
 *   - "env" module: Skia runtime stubs (logging, semaphores)
 *   - "wasi_snapshot_preview1" module: minimal WASI stubs
 *
 * @internal
 */

import { createEnvImports, createWasiImports, instantiateWasm } from './wasm-loader-shared'

// ── GL object handle tables ──
// WebGL uses JS objects, WASM uses integer handles.
// We maintain bidirectional mappings.

interface GLState {
  gl: WebGL2RenderingContext
  memory: WebAssembly.Memory
  exports: WebAssembly.Exports | null
  textures: Map<number, WebGLTexture | null>
  buffers: Map<number, WebGLBuffer | null>
  framebuffers: Map<number, WebGLFramebuffer | null>
  renderbuffers: Map<number, WebGLRenderbuffer | null>
  programs: Map<number, WebGLProgram | null>
  shaders: Map<number, WebGLShader | null>
  vaos: Map<number, WebGLVertexArrayObject | null>
  queries: Map<number, WebGLQuery | null>
  samplers: Map<number, WebGLSampler | null>
  syncs: Map<number, WebGLSync | null>
  uniforms: Map<number, WebGLUniformLocation | null>
  nextId: number
  // Cached string pointers for glGetString (string → WASM ptr)
  stringPtrs: Map<string, number>
}

function createGLState(gl: WebGL2RenderingContext): GLState {
  return {
    gl,
    memory: null!,
    exports: null,
    textures: new Map(),
    buffers: new Map(),
    framebuffers: new Map(),
    renderbuffers: new Map(),
    programs: new Map(),
    shaders: new Map(),
    vaos: new Map(),
    queries: new Map(),
    samplers: new Map(),
    syncs: new Map(),
    uniforms: new Map(),
    nextId: 1,
    stringPtrs: new Map(),
  }
}

function allocId(state: GLState): number {
  return state.nextId++
}

// ── Memory helpers ──

function getMemoryView(state: GLState) {
  return new DataView(state.memory.buffer)
}

function writeU32(state: GLState, ptr: number, value: number) {
  getMemoryView(state).setUint32(ptr, value, true)
}

function readU32(state: GLState, ptr: number): number {
  return getMemoryView(state).getUint32(ptr, true)
}

function readString(state: GLState, ptr: number): string {
  const bytes = new Uint8Array(state.memory.buffer)
  let end = ptr
  while (bytes[end] !== 0) end++
  return new TextDecoder().decode(bytes.slice(ptr, end))
}

function writeString(state: GLState, ptr: number, maxLen: number, str: string): number {
  const bytes = new TextEncoder().encode(str)
  const len = Math.min(bytes.length, maxLen - 1)
  new Uint8Array(state.memory.buffer).set(bytes.subarray(0, len), ptr)
  new Uint8Array(state.memory.buffer)[ptr + len] = 0
  return len
}

// ── String allocation into WASM memory ──

/** Allocate a null-terminated string in WASM memory via cabi_realloc. Cached. */
function allocString(state: GLState, str: string): number {
  const cached = state.stringPtrs.get(str)
  if (cached !== undefined) return cached
  const bytes = new TextEncoder().encode(str + '\0')
  const alloc = state.exports!.cabi_realloc as (oldPtr: number, oldSize: number, align: number, newSize: number) => number
  const ptr = alloc(0, 0, 1, bytes.length)
  new Uint8Array(state.memory.buffer, ptr, bytes.length).set(bytes)
  state.stringPtrs.set(str, ptr)
  return ptr
}

// ── GL imports ──

function createGLImports(state: GLState): Record<string, WebAssembly.ImportValue> {
  const { gl } = state

  const GL_VERSION = 0x1F02
  const GL_EXTENSIONS = 0x1F03
  const GL_SHADING_LANGUAGE_VERSION = 0x8B8C
  const GL_NUM_EXTENSIONS = 0x821D
  const GL_UNMASKED_VENDOR_WEBGL = 0x9245
  const GL_UNMASKED_RENDERER_WEBGL = 0x9246

  return {
    emscripten_glGetString(name: number): number {
      let str: string | null = null

      if (name === GL_EXTENSIONS) {
        str = (gl.getSupportedExtensions() || []).join(' ')
      } else {
        try { str = gl.getParameter(name) as string } catch { str = null }
        if (str == null) { gl.getError(); } // clear error from unsupported enum
      }

      // Skia's MakeWebGL parser expects Emscripten-style version strings.
      // Browsers return "WebGL 2.0 (...)" — rewrite to OpenGL ES format.
      if (name === GL_VERSION && typeof str === 'string' && str.startsWith('WebGL')) {
        const m = str.match(/WebGL (\d+)\.(\d+)/)
        if (m) {
          const webglMaj = parseInt(m[1]!)
          const esMaj = webglMaj === 2 ? 3 : 2
          str = `OpenGL ES ${esMaj}.0 (${str})`
        }
      }

      // GLSL version: "WebGL GLSL ES 3.00 (...)" → "OpenGL ES GLSL ES 3.00"
      if (name === GL_SHADING_LANGUAGE_VERSION && typeof str === 'string' && str.startsWith('WebGL GLSL ES')) {
        const m = str.match(/WebGL GLSL ES (\d+\.\d+)/)
        if (m) str = `OpenGL ES GLSL ES ${m[1]}`
      }

      // WEBGL_debug_renderer_info extension constants
      if (str == null && (name === GL_UNMASKED_VENDOR_WEBGL || name === GL_UNMASKED_RENDERER_WEBGL)) {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info')
        if (dbg) str = gl.getParameter(name) as string
        if (str == null) str = gl.getParameter(name === GL_UNMASKED_RENDERER_WEBGL ? gl.RENDERER : gl.VENDOR) as string
      }

      // Return empty string for unknown enums rather than null
      if (typeof str !== 'string') str = ''

      return allocString(state, str)
    },

    emscripten_glActiveTexture(texture: number) { gl.activeTexture(texture) },
    emscripten_glAttachShader(program: number, shader: number) {
      gl.attachShader(state.programs.get(program)!, state.shaders.get(shader)!)
    },
    emscripten_glBindBuffer(target: number, buffer: number) {
      gl.bindBuffer(target, buffer ? state.buffers.get(buffer)! : null)
    },
    emscripten_glBindFramebuffer(target: number, framebuffer: number) {
      gl.bindFramebuffer(target, framebuffer ? state.framebuffers.get(framebuffer)! : null)
    },
    emscripten_glBindRenderbuffer(target: number, renderbuffer: number) {
      gl.bindRenderbuffer(target, renderbuffer ? state.renderbuffers.get(renderbuffer)! : null)
    },
    emscripten_glBindTexture(target: number, texture: number) {
      gl.bindTexture(target, texture ? state.textures.get(texture)! : null)
    },
    emscripten_glBindVertexArray(array: number) {
      const vao = array ? state.vaos.get(array)! : null
      gl.bindVertexArray(vao)
    },
    emscripten_glBlendColor(r: number, g: number, b: number, a: number) { gl.blendColor(r, g, b, a) },
    emscripten_glBlendEquation(mode: number) { gl.blendEquation(mode) },
    emscripten_glBlendFunc(sfactor: number, dfactor: number) { gl.blendFunc(sfactor, dfactor) },
    emscripten_glBufferData(target: number, size: number, data: number, usage: number) {
      if (data) {
        gl.bufferData(target, new Uint8Array(state.memory.buffer, data, size), usage)
      } else {
        gl.bufferData(target, size, usage)
      }
    },
    emscripten_glBufferSubData(target: number, offset: number, size: number, data: number) {
      gl.bufferSubData(target, offset, new Uint8Array(state.memory.buffer, data, size))
    },
    emscripten_glCheckFramebufferStatus(target: number): number { return gl.checkFramebufferStatus(target) },
    emscripten_glClear(mask: number) { gl.clear(mask) },
    emscripten_glClearColor(r: number, g: number, b: number, a: number) { gl.clearColor(r, g, b, a) },
    emscripten_glClearStencil(s: number) { gl.clearStencil(s) },
    emscripten_glColorMask(r: number, g: number, b: number, a: number) {
      gl.colorMask(!!r, !!g, !!b, !!a)
    },
    emscripten_glCompileShader(shader: number) { gl.compileShader(state.shaders.get(shader)!) },
    emscripten_glCreateProgram(): number {
      const id = allocId(state)
      state.programs.set(id, gl.createProgram())
      return id
    },
    emscripten_glCreateShader(type: number): number {
      const id = allocId(state)
      state.shaders.set(id, gl.createShader(type))
      return id
    },
    emscripten_glCullFace(mode: number) { gl.cullFace(mode) },
    emscripten_glDeleteBuffers(n: number, ptr: number) {
      for (let i = 0; i < n; i++) {
        const id = readU32(state, ptr + i * 4)
        gl.deleteBuffer(state.buffers.get(id)!)
        state.buffers.delete(id)
      }
    },
    emscripten_glDeleteFramebuffers(n: number, ptr: number) {
      for (let i = 0; i < n; i++) {
        const id = readU32(state, ptr + i * 4)
        gl.deleteFramebuffer(state.framebuffers.get(id)!)
        state.framebuffers.delete(id)
      }
    },
    emscripten_glDeleteProgram(program: number) {
      gl.deleteProgram(state.programs.get(program)!)
      state.programs.delete(program)
    },
    emscripten_glDeleteRenderbuffers(n: number, ptr: number) {
      for (let i = 0; i < n; i++) {
        const id = readU32(state, ptr + i * 4)
        gl.deleteRenderbuffer(state.renderbuffers.get(id)!)
        state.renderbuffers.delete(id)
      }
    },
    emscripten_glDeleteShader(shader: number) {
      gl.deleteShader(state.shaders.get(shader)!)
      state.shaders.delete(shader)
    },
    emscripten_glDeleteTextures(n: number, ptr: number) {
      for (let i = 0; i < n; i++) {
        const id = readU32(state, ptr + i * 4)
        gl.deleteTexture(state.textures.get(id)!)
        state.textures.delete(id)
      }
    },
    emscripten_glDeleteVertexArrays(n: number, ptr: number) {
      for (let i = 0; i < n; i++) {
        const id = readU32(state, ptr + i * 4)
        gl.deleteVertexArray(state.vaos.get(id)!)
        state.vaos.delete(id)
      }
    },
    emscripten_glDepthMask(flag: number) { gl.depthMask(!!flag) },
    emscripten_glDisable(cap: number) { gl.disable(cap) },
    emscripten_glDisableVertexAttribArray(index: number) { gl.disableVertexAttribArray(index) },
    emscripten_glDrawArrays(mode: number, first: number, count: number) { gl.drawArrays(mode, first, count) },
    emscripten_glDrawElements(mode: number, count: number, type: number, offset: number) {
      gl.drawElements(mode, count, type, offset)
    },
    emscripten_glEnable(cap: number) { gl.enable(cap) },
    emscripten_glEnableVertexAttribArray(index: number) { gl.enableVertexAttribArray(index) },
    emscripten_glFinish() { gl.finish() },
    emscripten_glFlush() { gl.flush() },
    emscripten_glFramebufferRenderbuffer(target: number, attachment: number, rtarget: number, rb: number) {
      gl.framebufferRenderbuffer(target, attachment, rtarget, state.renderbuffers.get(rb)!)
    },
    emscripten_glFramebufferTexture2D(target: number, attachment: number, ttarget: number, texture: number, level: number) {
      gl.framebufferTexture2D(target, attachment, ttarget, state.textures.get(texture)!, level)
    },
    emscripten_glFrontFace(mode: number) { gl.frontFace(mode) },
    emscripten_glGenBuffers(n: number, ptr: number) {
      for (let i = 0; i < n; i++) {
        const id = allocId(state)
        state.buffers.set(id, gl.createBuffer())
        writeU32(state, ptr + i * 4, id)
      }
    },
    emscripten_glGenFramebuffers(n: number, ptr: number) {
      for (let i = 0; i < n; i++) {
        const id = allocId(state)
        state.framebuffers.set(id, gl.createFramebuffer())
        writeU32(state, ptr + i * 4, id)
      }
    },
    emscripten_glGenRenderbuffers(n: number, ptr: number) {
      for (let i = 0; i < n; i++) {
        const id = allocId(state)
        state.renderbuffers.set(id, gl.createRenderbuffer())
        writeU32(state, ptr + i * 4, id)
      }
    },
    emscripten_glGenTextures(n: number, ptr: number) {
      for (let i = 0; i < n; i++) {
        const id = allocId(state)
        state.textures.set(id, gl.createTexture())
        writeU32(state, ptr + i * 4, id)
      }
    },
    emscripten_glGenVertexArrays(n: number, ptr: number) {
      for (let i = 0; i < n; i++) {
        const id = allocId(state)
        state.vaos.set(id, gl.createVertexArray())
        writeU32(state, ptr + i * 4, id)
      }
    },
    emscripten_glGenerateMipmap(target: number) { gl.generateMipmap(target) },
    emscripten_glGetError(): number { return gl.getError() },
    emscripten_glGetFloatv(pname: number, ptr: number) {
      const val = gl.getParameter(pname)
      if (typeof val === 'number') {
        getMemoryView(state).setFloat32(ptr, val, true)
      } else if (val instanceof Float32Array) {
        new Float32Array(state.memory.buffer, ptr, val.length).set(val)
      }
    },
    emscripten_glGetIntegerv(pname: number, ptr: number) {
      let val: unknown
      if (pname === GL_NUM_EXTENSIONS) {
        val = (gl.getSupportedExtensions() || []).length
      } else {
        val = gl.getParameter(pname)
        // Clear GL error for unsupported enums
        if (val == null) { gl.getError(); val = 0 }
      }
      if (typeof val === 'number') {
        writeU32(state, ptr, val)
      } else if (typeof val === 'boolean') {
        writeU32(state, ptr, val ? 1 : 0)
      } else if (val instanceof Int32Array) {
        new Int32Array(state.memory.buffer, ptr, val.length).set(val)
      }
    },
    emscripten_glGetProgramiv(program: number, pname: number, ptr: number) {
      const val = gl.getProgramParameter(state.programs.get(program)!, pname)
      writeU32(state, ptr, typeof val === 'boolean' ? (val ? 1 : 0) : val)
    },
    emscripten_glGetShaderiv(shader: number, pname: number, ptr: number) {
      const val = gl.getShaderParameter(state.shaders.get(shader)!, pname)
      writeU32(state, ptr, typeof val === 'boolean' ? (val ? 1 : 0) : val)
    },
    emscripten_glGetUniformLocation(program: number, namePtr: number): number {
      const name = readString(state, namePtr)
      const loc = gl.getUniformLocation(state.programs.get(program)!, name)
      if (!loc) return -1
      const id = allocId(state)
      state.uniforms.set(id, loc)
      return id
    },
    emscripten_glIsTexture(texture: number): number {
      return gl.isTexture(state.textures.get(texture)!) ? 1 : 0
    },
    emscripten_glLineWidth(width: number) { gl.lineWidth(width) },
    emscripten_glLinkProgram(program: number) { gl.linkProgram(state.programs.get(program)!) },
    emscripten_glPixelStorei(pname: number, param: number) { gl.pixelStorei(pname, param) },
    emscripten_glReadPixels(x: number, y: number, w: number, h: number, format: number, type: number, ptr: number) {
      const size = w * h * 4 // RGBA
      gl.readPixels(x, y, w, h, format, type, new Uint8Array(state.memory.buffer, ptr, size))
    },
    emscripten_glRenderbufferStorage(target: number, format: number, w: number, h: number) {
      gl.renderbufferStorage(target, format, w, h)
    },
    emscripten_glScissor(x: number, y: number, w: number, h: number) { gl.scissor(x, y, w, h) },
    emscripten_glShaderSource(shader: number, count: number, stringsPtr: number, lengthsPtr: number) {
      let source = ''
      for (let i = 0; i < count; i++) {
        const strPtr = readU32(state, stringsPtr + i * 4)
        if (lengthsPtr) {
          const len = readU32(state, lengthsPtr + i * 4) // Actually GLint, signed
          if (len >= 0) {
            source += new TextDecoder().decode(new Uint8Array(state.memory.buffer, strPtr, len))
          } else {
            source += readString(state, strPtr)
          }
        } else {
          source += readString(state, strPtr)
        }
      }
      gl.shaderSource(state.shaders.get(shader)!, source)
    },
    emscripten_glStencilFunc(func: number, ref: number, mask: number) { gl.stencilFunc(func, ref, mask) },
    emscripten_glStencilFuncSeparate(face: number, func: number, ref: number, mask: number) {
      gl.stencilFuncSeparate(face, func, ref, mask)
    },
    emscripten_glStencilMask(mask: number) { gl.stencilMask(mask) },
    emscripten_glStencilMaskSeparate(face: number, mask: number) { gl.stencilMaskSeparate(face, mask) },
    emscripten_glStencilOp(fail: number, zfail: number, zpass: number) { gl.stencilOp(fail, zfail, zpass) },
    emscripten_glStencilOpSeparate(face: number, sfail: number, dpfail: number, dppass: number) {
      gl.stencilOpSeparate(face, sfail, dpfail, dppass)
    },
    emscripten_glTexImage2D(target: number, level: number, internalformat: number, w: number, h: number, border: number, format: number, type: number, ptr: number) {
      if (ptr) {
        // Use offset form so WebGL respects pixel store state (UNPACK_ROW_LENGTH, etc.)
        const view = new Uint8Array(state.memory.buffer)
        gl.texImage2D(target, level, internalformat, w, h, border, format, type, view, ptr)
      } else {
        gl.texImage2D(target, level, internalformat, w, h, border, format, type, null)
      }
    },
    emscripten_glTexParameterf(target: number, pname: number, param: number) { gl.texParameterf(target, pname, param) },
    emscripten_glTexParameteri(target: number, pname: number, param: number) { gl.texParameteri(target, pname, param) },
    emscripten_glTexSubImage2D(target: number, level: number, x: number, y: number, w: number, h: number, format: number, type: number, ptr: number) {
      // WebGL2 offset form — WebGL reads the correct byte count using
      // pixel store state (UNPACK_ROW_LENGTH, UNPACK_ALIGNMENT, etc.)
      gl.texSubImage2D(target, level, x, y, w, h, format, type, new Uint8Array(state.memory.buffer), ptr)
    },
    emscripten_glUniform1f(loc: number, v0: number) { gl.uniform1f(state.uniforms.get(loc)!, v0) },
    emscripten_glUniform1i(loc: number, v0: number) { gl.uniform1i(state.uniforms.get(loc)!, v0) },
    emscripten_glUniform2f(loc: number, v0: number, v1: number) { gl.uniform2f(state.uniforms.get(loc)!, v0, v1) },
    emscripten_glUniform3f(loc: number, v0: number, v1: number, v2: number) { gl.uniform3f(state.uniforms.get(loc)!, v0, v1, v2) },
    emscripten_glUniform4f(loc: number, v0: number, v1: number, v2: number, v3: number) { gl.uniform4f(state.uniforms.get(loc)!, v0, v1, v2, v3) },
    emscripten_glUniform1fv(loc: number, count: number, ptr: number) {
      gl.uniform1fv(state.uniforms.get(loc)!, new Float32Array(state.memory.buffer, ptr, count))
    },
    emscripten_glUniform2fv(loc: number, count: number, ptr: number) {
      gl.uniform2fv(state.uniforms.get(loc)!, new Float32Array(state.memory.buffer, ptr, count * 2))
    },
    emscripten_glUniform3fv(loc: number, count: number, ptr: number) {
      gl.uniform3fv(state.uniforms.get(loc)!, new Float32Array(state.memory.buffer, ptr, count * 3))
    },
    emscripten_glUniform4fv(loc: number, count: number, ptr: number) {
      gl.uniform4fv(state.uniforms.get(loc)!, new Float32Array(state.memory.buffer, ptr, count * 4))
    },
    emscripten_glUniformMatrix2fv(loc: number, count: number, transpose: number, ptr: number) {
      gl.uniformMatrix2fv(state.uniforms.get(loc)!, !!transpose, new Float32Array(state.memory.buffer, ptr, count * 4))
    },
    emscripten_glUniformMatrix3fv(loc: number, count: number, transpose: number, ptr: number) {
      gl.uniformMatrix3fv(state.uniforms.get(loc)!, !!transpose, new Float32Array(state.memory.buffer, ptr, count * 9))
    },
    emscripten_glUniformMatrix4fv(loc: number, count: number, transpose: number, ptr: number) {
      gl.uniformMatrix4fv(state.uniforms.get(loc)!, !!transpose, new Float32Array(state.memory.buffer, ptr, count * 16))
    },
    emscripten_glUseProgram(program: number) {
      gl.useProgram(program ? state.programs.get(program)! : null)
    },
    emscripten_glVertexAttrib1f(index: number, x: number) { gl.vertexAttrib1f(index, x) },
    emscripten_glVertexAttrib2fv(index: number, ptr: number) {
      gl.vertexAttrib2fv(index, new Float32Array(state.memory.buffer, ptr, 2))
    },
    emscripten_glVertexAttrib3fv(index: number, ptr: number) {
      gl.vertexAttrib3fv(index, new Float32Array(state.memory.buffer, ptr, 3))
    },
    emscripten_glVertexAttrib4fv(index: number, ptr: number) {
      gl.vertexAttrib4fv(index, new Float32Array(state.memory.buffer, ptr, 4))
    },
    emscripten_glVertexAttribPointer(index: number, size: number, type: number, normalized: number, stride: number, offset: number) {
      gl.vertexAttribPointer(index, size, type, !!normalized, stride, offset)
    },
    emscripten_glViewport(x: number, y: number, w: number, h: number) { gl.viewport(x, y, w, h) },

    // ── Remaining functions (stubs for now, implemented as needed) ──
    emscripten_glBindAttribLocation(program: number, index: number, namePtr: number) {
      gl.bindAttribLocation(state.programs.get(program)!, index, readString(state, namePtr))
    },
    emscripten_glBindSampler(unit: number, sampler: number) {
      gl.bindSampler(unit, sampler ? state.samplers.get(sampler)! : null)
    },
    emscripten_glBlitFramebuffer(sx0: number, sy0: number, sx1: number, sy1: number, dx0: number, dy0: number, dx1: number, dy1: number, mask: number, filter: number) {
      gl.blitFramebuffer(sx0, sy0, sx1, sy1, dx0, dy0, dx1, dy1, mask, filter)
    },
    emscripten_glCompressedTexImage2D() { /* stub */ },
    emscripten_glCompressedTexSubImage2D() { /* stub */ },
    emscripten_glCopyBufferSubData(r: number, w: number, ro: number, wo: number, s: number) {
      gl.copyBufferSubData(r, w, ro, wo, s)
    },
    emscripten_glCopyTexSubImage2D(t: number, l: number, xo: number, yo: number, x: number, y: number, w: number, h: number) {
      gl.copyTexSubImage2D(t, l, xo, yo, x, y, w, h)
    },
    emscripten_glDeleteQueries(n: number, ptr: number) {
      for (let i = 0; i < n; i++) {
        const id = readU32(state, ptr + i * 4)
        gl.deleteQuery(state.queries.get(id)!)
        state.queries.delete(id)
      }
    },
    emscripten_glDeleteSamplers(n: number, ptr: number) {
      for (let i = 0; i < n; i++) {
        const id = readU32(state, ptr + i * 4)
        gl.deleteSampler(state.samplers.get(id)!)
        state.samplers.delete(id)
      }
    },
    emscripten_glDeleteSync() { /* stub */ },
    emscripten_glDrawArraysInstanced(mode: number, first: number, count: number, instances: number) {
      gl.drawArraysInstanced(mode, first, count, instances)
    },
    emscripten_glDrawBuffers(n: number, ptr: number) {
      const bufs: number[] = []
      for (let i = 0; i < n; i++) bufs.push(readU32(state, ptr + i * 4))
      gl.drawBuffers(bufs)
    },
    emscripten_glDrawElementsInstanced(mode: number, count: number, type: number, offset: number, instances: number) {
      gl.drawElementsInstanced(mode, count, type, offset, instances)
    },
    emscripten_glDrawRangeElements(mode: number, _start: number, _end: number, count: number, type: number, offset: number) {
      gl.drawElements(mode, count, type, offset) // WebGL2 drawRangeElements not exposed, fallback
    },
    emscripten_glGenQueries(n: number, ptr: number) {
      for (let i = 0; i < n; i++) {
        const id = allocId(state)
        state.queries.set(id, gl.createQuery())
        writeU32(state, ptr + i * 4, id)
      }
    },
    emscripten_glGenSamplers(n: number, ptr: number) {
      for (let i = 0; i < n; i++) {
        const id = allocId(state)
        state.samplers.set(id, gl.createSampler())
        writeU32(state, ptr + i * 4, id)
      }
    },
    emscripten_glGetBufferParameteriv(target: number, pname: number, ptr: number) {
      writeU32(state, ptr, gl.getBufferParameter(target, pname))
    },
    emscripten_glGetFramebufferAttachmentParameteriv(target: number, att: number, pname: number, ptr: number) {
      writeU32(state, ptr, gl.getFramebufferAttachmentParameter(target, att, pname))
    },
    emscripten_glGetProgramInfoLog(program: number, bufSize: number, lengthPtr: number, infoLogPtr: number) {
      const log = gl.getProgramInfoLog(state.programs.get(program)!) ?? ''
      const written = writeString(state, infoLogPtr, bufSize, log)
      if (lengthPtr) writeU32(state, lengthPtr, written)
    },
    emscripten_glGetRenderbufferParameteriv(target: number, pname: number, ptr: number) {
      writeU32(state, ptr, gl.getRenderbufferParameter(target, pname))
    },
    emscripten_glGetShaderInfoLog(shader: number, bufSize: number, lengthPtr: number, infoLogPtr: number) {
      const log = gl.getShaderInfoLog(state.shaders.get(shader)!) ?? ''
      const written = writeString(state, infoLogPtr, bufSize, log)
      if (lengthPtr) writeU32(state, lengthPtr, written)
    },
    emscripten_glGetShaderPrecisionFormat(shaderType: number, precisionType: number, rangePtr: number, precisionPtr: number) {
      const format = gl.getShaderPrecisionFormat(shaderType, precisionType)
      if (format) {
        writeU32(state, rangePtr, format.rangeMin)
        writeU32(state, rangePtr + 4, format.rangeMax)
        writeU32(state, precisionPtr, format.precision)
      }
    },
    emscripten_glGetStringi(name: number, index: number): number {
      if (name === GL_EXTENSIONS) {
        const exts = gl.getSupportedExtensions() || []
        if (index < exts.length) return allocString(state, exts[index]!)
      }
      return 0
    },
    emscripten_glTexParameterfv() { /* stub */ },
    emscripten_glTexParameteriv() { /* stub */ },
    emscripten_glTexStorage2D(target: number, levels: number, format: number, w: number, h: number) {
      gl.texStorage2D(target, levels, format, w, h)
    },
    emscripten_glUniform1iv(loc: number, count: number, ptr: number) {
      gl.uniform1iv(state.uniforms.get(loc)!, new Int32Array(state.memory.buffer, ptr, count))
    },
    emscripten_glUniform2i(loc: number, v0: number, v1: number) { gl.uniform2i(state.uniforms.get(loc)!, v0, v1) },
    emscripten_glUniform2iv(loc: number, count: number, ptr: number) {
      gl.uniform2iv(state.uniforms.get(loc)!, new Int32Array(state.memory.buffer, ptr, count * 2))
    },
    emscripten_glUniform3i(loc: number, v0: number, v1: number, v2: number) { gl.uniform3i(state.uniforms.get(loc)!, v0, v1, v2) },
    emscripten_glUniform3iv(loc: number, count: number, ptr: number) {
      gl.uniform3iv(state.uniforms.get(loc)!, new Int32Array(state.memory.buffer, ptr, count * 3))
    },
    emscripten_glUniform4i(loc: number, v0: number, v1: number, v2: number, v3: number) { gl.uniform4i(state.uniforms.get(loc)!, v0, v1, v2, v3) },
    emscripten_glUniform4iv(loc: number, count: number, ptr: number) {
      gl.uniform4iv(state.uniforms.get(loc)!, new Int32Array(state.memory.buffer, ptr, count * 4))
    },
    emscripten_glVertexAttribDivisor(index: number, divisor: number) { gl.vertexAttribDivisor(index, divisor) },
    emscripten_glVertexAttribIPointer(index: number, size: number, type: number, stride: number, offset: number) {
      gl.vertexAttribIPointer(index, size, type, stride, offset)
    },
    emscripten_glSamplerParameterf(sampler: number, pname: number, param: number) {
      gl.samplerParameterf(state.samplers.get(sampler)!, pname, param)
    },
    emscripten_glSamplerParameteri(sampler: number, pname: number, param: number) {
      gl.samplerParameteri(state.samplers.get(sampler)!, pname, param)
    },
    emscripten_glSamplerParameteriv() { /* stub */ },
    emscripten_glBeginQuery(target: number, id: number) { gl.beginQuery(target, state.queries.get(id)!) },
    emscripten_glEndQuery(target: number) { gl.endQuery(target) },
    emscripten_glGetQueryObjectuiv() { /* stub */ },
    emscripten_glGetQueryiv() { /* stub */ },
    emscripten_glFenceSync() { return 0 },
    emscripten_glClientWaitSync() { return 0 },
    emscripten_glIsSync() { return 0 },
    emscripten_glWaitSync() { /* stub */ },
    emscripten_glInvalidateFramebuffer() { /* stub */ },
    emscripten_glInvalidateSubFramebuffer() { /* stub */ },
    emscripten_glReadBuffer(src: number) { gl.readBuffer(src) },
    emscripten_glRenderbufferStorageMultisample(target: number, samples: number, format: number, w: number, h: number) {
      gl.renderbufferStorageMultisample(target, samples, format, w, h)
    },
    // Multi-draw extensions (not available in WebGL2 without extensions)
    emscripten_glDrawArraysInstancedBaseInstance() { /* stub */ },
    emscripten_glDrawElementsInstancedBaseVertexBaseInstance() { /* stub */ },
    emscripten_glMultiDrawArraysInstancedBaseInstance() { /* stub */ },
    emscripten_glMultiDrawElementsInstancedBaseVertexBaseInstance() { /* stub */ },
    emscripten_glGetQueryObjecti64v() { /* stub */ },
    emscripten_glGetQueryObjectui64v() { /* stub */ },
    emscripten_glQueryCounter() { /* stub */ },
  }
}

// ── Public API ──

export interface SkiaWasmInstance {
  exports: WebAssembly.Exports & {
    memory: WebAssembly.Memory
    exports_skia_gl_init: (ptr: number) => void
    exports_skia_gl_destroy: () => void
    exports_skia_gl_begin_drawing: (fbo: number, w: number, h: number, retPtr: number) => number
    exports_skia_gl_end_drawing: () => void
    exports_skia_gl_flush: () => void
    exports_skia_gl_canvas_clear: (r: number, g: number, b: number, a: number) => void
    exports_skia_gl_canvas_draw_rect: (x: number, y: number, w: number, h: number, paint: number) => void
  }
  glState: GLState
}

export async function loadSkiaGL(
  wasmUrl: string | URL,
  gl: WebGL2RenderingContext,
  preloadedResponse?: Promise<Response>,
): Promise<SkiaWasmInstance> {
  // Enable all available WebGL extensions before Skia init.
  // WebGL2 requires explicit activation — Emscripten does this automatically,
  // we need to do it ourselves so Skia can query extension parameters.
  for (const ext of gl.getSupportedExtensions() || []) {
    gl.getExtension(ext)
  }

  const state = createGLState(gl)

  const importObject: WebAssembly.Imports = {
    gl: createGLImports(state),
    env: createEnvImports(),
    wasi_snapshot_preview1: createWasiImports(() => state.memory),
  }

  const response = preloadedResponse ?? fetch(wasmUrl)
  const { instance } = await instantiateWasm(response, importObject)

  // Wire up memory + exports so GL/WASI imports can read/write WASM memory
  state.memory = instance.exports.memory as WebAssembly.Memory
  state.exports = instance.exports

  return {
    exports: instance.exports as SkiaWasmInstance['exports'],
    glState: state,
  }
}
