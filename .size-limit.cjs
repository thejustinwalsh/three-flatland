const path = require('path')
const fs = require('fs')

const skiaDistDir = path.resolve(__dirname, 'packages/skia/dist')
const skiaSrcDir = path.resolve(__dirname, 'packages/skia/src/ts')

/**
 * Resolve the entry point for a mini project from its index.html.
 */
function resolveEntryPoint(miniDir) {
  const indexHtml = path.join(miniDir, 'index.html')
  if (!fs.existsSync(indexHtml)) return null
  const html = fs.readFileSync(indexHtml, 'utf-8')
  const match = html.match(/src=["']([^"']+)["']/)
  if (!match) return null
  // Strip leading slash — Vite treats src="/src/main.tsx" as relative to project root
  return path.resolve(miniDir, match[1].replace(/^\//, ''))
}

/**
 * Extract value (non-type) named imports for a package from a project's
 * full module graph. Uses the TypeScript compiler to resolve imports from
 * the entry point, crawling all reachable local files.
 * Returns a size-limit import string like "{ Sprite2D, SpriteGroup }".
 */
function extractImports(entryPoint, pkg) {
  if (!fs.existsSync(entryPoint)) return null
  const ts = require('typescript')

  const program = ts.createProgram([entryPoint], {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  })

  const names = new Set()

  for (const sourceFile of program.getSourceFiles()) {
    // Skip node_modules and declaration files — only crawl project sources
    if (sourceFile.isDeclarationFile) continue
    if (sourceFile.fileName.includes('node_modules')) continue

    for (const stmt of sourceFile.statements) {
      if (!ts.isImportDeclaration(stmt)) continue
      if (stmt.importClause?.isTypeOnly) continue
      if (stmt.moduleSpecifier.text !== pkg) continue

      const bindings = stmt.importClause?.namedBindings
      if (!bindings || !ts.isNamedImports(bindings)) continue

      for (const el of bindings.elements) {
        if (el.isTypeOnly) continue
        names.add(el.name.text)
      }
    }
  }

  return names.size ? `{ ${[...names].join(', ')} }` : null
}

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
  ...[['', 'core'], ['/three', 'full'], ['/react', 'full']].map(([sub, label]) => ({
    name: `@three-flatland/skia${sub} (${label})`,
    path: `packages/skia/dist${sub || ''}/index.js`,
    import: '*',
    ignore: corePeerDeps,
    modifyEsbuildConfig(config) {
      config.format = 'esm'
      config.plugins = [...(config.plugins || []), resolveSkia]
      return config
    },
  })),

  // ── minis (tree-shaken) — auto-scanned from index.html entry points ──
  ...(function () {
    const minisDir = path.resolve(__dirname, 'minis')
    if (!fs.existsSync(minisDir)) return []
    const entries = []

    for (const name of fs.readdirSync(minisDir).sort()) {
      const miniDir = path.join(minisDir, name)
      const entryPoint = resolveEntryPoint(miniDir)
      if (!entryPoint) continue

      for (const [pkg, dist] of [['three-flatland/react', 'react.js'], ['three-flatland', 'index.js']]) {
        const imports = extractImports(entryPoint, pkg)
        if (imports) {
          entries.push({
            name: `minis/${name} (tree-shaken)`,
            path: `packages/three-flatland/dist/${dist}`,
            import: imports,
            ignore: corePeerDeps,
          })
          break
        }
      }
    }

    return entries
  })(),
]
