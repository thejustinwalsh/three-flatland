import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

/** @type {esbuild.BuildOptions} */
const opts = {
  entryPoints: ['extension/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  sourcemap: true,
  banner: {
    js: "import { createRequire as _fl_createRequire } from 'module'; const require = _fl_createRequire(import.meta.url);",
  },
  logLevel: 'info',
}

if (watch) {
  const ctx = await esbuild.context(opts)
  await ctx.watch()
  console.log('[host] watching extension host...')
} else {
  await esbuild.build(opts)
}
