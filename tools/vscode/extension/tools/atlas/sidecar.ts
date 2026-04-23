import * as vscode from 'vscode'

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
  const uri = sidecarUriForImage(imageUri)
  const text = JSON.stringify(json, null, 2) + '\n'
  await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'))
  return uri
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
