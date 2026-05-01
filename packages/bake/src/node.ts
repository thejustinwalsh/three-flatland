// Node-only surface of @three-flatland/bake.
//
// Re-exports the browser-safe surface plus filesystem helpers and the
// manifest discovery used by the `flatland-bake` CLI. Importing this
// entry pulls in `node:fs`, `node:path`, and `pngjs` — avoid it from
// bundles targeting the browser.

export * from './index.js'
export { discoverBakers } from './discovery.js'
export { writeSidecarPng, writeSidecarJson } from './writeSidecar.js'
