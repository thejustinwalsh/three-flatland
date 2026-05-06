// Node-only entry. Re-exports the browser-safe surface plus file I/O
// helpers (`bakeNormalMapFile`). The CLI subcommand entry is at
// `@three-flatland/normals/cli`.

export * from './index.js'
export { bakeNormalMapFile } from './bake.node.js'
