import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'

const ROOT = resolve(import.meta.dirname, '..')
const SOURCE_ROOTS = ['benchmarks', 'docs/src', 'examples', 'minis', 'packages', 'tools']
const SKIPPED_DIRECTORIES = new Set(['dist', 'node_modules', '.astro', '.nx'])
const BARE_R3F = '@react-three/fiber'

export function hasBareR3FRuntimeReference(source: string): boolean {
  if (!source.includes(BARE_R3F)) return false

  const file = ts.createSourceFile('entrypoint-check.tsx', source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX)

  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      if (statement.moduleSpecifier.text !== BARE_R3F) continue
      const clause = statement.importClause
      if (clause?.isTypeOnly) continue
      if (!clause || clause.name || (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings))) return true
      if (clause.namedBindings?.elements.some((element) => !element.isTypeOnly)) return true
    }

    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      if (statement.moduleSpecifier.text !== BARE_R3F || statement.isTypeOnly) continue
      if (!statement.exportClause || ts.isNamespaceExport(statement.exportClause)) return true
      if (statement.exportClause.elements.some((element) => !element.isTypeOnly)) return true
    }
  }

  let dynamicRuntimeReference = false
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.arguments.length >= 1) {
      const specifier = node.arguments[0]!
      const runtimeLoader =
        node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')
      const bareSpecifier =
        (ts.isStringLiteral(specifier) || ts.isNoSubstitutionTemplateLiteral(specifier)) && specifier.text === BARE_R3F
      if (runtimeLoader && bareSpecifier) dynamicRuntimeReference = true
    }
    if (!dynamicRuntimeReference) ts.forEachChild(node, visit)
  }
  visit(file)
  return dynamicRuntimeReference
}

export function sourceFiles(directory: string, visitedDirectories = new Set<string>()): string[] {
  if (SKIPPED_DIRECTORIES.has(directory.split('/').at(-1)!)) return []
  const realDirectory = realpathSync(directory)
  if (visitedDirectories.has(realDirectory)) return []
  visitedDirectories.add(realDirectory)

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path, visitedDirectories)
    if (entry.isSymbolicLink()) {
      const target = statSync(path)
      if (target.isDirectory()) return sourceFiles(path, visitedDirectories)
      if (!target.isFile()) return []
    } else if (!entry.isFile()) return []
    if (!/\.[cm]?[jt]sx?$/.test(path) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path)) return []
    return [path]
  })
}

describe('R3F runtime entrypoints', () => {
  it.each([
    "import { useFrame } from '@react-three/fiber'",
    "import {\n  useFrame,\n} from '@react-three/fiber'",
    "import * as Fiber from '@react-three/fiber'",
    "import '@react-three/fiber'",
    "export { useFrame } from '@react-three/fiber'",
    "export * from '@react-three/fiber'",
    "import('@react-three/fiber')",
    'import(`@react-three/fiber`)',
    "import('@react-three/fiber', { with: { type: 'json' } })",
    "require('@react-three/fiber')",
    "require('@react-three/fiber', {})",
  ])('detects runtime form %s', (source) => {
    expect(hasBareR3FRuntimeReference(source)).toBe(true)
  })

  it.each([
    "import type { RootState } from '@react-three/fiber'",
    "import type * as Fiber from '@react-three/fiber'",
    "import type Fiber from '@react-three/fiber'",
    "import { type RootState } from '@react-three/fiber'",
    "export type { RootState } from '@react-three/fiber'",
    "import { useFrame } from '@react-three/fiber/webgpu'",
  ])('allows type-only or WebGPU form %s', (source) => {
    expect(hasBareR3FRuntimeReference(source)).toBe(false)
  })

  it('keeps production WebGPU code out of the legacy R3F entry graph', () => {
    const violations = SOURCE_ROOTS.flatMap((root) => sourceFiles(join(ROOT, root))).flatMap((path) =>
      hasBareR3FRuntimeReference(readFileSync(path, 'utf8')) ? [relative(ROOT, path)] : []
    )

    expect(violations).toEqual([])
  })

  it('follows source symlinks without recursing through directory cycles', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'flatland-r3f-entrypoints-'))
    const source = join(fixture, 'source')
    const linked = join(fixture, 'linked')
    mkdirSync(source)
    writeFileSync(join(source, 'runtime.ts'), "import { useFrame } from '@react-three/fiber'")
    symlinkSync(source, linked)
    symlinkSync(fixture, join(source, 'cycle'))

    try {
      expect(sourceFiles(linked)).toEqual([join(linked, 'runtime.ts')])
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })
})
