import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const roots = process.argv.slice(2)
if (roots.length === 0) {
  throw new Error('Pass at least one built directory to verify')
}

const testMarkers = ['.test.', '.test-d.', '.type-test.']
const leaked = []

function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) inspect(path)
    else if (testMarkers.some((marker) => entry.name.includes(marker))) leaked.push(path)
  }
}

for (const root of roots) inspect(resolve(root))

if (leaked.length > 0) {
  throw new Error(`Test-only artifacts entered published output:\n${leaked.join('\n')}`)
}

console.log(
  `Verified that ${roots.length} published output director${roots.length === 1 ? 'y contains' : 'ies contain'} no tests.`
)
