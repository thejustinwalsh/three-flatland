# @three-flatland/alphamap

## 0.1.0-alpha.1

### Minor Changes

- bc4481b: > Branch: worktree-events-system

  > PR: https://github.com/thejustinwalsh/three-flatland/pull/125

  ### c03dd167fcabfbc0f0ce6f52a4b43159d8585da5

  feat: extract the alpha hitmask baker into its own package
  Each flatland-bake baker is meant to be a small grab-it-when-you-need-it
  package, not a tenant of an unrelated one. The alpha baker had been
  parked in @three-flatland/normals (which already owned PNG decode), but
  the name was misleading — normals now shipped a non-normal baker.

  Move the alpha baker into a new @three-flatland/alphamap package: the
  `flatland-bake alpha` subcommand, bakeAlphaMapFile, and the
  ALPHA_DESCRIPTOR. The runtime side (AlphaMap, resolveAlphaMap) stays in
  three-flatland/events, decoupled by the re-declared descriptor literal —
  no cross-package import either way. normals goes back to a single
  `normal` baker.

  Shared deps move to the workspace catalog (pngjs, @types/pngjs); both
  baker packages reference catalog:. Discovery is unchanged — the bake CLI
  finds whichever bakers are installed via their package.json flatland.bake
  manifest, so consumers install only the baker they need.
  Files: docs/src/content/docs/examples/hit-test.mdx, docs/src/content/docs/guides/baking.mdx, packages/alphamap/README.md, packages/alphamap/package.json, packages/alphamap/src/bake.node.test.ts, packages/alphamap/src/bake.node.ts, packages/alphamap/src/cli.ts, packages/alphamap/src/descriptor.ts, packages/alphamap/src/index.ts, packages/alphamap/src/node.ts, packages/alphamap/tsconfig.json, packages/alphamap/tsup.config.ts, packages/normals/package.json, packages/normals/src/alphaBake.node.ts, packages/normals/src/alphaBake.test.ts, packages/normals/src/alphaCli.ts, packages/three-flatland/src/events/resolveAlphaMap.ts, pnpm-lock.yaml, pnpm-workspace.yaml
  Stats: 19 files changed, 283 insertions(+), 121 deletions(-)
