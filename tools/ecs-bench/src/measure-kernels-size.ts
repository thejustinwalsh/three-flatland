import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import { build } from 'esbuild'
import { gitMergeBase } from './provenance.ts'

const require = createRequire(import.meta.url)

const harnessSources = [
  'adapter.ts',
  'candidates/anchored-scan.ts',
  'candidates/shared.ts',
  'candidates/signature-persistent.ts',
  'candidates/sparse-persistent.ts',
  'fixtures/anchored-scan-size-entry.ts',
  'fixtures/koota-size-entry.ts',
  'fixtures/signature-persistent-size-entry.ts',
  'fixtures/sparse-persistent-size-entry.ts',
  'provenance.ts',
  'measure-kernels-size.ts',
] as const

const harnessHash = createHash('sha256')
for (const source of harnessSources) {
  harnessHash.update(source)
  harnessHash.update(readFileSync(resolve(import.meta.dirname, source)))
}

function packageVersion(name: string): string {
  const entry = require.resolve(name)
  const packageJson = JSON.parse(readFileSync(resolve(dirname(entry), '../package.json'), 'utf8')) as {
    version: string
  }
  return packageJson.version
}

const artifacts = [
  {
    entry: fileURLToPath(new URL('./fixtures/koota-size-entry.ts', import.meta.url)),
    name: 'Koota seven-import tree-shaken browser kernel',
  },
  {
    entry: fileURLToPath(new URL('./fixtures/sparse-persistent-size-entry.ts', import.meta.url)),
    name: 'Sparse membership with persistent selector views',
  },
  {
    entry: fileURLToPath(new URL('./fixtures/signature-persistent-size-entry.ts', import.meta.url)),
    name: 'Signature membership with persistent selector views',
  },
  {
    entry: fileURLToPath(new URL('./fixtures/anchored-scan-size-entry.ts', import.meta.url)),
    name: 'Sparse membership with anchored selector scans',
  },
] as const

const measurements = []
for (const artifact of artifacts) {
  const result = await build({
    bundle: true,
    entryPoints: [artifact.entry],
    format: 'esm',
    minify: true,
    platform: 'browser',
    target: 'es2022',
    treeShaking: true,
    write: false,
  })

  const code = result.outputFiles[0]?.contents
  if (!code) throw new Error(`${artifact.name} size probe did not produce an output file`)

  measurements.push({
    artifact: artifact.name,
    brotliBytes: brotliCompressSync(code).byteLength,
    gzipBytes: gzipSync(code).byteLength,
    minifiedBytes: code.byteLength,
  })
}

const report = {
  schemaVersion: 2,
  esbuild: packageVersion('esbuild'),
  harnessSha256: harnessHash.digest('hex'),
  harnessSources,
  koota: packageVersion('koota'),
  measurements,
  mergeBase: gitMergeBase(),
  methodology: {
    brotli: 'node:zlib brotliCompressSync defaults',
    bundle: 'esbuild browser ESM bundle with minification and tree shaking',
    gzip: 'node:zlib gzipSync defaults',
  },
  target: 'es2022',
}

const serialized = `${JSON.stringify(report, null, 2)}\n`
const outputPath = process.argv.find((value) => value.startsWith('--output='))?.slice(9)
if (outputPath === undefined) {
  process.stdout.write(serialized)
} else {
  const absoluteOutputPath = resolve(process.cwd(), outputPath)
  mkdirSync(dirname(absoluteOutputPath), { recursive: true })
  writeFileSync(absoluteOutputPath, serialized)
  process.stdout.write(`${absoluteOutputPath}\n`)
}
