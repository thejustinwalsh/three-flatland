import * as vscode from 'vscode'
import { randomUUID } from 'node:crypto'
import { assertValidAtlas } from './validateAtlas'

/** Rect in image-pixel coords, as sent from the webview. */
export type RectInput = {
  id: string
  x: number
  y: number
  w: number
  h: number
  name?: string
}

/**
 * SpriteSheetJSONHash shape (from `packages/three-flatland/src/sprites/
 * types.ts`) with our additive `meta.app` + `meta.version` markers. The
 * sibling schema at `packages/three-flatland/src/sprites/atlas.schema.
 * json` validates this structure. We don't run ajv at save time today —
 * rects come from our own code and the shape is statically controlled —
 * but the schema is the publishable spec.
 */
export type AtlasJson = {
  $schema?: string
  meta: {
    app: string
    version: string
    image: string
    size: { w: number; h: number }
    scale: string
  }
  frames: Record<
    string,
    {
      frame: { x: number; y: number; w: number; h: number }
      rotated: boolean
      trimmed: boolean
      spriteSourceSize: { x: number; y: number; w: number; h: number }
      sourceSize: { w: number; h: number }
    }
  >
}

export function buildAtlasJson(input: {
  image: { fileName: string; width: number; height: number }
  rects: readonly RectInput[]
}): AtlasJson {
  const frames: AtlasJson['frames'] = {}
  const used = new Set<string>()

  input.rects.forEach((r, i) => {
    const key = uniqueKey(r.name ?? `frame_${i}`, used)
    frames[key] = {
      frame: { x: r.x, y: r.y, w: r.w, h: r.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: r.w, h: r.h },
      sourceSize: { w: r.w, h: r.h },
    }
  })

  return {
    $schema: 'https://three-flatland.dev/schemas/atlas.v1.json',
    meta: {
      app: 'fl-sprite-atlas',
      version: '1.0',
      image: input.image.fileName,
      size: { w: input.image.width, h: input.image.height },
      scale: '1',
    },
    frames,
  }
}

/**
 * Derive the sidecar URI from the image URI:
 *   /path/to/knight.png → /path/to/knight.atlas.json
 *
 * Explicitly uses `.atlas.json` not just `.json` so it doesn't collide
 * with arbitrary `knight.json` files the user might already have.
 */
export function sidecarUriForImage(imageUri: vscode.Uri): vscode.Uri {
  const path = imageUri.path
  const lastSlash = path.lastIndexOf('/')
  const dir = lastSlash >= 0 ? path.slice(0, lastSlash) : ''
  const fileName = lastSlash >= 0 ? path.slice(lastSlash + 1) : path
  const dot = fileName.lastIndexOf('.')
  const base = dot >= 0 ? fileName.slice(0, dot) : fileName
  const sidecar = `${dir}/${base}.atlas.json`
  return imageUri.with({ path: sidecar })
}

export async function writeAtlasSidecar(
  imageUri: vscode.Uri,
  json: AtlasJson
): Promise<vscode.Uri> {
  // Validate before writing so a schema-invalid blob never hits disk.
  // We control the build path so this should never throw in practice,
  // but it's cheap insurance if the shape ever drifts.
  assertValidAtlas(json)
  const uri = sidecarUriForImage(imageUri)
  const text = JSON.stringify(json, null, 2) + '\n'
  await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'))
  return uri
}

/**
 * Try to read the sidecar for the given image. Returns `null` if no
 * sidecar exists yet (fresh atlas). Throws if the file exists but the
 * contents are malformed or fail schema validation — caller decides
 * whether to surface the error or fall back to empty.
 */
export type LoadedAtlas = {
  json: AtlasJson
  rects: RectInput[]
}

export async function readAtlasSidecar(imageUri: vscode.Uri): Promise<LoadedAtlas | null> {
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
  return { json: parsed, rects: atlasToRects(parsed) }
}

/**
 * Project a validated AtlasJson back into the webview's RectInput[] model.
 * Frame keys become `name`; ids are freshly generated (sidecar has no
 * durable id concept). Future phases may preserve extra per-frame fields
 * we currently drop (pivot, rotated, trimmed, spriteSourceSize).
 */
export function atlasToRects(json: AtlasJson): RectInput[] {
  const out: RectInput[] = []
  for (const [name, frame] of Object.entries(json.frames)) {
    out.push({
      id: randomUUID(),
      x: frame.frame.x,
      y: frame.frame.y,
      w: frame.frame.w,
      h: frame.frame.h,
      name,
    })
  }
  return out
}

function uniqueKey(candidate: string, used: Set<string>): string {
  if (!used.has(candidate)) {
    used.add(candidate)
    return candidate
  }
  // Append a suffix on collisions so duplicate names don't clobber each
  // other in the hash-style frames dict.
  let i = 1
  while (used.has(`${candidate}_${i}`)) i++
  const key = `${candidate}_${i}`
  used.add(key)
  return key
}
