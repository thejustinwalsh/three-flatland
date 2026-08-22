import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const entries = process.argv.slice(2)
if (entries.length === 0) {
  throw new Error('Pass at least one built entry to verify')
}

for (const entry of entries) {
  const entryUrl = pathToFileURL(resolve(entry)).href
  const verification = `
    // Three's inspector reads localStorage while three/webgpu is evaluated.
    // Node 26 exposes the global with an undefined value unless storage was
    // configured, so provide the smallest browser-compatible read shim before
    // either module is imported.
    const storage = new Map()
    globalThis.localStorage ??= {
      get length() { return storage.size },
      clear: () => storage.clear(),
      getItem: (key) => storage.get(String(key)) ?? null,
      key: (index) => Array.from(storage.keys())[index] ?? null,
      removeItem: (key) => storage.delete(String(key)),
      setItem: (key, value) => storage.set(String(key), String(value)),
    }
    const { EventNode } = await import('three/webgpu')
    const entryModule = await import(${JSON.stringify(entryUrl)})
    if (!EventNode.prototype.__instanceEventPhaseSplitPatched__) {
      throw new Error(${JSON.stringify(`r185 EventNode patch missing after importing ${entry}`)})
    }

    if (${JSON.stringify(entry)}.endsWith('/materials/Sprite2DMaterial.js')) {
      const { BufferGeometry, InstancedMesh } = await import('three')
      const { getCurrentStack, NodeUpdateType, setCurrentStack, stack } = await import('three/tsl')
      const material = new entryModule.Sprite2DMaterial()
      const mesh = new InstancedMesh(new BufferGeometry(), material, 2048)
      const nodeStack = stack()
      const previousStack = getCurrentStack()
      setCurrentStack(nodeStack)
      try {
        material.setupPosition({
          object: mesh,
          getUniformBufferLimit: () => 65_536,
          hasGeometryAttribute: () => false,
          needsPreviousData: () => false,
        })
      } finally {
        setCurrentStack(previousStack)
      }
      const event = nodeStack.nodes.find(
        (node) => node instanceof EventNode && node.eventType === EventNode.FRAME
      )
      if (!event || event.getUpdateBeforeType() !== NodeUpdateType.FRAME) {
        throw new Error('Built Sprite2DMaterial large-batch sync event did not enter the pre-upload phase')
      }
      material.dispose()
      mesh.geometry.dispose()
    }
  `
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', verification], {
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    process.stderr.write(result.stderr)
    process.exit(result.status ?? 1)
  }
}

console.log(`Verified r185 EventNode patch in ${entries.length} published entries.`)
