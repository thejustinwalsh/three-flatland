const path = require('path')

const skiaDistDir = path.resolve(__dirname, 'packages/skia/dist')
const skiaSrcDir = path.resolve(__dirname, 'packages/skia/src/ts')

/**
 * esbuild plugin for @three-flatland/skia:
 * - Resolves .json imports from src/ (tsup doesn't copy them to dist/)
 * - Stubs .wasm imports (measured separately as raw file sizes)
 */
const resolveSkia = {
  name: 'resolve-skia',
  setup(build) {
    const fs = require('fs')

    build.onResolve({ filter: /\.json$/ }, (args) => {
      const distPath = path.resolve(skiaDistDir, args.path)
      if (fs.existsSync(distPath)) return { path: distPath }
      const srcPath = path.resolve(skiaSrcDir, args.path)
      if (fs.existsSync(srcPath)) return { path: srcPath }
      return null
    })

    build.onResolve({ filter: /\.wasm/ }, () => ({
      path: 'wasm-stub',
      namespace: 'wasm-stub',
    }))

    build.onLoad({ filter: /.*/, namespace: 'wasm-stub' }, () => ({
      contents: 'export default ""',
      loader: 'js',
    }))
  },
}

const corePeerDeps = ['three', 'react', '@react-three/fiber', 'koota']

module.exports = [
  // ── three-flatland (core) ──
  {
    name: 'three-flatland (full)',
    path: 'packages/three-flatland/dist/index.js',
    import: '*',
    ignore: corePeerDeps,
  },
  {
    name: 'three-flatland/react (full)',
    path: 'packages/three-flatland/dist/react.js',
    import: '*',
    ignore: corePeerDeps,
  },
  {
    name: 'Flatland (tree-shaken)',
    path: 'packages/three-flatland/dist/index.js',
    import: '{ Flatland }',
    ignore: corePeerDeps,
  },
  {
    name: 'AnimatedSprite2D (tree-shaken)',
    path: 'packages/three-flatland/dist/index.js',
    import: '{ AnimatedSprite2D }',
    ignore: corePeerDeps,
  },
  {
    name: 'Sprite2D (tree-shaken)',
    path: 'packages/three-flatland/dist/index.js',
    import: '{ Sprite2D }',
    ignore: corePeerDeps,
  },
  {
    name: 'TileMap2D (tree-shaken)',
    path: 'packages/three-flatland/dist/index.js',
    import: '{ TileMap2D }',
    ignore: corePeerDeps,
  },

  // ── @three-flatland/nodes ──
  {
    name: '@three-flatland/nodes (full)',
    path: 'packages/nodes/dist/index.js',
    import: '*',
    ignore: ['three'],
  },

  // ── @three-flatland/presets ──
  {
    name: '@three-flatland/presets (full)',
    path: 'packages/presets/dist/index.js',
    import: '*',
  },

  // ── @three-flatland/tweakpane ──
  {
    name: '@three-flatland/tweakpane (full)',
    path: 'packages/tweakpane/dist/index.js',
    import: '*',
    ignore: [
      'tweakpane',
      '@tweakpane/core',
      '@tweakpane/plugin-essentials',
      ...corePeerDeps,
    ],
  },
  {
    name: '@three-flatland/tweakpane/react (full)',
    path: 'packages/tweakpane/dist/react.js',
    import: '*',
    ignore: [
      'tweakpane',
      '@tweakpane/core',
      '@tweakpane/plugin-essentials',
      ...corePeerDeps,
    ],
  },

  // ── @three-flatland/skia (needs ESM + plugins for import.meta / .json / .wasm) ──
  {
    name: '@three-flatland/skia (full)',
    path: 'packages/skia/dist/index.js',
    import: '*',
    ignore: corePeerDeps,
    modifyEsbuildConfig(config) {
      config.format = 'esm'
      config.plugins = [...(config.plugins || []), resolveSkia]
      return config
    },
  },
]
