import { spawnSync } from 'node:child_process'

const entries = ['dist/index.js', 'dist/react.js', 'dist/pipeline/SpriteBatch.js']

for (const entry of entries) {
  const entryUrl = new URL(`../${entry}`, import.meta.url).href
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

console.log('Verified r185 EventNode patch in published batching entries.')
