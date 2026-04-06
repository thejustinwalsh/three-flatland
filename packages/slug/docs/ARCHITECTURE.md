# Architecture

Deep dive into how `@three-flatland/slug` renders text on the GPU.

## Overview

Slug renders font glyphs by evaluating their quadratic Bezier curve outlines directly in the fragment shader. Each pixel determines whether it is inside or outside the glyph by casting rays and counting curve intersections (winding number). This produces mathematically exact results at any resolution, zoom level, or projection.

The system has two halves:

1. **CPU pipeline** -- parse font, extract curves, build acceleration structures, pack into GPU textures
2. **GPU shaders** -- evaluate per-pixel coverage from the curve data via TSL (Three Shader Language)

## CPU Pipeline

### Font Parsing (`pipeline/fontParser.ts`)

Loads a TTF/OTF/WOFF file via [opentype.js](https://github.com/opentypejs/opentype.js) and converts all glyph outlines to quadratic Bezier curves in normalized em-space (0--1 range):

**Curve conversion rules:**

| Source | Conversion | Notes |
|--------|-----------|-------|
| Line segment (L) | Degenerate quadratic | Slight perpendicular bowing (epsilon = 0.125/1024) prevents scanline dropout in root eligibility |
| Quadratic (Q) | Pass through | TrueType fonts use quadratics natively |
| Cubic (C) | Split at t=0.5 via De Casteljau | Produces 2 quadratics per cubic. OpenType/CFF fonts use cubics. |

Each glyph stores:
- `curves: QuadCurve[]` -- array of `{ p0x, p0y, p1x, p1y, p2x, p2y }` in em-space
- `bounds: GlyphBounds` -- bounding box from control point extrema
- `advanceWidth` / `lsb` -- metrics for text layout

### Band Acceleration (`pipeline/bandBuilder.ts`)

Without optimization, the fragment shader would test every curve for every pixel. The band structure spatially partitions curves to reduce this:

```
 Glyph bounding box
 ┌──────────────────┐
 │  vBand 0 │ vBand 1│  ...  │ vBand 7 │   <- vertical bands partition X axis
 ├──────────┤────────┤       ┤─────────┤
 │ hBand 7  │        │       │         │
 │ hBand 6  │        │       │         │   <- horizontal bands partition Y axis
 │ ...      │        │       │         │
 │ hBand 0  │        │       │         │
 └──────────┘────────┘       ┘─────────┘
```

- **Horizontal bands** (default 8) partition the Y axis. Used when casting horizontal rays.
- **Vertical bands** (default 8) partition the X axis. Used when casting vertical rays.
- Each band stores indices of curves whose bounding box overlaps that band (with epsilon = 1/1024 em).
- Curves within each band are **sorted by descending max coordinate** (max-X for h-bands, max-Y for v-bands). This enables the shader's early-exit optimization.
- Purely horizontal curves are excluded from h-bands (can't intersect a horizontal ray). Same for purely vertical curves in v-bands.

### Texture Packing (`pipeline/texturePacker.ts`)

All glyph data for a font is packed into two `DataTexture` instances with power-of-2 dimensions:

**Curve Texture** (RGBA32Float, 4096 x N):
```
Texel layout per curve (2 texels):
  [0]: p0.x, p0.y, p1.x, p1.y
  [1]: p2.x, p2.y,    0,    0
```

**Band Texture** (RGBA32Float encoding uint32 pairs, 4096 x N):
```
Per glyph:
  [hBand headers × numHBands]    (curveCount, offset)
  [vBand headers × numVBands]    (curveCount, offset)
  [curve ref lists]              (curveTexX, curveTexY) → pointer into curve texture
```

Both textures use `NearestFilter` (no interpolation -- data is accessed by exact texel coordinate via `textureLoad`).

**Why float-encoded integers?** The band texture stores integer data (counts, offsets, texture coordinates) but uses `FloatType` instead of `UnsignedIntType`. This ensures compatibility with both WebGPU and WebGL2 renderers. Float32 has 24 bits of mantissa, representing integers up to 16,777,216 exactly -- far more than our maximum values (~4096 for coordinates, ~100 for curve counts).

**Why power-of-2 dimensions?** GPU texture compression and certain hardware optimizations require power-of-2 texture dimensions. Heights are rounded up to the next power of 2 (e.g., 49 rows -> 64, 82 rows -> 128).

### Text Shaping (`pipeline/textShaper.ts`)

Converts a string into positioned glyphs:

1. `font.stringToGlyphs(text)` -- unicode to glyph IDs
2. Kerning applied via `font.getKerningValue()` between adjacent pairs
3. Advance widths accumulated for horizontal positioning
4. Line breaking on `\n` and word-wrap at `maxWidth`
5. Alignment offset (left/center/right) applied per line

Output: `PositionedGlyph[]` -- each with `{ glyphId, x, y, scale }`.

## GPU Shaders

All shaders are written in TSL (Three Shader Language) which compiles to both WGSL (WebGPU) and GLSL ES 3.0 (WebGL2).

### Fragment Shader: The Slug Algorithm (`shaders/slugFragment.ts`)

The fragment shader is the heart of the system. For each pixel:

#### Step 1: Pixel Setup

```
renderCoord = em-space coordinate of this fragment (interpolated from vertex shader)
emsPerPixel = fwidth(renderCoord)           -- screen-space pixel footprint in em units
pixelsPerEm = 1.0 / emsPerPixel             -- scale factor for coverage computation
bandIdx     = renderCoord * bandTransform    -- which band this pixel falls in
```

#### Step 2: Horizontal Band Loop

For each curve in the pixel's horizontal band:

1. **Load control points** from curve texture via `textureLoad`
2. **Translate** points relative to pixel: `p -= renderCoord`
3. **Root eligibility** (`calcRootCode`): determine which roots of the quadratic intersection contribute to the winding number

#### Step 3: Root Eligibility (`shaders/calcRootCode.ts`)

This is the key robustness innovation. The function classifies each curve into one of 8 equivalence classes using only the **sign bits** of the three Y control points:

```
s1 = uint(y1 < 0)    -- 0 or 1
s2 = uint(y2 < 0)    -- 0 or 1
s3 = uint(y3 < 0)    -- 0 or 1

shift = s1 | (s2 << 1) | (s3 << 2)     -- 3-bit index [0..7]

result = (0x2E74 >> shift) & 0x0101    -- bit 0: root 1 eligible
                                        -- bit 8: root 2 eligible
```

The magic constant `0x2E74` (binary: `0010 1110 0111 0100`) encodes the correct eligibility for all 8 sign combinations. This eliminates branchy per-root range checks and handles all edge cases (tangent touches, endpoints on the ray, etc.) in a single branchless operation.

#### Step 4: Quadratic Intersection (`shaders/solveQuadratic.ts`)

For eligible curves, solve `a*t^2 - 2b*t + c = 0` where:

```
a = p0.y - 2*p1.y + p2.y
b = p0.y - p1.y
c = p0.y
```

The discriminant is **clamped to zero** (`max(b*b - a*c, 0)`) -- imaginary roots become a double root at the global minimum. Near-linear curves (|a| < 1/65536) fall back to the linear solution `t = c / (2*b)`.

The x-coordinates of intersections are evaluated at the solved t-values and scaled to pixel space for coverage computation.

#### Step 5: Coverage Accumulation

For each eligible root, coverage is accumulated:

```
xcov += saturate(rootX_px + 0.5)    -- first root enters the glyph
xcov -= saturate(rootY_px + 0.5)    -- second root exits the glyph
```

The `saturate(r + 0.5)` maps the intersection position into [0, 1] sub-pixel coverage.

A **weight** tracks proximity to the pixel center:

```
xwgt = max(xwgt, saturate(1.0 - abs(rootX_px) * 2.0))
```

#### Step 6: Vertical Band Loop

Same as horizontal, but with x/y swapped. Accumulates `ycov` and `ywgt`.

#### Step 7: Coverage Combination (`shaders/calcCoverage.ts`)

The dual-ray coverages are combined:

```
coverage = max(
    abs(xcov * xwgt + ycov * ywgt) / max(xwgt + ywgt, epsilon),
    min(abs(xcov), abs(ycov))
)
```

The weighted blend handles typical cases. The `min(abs(xcov), abs(ycov))` fallback catches degenerate cases where one ray direction produces poor results (e.g., grazing near-horizontal edges).

**Fill rules:**
- Nonzero (default): `saturate(coverage)`
- Even-odd: `1.0 - abs(1.0 - frac(coverage * 0.5) * 2.0)`

### Vertex Shader (`shaders/slugVertex.ts`)

Positions instanced glyph quads. Each glyph is a unit quad `[-0.5, 0.5]^2` scaled and translated by per-instance attributes:

```
worldPos = glyphCenter + baseQuadPos * glyphSize
```

The em-space coordinate for the fragment shader is interpolated from the quad corners using the inverse Jacobian stored per-glyph.

### Instance Attribute Layout

Each glyph instance uses 5 x vec4 (80 bytes):

| Attribute | Components | Description |
|-----------|-----------|-------------|
| `glyphPos` | x, y, z, w | Object-space center (xy) + half-size (zw) |
| `glyphTex` | x, y, z, w | Em-space center (xy) + band texture location (zw) |
| `glyphJac` | x, y, z, w | Inverse Jacobian 2x2 (maps object -> em space) |
| `glyphBand` | x, y, z, w | Band transform: scale (xy) + offset (zw) |
| `glyphColor` | r, g, b, a | Per-glyph RGBA color |

## Data Flow Diagram

```
                                CPU                                 GPU
                                 |                                   |
  Font file (TTF/OTF)           |                                   |
         |                       |                                   |
   [opentype.js parse]          |                                   |
         |                       |                                   |
   Path commands (M/L/Q/C/Z)    |                                   |
         |                       |                                   |
   [fontParser] ────────────────|──> QuadCurve[] per glyph          |
         |                       |                                   |
   [bandBuilder] ───────────────|──> GlyphBands (sorted)            |
         |                       |                                   |
   [texturePacker] ─────────────|──> curveTexture (RGBA32F) ──────> textureLoad()
         |                       |   bandTexture  (RGBA32F) ──────> textureLoad()
         |                       |                                   |
   [textShaper] ────────────────|──> PositionedGlyph[]              |
         |                       |                                   |
   [SlugGeometry] ──────────────|──> InstancedBufferAttribute ────> attribute<'vec4'>()
         |                       |   (5 x vec4 per glyph)           |
         |                       |                                   |
                                 |   SlugMaterial                    |
                                 |     positionNode ──────────────> vertex shader
                                 |     colorNode ────────────────> fragment shader
                                 |                                   |
                                 |                          slugRender() per pixel:
                                 |                            1. fwidth → pixel size
                                 |                            2. band lookup
                                 |                            3. h-band curve loop
                                 |                            4. v-band curve loop
                                 |                            5. calcCoverage
                                 |                                   |
                                 |                              coverage [0,1]
                                 |                                   |
                                 |                          color * coverage * opacity
```

## Comparison with Other Approaches

| Approach | Resolution Independent | Quality | GPU Cost | Memory |
|----------|----------------------|---------|----------|--------|
| **Slug** (this) | Yes | Exact | Medium (per-curve math) | Compact (curve data) |
| SDF atlas | No (resolution ceiling) | Good | Low (texture sample) | Large (atlas textures) |
| MSDF atlas | No (higher ceiling) | Better | Low | Large |
| Bitmap atlas | No | Varies | Lowest | Largest |
| Loop-Blinn | Yes | Exact | Medium | Medium |
| Vello (compute) | Yes | Exact | Varies | Medium |

Slug's sweet spot is text-heavy scenes where resolution independence matters: UI text that must survive zoom, 3D-placed text in perspective, or any scenario where precomputed textures would need regeneration at different scales.
