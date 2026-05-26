import * as vscode from 'vscode'
import { randomUUID } from 'node:crypto'
import {
  atlasToRects as atlasToRectsImpl,
  buildAtlasJson as buildAtlasJsonImpl,
  readAnimationsFromJson,
  type AnimationInput,
  type AtlasJson,
  type AtlasMergeMeta,
  type RectInput,
} from '@three-flatland/io/atlas'
import { assertValidAtlas } from './validateAtlas'

export type { AnimationInput, AtlasJson, RectInput }

export function buildAtlasJson(input: {
  image: { fileName: string; width: number; height: number }
  rects: readonly RectInput[]
  animations?: Record<string, AnimationInput>
  merge?: AtlasMergeMeta
}): AtlasJson {
  return buildAtlasJsonImpl(input)
}

export function atlasToRects(json: AtlasJson): RectInput[] {
  return atlasToRectsImpl(json, () => randomUUID())
}

export function sidecarUriForImage(imageUri: vscode.Uri): vscode.Uri {
  const path = imageUri.path
  const lastSlash = path.lastIndexOf('/')
  const dir = lastSlash >= 0 ? path.slice(0, lastSlash) : ''
  const fileName = lastSlash >= 0 ? path.slice(lastSlash + 1) : path
  const dot = fileName.lastIndexOf('.')
  const base = dot >= 0 ? fileName.slice(0, dot) : fileName
  return imageUri.with({ path: `${dir}/${base}.atlas.json` })
}

export async function writeAtlasSidecar(
  imageUri: vscode.Uri,
  json: AtlasJson
): Promise<vscode.Uri> {
  assertValidAtlas(json)
  const uri = sidecarUriForImage(imageUri)
  const text = JSON.stringify(json, null, 2) + '\n'
  await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'))
  return uri
}

export type LoadedAtlas = {
  json: AtlasJson
  rects: RectInput[]
  animations: Record<string, AnimationInput>
}

export async function readAtlasSidecar(
  imageUri: vscode.Uri
): Promise<LoadedAtlas | null> {
  const uri = sidecarUriForImage(imageUri)
  let bytes: Uint8Array
  try {
    bytes = await vscode.workspace.fs.readFile(uri)
  } catch (err) {
    if (err instanceof vscode.FileSystemError && err.code === 'FileNotFound') {
      return null
    }
    throw err
  }
  const text = new TextDecoder('utf-8').decode(bytes)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Atlas sidecar is not valid JSON: ${msg}`)
  }
  assertValidAtlas(parsed)
  const atlas = parsed as AtlasJson
  return {
    json: atlas,
    rects: atlasToRects(atlas),
    animations: readAnimationsFromJson(atlas),
  }
}
