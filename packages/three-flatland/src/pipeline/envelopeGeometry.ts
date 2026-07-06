import { BufferAttribute, BufferGeometry, Sphere, Vector3, type Texture } from 'three'
import { getAtlasMesh } from '../loaders/atlasMeshRegistry'
import { convexHull, fanTriangulate } from './convexHull'

/**
 * Build the shared per-batch envelope geometry (tight-mesh Option A):
 * the convex hull of every registered frame polygon in the atlas, in
 * unit-quad local space, with corner UVs derived from position — the
 * same `local + 0.5` mapping the synth quad uses, so the shader's
 * flip/atlas remap applies unchanged.
 *
 * When the atlas has frames WITHOUT polygons (`complete: false`), the
 * full quad corners join the hull so those frames render un-clipped —
 * the envelope degrades toward the quad instead of clipping content.
 *
 * Returns null when the texture has no registered atlas polygons
 * (callers fall back to the synth quad).
 */
export function buildEnvelopeGeometry(texture: Texture | null): BufferGeometry | null {
  const atlas = getAtlasMesh(texture)
  if (!atlas || atlas.frames.length === 0) return null

  const points: [number, number][] = []
  for (const frame of atlas.frames) {
    const mesh = frame.mesh!
    for (let i = 0; i < mesh.vertexCount; i++) {
      points.push([mesh.verts[i * 4 + 0]!, mesh.verts[i * 4 + 1]!])
    }
  }
  if (!atlas.complete) {
    points.push([-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5])
  }

  const hull = convexHull(points)
  if (hull.length < 3) return null

  const positions = new Float32Array(hull.length * 3)
  const uvs = new Float32Array(hull.length * 2)
  for (let i = 0; i < hull.length; i++) {
    const [x, y] = hull[i]!
    positions[i * 3 + 0] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = 0
    uvs[i * 2 + 0] = x + 0.5
    uvs[i * 2 + 1] = y + 0.5
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  geometry.setIndex(fanTriangulate(hull.length))
  geometry.boundingSphere = new Sphere(new Vector3(), Math.SQRT1_2)
  return geometry
}
