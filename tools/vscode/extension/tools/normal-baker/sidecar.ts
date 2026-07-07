import * as vscode from 'vscode'
import { randomUUID } from 'node:crypto'
import { renameSync, unlinkSync } from 'node:fs'
import { bakeNormalMapFile, type NormalSourceDescriptor } from '@three-flatland/normals/node'
import { writeSidecarJson } from '@three-flatland/bake/node'
import { assertValidNormalDescriptor } from '@three-flatland/schemas/normal-descriptor'
import { publishAtomically } from './atomicPublish'
import { normalJsonPath, normalPngPath } from './paths'

// The schemas package exports only the ajv validator (`assertValidNormalDescriptor`
// etc.), not a TS type — `NormalSourceDescriptor` from packages/normals is
// the authoritative type for the shape it validates, kept in sync with
// the JSON Schema by a schema-parity test in packages/normals (see
// planning/vscode-tools/tool-normal-baker.md "JSON Schema").

export function normalJsonUriFor(imageUri: vscode.Uri): vscode.Uri {
  return imageUri.with({ path: normalJsonPath(imageUri.path) })
}

export function normalPngUriFor(imageUri: vscode.Uri): vscode.Uri {
  return imageUri.with({ path: normalPngPath(imageUri.path) })
}

export type LoadedDescriptor = { descriptor: NormalSourceDescriptor }

/**
 * Read + ajv-validate the `.normal.json` sidecar next to `imageUri`, if
 * one exists. Returns `null` when there is no sidecar yet (fresh bake) —
 * NOT an error. Throws on malformed JSON or a schema violation; callers
 * treat that as a non-fatal load error (see atlas's `readAtlasSidecar`
 * for the established convention this mirrors).
 */
export async function readNormalDescriptorSidecar(
  imageUri: vscode.Uri
): Promise<LoadedDescriptor | null> {
  const uri = normalJsonUriFor(imageUri)
  let bytes: Uint8Array
  try {
    bytes = await vscode.workspace.fs.readFile(uri)
  } catch (err) {
    if (err instanceof vscode.FileSystemError && err.code === 'FileNotFound') return null
    throw err
  }
  const text = new TextDecoder('utf-8').decode(bytes)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Normal descriptor sidecar is not valid JSON: ${msg}`)
  }
  assertValidNormalDescriptor(parsed)
  return { descriptor: parsed as NormalSourceDescriptor }
}

export type SaveResult = { pngUri: vscode.Uri; jsonUri: vscode.Uri }

/**
 * Validate, bake, and write both sidecar outputs for `imageUri`.
 *
 * `bakeNormalMapFile` (Node fs — the extension host is Node, so this
 * runs directly, no subprocess) reads the source PNG, bakes it, and
 * writes a PNG stamped with a `tEXt` chunk carrying
 * `hashDescriptor(descriptor)`. `writeSidecarJson` then writes the exact
 * same `descriptor` object as JSON. Baking and JSON-writing both read
 * from the one `descriptor` parameter, so the PNG's stamped hash and the
 * JSON sidecar can never disagree about WHAT was baked — see
 * planning/vscode-tools/tool-normal-baker.md, "Risk 3: Hash re-stamp on
 * Save."
 *
 * The actual bake-to-temp / write-to-temp / rename-into-place / cleanup-
 * on-failure orchestration lives in `publishAtomically()` (atomicPublish.ts)
 * — extracted so it's unit-testable with injected fakes, including a
 * simulated failure, which a function importing `vscode` at module scope
 * can't be (see paths.ts's note). This function just supplies the real
 * dependencies and the four concrete paths.
 *
 * Only supports local (`file://`) sources — `bakeNormalMapFile` is a
 * synchronous Node `fs` reader/writer, not `vscode.workspace.fs`, so a
 * virtual-filesystem source (remote SSH edits a local extension host
 * doesn't back, Codespaces web, vscode.dev) can't be baked this way.
 */
export function saveNormalDescriptor(
  imageUri: vscode.Uri,
  descriptor: NormalSourceDescriptor
): SaveResult {
  assertValidNormalDescriptor(descriptor)
  if (imageUri.scheme !== 'file') {
    throw new Error(
      `FL Normal Baker: source image must be on the local filesystem to bake (got scheme "${imageUri.scheme}").`
    )
  }
  const jsonUri = normalJsonUriFor(imageUri)
  const pngUri = normalPngUriFor(imageUri)
  const tmpSuffix = `.tmp-${randomUUID()}`
  publishAtomically(
    {
      pngPath: pngUri.fsPath,
      jsonPath: jsonUri.fsPath,
      pngTmpPath: pngUri.fsPath + tmpSuffix,
      jsonTmpPath: jsonUri.fsPath + tmpSuffix,
    },
    {
      bake: (tmpPngPath) => bakeNormalMapFile(imageUri.fsPath, descriptor, tmpPngPath),
      writeJson: (tmpJsonPath) => writeSidecarJson(tmpJsonPath, descriptor),
      rename: renameSync,
      unlink: unlinkSync,
    }
  )
  return { pngUri, jsonUri }
}
