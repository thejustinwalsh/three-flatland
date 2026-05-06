// Browser-safe surface of @three-flatland/bake.
//
// Types + runtime helpers usable from any environment (browser, node,
// workers, deno). No `node:*` imports, no filesystem access.
//
// Consumers running in node that need the CLI, discovery, or sidecar
// emission should import from '@three-flatland/bake/node' instead.
export type {
  Baker,
  BakerRegistration,
  FlatlandManifest,
  FlatlandManifestEntry,
  BakedAssetLoaderOptions,
  BakedSidecarMetadata,
} from './types.js'

export {
  bakedSiblingURL,
  probeBakedSibling,
  readPngTextChunk,
  hashDescriptor,
} from './sidecar.js'

export { devtimeWarn, _resetDevtimeWarnings } from './devtimeWarn.js'
