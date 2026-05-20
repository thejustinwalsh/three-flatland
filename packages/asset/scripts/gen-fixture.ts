/**
 * Generates `src/__fixtures__/sample.glb` and `src/__fixtures__/sample.expected.json`.
 *
 * Run via:
 *   node --import tsx/esm packages/asset/scripts/gen-fixture.ts
 * or let the conformance.test.ts regenerate it deterministically via beforeAll.
 *
 * Fixture covers:
 *   - FLOAT SCALAR accessor: [1.5, 2.5, 3.5]
 *   - USHORT VEC2 accessor:  [10, 20, 30, 40]  (count=2, VEC2 → 4 shorts)
 *   - SHORT SCALAR accessor: [-1, 0, 1]
 *   - FL_demo extension with nested metadata + accessor refs by name
 *
 * All values are exactly representable in their respective typed arrays.
 */

import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, NodeIO } from '@gltf-transform/core'
import { addColumn, createFLExtension } from '../src/bake/gltf.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const fixturesDir = join(__dirname, '../src/__fixtures__')

export async function generateFixture(): Promise<void> {
  const doc = new Document()
  const buf = doc.createBuffer()

  // (a) FLOAT SCALAR: [1.5, 2.5, 3.5] — all exactly Float32-representable
  const accFloat = addColumn(doc, buf, 'floatCol', new Float32Array([1.5, 2.5, 3.5]), 'SCALAR')

  // (b) USHORT VEC2: [10, 20, 30, 40] — count=2, VEC2 → 4 Uint16 elements
  const accUshort = addColumn(doc, buf, 'ushortCol', new Uint16Array([10, 20, 30, 40]), 'VEC2')

  // (c) SHORT SCALAR: [-1, 0, 1] — count=3, SCALAR → 3 Int16 elements
  const accShort = addColumn(doc, buf, 'shortCol', new Int16Array([-1, 0, 1]), 'SCALAR')

  // Create FL_demo extension with nested metadata
  const { ExtClass } = createFLExtension('FL_demo')
  const ext = doc.createExtension(ExtClass).setRequired(false)

  const prop = ext.createProperty({
    kind: 'flatland.demo',
    version: 1,
    metrics: { vertexCount: 3, tileSize: 16 },
  })
  prop.setAccessorRef('floatCol', accFloat)
  prop.setAccessorRef('ushortCol', accUshort)
  prop.setAccessorRef('shortCol', accShort)
  doc.getRoot().setExtension('FL_demo', prop)

  // Write GLB
  const io = new NodeIO().registerExtensions([ExtClass])
  const glb = await io.writeBinary(doc)

  writeFileSync(join(fixturesDir, 'sample.glb'), Buffer.from(glb))

  // Build expected.json — accessor values + extension metadata
  // Use the actual accessor indices that glTF-Transform assigns.
  // After writeBinary we can re-read the JSON to find them, but since we know
  // the order of creation we can derive them deterministically:
  //   accessor 0 = floatCol, accessor 1 = ushortCol, accessor 2 = shortCol
  const expected = {
    metadata: {
      kind: 'flatland.demo',
      version: 1,
      metrics: { vertexCount: 3, tileSize: 16 },
    },
    accessors: {
      floatCol: {
        index: 0,
        values: [1.5, 2.5, 3.5],
        type: 'Float32Array',
      },
      ushortCol: {
        index: 1,
        values: [10, 20, 30, 40],
        type: 'Uint16Array',
      },
      shortCol: {
        index: 2,
        values: [-1, 0, 1],
        type: 'Int16Array',
      },
    },
  }

  writeFileSync(
    join(fixturesDir, 'sample.expected.json'),
    JSON.stringify(expected, null, 2) + '\n',
  )

  console.log('Wrote sample.glb and sample.expected.json to', fixturesDir)
}

// Run as a standalone script (not when imported by the test)
// Detect: running as main module in ESM
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  generateFixture().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
