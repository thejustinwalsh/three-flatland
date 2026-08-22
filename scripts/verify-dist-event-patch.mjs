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
    await import(${JSON.stringify(entryUrl)})
    if (!EventNode.prototype.__instanceEventPhaseSplitPatched__) {
      throw new Error(${JSON.stringify(`r185 EventNode patch missing after importing ${entry}`)})
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
