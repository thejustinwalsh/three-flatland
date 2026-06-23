// Node-only entry. Re-exports the browser-safe surface plus the file-I/O
// baker (`bakeAlphaMapFile`). The CLI subcommand entry is at
// `@three-flatland/alphamap/cli`.

export * from './index.js'
export { bakeAlphaMapFile } from './bake.node.js'
