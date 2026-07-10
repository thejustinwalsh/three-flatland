import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import opentype from 'opentype.js'
import { Vector2 } from 'three'
import type { Camera, InstancedMesh } from 'three'
import { parseFont } from './pipeline/fontParser'
import { packTextures } from './pipeline/texturePacker'
import { shapeText } from './pipeline/textShaper'
import { wrapLines } from './pipeline/wrapLines'
import { measureText } from './pipeline/textMeasure'
import { SlugFont } from './SlugFont'
import { SlugFontStack } from './SlugFontStack'
import { SlugText } from './SlugText'
import { SlugBatch } from './SlugBatch'
import { SlugStackText } from './SlugStackText'

const FONT_PATH = resolve(__dirname, '../../../examples/three/slug-text/public/Inter-Regular.ttf')
const buf = readFileSync(FONT_PATH)
const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)

let font: SlugFont

beforeAll(() => {
  const parsed = parseFont(arrayBuffer)
  const textures = packTextures(parsed.glyphs)
  const otFont = opentype.parse(arrayBuffer)
  font = SlugFont._createRuntime(
    parsed.glyphs,
    textures,
    {
      unitsPerEm: parsed.unitsPerEm,
      ascender: parsed.ascender,
      descender: parsed.descender,
      capHeight: parsed.capHeight,
    },
    otFont,
    shapeText,
    wrapLines,
    measureText
  )
})

/** Fake renderer exposing only what the render hook consumes. */
function fakeRenderer(width: number, height: number) {
  return { getDrawingBufferSize: (target: Vector2) => target.set(width, height) }
}

/** Read the private viewport uniform off a slug material. */
function viewportOf(material: unknown): Vector2 {
  return (material as { _viewportUniform: { value: Vector2 } })._viewportUniform.value
}

const camera = null as unknown as Camera
const scene = null as unknown

describe('drawing-buffer viewport (device-pixel dilation, F5)', () => {
  it('SlugText.onBeforeRender overrides a CSS-pixel viewport with the drawing-buffer size', () => {
    const text = new SlugText({ font, text: 'A' })
    text.setViewportSize(400, 300) // consumer-provided CSS px
    text.onBeforeRender(fakeRenderer(800, 600), scene, camera) // DPR 2 framebuffer
    expect(viewportOf(text.material).width).toBe(800)
    expect(viewportOf(text.material).height).toBe(600)
    text.dispose()
  })

  it('SlugText is bit-identical at DPR 1 (device px == CSS px)', () => {
    const text = new SlugText({ font, text: 'A' })
    text.setViewportSize(400, 300)
    text.onBeforeRender(fakeRenderer(400, 300), scene, camera)
    expect(viewportOf(text.material).width).toBe(400)
    expect(viewportOf(text.material).height).toBe(300)
    text.dispose()
  })

  it('SlugText outline mesh shares the drawing-buffer render hook', () => {
    const text = new SlugText({ font, text: 'A', outline: { width: 0.03 } })
    const outlineMesh = text.children.find((c) => (c as InstancedMesh).isInstancedMesh) as
      | InstancedMesh
      | undefined
    expect(outlineMesh).toBeDefined()
    expect(outlineMesh!.onBeforeRender).toBe(text.onBeforeRender)
    // Firing the stroke child's hook (it draws FIRST via renderOrder -1)
    // updates BOTH the fill and stroke materials.
    outlineMesh!.onBeforeRender(
      fakeRenderer(1024, 768) as never,
      scene as never,
      camera as never,
      undefined as never,
      undefined as never,
      undefined as never
    )
    expect(viewportOf(text.material).width).toBe(1024)
    expect(viewportOf(outlineMesh!.material).width).toBe(1024)
    text.dispose()
  })

  it('SlugBatch.onBeforeRender pushes the drawing-buffer size into the batch material', () => {
    const batch = new SlugBatch({ font })
    batch.setViewportSize(256, 256) // headless seed stays honored pre-render
    expect(viewportOf(batch.material).width).toBe(256)
    batch.onBeforeRender(fakeRenderer(512, 384), scene, camera)
    expect(viewportOf(batch.material).width).toBe(512)
    expect(viewportOf(batch.material).height).toBe(384)
    batch.dispose()
  })

  it('SlugStackText wires the hook onto every child mesh (Groups never get onBeforeRender)', () => {
    const stack = new SlugFontStack([font])
    const text = new SlugStackText({ font: stack, text: 'A', outline: { width: 0.03 } })
    const meshes = text.children.filter((c) => (c as InstancedMesh).isInstancedMesh)
    expect(meshes.length).toBe(2) // fill + stroke for the single font
    for (const mesh of meshes) {
      mesh.onBeforeRender(
        fakeRenderer(640, 480) as never,
        scene as never,
        camera as never,
        undefined as never,
        undefined as never,
        undefined as never
      )
    }
    for (const mesh of meshes) {
      expect(viewportOf((mesh as InstancedMesh).material).width).toBe(640)
      expect(viewportOf((mesh as InstancedMesh).material).height).toBe(480)
    }
    text.dispose()
  })
})
