import { describe, it, expect } from 'vitest'
import { Document, NodeIO } from '@gltf-transform/core'
import { addColumn, createFLExtension } from './gltf'
import { readAsset } from '../readAsset'

// ---------------------------------------------------------------------------
// Round-trip test: bake with glTF-Transform helpers → read back with readAsset
// ---------------------------------------------------------------------------

describe('bake/gltf round-trip', () => {
  it('bakes a document with two accessor columns + FL_demo root extension and reads it back', async () => {
    // ---- Build document ----
    const doc = new Document()
    const buf = doc.createBuffer()

    // (a) FLOAT SCALAR accessor: [1.5, 2.5, 3.5]
    const accA = addColumn(doc, buf, 'a', new Float32Array([1.5, 2.5, 3.5]), 'SCALAR')

    // (b) USHORT SCALAR accessor: [10, 20, 30, 40]
    const accB = addColumn(doc, buf, 'b', new Uint16Array([10, 20, 30, 40]), 'SCALAR')

    // ---- Create FL_demo extension on the document root ----
    const { ExtClass } = createFLExtension('FL_demo')
    const ext = doc.createExtension(ExtClass).setRequired(true)

    // Attach the property to the document root
    const prop = ext.createProperty({
      kind: 'demo',
      version: 1,
      hello: 'world',
    })
    prop.setAccessorRef('a', accA)
    prop.setAccessorRef('b', accB)
    doc.getRoot().setExtension('FL_demo', prop)

    // ---- Write to GLB ----
    const io = new NodeIO().registerExtensions([ExtClass])
    const glb = await io.writeBinary(doc)

    // ---- Read back with readAsset ----
    const asset = readAsset(glb.buffer)

    // The root extension should be present
    const extJson = asset.ext<Record<string, unknown>>('FL_demo')
    expect(extJson).toBeDefined()

    // Metadata fields
    expect(extJson!['kind']).toBe('demo')
    expect(extJson!['version']).toBe(1)
    expect(extJson!['hello']).toBe('world')

    // Accessor refs are present in extension JSON
    const columns = extJson!['columns'] as Record<string, { accessor: number }>
    expect(columns).toBeDefined()
    expect(typeof columns['a']!.accessor).toBe('number')
    expect(typeof columns['b']!.accessor).toBe('number')

    const indexA = columns['a']!.accessor
    const indexB = columns['b']!.accessor
    expect(indexA).not.toBe(indexB)

    // Follow accessor indices → correct decoded values
    const viewA = asset.accessor(indexA) as Float32Array
    expect(viewA).toBeInstanceOf(Float32Array)
    expect(viewA.length).toBe(3)
    expect(viewA[0]).toBeCloseTo(1.5)
    expect(viewA[1]).toBeCloseTo(2.5)
    expect(viewA[2]).toBeCloseTo(3.5)

    const viewB = asset.accessor(indexB) as Uint16Array
    expect(viewB).toBeInstanceOf(Uint16Array)
    expect(viewB.length).toBe(4)
    expect(viewB[0]).toBe(10)
    expect(viewB[1]).toBe(20)
    expect(viewB[2]).toBe(30)
    expect(viewB[3]).toBe(40)
  })
})
