import { cpSync } from 'node:fs'
import { join } from 'node:path'

const copyFilter = (sourceRoot) => (source) => !/(^|\/)(node_modules|dist)(\/|$)/.test(source.slice(sourceRoot.length))

/**
 * Copy an example into the consumer-smoke workspace without changing its
 * repository-relative imports. Benchmark examples import `../../_shared/*`, so
 * flattening every example into the workspace root is not faithful to the
 * source tree and makes an otherwise valid published-package smoke fail.
 */
export function materializeConsumerExample(repositoryRoot, workspaceRoot, example) {
  const examplesRoot = join(workspaceRoot, 'examples')
  const destination = join(examplesRoot, example.type, example.slug)
  const sharedSource = join(repositoryRoot, 'examples', '_shared')
  const sharedDestination = join(examplesRoot, '_shared')

  cpSync(sharedSource, sharedDestination, {
    recursive: true,
    filter: copyFilter(sharedSource),
  })
  cpSync(example.dir, destination, {
    recursive: true,
    filter: copyFilter(example.dir),
  })

  return destination
}
