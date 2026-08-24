import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

export interface TrustedProvenance {
  source: string
  dirty: 'true' | 'false'
  labs: string
  lock: string
  config: string
  fixture: string
  runner: string
  note?: string
}

export interface LabsInstallation {
  packageRoot: string
  cli: string
  version: string
}

interface LabsPackageMetadata {
  name: '@pmndrs/labs'
  version: string
  bin: string | Record<string, string>
}

const REQUIRED_KEYS = ['source', 'dirty', 'labs', 'lock', 'config', 'fixture', 'runner'] as const
const ALLOWED_KEYS = new Set<string>([...REQUIRED_KEYS, 'note'])
const HASH = /^[0-9a-f]{64}$/
const REVISION = /^[0-9a-f]{40}$/
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateNote(note: string): void {
  if (note.length === 0) throw new Error('Labs provenance note cannot be empty')
  if (/[;=\r\n]/.test(note)) {
    throw new Error("Labs provenance note cannot contain ';', '=', or line breaks")
  }
}

function requiredField(fields: Readonly<Record<string, string>>, key: string): string {
  const value = fields[key]
  if (value === undefined) throw new Error(`Labs provenance is missing field '${key}'`)
  return value
}

export function takeUserMessage(args: readonly string[]): { args: string[]; message?: string } {
  const forwarded: string[] = []
  let message: string | undefined

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!
    const inlineMessage = arg.startsWith('--message=') ? arg.slice('--message='.length) : undefined
    if (arg === '-m' || arg === '--message' || inlineMessage !== undefined) {
      const value = inlineMessage ?? args[index + 1]
      if (value === undefined) throw new Error(`${arg} requires a value`)
      if (message !== undefined) throw new Error('Labs accepts only one provenance note')
      validateNote(value)
      message = value
      if (inlineMessage === undefined) index++
      continue
    }
    forwarded.push(arg)
  }

  return { args: forwarded, ...(message === undefined ? {} : { message }) }
}

export function parseTrustedDescription(description: unknown): TrustedProvenance {
  if (typeof description !== 'string' || description.length === 0) {
    throw new Error('Labs result is missing a trusted provenance description')
  }

  const fields: Record<string, string> = {}
  for (const part of description.split('; ')) {
    const separator = part.indexOf('=')
    if (separator <= 0) throw new Error('Labs provenance contains a malformed field')
    const key = part.slice(0, separator)
    const value = part.slice(separator + 1)
    if (!ALLOWED_KEYS.has(key)) throw new Error(`Labs provenance contains unknown field '${key}'`)
    if (key in fields) throw new Error(`Labs provenance contains duplicate field '${key}'`)
    if (value.length === 0) throw new Error(`Labs provenance field '${key}' is empty`)
    fields[key] = value
  }

  const source = requiredField(fields, 'source')
  const dirty = requiredField(fields, 'dirty')
  const labs = requiredField(fields, 'labs')
  const lock = requiredField(fields, 'lock')
  const config = requiredField(fields, 'config')
  const fixture = requiredField(fields, 'fixture')
  const runner = requiredField(fields, 'runner')
  if (!REVISION.test(source)) throw new Error('Labs provenance source is not a full Git revision')
  if (dirty !== 'true' && dirty !== 'false') {
    throw new Error('Labs provenance dirty flag must be true or false')
  }
  if (!VERSION.test(labs)) throw new Error('Labs provenance version is malformed')
  for (const [key, value] of Object.entries({ lock, config, fixture, runner })) {
    if (!HASH.test(value)) throw new Error(`Labs provenance ${key} is not a SHA-256 digest`)
  }
  const note = fields['note']
  if (note !== undefined) validateNote(note)

  return {
    source,
    dirty,
    labs,
    lock,
    config,
    fixture,
    runner,
    ...(note === undefined ? {} : { note }),
  }
}

export function createTrustedDescription(fields: TrustedProvenance): string {
  const trusted = parseTrustedDescription(
    [
      ...REQUIRED_KEYS.map((key) => `${key}=${fields[key]}`),
      ...(fields.note === undefined ? [] : [`note=${fields.note}`]),
    ].join('; ')
  )
  return [
    ...REQUIRED_KEYS.map((key) => `${key}=${trusted[key]}`),
    ...(trusted.note === undefined ? [] : [`note=${trusted.note}`]),
  ].join('; ')
}

export function assertCaptureMode(options: {
  baseline: boolean
  compare: boolean
  dirty: boolean
  smoke: boolean
}): void {
  if ((options.baseline || options.compare) && options.dirty) {
    throw new Error('Labs baseline and comparison captures require a clean source tree')
  }
  if ((options.baseline || options.compare) && options.smoke) {
    throw new Error('Labs baseline and comparison captures cannot use the smoke sampling profile')
  }
}

export function assertCompatibleBaseline(description: unknown, current: TrustedProvenance): void {
  const baseline = parseTrustedDescription(description)
  const mismatches: string[] = []
  if (baseline.dirty !== 'false') mismatches.push('baseline source is dirty')
  for (const key of ['labs', 'lock', 'config', 'fixture', 'runner'] as const) {
    if (baseline[key] !== current[key]) mismatches.push(`${key} differs from baseline`)
  }
  if (mismatches.length > 0) {
    throw new Error(`Labs comparison provenance mismatch: ${mismatches.join('; ')}`)
  }
}

function parsePackageMetadata(value: unknown): LabsPackageMetadata {
  if (!isRecord(value) || value['name'] !== '@pmndrs/labs' || typeof value['version'] !== 'string') {
    throw new Error('Installed @pmndrs/labs package metadata is malformed')
  }
  const untrustedBin = value['bin']
  if (typeof untrustedBin === 'string') {
    return { bin: untrustedBin, name: '@pmndrs/labs', version: value['version'] }
  }
  if (!isRecord(untrustedBin) || Object.values(untrustedBin).some((target) => typeof target !== 'string')) {
    throw new Error('Installed @pmndrs/labs bin metadata is malformed')
  }
  const bin: Record<string, string> = {}
  for (const [name, target] of Object.entries(untrustedBin)) {
    if (typeof target !== 'string') throw new Error('Installed @pmndrs/labs bin metadata is malformed')
    bin[name] = target
  }
  return { bin, name: '@pmndrs/labs', version: value['version'] }
}

export function resolveLabsInstallation(resolvedEntry: string): LabsInstallation {
  let directory = dirname(resolvedEntry)
  while (true) {
    const manifest = resolve(directory, 'package.json')
    if (existsSync(manifest)) {
      const metadata = parsePackageMetadata(JSON.parse(readFileSync(manifest, 'utf8')))
      const bin = metadata.bin
      const target = typeof bin === 'string' ? bin : (bin['labs'] ?? bin['bench'])
      if (target === undefined) throw new Error('Installed @pmndrs/labs package has no labs or bench binary')
      if (isAbsolute(target)) throw new Error('Installed @pmndrs/labs binary target must be package-relative')
      const cli = resolve(directory, target)
      const packageRelative = relative(directory, cli)
      if (packageRelative === '..' || packageRelative.startsWith(`..${sep}`)) {
        throw new Error('Installed @pmndrs/labs binary target escapes its package')
      }
      if (!existsSync(cli)) throw new Error(`Installed @pmndrs/labs binary is missing: ${target}`)
      return { cli, packageRoot: directory, version: metadata.version }
    }
    const parent = dirname(directory)
    if (parent === directory) throw new Error('Could not locate installed @pmndrs/labs package metadata')
    directory = parent
  }
}

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function sha256Files(paths: readonly string[]): string {
  const hash = createHash('sha256')
  for (const path of paths) hash.update(readFileSync(path))
  return hash.digest('hex')
}

export function snapshotDirectory(root: string): Record<string, string> {
  if (!existsSync(root)) return {}
  const snapshot: Record<string, string> = {}

  function visit(directory: string): void {
    for (const name of readdirSync(directory).sort()) {
      const path = resolve(directory, name)
      const pathRelative = relative(root, path)
      const stat = statSync(path)
      if (stat.isDirectory()) visit(path)
      else snapshot[pathRelative] = sha256File(path)
    }
  }

  visit(root)
  return snapshot
}

export function assertDirectorySnapshotUnchanged(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>
): void {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error('Labs smoke modified the trusted results directory')
  }
}

export function assertSmokeResultsEmpty(directory: string): void {
  if (existsSync(directory) && readdirSync(directory).length > 0) {
    throw new Error('Labs smoke wrote a saved result or baseline')
  }
}
