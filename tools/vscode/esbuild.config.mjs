import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

/** @type {esbuild.BuildOptions} */
const opts = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  sourcemap: true,
  // ESM CJS interop: emit a small banner so `require` works for CJS deps
  // the extension host still reaches for (rare with our tree, but safe).
  banner: {
    js: "import { createRequire as _fl_createRequire } from 'module'; const require = _fl_createRequire(import.meta.url);",
  },
  logLevel: 'info',
}

if (watch) {
  const ctx = await esbuild.context(opts)
  await ctx.watch()
  console.log('[esbuild] watching extension host...')
} else {
  await esbuild.build(opts)
}
