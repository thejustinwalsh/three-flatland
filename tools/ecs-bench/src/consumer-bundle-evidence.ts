import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import { build, type Metafile, type OutputFile, type Plugin } from 'esbuild'

export const RECORDED_KOOTA_BASELINE = {
  brotliBytes: 9_362,
  gzipBytes: 10_584,
  minifiedBytes: 34_910,
} as const

export const MINIMUM_REPRESENTATIVE_SAVING = {
  gzipBytes: 6_000,
  minifiedBytes: 22_000,
} as const

export const consumerFixtures = [
  {
    id: 'basic-three',
    label: 'Basic Three.js consumer',
    source: 'tools/ecs-bench/src/fixtures/consumer-basic-three.ts.fixture',
  },
  {
    id: 'basic-react',
    label: 'Basic React Three Fiber consumer',
    source: 'tools/ecs-bench/src/fixtures/consumer-basic-react.ts.fixture',
  },
  {
    id: 'knightmark',
    label: 'Knightmark batch-stress consumer',
    source: 'tools/ecs-bench/src/fixtures/consumer-knightmark.ts.fixture',
  },
  {
    id: 'pass-lighting',
    label: 'Pass, lighting, and dynamic-trait consumer',
    source: 'tools/ecs-bench/src/fixtures/consumer-pass-lighting.ts.fixture',
  },
] as const

type ConsumerFixture = (typeof consumerFixtures)[number]

interface BundleSize {
  readonly brotliBytes: number
  readonly gzipBytes: number
  readonly minifiedBytes: number
}

export interface BundleAttribution {
  readonly duplicateRuntimeInputs: readonly {
    readonly input: string
    readonly outputs: readonly string[]
  }[]
  readonly kootaBytesInOutput: number
  readonly kootaInputs: readonly string[]
  readonly runtimeBytesInOutput: number
  readonly runtimeInputs: readonly string[]
  readonly runtimeOutputs: readonly string[]
}

interface BundleCapture {
  readonly attribution: BundleAttribution
  readonly code: Uint8Array
  readonly metafile: Metafile
  readonly size: BundleSize
}

interface SharedGraphCapture {
  readonly attribution: BundleAttribution
  readonly metafile: Metafile
  readonly outputFiles: readonly OutputFile[]
}

export interface RepresentativeConsumerResult {
  readonly baseline: BundleSize & BundleAttribution
  readonly current: BundleSize & BundleAttribution
  readonly fixture: ConsumerFixture
  readonly saving: BundleSize
}

export interface ConsumerBundleEvidenceReport {
  readonly captures: readonly RepresentativeConsumerResult[]
  readonly compression: {
    readonly brotli: string
    readonly gzip: string
  }
  readonly gate: {
    readonly kootaAbsentFromCurrentConsumerGraphs: boolean
    readonly minimumGzipSavingBytes: number
    readonly minimumMinifiedSavingBytes: number
    readonly noDuplicateRuntimeChunk: boolean
    readonly publishedOutputKootaReferences: readonly string[]
    readonly recordedKootaBaselineMatched: boolean
    readonly sourceKootaImports: readonly string[]
  }
  readonly isolatedKootaBaseline: BundleSize
  readonly methodology: string
  readonly provenance: {
    readonly dirty: boolean
    readonly fixtureSources: readonly { readonly path: string; readonly sha256: string }[]
    readonly harnessSha256: string
    readonly harnessSources: readonly string[]
    readonly lockfileSha256: string
    readonly productionSourceSha256: string
    readonly revision: string
    readonly toolVersions: {
      readonly esbuild: string
      readonly koota: string
      readonly node: string
      readonly pnpm: string
      readonly react: string
      readonly reactThreeFiber: string
      readonly three: string
    }
  }
  readonly schemaVersion: 1
  readonly sharedGraph: BundleAttribution
  readonly status: 'measured-unreviewed' | 'smoke-dirty'
  readonly target: 'es2022'
}

export interface CaptureConsumerBundleOptions {
  readonly allowDirty?: boolean
  readonly outputDirectory?: string
  readonly requirePublishedOutput?: boolean
  readonly repositoryRoot?: string
  readonly writeArtifacts?: boolean
}

const harnessSources = [
  'tools/ecs-bench/src/consumer-bundle-evidence.ts',
  'tools/ecs-bench/src/measure-consumer-bundles.ts',
  'tools/ecs-bench/src/consumer-bundle-evidence.test.ts',
  'tools/ecs-bench/src/fixtures/koota-size-entry.ts',
  ...consumerFixtures.map(({ source }) => source),
] as const

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function hashFiles(root: string, files: readonly string[]): string {
  const hash = createHash('sha256')
  for (const file of [...files].sort()) {
    hash.update(file)
    hash.update(readFileSync(resolve(root, file)))
  }
  return hash.digest('hex')
}

function git(root: string, args: readonly string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function gitTrackedProductionSources(root: string): string[] {
  return git(root, ['ls-files', 'packages/three-flatland/src'])
    .split('\n')
    .filter(
      (path) =>
        path.length > 0 &&
        /\.(?:ts|tsx)$/.test(path) &&
        !/\.(?:test|spec|bench)(?:-d)?\.(?:ts|tsx)$/.test(path) &&
        !path.endsWith('.type-test.ts')
    )
    .sort()
}

function packageVersion(name: string, anchor: string): string {
  const anchoredRequire = createRequire(anchor)
  let directory = dirname(anchoredRequire.resolve(name))
  while (true) {
    const manifestPath = resolve(directory, 'package.json')
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: string; version?: string }
      if (manifest.name === name && manifest.version) return manifest.version
    }
    const parent = dirname(directory)
    if (parent === directory) throw new Error(`Could not resolve package version for ${name}`)
    directory = parent
  }
}

function sourceAliasPlugin(root: string): Plugin {
  const sourceEntries = new Map([
    ['@three-flatland/bake', resolve(root, 'packages/bake/src/index.ts')],
    ['three-flatland', resolve(root, 'packages/three-flatland/src/index.ts')],
    ['three-flatland/react', resolve(root, 'packages/three-flatland/src/react.ts')],
  ])
  return {
    name: 'three-flatland-source-entry',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^(?:@three-flatland\/bake|three-flatland(?:\/react)?)$/ }, ({ path }) => {
        const source = sourceEntries.get(path)
        if (!source) return null
        return { path: source }
      })
    },
  }
}

function consumerDependencyPlugin(root: string): Plugin {
  const resolveDirectory = resolve(root, 'packages/three-flatland')
  return {
    name: 'three-flatland-consumer-dependencies',
    setup(pluginBuild) {
      pluginBuild.onResolve(
        { filter: /^(?:three(?:\/.*)?|react(?:\/.*)?|@react-three\/fiber(?:\/.*)?)$/ },
        ({ path, pluginData }) => {
          if ((pluginData as { consumerResolved?: boolean } | undefined)?.consumerResolved) return null
          return pluginBuild.resolve(path, {
            kind: 'import-statement',
            pluginData: { consumerResolved: true },
            resolveDir: resolveDirectory,
          })
        }
      )
    },
  }
}

function consumerFixturePlugin(): Plugin {
  return {
    name: 'three-flatland-consumer-fixture',
    setup(pluginBuild) {
      pluginBuild.onLoad({ filter: /\.ts\.fixture$/ }, ({ path }) => ({
        contents: readFileSync(path, 'utf8'),
        loader: 'ts',
      }))
    },
  }
}

function isKootaInput(path: string): boolean {
  const normalized = path.split(sep).join('/')
  return /(?:^|\/)node_modules\/(?:\.pnpm\/koota@[^/]+\/node_modules\/)?koota\//.test(normalized)
}

function isRuntimeInput(path: string): boolean {
  return path.split(sep).join('/').includes('packages/three-flatland/src/ecs/runtime/')
}

function attribution(metafile: Metafile): BundleAttribution {
  const kootaInputs = Object.keys(metafile.inputs).filter(isKootaInput).sort()
  const runtimeInputs = Object.keys(metafile.inputs).filter(isRuntimeInput).sort()
  const runtimeOutputOwners = new Map<string, string[]>()
  let kootaBytesInOutput = 0
  let runtimeBytesInOutput = 0

  for (const [output, details] of Object.entries(metafile.outputs)) {
    for (const [input, contribution] of Object.entries(details.inputs)) {
      if (isKootaInput(input)) kootaBytesInOutput += contribution.bytesInOutput
      if (!isRuntimeInput(input)) continue
      runtimeBytesInOutput += contribution.bytesInOutput
      const outputs = runtimeOutputOwners.get(input) ?? []
      outputs.push(output)
      runtimeOutputOwners.set(input, outputs)
    }
  }

  const runtimeOutputs = [...new Set([...runtimeOutputOwners.values()].flat())].sort()
  return {
    duplicateRuntimeInputs: [...runtimeOutputOwners]
      .filter(([, outputs]) => outputs.length > 1)
      .map(([input, outputs]) => ({ input, outputs: [...outputs].sort() })),
    kootaBytesInOutput,
    kootaInputs,
    runtimeBytesInOutput,
    runtimeInputs,
    runtimeOutputs,
  }
}

function bundleSize(code: Uint8Array): BundleSize {
  return {
    brotliBytes: brotliCompressSync(code).byteLength,
    gzipBytes: gzipSync(code).byteLength,
    minifiedBytes: code.byteLength,
  }
}

async function buildConsumer(root: string, fixture: ConsumerFixture, includeKoota: boolean): Promise<BundleCapture> {
  const exports = [`export * from './${fixture.source}'`]
  if (includeKoota) exports.push("export * from './tools/ecs-bench/src/fixtures/koota-size-entry.ts'")
  const result = await build({
    absWorkingDir: root,
    bundle: true,
    define: {
      'process.env.FL_DEVTOOLS': '"false"',
      'process.env.FL_PROFILE': '"false"',
      'process.env.NODE_ENV': '"production"',
    },
    format: 'esm',
    legalComments: 'none',
    metafile: true,
    minify: true,
    outfile: `${fixture.id}.mjs`,
    platform: 'browser',
    plugins: [sourceAliasPlugin(root), consumerDependencyPlugin(root), consumerFixturePlugin()],
    sourcemap: false,
    stdin: {
      contents: `${exports.join('\n')}\n`,
      loader: 'ts',
      resolveDir: root,
      sourcefile: `${fixture.id}-${includeKoota ? 'koota-baseline' : 'current'}.ts`,
    },
    target: 'es2022',
    treeShaking: true,
    write: false,
  })
  const code = result.outputFiles?.find(({ path }) => path.endsWith('.mjs'))?.contents
  if (!code || !result.metafile) throw new Error(`${fixture.label} did not emit a bundle and metafile`)
  return { attribution: attribution(result.metafile), code, metafile: result.metafile, size: bundleSize(code) }
}

async function buildIsolatedKootaBaseline(root: string): Promise<BundleCapture> {
  const result = await build({
    absWorkingDir: root,
    bundle: true,
    entryPoints: ['tools/ecs-bench/src/fixtures/koota-size-entry.ts'],
    format: 'esm',
    legalComments: 'none',
    metafile: true,
    minify: true,
    outfile: 'koota-kernel.mjs',
    platform: 'browser',
    sourcemap: false,
    target: 'es2022',
    treeShaking: true,
    write: false,
  })
  const code = result.outputFiles?.find(({ path }) => path.endsWith('.mjs'))?.contents
  if (!code || !result.metafile) throw new Error('The isolated Koota baseline did not emit a bundle and metafile')
  return { attribution: attribution(result.metafile), code, metafile: result.metafile, size: bundleSize(code) }
}

async function buildSharedConsumerGraph(root: string): Promise<SharedGraphCapture> {
  const result = await build({
    absWorkingDir: root,
    bundle: true,
    chunkNames: 'chunks/[name]-[hash]',
    define: {
      'process.env.FL_DEVTOOLS': '"false"',
      'process.env.FL_PROFILE': '"false"',
      'process.env.NODE_ENV': '"production"',
    },
    entryNames: '[name]',
    entryPoints: Object.fromEntries(consumerFixtures.map((fixture) => [fixture.id, fixture.source])),
    format: 'esm',
    legalComments: 'none',
    metafile: true,
    minify: true,
    outdir: 'shared-graph',
    platform: 'browser',
    plugins: [sourceAliasPlugin(root), consumerDependencyPlugin(root), consumerFixturePlugin()],
    sourcemap: false,
    splitting: true,
    target: 'es2022',
    treeShaking: true,
    write: false,
  })
  if (!result.outputFiles || !result.metafile) {
    throw new Error('The shared representative graph did not emit bundles and a metafile')
  }
  return {
    attribution: attribution(result.metafile),
    metafile: result.metafile,
    outputFiles: result.outputFiles,
  }
}

function allFiles(directory: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...allFiles(path))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

function productionKootaImports(root: string, sources: readonly string[]): string[] {
  return sources.filter((source) => {
    const text = readFileSync(resolve(root, source), 'utf8')
    return /\b(?:from\s*|import\s*\()\s*['"]koota(?:\/[^'"]*)?['"]/.test(text)
  })
}

export function scanPublishedOutputForKoota(root: string, required: boolean): string[] {
  const dist = resolve(root, 'packages/three-flatland/dist')
  if (!existsSync(dist)) {
    if (required)
      throw new Error('packages/three-flatland/dist is missing; build the package before definitive capture')
    return []
  }
  return allFiles(dist)
    .filter((path) => /\.(?:[cm]?js|d\.ts|map)$/.test(path))
    .filter((path) => /\bkoota(?:\/react)?\b/i.test(readFileSync(path, 'utf8')))
    .map((path) => relative(root, path))
    .sort()
}

function subtract(baseline: BundleSize, current: BundleSize): BundleSize {
  return {
    brotliBytes: baseline.brotliBytes - current.brotliBytes,
    gzipBytes: baseline.gzipBytes - current.gzipBytes,
    minifiedBytes: baseline.minifiedBytes - current.minifiedBytes,
  }
}

function publicResult(
  fixture: ConsumerFixture,
  current: BundleCapture,
  baseline: BundleCapture
): RepresentativeConsumerResult {
  return {
    baseline: { ...baseline.size, ...baseline.attribution },
    current: { ...current.size, ...current.attribution },
    fixture,
    saving: subtract(baseline.size, current.size),
  }
}

function assertGate(report: ConsumerBundleEvidenceReport, currentCaptures: readonly BundleCapture[]): void {
  if (!report.gate.recordedKootaBaselineMatched) {
    throw new Error(
      `Isolated Koota baseline changed: expected ${JSON.stringify(RECORDED_KOOTA_BASELINE)}, ` +
        `received ${JSON.stringify(report.isolatedKootaBaseline)}`
    )
  }
  if (report.gate.sourceKootaImports.length > 0) {
    throw new Error(`Koota returned to three-flatland production source: ${report.gate.sourceKootaImports.join(', ')}`)
  }
  if (report.gate.publishedOutputKootaReferences.length > 0) {
    throw new Error(`Koota appears in published output: ${report.gate.publishedOutputKootaReferences.join(', ')}`)
  }
  if (report.sharedGraph.kootaInputs.length > 0) {
    throw new Error(
      `The shared representative graph still includes Koota: ${report.sharedGraph.kootaInputs.join(', ')}`
    )
  }
  if (report.sharedGraph.duplicateRuntimeInputs.length > 0) {
    throw new Error('The shared representative graph duplicates private-runtime modules across output chunks')
  }
  for (const capture of report.captures) {
    if (capture.current.runtimeInputs.length === 0) {
      throw new Error(`${capture.fixture.label} did not retain the private runtime and is not representative`)
    }
    if (capture.current.kootaInputs.length > 0) {
      throw new Error(`${capture.fixture.label} still includes Koota: ${capture.current.kootaInputs.join(', ')}`)
    }
    if (capture.current.duplicateRuntimeInputs.length > 0 || capture.current.runtimeOutputs.length !== 1) {
      throw new Error(`${capture.fixture.label} emitted the private runtime into more than one output chunk`)
    }
    if (capture.saving.minifiedBytes < MINIMUM_REPRESENTATIVE_SAVING.minifiedBytes) {
      throw new Error(
        `${capture.fixture.label} saves ${capture.saving.minifiedBytes} minified bytes; ` +
          `${MINIMUM_REPRESENTATIVE_SAVING.minifiedBytes} required`
      )
    }
    if (capture.saving.gzipBytes < MINIMUM_REPRESENTATIVE_SAVING.gzipBytes) {
      throw new Error(
        `${capture.fixture.label} saves ${capture.saving.gzipBytes} gzip bytes; ` +
          `${MINIMUM_REPRESENTATIVE_SAVING.gzipBytes} required`
      )
    }
  }
  for (const capture of currentCaptures) {
    if (/\bkoota(?:\/react)?\b/i.test(Buffer.from(capture.code).toString('utf8'))) {
      throw new Error('A current representative bundle contains a Koota runtime reference')
    }
  }
}

export function resolveEvidenceOutputDirectory(
  options: CaptureConsumerBundleOptions,
  root: string,
  revision: string
): string {
  const requested = options.outputDirectory
  const directory = requested ?? join(tmpdir(), `three-flatland-consumer-bundles-${revision.slice(0, 12)}`)
  const absolute = resolve(directory)
  const repositoryRelative = relative(root, absolute)
  if (repositoryRelative === '' || (!repositoryRelative.startsWith(`..${sep}`) && repositoryRelative !== '..')) {
    throw new Error('Consumer bundle evidence must be written outside the source repository')
  }
  return absolute
}

export function assertCaptureClean(dirty: boolean, allowDirty: boolean): void {
  if (dirty && !allowDirty) {
    throw new Error(
      'Refusing definitive consumer bundle evidence from a dirty source tree; use --allow-dirty for smoke only'
    )
  }
}

function writeArtifacts(
  root: string,
  directory: string,
  report: ConsumerBundleEvidenceReport,
  captures: readonly { fixture: ConsumerFixture; current: BundleCapture; baseline: BundleCapture }[],
  isolatedKoota: BundleCapture,
  sharedGraph: SharedGraphCapture
): void {
  if (existsSync(directory) && readdirSync(directory).length > 0) {
    throw new Error(`Evidence output directory is not empty: ${directory}`)
  }
  mkdirSync(directory, { recursive: true })
  for (const { fixture, current, baseline } of captures) {
    writeFileSync(resolve(directory, `${fixture.id}.current.mjs`), current.code)
    writeFileSync(
      resolve(directory, `${fixture.id}.current.metafile.json`),
      `${JSON.stringify(current.metafile, null, 2)}\n`
    )
    writeFileSync(resolve(directory, `${fixture.id}.koota-baseline.mjs`), baseline.code)
    writeFileSync(
      resolve(directory, `${fixture.id}.koota-baseline.metafile.json`),
      `${JSON.stringify(baseline.metafile, null, 2)}\n`
    )
  }
  writeFileSync(resolve(directory, 'koota-kernel.mjs'), isolatedKoota.code)
  writeFileSync(
    resolve(directory, 'koota-kernel.metafile.json'),
    `${JSON.stringify(isolatedKoota.metafile, null, 2)}\n`
  )
  writeFileSync(resolve(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(resolve(directory, 'shared-graph.metafile.json'), `${JSON.stringify(sharedGraph.metafile, null, 2)}\n`)
  for (const output of sharedGraph.outputFiles) {
    const outputRelative = relative(resolve(root, 'shared-graph'), output.path)
    if (outputRelative.startsWith(`..${sep}`) || outputRelative === '..') {
      throw new Error(`Shared-graph output escaped its configured directory: ${output.path}`)
    }
    const artifact = resolve(directory, 'shared-graph', outputRelative)
    mkdirSync(dirname(artifact), { recursive: true })
    writeFileSync(artifact, output.contents)
  }
}

export async function captureConsumerBundleEvidence(
  options: CaptureConsumerBundleOptions = {}
): Promise<{ readonly outputDirectory: string; readonly report: ConsumerBundleEvidenceReport }> {
  const root = resolve(options.repositoryRoot ?? resolve(import.meta.dirname, '../../..'))
  const revision = git(root, ['rev-parse', 'HEAD'])
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error(`Expected a full Git revision, received '${revision}'`)
  const dirty = git(root, ['status', '--short', '--untracked-files=all']).length > 0
  assertCaptureClean(dirty, options.allowDirty === true)

  const productionSources = gitTrackedProductionSources(root)
  const sourceImports = productionKootaImports(root, productionSources)
  const publishedReferences = scanPublishedOutputForKoota(root, options.requirePublishedOutput ?? true)
  const isolatedKoota = await buildIsolatedKootaBaseline(root)
  const sharedGraph = await buildSharedConsumerGraph(root)
  const captures: { fixture: ConsumerFixture; current: BundleCapture; baseline: BundleCapture }[] = []
  for (const fixture of consumerFixtures) {
    const current = await buildConsumer(root, fixture, false)
    const baseline = await buildConsumer(root, fixture, true)
    captures.push({ baseline, current, fixture })
  }

  const publicCaptures = captures.map(({ fixture, current, baseline }) => publicResult(fixture, current, baseline))
  const fixtureSources = consumerFixtures.map(({ source }) => ({
    path: source,
    sha256: sha256(readFileSync(resolve(root, source))),
  }))
  const report: ConsumerBundleEvidenceReport = {
    captures: publicCaptures,
    compression: {
      brotli: 'node:zlib brotliCompressSync defaults',
      gzip: 'node:zlib gzipSync defaults',
    },
    gate: {
      kootaAbsentFromCurrentConsumerGraphs:
        publicCaptures.every(({ current }) => current.kootaInputs.length === 0) &&
        sharedGraph.attribution.kootaInputs.length === 0,
      minimumGzipSavingBytes: MINIMUM_REPRESENTATIVE_SAVING.gzipBytes,
      minimumMinifiedSavingBytes: MINIMUM_REPRESENTATIVE_SAVING.minifiedBytes,
      noDuplicateRuntimeChunk:
        publicCaptures.every(({ current }) => current.duplicateRuntimeInputs.length === 0) &&
        sharedGraph.attribution.duplicateRuntimeInputs.length === 0,
      publishedOutputKootaReferences: publishedReferences,
      recordedKootaBaselineMatched: JSON.stringify(isolatedKoota.size) === JSON.stringify(RECORDED_KOOTA_BASELINE),
      sourceKootaImports: sourceImports,
    },
    isolatedKootaBaseline: isolatedKoota.size,
    methodology:
      'Each current consumer is bundled from three-flatland source. Its paired baseline uses the identical graph plus ' +
      'the exact seven exported Koota symbols from the recorded baseline entry. The pair isolates Koota attribution ' +
      'without changing Three.js, React, fixture code, minifier settings, or the private runtime.',
    provenance: {
      dirty,
      fixtureSources,
      harnessSha256: hashFiles(root, harnessSources),
      harnessSources,
      lockfileSha256: sha256(readFileSync(resolve(root, 'pnpm-lock.yaml'))),
      productionSourceSha256: hashFiles(root, productionSources),
      revision,
      toolVersions: {
        esbuild: packageVersion('esbuild', resolve(root, 'tools/ecs-bench/package.json')),
        koota: packageVersion('koota', resolve(root, 'tools/ecs-bench/package.json')),
        node: process.version,
        pnpm: execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim(),
        react: packageVersion('react', resolve(root, 'packages/three-flatland/package.json')),
        reactThreeFiber: packageVersion('@react-three/fiber', resolve(root, 'packages/three-flatland/package.json')),
        three: packageVersion('three', resolve(root, 'packages/three-flatland/package.json')),
      },
    },
    schemaVersion: 1,
    sharedGraph: sharedGraph.attribution,
    status: dirty ? 'smoke-dirty' : 'measured-unreviewed',
    target: 'es2022',
  }

  assertGate(
    report,
    captures.map(({ current }) => current)
  )
  const outputDirectory = resolveEvidenceOutputDirectory(options, root, revision)
  if (options.writeArtifacts !== false)
    writeArtifacts(root, outputDirectory, report, captures, isolatedKoota, sharedGraph)
  return { outputDirectory, report }
}
