import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'

const ROOT = resolve(import.meta.dirname, '..')
const SOURCE_ROOTS = ['benchmarks', 'docs/src', 'examples', 'minis', 'packages', 'tools']
const SKIPPED_DIRECTORIES = new Set(['dist', 'node_modules', '.astro', '.nx'])
const BARE_R3F = '@react-three/fiber'

export function hasBareR3FRuntimeReference(source: string): boolean {
  const file = ts.createSourceFile('entrypoint-check.tsx', source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX)

  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      if (statement.moduleSpecifier.text !== BARE_R3F) continue
      const clause = statement.importClause
      if (!clause || clause.name || (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings))) return true
      if (clause.isTypeOnly) continue
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
    if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]!)) {
      const runtimeLoader =
        node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')
      if (runtimeLoader && node.arguments[0]!.text === BARE_R3F) dynamicRuntimeReference = true
    }
    if (!dynamicRuntimeReference) ts.forEachChild(node, visit)
  }
  visit(file)
  return dynamicRuntimeReference
}

function sourceFiles(directory: string): string[] {
  if (SKIPPED_DIRECTORIES.has(directory.split('/').at(-1)!)) return []
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
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
    "require('@react-three/fiber')",
  ])('detects runtime form %s', (source) => {
    expect(hasBareR3FRuntimeReference(source)).toBe(true)
  })

  it.each([
    "import type { RootState } from '@react-three/fiber'",
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
})
