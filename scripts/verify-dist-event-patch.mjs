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
    import { EventNode } from 'three/webgpu'
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
