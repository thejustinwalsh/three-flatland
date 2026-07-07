// Browser-safe entry: the alpha sidecar descriptor only. The Node-only
// baker (file I/O via pngjs) lives at `@three-flatland/alphamap/node`, and
// the flatland-bake subcommand entry is at `@three-flatland/alphamap/cli`,
// so bundlers targeting the browser don't pull in `node:fs` or pngjs.

export { ALPHA_DESCRIPTOR } from './descriptor.js'
