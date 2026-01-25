# M7: Text Rendering

## Milestone Overview

| Field | Value |
|-------|-------|
| **Duration** | 4 weeks |
| **Dependencies** | M1 (Core Sprites), M3 (2D Render Pipeline) |
| **Outputs** | SDFText, MSDFText, BitmapText, CanvasText, Paragraph, FontLoader, Text Effects |
| **Risk Level** | High (complex text layout, SDF shader math) |

---

## Objectives

1. Implement base `TextMesh` class extending THREE.Mesh
2. Create `SDFText` for signed distance field text (scalable, effects-ready)
3. Create `MSDFText` for multi-channel SDF (sharper at all sizes)
4. Create `BitmapText` for classic bitmap font rendering
5. Create `CanvasText` for Canvas 2D rendered to texture
6. Implement `Paragraph` for multi-line text with word wrap
7. Create `FontLoader` for .fnt (BMFont) and .json (MSDF) formats
8. Implement text effects via TSL nodes (outline, shadow, glow)
9. Build layout engine for kerning, word wrap, alignment

---

## Architecture

```
+---------------------------------------------------------------------------+
|                          TEXT RENDERING SYSTEM                             |
+---------------------------------------------------------------------------+
|                                                                           |
|   FontLoader                                                              |
|   +-------------------------------------------------------------------+   |
|   |  • load('.fnt')     -> BMFont format (bitmap fonts)               |   |
|   |  • load('.json')    -> MSDF format (multi-channel SDF)            |   |
|   |  • load('.sdf.json') -> SDF format (single-channel SDF)           |   |
|   |  Returns: FontData { glyphs, kerning, texture, type }             |   |
|   +-------------------------------------------------------------------+   |
|                                    |                                      |
|                                    v                                      |
|   TextGeometry                                                            |
|   +-------------------------------------------------------------------+   |
|   |  • Generates glyph quads from text string                         |   |
|   |  • Applies kerning pairs                                          |   |
|   |  • Handles alignment (left, center, right, justify)               |   |
|   |  • Supports multi-line with word wrap                             |   |
|   |  BufferGeometry: position, uv, glyphIndex attributes              |   |
|   +-------------------------------------------------------------------+   |
|                                    |                                      |
|                                    v                                      |
|   TextMesh (abstract base)                                                |
|   +-------------------------------------------------------------------+   |
|   |  extends THREE.Mesh                                                |   |
|   |  • text: string                                                    |   |
|   |  • font: FontData                                                  |   |
|   |  • fontSize: number                                                |   |
|   |  • color: Color                                                    |   |
|   |  • alignment: 'left' | 'center' | 'right'                         |   |
|   |  • letterSpacing: number                                           |   |
|   |  • lineHeight: number                                              |   |
|   +-------------------------------------------------------------------+   |
|           |               |               |               |               |
|           v               v               v               v               |
|   +----------+    +----------+    +----------+    +----------+           |
|   | SDFText  |    | MSDFText |    |BitmapText|    |CanvasText|           |
|   +----------+    +----------+    +----------+    +----------+           |
|   | Single   |    | Multi-ch |    | Classic  |    | Canvas2D |           |
|   | channel  |    | sharper  |    | bitmap   |    | dynamic  |           |
|   | SDF      |    | edges    |    | no scale |    | texture  |           |
|   +----------+    +----------+    +----------+    +----------+           |
|                                                                           |
|   Paragraph (extends TextMesh)                                            |
|   +-------------------------------------------------------------------+   |
|   |  • maxWidth: number (word wrap boundary)                           |   |
|   |  • maxHeight: number (optional vertical clip)                      |   |
|   |  • wordWrap: boolean                                               |   |
|   |  • overflow: 'visible' | 'hidden' | 'ellipsis'                    |   |
|   +-------------------------------------------------------------------+   |
|                                                                           |
|   TSL Text Effects                                                        |
|   +-------------------------------------------------------------------+   |
|   |  • textOutline(color, thickness)                                   |   |
|   |  • textShadow(color, offset, blur)                                 |   |
|   |  • textGlow(color, intensity, radius)                              |   |
|   |  • textGradient(colors, direction)                                 |   |
|   +-------------------------------------------------------------------+   |
|                                                                           |
+---------------------------------------------------------------------------+
```

---

## Detailed Implementation

### 1. Type Definitions

**packages/core/src/text/types.ts:**

```typescript
import type { Texture, Color, Vector2 } from 'three';

/**
 * Font types supported by the text system.
 */
export type FontType = 'bitmap' | 'sdf' | 'msdf';

/**
 * Text alignment options.
 */
export type TextAlignment = 'left' | 'center' | 'right' | 'justify';

/**
 * Vertical alignment options.
 */
export type VerticalAlignment = 'top' | 'middle' | 'bottom';

/**
 * Text overflow behavior.
 */
export type TextOverflow = 'visible' | 'hidden' | 'ellipsis';

/**
 * Individual glyph data.
 */
export interface GlyphData {
  /** Character code */
  id: number;
  /** Character string */
  char: string;
  /** X position in texture atlas (pixels) */
  x: number;
  /** Y position in texture atlas (pixels) */
  y: number;
  /** Width in texture atlas (pixels) */
  width: number;
  /** Height in texture atlas (pixels) */
  height: number;
  /** X offset when rendering (pixels) */
  xoffset: number;
  /** Y offset when rendering (pixels) */
  yoffset: number;
  /** Advance to next character (pixels) */
  xadvance: number;
  /** Texture page (for multi-texture fonts) */
  page: number;
  /** Texture channel (for MSDF: 0=r, 1=g, 2=b, 3=a) */
  chnl?: number;
}

/**
 * Kerning pair data.
 */
export interface KerningPair {
  /** First character code */
  first: number;
  /** Second character code */
  second: number;
  /** Kerning amount (pixels) */
  amount: number;
}

/**
 * Font metrics and common data.
 */
export interface FontInfo {
  /** Font face name */
  face: string;
  /** Font size used to generate the atlas */
  size: number;
  /** Bold flag */
  bold: boolean;
  /** Italic flag */
  italic: boolean;
  /** Character set */
  charset: string;
  /** Unicode flag */
  unicode: boolean;
  /** Stretch height percentage */
  stretchH: number;
  /** Smoothing flag */
  smooth: boolean;
  /** Supersampling level */
  aa: number;
  /** Padding (top, right, bottom, left) */
  padding: [number, number, number, number];
  /** Spacing (horizontal, vertical) */
  spacing: [number, number];
}

/**
 * Font common metrics.
 */
export interface FontCommon {
  /** Line height */
  lineHeight: number;
  /** Distance from top to baseline */
  base: number;
  /** Texture atlas width */
  scaleW: number;
  /** Texture atlas height */
  scaleH: number;
  /** Number of texture pages */
  pages: number;
  /** Packed flag */
  packed: boolean;
  /** SDF distance range (for SDF/MSDF fonts) */
  distanceRange?: number;
}

/**
 * Complete font data structure.
 */
export interface FontData {
  /** Font type */
  type: FontType;
  /** Font info */
  info: FontInfo;
  /** Common metrics */
  common: FontCommon;
  /** Glyph map (char code -> glyph data) */
  glyphs: Map<number, GlyphData>;
  /** Kerning pairs (packed key -> amount) */
  kerning: Map<number, number>;
  /** Texture atlas(es) */
  textures: Texture[];
  /** Get glyph by character */
  getGlyph(char: string): GlyphData | undefined;
  /** Get kerning between two characters */
  getKerning(first: string, second: string): number;
}

/**
 * Options for creating text.
 */
export interface TextOptions {
  /** Font data (required) */
  font: FontData;
  /** Text string */
  text?: string;
  /** Font size in world units */
  fontSize?: number;
  /** Text color */
  color?: Color | string | number;
  /** Text alignment */
  alignment?: TextAlignment;
  /** Vertical alignment */
  verticalAlignment?: VerticalAlignment;
  /** Letter spacing (em units) */
  letterSpacing?: number;
  /** Line height multiplier */
  lineHeight?: number;
  /** Maximum width for word wrap */
  maxWidth?: number;
  /** Word wrap enabled */
  wordWrap?: boolean;
  /** Overflow behavior */
  overflow?: TextOverflow;
  /** Render layer */
  layer?: number;
  /** Z-index within layer */
  zIndex?: number;
}

/**
 * SDF-specific text options.
 */
export interface SDFTextOptions extends TextOptions {
  /** SDF smoothing (0-1, lower = sharper) */
  sdfSmoothing?: number;
  /** Outline color */
  outlineColor?: Color | string | number;
  /** Outline width (0-0.5) */
  outlineWidth?: number;
  /** Shadow color */
  shadowColor?: Color | string | number;
  /** Shadow offset */
  shadowOffset?: Vector2 | [number, number];
  /** Shadow blur */
  shadowBlur?: number;
  /** Glow color */
  glowColor?: Color | string | number;
  /** Glow intensity */
  glowIntensity?: number;
}

/**
 * Paragraph-specific options.
 */
export interface ParagraphOptions extends SDFTextOptions {
  /** Maximum width (required for paragraphs) */
  maxWidth: number;
  /** Maximum height (optional) */
  maxHeight?: number;
  /** Word wrap (default: true) */
  wordWrap?: boolean;
  /** Text overflow behavior */
  overflow?: TextOverflow;
  /** First line indent */
  indent?: number;
  /** Paragraph spacing */
  paragraphSpacing?: number;
}

/**
 * Canvas text options.
 */
export interface CanvasTextOptions {
  /** Text string */
  text?: string;
  /** CSS font string (e.g., '16px Arial') */
  font?: string;
  /** Text color (CSS color string) */
  color?: string;
  /** Canvas width (pixels) */
  width?: number;
  /** Canvas height (pixels) */
  height?: number;
  /** Text alignment */
  alignment?: TextAlignment;
  /** Padding (pixels) */
  padding?: number;
  /** Background color (CSS color string, or null for transparent) */
  backgroundColor?: string | null;
  /** Auto-resize canvas to fit text */
  autoSize?: boolean;
}

/**
 * Computed text layout data.
 */
export interface TextLayout {
  /** Laid out glyphs with positions */
  glyphs: LayoutGlyph[];
  /** Total width */
  width: number;
  /** Total height */
  height: number;
  /** Line count */
  lineCount: number;
  /** Lines data */
  lines: LayoutLine[];
}

/**
 * Laid out glyph with computed position.
 */
export interface LayoutGlyph {
  /** Glyph data */
  glyph: GlyphData;
  /** Character */
  char: string;
  /** X position */
  x: number;
  /** Y position */
  y: number;
  /** Line index */
  line: number;
}

/**
 * Line layout data.
 */
export interface LayoutLine {
  /** Start index in glyphs array */
  start: number;
  /** End index in glyphs array */
  end: number;
  /** Line width */
  width: number;
  /** Line height */
  height: number;
  /** Baseline Y position */
  baseline: number;
}

/**
 * BMFont file format (parsed).
 */
export interface BMFontData {
  info: FontInfo;
  common: FontCommon;
  pages: string[];
  chars: GlyphData[];
  kernings?: KerningPair[];
}

/**
 * MSDF JSON format.
 */
export interface MSDFJsonData {
  atlas: {
    type: string;
    distanceRange: number;
    size: number;
    width: number;
    height: number;
    yOrigin: 'top' | 'bottom';
  };
  metrics: {
    lineHeight: number;
    ascender: number;
    descender: number;
    underlineY: number;
    underlineThickness: number;
  };
  glyphs: Array<{
    unicode: number;
    advance: number;
    planeBounds?: { left: number; bottom: number; right: number; top: number };
    atlasBounds?: { left: number; bottom: number; right: number; top: number };
  }>;
  kerning?: Array<{
    unicode1: number;
    unicode2: number;
    advance: number;
  }>;
}
```

---

### 2. FontLoader

**packages/core/src/loaders/FontLoader.ts:**

```typescript
import { Texture, TextureLoader, LinearFilter, ClampToEdgeWrapping } from 'three';
import type {
  FontData,
  FontType,
  GlyphData,
  FontInfo,
  FontCommon,
  BMFontData,
  MSDFJsonData,
} from '../text/types';

/**
 * Loader for font files.
 *
 * Supports:
 * - BMFont format (.fnt text or XML, .json)
 * - MSDF format (.json with atlas)
 * - SDF format (.json with atlas)
 *
 * @example
 * ```typescript
 * // Load MSDF font
 * const font = await FontLoader.load('/fonts/roboto-msdf.json');
 *
 * // Load BMFont
 * const bitmapFont = await FontLoader.load('/fonts/pixel.fnt');
 * ```
 */
export class FontLoader {
  private static textureLoader = new TextureLoader();
  private static cache = new Map<string, Promise<FontData>>();

  /**
   * Load a font from URL.
   * Results are cached by URL.
   */
  static load(url: string): Promise<FontData> {
    if (this.cache.has(url)) {
      return this.cache.get(url)!;
    }

    const promise = this.loadUncached(url);
    this.cache.set(url, promise);
    return promise;
  }

  /**
   * Load without caching.
   */
  private static async loadUncached(url: string): Promise<FontData> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load font: ${url}`);
    }

    const ext = url.split('.').pop()?.toLowerCase();
    const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

    if (ext === 'fnt') {
      const text = await response.text();
      return this.parseBMFont(text, baseUrl);
    } else if (ext === 'json') {
      const json = await response.json();
      return this.parseJsonFont(json, baseUrl, url);
    } else {
      throw new Error(`Unsupported font format: ${ext}`);
    }
  }

  /**
   * Parse BMFont text format.
   */
  private static async parseBMFont(text: string, baseUrl: string): Promise<FontData> {
    const lines = text.split('\n');
    const data: Partial<BMFontData> = {
      pages: [],
      chars: [],
      kernings: [],
    };

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const type = parts[0];

      if (!type) continue;

      const values: Record<string, string> = {};
      for (let i = 1; i < parts.length; i++) {
        const [key, value] = parts[i]!.split('=');
        if (key && value !== undefined) {
          values[key] = value.replace(/"/g, '');
        }
      }

      switch (type) {
        case 'info':
          data.info = this.parseInfoLine(values);
          break;
        case 'common':
          data.common = this.parseCommonLine(values);
          break;
        case 'page':
          data.pages![parseInt(values['id'] ?? '0')] = values['file'] ?? '';
          break;
        case 'char':
          data.chars!.push(this.parseCharLine(values));
          break;
        case 'kerning':
          data.kernings!.push({
            first: parseInt(values['first'] ?? '0'),
            second: parseInt(values['second'] ?? '0'),
            amount: parseInt(values['amount'] ?? '0'),
          });
          break;
      }
    }

    // Load textures
    const textures = await this.loadTextures(data.pages!, baseUrl, 'bitmap');

    return this.createFontData('bitmap', data as BMFontData, textures);
  }

  /**
   * Parse JSON font format (MSDF or SDF).
   */
  private static async parseJsonFont(
    json: any,
    baseUrl: string,
    url: string
  ): Promise<FontData> {
    // Detect format
    if (json.atlas && json.glyphs) {
      // MSDF-gen format
      return this.parseMSDFJson(json as MSDFJsonData, baseUrl, url);
    } else if (json.chars || json.info) {
      // BMFont JSON format
      return this.parseBMFontJson(json, baseUrl);
    } else {
      throw new Error('Unknown JSON font format');
    }
  }

  /**
   * Parse MSDF-gen JSON format.
   */
  private static async parseMSDFJson(
    json: MSDFJsonData,
    baseUrl: string,
    url: string
  ): Promise<FontData> {
    const type: FontType = json.atlas.type === 'msdf' ? 'msdf' : 'sdf';

    // Determine texture URL
    const textureName = url.replace('.json', '.png');
    const textureUrl = textureName.startsWith('/') ? textureName : baseUrl + textureName.split('/').pop();
    const textures = await this.loadTextures([textureUrl.split('/').pop()!], baseUrl, type);

    // Build glyph map
    const glyphs = new Map<number, GlyphData>();
    const atlasWidth = json.atlas.width;
    const atlasHeight = json.atlas.height;

    for (const glyph of json.glyphs) {
      const atlas = glyph.atlasBounds;
      const plane = glyph.planeBounds;

      const glyphData: GlyphData = {
        id: glyph.unicode,
        char: String.fromCharCode(glyph.unicode),
        x: atlas ? atlas.left : 0,
        y: atlas ? (json.atlas.yOrigin === 'top' ? atlas.top : atlasHeight - atlas.top) : 0,
        width: atlas ? atlas.right - atlas.left : 0,
        height: atlas ? atlas.top - atlas.bottom : 0,
        xoffset: plane ? plane.left * json.atlas.size : 0,
        yoffset: plane ? (1 - plane.top) * json.atlas.size : 0,
        xadvance: glyph.advance * json.atlas.size,
        page: 0,
      };

      glyphs.set(glyph.unicode, glyphData);
    }

    // Build kerning map
    const kerning = new Map<number, number>();
    if (json.kerning) {
      for (const kern of json.kerning) {
        const key = (kern.unicode1 << 16) | kern.unicode2;
        kerning.set(key, kern.advance * json.atlas.size);
      }
    }

    const fontData: FontData = {
      type,
      info: {
        face: 'MSDF Font',
        size: json.atlas.size,
        bold: false,
        italic: false,
        charset: '',
        unicode: true,
        stretchH: 100,
        smooth: true,
        aa: 1,
        padding: [0, 0, 0, 0],
        spacing: [0, 0],
      },
      common: {
        lineHeight: json.metrics.lineHeight * json.atlas.size,
        base: json.metrics.ascender * json.atlas.size,
        scaleW: atlasWidth,
        scaleH: atlasHeight,
        pages: 1,
        packed: false,
        distanceRange: json.atlas.distanceRange,
      },
      glyphs,
      kerning,
      textures,
      getGlyph(char: string): GlyphData | undefined {
        return glyphs.get(char.charCodeAt(0));
      },
      getKerning(first: string, second: string): number {
        const key = (first.charCodeAt(0) << 16) | second.charCodeAt(0);
        return kerning.get(key) ?? 0;
      },
    };

    return fontData;
  }

  /**
   * Parse BMFont JSON format.
   */
  private static async parseBMFontJson(json: any, baseUrl: string): Promise<FontData> {
    const pages = json.pages || [json.page || 'font.png'];
    const textures = await this.loadTextures(pages, baseUrl, 'bitmap');

    const chars = Array.isArray(json.chars) ? json.chars : Object.values(json.chars || {});
    const kernings = json.kernings || json.kerning || [];

    return this.createFontData(
      'bitmap',
      {
        info: json.info || this.defaultInfo(),
        common: json.common || this.defaultCommon(),
        pages,
        chars,
        kernings,
      },
      textures
    );
  }

  /**
   * Load texture(s) for font.
   */
  private static async loadTextures(
    pages: string[],
    baseUrl: string,
    type: FontType
  ): Promise<Texture[]> {
    const promises = pages.map((page) => {
      const url = page.startsWith('/') || page.startsWith('http') ? page : baseUrl + page;
      return new Promise<Texture>((resolve, reject) => {
        this.textureLoader.load(
          url,
          (texture) => {
            // Configure texture for text rendering
            texture.generateMipmaps = false;
            texture.minFilter = LinearFilter;
            texture.magFilter = LinearFilter;
            texture.wrapS = ClampToEdgeWrapping;
            texture.wrapT = ClampToEdgeWrapping;
            resolve(texture);
          },
          undefined,
          reject
        );
      });
    });

    return Promise.all(promises);
  }

  /**
   * Create FontData from parsed BMFont data.
   */
  private static createFontData(
    type: FontType,
    data: BMFontData,
    textures: Texture[]
  ): FontData {
    const glyphs = new Map<number, GlyphData>();
    for (const char of data.chars) {
      glyphs.set(char.id, char);
    }

    const kerning = new Map<number, number>();
    if (data.kernings) {
      for (const kern of data.kernings) {
        const key = (kern.first << 16) | kern.second;
        kerning.set(key, kern.amount);
      }
    }

    return {
      type,
      info: data.info,
      common: data.common,
      glyphs,
      kerning,
      textures,
      getGlyph(char: string): GlyphData | undefined {
        return glyphs.get(char.charCodeAt(0));
      },
      getKerning(first: string, second: string): number {
        const key = (first.charCodeAt(0) << 16) | second.charCodeAt(0);
        return kerning.get(key) ?? 0;
      },
    };
  }

  /**
   * Parse info line from BMFont.
   */
  private static parseInfoLine(values: Record<string, string>): FontInfo {
    const padding = (values['padding'] ?? '0,0,0,0').split(',').map(Number) as [number, number, number, number];
    const spacing = (values['spacing'] ?? '0,0').split(',').map(Number) as [number, number];

    return {
      face: values['face'] ?? 'Unknown',
      size: parseInt(values['size'] ?? '12'),
      bold: values['bold'] === '1',
      italic: values['italic'] === '1',
      charset: values['charset'] ?? '',
      unicode: values['unicode'] === '1',
      stretchH: parseInt(values['stretchH'] ?? '100'),
      smooth: values['smooth'] === '1',
      aa: parseInt(values['aa'] ?? '1'),
      padding,
      spacing,
    };
  }

  /**
   * Parse common line from BMFont.
   */
  private static parseCommonLine(values: Record<string, string>): FontCommon {
    return {
      lineHeight: parseInt(values['lineHeight'] ?? '16'),
      base: parseInt(values['base'] ?? '12'),
      scaleW: parseInt(values['scaleW'] ?? '256'),
      scaleH: parseInt(values['scaleH'] ?? '256'),
      pages: parseInt(values['pages'] ?? '1'),
      packed: values['packed'] === '1',
    };
  }

  /**
   * Parse char line from BMFont.
   */
  private static parseCharLine(values: Record<string, string>): GlyphData {
    const id = parseInt(values['id'] ?? '0');
    return {
      id,
      char: String.fromCharCode(id),
      x: parseInt(values['x'] ?? '0'),
      y: parseInt(values['y'] ?? '0'),
      width: parseInt(values['width'] ?? '0'),
      height: parseInt(values['height'] ?? '0'),
      xoffset: parseInt(values['xoffset'] ?? '0'),
      yoffset: parseInt(values['yoffset'] ?? '0'),
      xadvance: parseInt(values['xadvance'] ?? '0'),
      page: parseInt(values['page'] ?? '0'),
      chnl: parseInt(values['chnl'] ?? '15'),
    };
  }

  /**
   * Default font info.
   */
  private static defaultInfo(): FontInfo {
    return {
      face: 'Unknown',
      size: 16,
      bold: false,
      italic: false,
      charset: '',
      unicode: true,
      stretchH: 100,
      smooth: true,
      aa: 1,
      padding: [0, 0, 0, 0],
      spacing: [0, 0],
    };
  }

  /**
   * Default common metrics.
   */
  private static defaultCommon(): FontCommon {
    return {
      lineHeight: 16,
      base: 12,
      scaleW: 256,
      scaleH: 256,
      pages: 1,
      packed: false,
    };
  }

  /**
   * Clear the cache.
   */
  static clearCache(): void {
    this.cache.clear();
  }

  /**
   * Preload multiple fonts.
   */
  static preload(urls: string[]): Promise<FontData[]> {
    return Promise.all(urls.map((url) => this.load(url)));
  }
}
```

---

### 3. TextGeometry

**packages/core/src/text/TextGeometry.ts:**

```typescript
import { BufferGeometry, BufferAttribute, Vector2 } from 'three';
import type {
  FontData,
  TextAlignment,
  VerticalAlignment,
  TextLayout,
  LayoutGlyph,
  LayoutLine,
} from './types';

export interface TextGeometryOptions {
  /** Font data */
  font: FontData;
  /** Text string */
  text: string;
  /** Font size in world units */
  fontSize?: number;
  /** Letter spacing (em units, 0 = normal) */
  letterSpacing?: number;
  /** Line height multiplier (1 = normal) */
  lineHeight?: number;
  /** Horizontal alignment */
  alignment?: TextAlignment;
  /** Vertical alignment */
  verticalAlignment?: VerticalAlignment;
  /** Maximum width for word wrap (undefined = no wrap) */
  maxWidth?: number;
  /** Word wrap enabled */
  wordWrap?: boolean;
}

/**
 * Generates glyph quad geometry from text string.
 *
 * Creates BufferGeometry with:
 * - position: vec3 (quad vertices)
 * - uv: vec2 (texture coordinates)
 * - glyphIndex: float (for per-character effects)
 */
export class TextGeometry extends BufferGeometry {
  private _layout: TextLayout | null = null;
  private options: TextGeometryOptions;

  constructor(options: TextGeometryOptions) {
    super();
    this.options = { ...options };
    this.update();
  }

  /**
   * Get the computed layout.
   */
  get layout(): TextLayout | null {
    return this._layout;
  }

  /**
   * Update geometry with new text or options.
   */
  update(newText?: string, newOptions?: Partial<TextGeometryOptions>): void {
    if (newText !== undefined) {
      this.options.text = newText;
    }
    if (newOptions) {
      Object.assign(this.options, newOptions);
    }

    const { font, text, fontSize = 16 } = this.options;

    if (!text || text.length === 0) {
      this.setEmpty();
      return;
    }

    // Compute layout
    this._layout = this.computeLayout();

    // Generate geometry
    this.generateGeometry(this._layout, fontSize);
  }

  /**
   * Set empty geometry.
   */
  private setEmpty(): void {
    this._layout = {
      glyphs: [],
      width: 0,
      height: 0,
      lineCount: 0,
      lines: [],
    };

    this.setAttribute('position', new BufferAttribute(new Float32Array(0), 3));
    this.setAttribute('uv', new BufferAttribute(new Float32Array(0), 2));
    this.setAttribute('glyphIndex', new BufferAttribute(new Float32Array(0), 1));
    this.setIndex(null);
  }

  /**
   * Compute text layout with word wrap and alignment.
   */
  private computeLayout(): TextLayout {
    const {
      font,
      text,
      fontSize = 16,
      letterSpacing = 0,
      lineHeight = 1,
      alignment = 'left',
      maxWidth,
      wordWrap = false,
    } = this.options;

    const scale = fontSize / font.info.size;
    const scaledLineHeight = font.common.lineHeight * scale * lineHeight;
    const letterSpacingPx = letterSpacing * fontSize;

    const glyphs: LayoutGlyph[] = [];
    const lines: LayoutLine[] = [];

    let x = 0;
    let y = 0;
    let lineStart = 0;
    let lineWidth = 0;
    let maxLineWidth = 0;
    let wordStart = 0;
    let wordWidth = 0;
    let prevChar: string | null = null;

    const finishLine = (end: number, width: number) => {
      lines.push({
        start: lineStart,
        end,
        width,
        height: scaledLineHeight,
        baseline: y + font.common.base * scale,
      });
      maxLineWidth = Math.max(maxLineWidth, width);
      lineStart = end;
      lineWidth = 0;
      x = 0;
      y += scaledLineHeight;
      prevChar = null;
    };

    for (let i = 0; i < text.length; i++) {
      const char = text[i]!;

      // Handle newlines
      if (char === '\n') {
        finishLine(glyphs.length, lineWidth);
        continue;
      }

      // Handle spaces (potential word break)
      if (char === ' ') {
        wordStart = glyphs.length;
        wordWidth = 0;
      }

      const glyph = font.getGlyph(char);
      if (!glyph) {
        prevChar = char;
        continue;
      }

      // Apply kerning
      let kerning = 0;
      if (prevChar) {
        kerning = font.getKerning(prevChar, char) * scale;
      }

      const glyphX = x + kerning + glyph.xoffset * scale;
      const glyphY = y + glyph.yoffset * scale;
      const glyphWidth = glyph.xadvance * scale + letterSpacingPx;

      // Word wrap check
      if (wordWrap && maxWidth !== undefined) {
        if (x + kerning + glyph.width * scale > maxWidth && char !== ' ') {
          // Need to wrap
          if (wordStart > lineStart) {
            // Wrap at word boundary
            finishLine(wordStart, lineWidth - wordWidth);
            // Reposition word on new line
            const wordGlyphs = glyphs.slice(wordStart);
            let newX = 0;
            for (const wg of wordGlyphs) {
              wg.x = newX + (wg.glyph.xoffset * scale);
              wg.y = y + wg.glyph.yoffset * scale;
              wg.line = lines.length;
              newX += wg.glyph.xadvance * scale + letterSpacingPx;
            }
            x = newX;
            lineWidth = newX;
            wordStart = glyphs.length;
            wordWidth = 0;
          } else {
            // No word boundary, force wrap
            finishLine(glyphs.length, lineWidth);
          }
        }
      }

      glyphs.push({
        glyph,
        char,
        x: x + kerning + glyph.xoffset * scale,
        y: y + glyph.yoffset * scale,
        line: lines.length,
      });

      const advance = glyph.xadvance * scale + letterSpacingPx + kerning;
      x += advance;
      lineWidth += advance;
      wordWidth += advance;
      prevChar = char;
    }

    // Finish last line
    if (glyphs.length > lineStart) {
      finishLine(glyphs.length, lineWidth);
    }

    // Apply alignment
    this.applyAlignment(glyphs, lines, alignment, maxLineWidth);

    return {
      glyphs,
      width: maxLineWidth,
      height: y + (lines.length > 0 ? 0 : scaledLineHeight),
      lineCount: lines.length,
      lines,
    };
  }

  /**
   * Apply text alignment to laid out glyphs.
   */
  private applyAlignment(
    glyphs: LayoutGlyph[],
    lines: LayoutLine[],
    alignment: TextAlignment,
    maxWidth: number
  ): void {
    for (const line of lines) {
      let offset = 0;

      switch (alignment) {
        case 'center':
          offset = (maxWidth - line.width) / 2;
          break;
        case 'right':
          offset = maxWidth - line.width;
          break;
        case 'justify':
          // TODO: Implement justify (distribute space between words)
          break;
        case 'left':
        default:
          offset = 0;
          break;
      }

      for (let i = line.start; i < line.end; i++) {
        glyphs[i]!.x += offset;
      }
    }
  }

  /**
   * Generate BufferGeometry from layout.
   */
  private generateGeometry(layout: TextLayout, fontSize: number): void {
    const { font } = this.options;
    const scale = fontSize / font.info.size;
    const glyphCount = layout.glyphs.length;

    // 4 vertices per glyph (quad), 6 indices per glyph (2 triangles)
    const positions = new Float32Array(glyphCount * 4 * 3);
    const uvs = new Float32Array(glyphCount * 4 * 2);
    const glyphIndices = new Float32Array(glyphCount * 4);
    const indices = new Uint32Array(glyphCount * 6);

    const texWidth = font.common.scaleW;
    const texHeight = font.common.scaleH;

    for (let i = 0; i < glyphCount; i++) {
      const lg = layout.glyphs[i]!;
      const glyph = lg.glyph;
      const vertexOffset = i * 4;
      const posOffset = i * 12;
      const uvOffset = i * 8;
      const indexOffset = i * 6;

      // Glyph dimensions in world units
      const w = glyph.width * scale;
      const h = glyph.height * scale;

      // Vertex positions (quad: TL, TR, BR, BL)
      // Top-left
      positions[posOffset] = lg.x;
      positions[posOffset + 1] = lg.y;
      positions[posOffset + 2] = 0;
      // Top-right
      positions[posOffset + 3] = lg.x + w;
      positions[posOffset + 4] = lg.y;
      positions[posOffset + 5] = 0;
      // Bottom-right
      positions[posOffset + 6] = lg.x + w;
      positions[posOffset + 7] = lg.y + h;
      positions[posOffset + 8] = 0;
      // Bottom-left
      positions[posOffset + 9] = lg.x;
      positions[posOffset + 10] = lg.y + h;
      positions[posOffset + 11] = 0;

      // UV coordinates
      const u0 = glyph.x / texWidth;
      const v0 = glyph.y / texHeight;
      const u1 = (glyph.x + glyph.width) / texWidth;
      const v1 = (glyph.y + glyph.height) / texHeight;

      // Top-left
      uvs[uvOffset] = u0;
      uvs[uvOffset + 1] = v0;
      // Top-right
      uvs[uvOffset + 2] = u1;
      uvs[uvOffset + 3] = v0;
      // Bottom-right
      uvs[uvOffset + 4] = u1;
      uvs[uvOffset + 5] = v1;
      // Bottom-left
      uvs[uvOffset + 6] = u0;
      uvs[uvOffset + 7] = v1;

      // Glyph index (for per-character effects)
      glyphIndices[vertexOffset] = i;
      glyphIndices[vertexOffset + 1] = i;
      glyphIndices[vertexOffset + 2] = i;
      glyphIndices[vertexOffset + 3] = i;

      // Indices (two triangles: TL-TR-BR, TL-BR-BL)
      indices[indexOffset] = vertexOffset;
      indices[indexOffset + 1] = vertexOffset + 1;
      indices[indexOffset + 2] = vertexOffset + 2;
      indices[indexOffset + 3] = vertexOffset;
      indices[indexOffset + 4] = vertexOffset + 2;
      indices[indexOffset + 5] = vertexOffset + 3;
    }

    this.setAttribute('position', new BufferAttribute(positions, 3));
    this.setAttribute('uv', new BufferAttribute(uvs, 2));
    this.setAttribute('glyphIndex', new BufferAttribute(glyphIndices, 1));
    this.setIndex(new BufferAttribute(indices, 1));

    this.computeBoundingBox();
    this.computeBoundingSphere();
  }
}
```

---

### 4. Base TextMesh Class

**packages/core/src/text/TextMesh.ts:**

```typescript
import { Mesh, Color, Vector2 } from 'three';
import { TextGeometry } from './TextGeometry';
import type { FontData, TextAlignment, VerticalAlignment, TextOptions } from './types';

/**
 * Abstract base class for text rendering.
 *
 * Provides common functionality for all text types:
 * - Text string and font management
 * - Font size and color
 * - Alignment and spacing
 * - Layer and z-index for 2D rendering
 */
export abstract class TextMesh extends Mesh {
  /** Render layer (for Renderer2D) */
  layer: number = 0;

  /** Z-index within layer */
  zIndex: number = 0;

  protected _text: string = '';
  protected _font: FontData;
  protected _fontSize: number = 16;
  protected _color: Color = new Color(0xffffff);
  protected _alignment: TextAlignment = 'left';
  protected _verticalAlignment: VerticalAlignment = 'top';
  protected _letterSpacing: number = 0;
  protected _lineHeight: number = 1;
  protected _maxWidth?: number;
  protected _wordWrap: boolean = false;

  protected textGeometry: TextGeometry;
  protected needsUpdate: boolean = false;

  constructor(options: TextOptions) {
    super();

    this._font = options.font;
    this._text = options.text ?? '';
    this._fontSize = options.fontSize ?? 16;
    this._alignment = options.alignment ?? 'left';
    this._verticalAlignment = options.verticalAlignment ?? 'top';
    this._letterSpacing = options.letterSpacing ?? 0;
    this._lineHeight = options.lineHeight ?? 1;
    this._maxWidth = options.maxWidth;
    this._wordWrap = options.wordWrap ?? false;

    if (options.color !== undefined) {
      this.setColor(options.color);
    }

    if (options.layer !== undefined) {
      this.layer = options.layer;
    }

    if (options.zIndex !== undefined) {
      this.zIndex = options.zIndex;
    }

    // Create geometry
    this.textGeometry = new TextGeometry({
      font: this._font,
      text: this._text,
      fontSize: this._fontSize,
      letterSpacing: this._letterSpacing,
      lineHeight: this._lineHeight,
      alignment: this._alignment,
      maxWidth: this._maxWidth,
      wordWrap: this._wordWrap,
    });

    this.geometry = this.textGeometry;
    this.name = 'TextMesh';
    this.frustumCulled = true;
  }

  /**
   * Get the text string.
   */
  get text(): string {
    return this._text;
  }

  /**
   * Set the text string.
   */
  set text(value: string) {
    if (this._text !== value) {
      this._text = value;
      this.needsUpdate = true;
    }
  }

  /**
   * Get the font.
   */
  get font(): FontData {
    return this._font;
  }

  /**
   * Set the font.
   */
  set font(value: FontData) {
    if (this._font !== value) {
      this._font = value;
      this.needsUpdate = true;
    }
  }

  /**
   * Get font size.
   */
  get fontSize(): number {
    return this._fontSize;
  }

  /**
   * Set font size.
   */
  set fontSize(value: number) {
    if (this._fontSize !== value) {
      this._fontSize = value;
      this.needsUpdate = true;
    }
  }

  /**
   * Get text color.
   */
  get color(): Color {
    return this._color.clone();
  }

  /**
   * Set text color.
   */
  setColor(value: Color | string | number): this {
    if (value instanceof Color) {
      this._color.copy(value);
    } else {
      this._color.set(value);
    }
    this.updateMaterialColor();
    return this;
  }

  /**
   * Get alignment.
   */
  get alignment(): TextAlignment {
    return this._alignment;
  }

  /**
   * Set alignment.
   */
  set alignment(value: TextAlignment) {
    if (this._alignment !== value) {
      this._alignment = value;
      this.needsUpdate = true;
    }
  }

  /**
   * Get letter spacing.
   */
  get letterSpacing(): number {
    return this._letterSpacing;
  }

  /**
   * Set letter spacing.
   */
  set letterSpacing(value: number) {
    if (this._letterSpacing !== value) {
      this._letterSpacing = value;
      this.needsUpdate = true;
    }
  }

  /**
   * Get line height.
   */
  get lineHeight(): number {
    return this._lineHeight;
  }

  /**
   * Set line height.
   */
  set lineHeight(value: number) {
    if (this._lineHeight !== value) {
      this._lineHeight = value;
      this.needsUpdate = true;
    }
  }

  /**
   * Get max width.
   */
  get maxWidth(): number | undefined {
    return this._maxWidth;
  }

  /**
   * Set max width.
   */
  set maxWidth(value: number | undefined) {
    if (this._maxWidth !== value) {
      this._maxWidth = value;
      this.needsUpdate = true;
    }
  }

  /**
   * Get word wrap.
   */
  get wordWrap(): boolean {
    return this._wordWrap;
  }

  /**
   * Set word wrap.
   */
  set wordWrap(value: boolean) {
    if (this._wordWrap !== value) {
      this._wordWrap = value;
      this.needsUpdate = true;
    }
  }

  /**
   * Get computed text width.
   */
  get textWidth(): number {
    return this.textGeometry.layout?.width ?? 0;
  }

  /**
   * Get computed text height.
   */
  get textHeight(): number {
    return this.textGeometry.layout?.height ?? 0;
  }

  /**
   * Get line count.
   */
  get lineCount(): number {
    return this.textGeometry.layout?.lineCount ?? 0;
  }

  /**
   * Update the text mesh. Call this after changing properties.
   */
  update(): void {
    if (this.needsUpdate) {
      this.textGeometry.update(this._text, {
        font: this._font,
        fontSize: this._fontSize,
        letterSpacing: this._letterSpacing,
        lineHeight: this._lineHeight,
        alignment: this._alignment,
        maxWidth: this._maxWidth,
        wordWrap: this._wordWrap,
      });
      this.needsUpdate = false;
    }
  }

  /**
   * Update material color. Override in subclasses.
   */
  protected abstract updateMaterialColor(): void;

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.textGeometry.dispose();
    if (this.material) {
      if (Array.isArray(this.material)) {
        this.material.forEach((m) => m.dispose());
      } else {
        this.material.dispose();
      }
    }
  }
}
```

---

### 5. SDFText Material (TSL)

**packages/core/src/materials/SDFTextMaterial.ts:**

```typescript
import {
  MeshBasicNodeMaterial,
  uniform,
  texture as textureFn,
  uv,
  vec2,
  vec3,
  vec4,
  float,
  Fn,
  If,
  Discard,
  smoothstep,
  mix,
  length,
  clamp,
  max,
  min,
  abs,
} from 'three/tsl';
import {
  Color,
  Vector2,
  Vector4,
  Texture,
  FrontSide,
  NormalBlending,
} from 'three';

export interface SDFTextMaterialOptions {
  map: Texture;
  color?: Color;
  /** SDF distance range (pixels in font atlas) */
  distanceRange?: number;
  /** Smoothing factor (0-1) */
  smoothing?: number;
  /** Outline color */
  outlineColor?: Color;
  /** Outline width (0-0.5) */
  outlineWidth?: number;
  /** Shadow color */
  shadowColor?: Color;
  /** Shadow offset (normalized) */
  shadowOffset?: Vector2;
  /** Shadow blur */
  shadowBlur?: number;
  /** Glow color */
  glowColor?: Color;
  /** Glow intensity */
  glowIntensity?: number;
}

/**
 * TSL-based material for SDF text rendering.
 *
 * Supports:
 * - Signed Distance Field text rendering
 * - Outline effects
 * - Drop shadows
 * - Glow effects
 * - Smooth anti-aliasing at all sizes
 */
export class SDFTextMaterial extends MeshBasicNodeMaterial {
  // Uniforms
  readonly textColor = uniform(new Color(0xffffff));
  readonly distanceRange = uniform(4.0);
  readonly smoothing = uniform(0.25);

  // Outline uniforms
  readonly outlineColor = uniform(new Color(0x000000));
  readonly outlineWidth = uniform(0.0);

  // Shadow uniforms
  readonly shadowColor = uniform(new Color(0x000000));
  readonly shadowOffset = uniform(new Vector2(0.005, -0.005));
  readonly shadowBlur = uniform(0.1);
  readonly shadowEnabled = uniform(0.0);

  // Glow uniforms
  readonly glowColor = uniform(new Color(0xffffff));
  readonly glowIntensity = uniform(0.0);

  private _map: Texture;

  constructor(options: SDFTextMaterialOptions) {
    super();

    this._map = options.map;

    // Apply options
    if (options.color) {
      this.textColor.value.copy(options.color);
    }
    if (options.distanceRange !== undefined) {
      this.distanceRange.value = options.distanceRange;
    }
    if (options.smoothing !== undefined) {
      this.smoothing.value = options.smoothing;
    }
    if (options.outlineColor) {
      this.outlineColor.value.copy(options.outlineColor);
    }
    if (options.outlineWidth !== undefined) {
      this.outlineWidth.value = options.outlineWidth;
    }
    if (options.shadowColor) {
      this.shadowColor.value.copy(options.shadowColor);
    }
    if (options.shadowOffset) {
      this.shadowOffset.value.copy(options.shadowOffset);
    }
    if (options.shadowBlur !== undefined) {
      this.shadowBlur.value = options.shadowBlur;
    }
    if (options.glowColor) {
      this.glowColor.value.copy(options.glowColor);
    }
    if (options.glowIntensity !== undefined) {
      this.glowIntensity.value = options.glowIntensity;
    }

    this.setupNodes();

    this.transparent = true;
    this.depthWrite = false;
    this.depthTest = true;
    this.side = FrontSide;
    this.blending = NormalBlending;
  }

  private setupNodes() {
    this.colorNode = Fn(() => {
      const coords = uv();

      // Sample SDF
      const sdfSample = textureFn(this._map, coords);
      const distance = sdfSample.a; // SDF stored in alpha for single-channel

      // Calculate screen-space derivative for anti-aliasing
      const screenPxDistance = this.distanceRange.mul(distance.sub(0.5));
      const alpha = clamp(screenPxDistance.div(this.smoothing).add(0.5), 0.0, 1.0);

      // Base text color
      let color = vec4(this.textColor, alpha);

      // Outline
      const outlineAlpha = clamp(
        screenPxDistance.add(this.outlineWidth.mul(this.distanceRange)).div(this.smoothing).add(0.5),
        0.0,
        1.0
      );
      color = mix(
        vec4(this.outlineColor, outlineAlpha),
        color,
        alpha
      );

      // Shadow
      If(this.shadowEnabled.greaterThan(0.0), () => {
        const shadowCoords = coords.sub(this.shadowOffset);
        const shadowSample = textureFn(this._map, shadowCoords);
        const shadowDistance = shadowSample.a;
        const shadowScreenDist = this.distanceRange.mul(shadowDistance.sub(0.5));
        const shadowAlpha = clamp(
          shadowScreenDist.div(this.smoothing.add(this.shadowBlur)).add(0.5),
          0.0,
          1.0
        );
        const shadowResult = vec4(this.shadowColor.rgb, shadowAlpha.mul(this.shadowColor.a));

        // Composite shadow behind text
        color = mix(shadowResult, color, color.a);
      });

      // Glow
      If(this.glowIntensity.greaterThan(0.0), () => {
        const glowDistance = float(1.0).sub(distance);
        const glowAlpha = clamp(
          glowDistance.mul(this.glowIntensity).mul(2.0),
          0.0,
          1.0
        );
        const glowResult = vec4(this.glowColor, glowAlpha);

        // Additive glow
        color = vec4(
          color.rgb.add(glowResult.rgb.mul(glowAlpha)),
          max(color.a, glowAlpha)
        );
      });

      // Discard fully transparent pixels
      If(color.a.lessThan(0.01), () => {
        Discard();
      });

      return color;
    })();
  }

  get map(): Texture {
    return this._map;
  }

  set map(value: Texture) {
    this._map = value;
    this.setupNodes();
    this.needsUpdate = true;
  }

  /**
   * Enable/disable shadow.
   */
  setShadowEnabled(enabled: boolean): void {
    this.shadowEnabled.value = enabled ? 1.0 : 0.0;
  }
}
```

---

### 6. MSDFText Material (TSL)

**packages/core/src/materials/MSDFTextMaterial.ts:**

```typescript
import {
  MeshBasicNodeMaterial,
  uniform,
  texture as textureFn,
  uv,
  vec2,
  vec3,
  vec4,
  float,
  Fn,
  If,
  Discard,
  clamp,
  mix,
  max,
  min,
  median,
  fwidth,
} from 'three/tsl';
import {
  Color,
  Vector2,
  Texture,
  FrontSide,
  NormalBlending,
} from 'three';

export interface MSDFTextMaterialOptions {
  map: Texture;
  color?: Color;
  /** MSDF distance range (from font atlas) */
  distanceRange?: number;
  /** Outline color */
  outlineColor?: Color;
  /** Outline width (0-0.5) */
  outlineWidth?: number;
  /** Shadow color */
  shadowColor?: Color;
  /** Shadow offset */
  shadowOffset?: Vector2;
  /** Shadow blur */
  shadowBlur?: number;
}

/**
 * TSL-based material for MSDF (Multi-channel Signed Distance Field) text.
 *
 * MSDF provides sharper edges than single-channel SDF at all font sizes.
 * The distance is encoded across R, G, B channels.
 */
export class MSDFTextMaterial extends MeshBasicNodeMaterial {
  readonly textColor = uniform(new Color(0xffffff));
  readonly distanceRange = uniform(4.0);

  readonly outlineColor = uniform(new Color(0x000000));
  readonly outlineWidth = uniform(0.0);

  readonly shadowColor = uniform(new Color(0x000000));
  readonly shadowOffset = uniform(new Vector2(0.005, -0.005));
  readonly shadowBlur = uniform(0.1);
  readonly shadowEnabled = uniform(0.0);

  private _map: Texture;

  constructor(options: MSDFTextMaterialOptions) {
    super();

    this._map = options.map;

    if (options.color) {
      this.textColor.value.copy(options.color);
    }
    if (options.distanceRange !== undefined) {
      this.distanceRange.value = options.distanceRange;
    }
    if (options.outlineColor) {
      this.outlineColor.value.copy(options.outlineColor);
    }
    if (options.outlineWidth !== undefined) {
      this.outlineWidth.value = options.outlineWidth;
    }
    if (options.shadowColor) {
      this.shadowColor.value.copy(options.shadowColor);
    }
    if (options.shadowOffset) {
      this.shadowOffset.value.copy(options.shadowOffset);
    }
    if (options.shadowBlur !== undefined) {
      this.shadowBlur.value = options.shadowBlur;
    }

    this.setupNodes();

    this.transparent = true;
    this.depthWrite = false;
    this.depthTest = true;
    this.side = FrontSide;
    this.blending = NormalBlending;
  }

  private setupNodes() {
    // Helper: compute median of 3 values
    const median3 = (r: any, g: any, b: any) => {
      return max(min(r, g), min(max(r, g), b));
    };

    this.colorNode = Fn(() => {
      const coords = uv();

      // Sample MSDF texture
      const msdfSample = textureFn(this._map, coords);

      // Get signed distance from median of RGB
      const sd = median3(msdfSample.r, msdfSample.g, msdfSample.b);

      // Screen-space distance for anti-aliasing
      const screenPxDistance = this.distanceRange.mul(sd.sub(0.5));

      // Calculate smoothing based on screen-space derivatives
      const smoothWidth = fwidth(screenPxDistance);
      const alpha = clamp(screenPxDistance.div(smoothWidth).add(0.5), 0.0, 1.0);

      // Base text
      let color = vec4(this.textColor, alpha);

      // Outline
      If(this.outlineWidth.greaterThan(0.0), () => {
        const outlineDistance = screenPxDistance.add(this.outlineWidth.mul(this.distanceRange));
        const outlineAlpha = clamp(outlineDistance.div(smoothWidth).add(0.5), 0.0, 1.0);

        color = mix(
          vec4(this.outlineColor, outlineAlpha),
          color,
          alpha
        );
      });

      // Shadow
      If(this.shadowEnabled.greaterThan(0.0), () => {
        const shadowCoords = coords.sub(this.shadowOffset);
        const shadowSample = textureFn(this._map, shadowCoords);
        const shadowSd = median3(shadowSample.r, shadowSample.g, shadowSample.b);
        const shadowScreenDist = this.distanceRange.mul(shadowSd.sub(0.5));
        const shadowSmooth = fwidth(shadowScreenDist).add(this.shadowBlur);
        const shadowAlpha = clamp(shadowScreenDist.div(shadowSmooth).add(0.5), 0.0, 1.0);

        const shadowResult = vec4(this.shadowColor.rgb, shadowAlpha.mul(0.5));
        color = mix(shadowResult, color, color.a);
      });

      // Discard fully transparent
      If(color.a.lessThan(0.01), () => {
        Discard();
      });

      return color;
    })();
  }

  get map(): Texture {
    return this._map;
  }

  set map(value: Texture) {
    this._map = value;
    this.setupNodes();
    this.needsUpdate = true;
  }

  setShadowEnabled(enabled: boolean): void {
    this.shadowEnabled.value = enabled ? 1.0 : 0.0;
  }
}
```

---

### 7. SDFText Class

**packages/core/src/text/SDFText.ts:**

```typescript
import { Color, Vector2 } from 'three';
import { TextMesh } from './TextMesh';
import { SDFTextMaterial } from '../materials/SDFTextMaterial';
import type { SDFTextOptions } from './types';

/**
 * Signed Distance Field text renderer.
 *
 * Provides scalable text with smooth edges at any size.
 * Supports outline, shadow, and glow effects.
 *
 * @example
 * ```typescript
 * const text = new SDFText({
 *   font: await FontLoader.load('/fonts/roboto-sdf.json'),
 *   text: 'Hello World',
 *   fontSize: 32,
 *   color: 0xffffff,
 *   outlineColor: 0x000000,
 *   outlineWidth: 0.1,
 * });
 * scene.add(text);
 * ```
 */
export class SDFText extends TextMesh {
  private sdfMaterial: SDFTextMaterial;

  // Effect properties
  private _outlineColor: Color = new Color(0x000000);
  private _outlineWidth: number = 0;
  private _shadowColor: Color = new Color(0x000000);
  private _shadowOffset: Vector2 = new Vector2(0.005, -0.005);
  private _shadowBlur: number = 0.1;
  private _shadowEnabled: boolean = false;
  private _glowColor: Color = new Color(0xffffff);
  private _glowIntensity: number = 0;
  private _sdfSmoothing: number = 0.25;

  constructor(options: SDFTextOptions) {
    super(options);

    // Create SDF material
    this.sdfMaterial = new SDFTextMaterial({
      map: this._font.textures[0]!,
      color: this._color,
      distanceRange: this._font.common.distanceRange ?? 4,
      smoothing: options.sdfSmoothing ?? 0.25,
    });

    this.material = this.sdfMaterial;

    // Apply effect options
    if (options.outlineColor !== undefined) {
      this.outlineColor = options.outlineColor;
    }
    if (options.outlineWidth !== undefined) {
      this.outlineWidth = options.outlineWidth;
    }
    if (options.shadowColor !== undefined) {
      this.shadowColor = options.shadowColor;
    }
    if (options.shadowOffset !== undefined) {
      const offset = options.shadowOffset;
      this._shadowOffset.set(
        Array.isArray(offset) ? offset[0] : offset.x,
        Array.isArray(offset) ? offset[1] : offset.y
      );
      this.sdfMaterial.shadowOffset.value.copy(this._shadowOffset);
      this._shadowEnabled = true;
      this.sdfMaterial.setShadowEnabled(true);
    }
    if (options.shadowBlur !== undefined) {
      this.shadowBlur = options.shadowBlur;
    }
    if (options.glowColor !== undefined) {
      this.glowColor = options.glowColor;
    }
    if (options.glowIntensity !== undefined) {
      this.glowIntensity = options.glowIntensity;
    }
    if (options.sdfSmoothing !== undefined) {
      this._sdfSmoothing = options.sdfSmoothing;
      this.sdfMaterial.smoothing.value = options.sdfSmoothing;
    }

    this.name = 'SDFText';
  }

  protected updateMaterialColor(): void {
    this.sdfMaterial.textColor.value.copy(this._color);
  }

  // Outline properties
  get outlineColor(): Color {
    return this._outlineColor.clone();
  }

  set outlineColor(value: Color | string | number) {
    if (value instanceof Color) {
      this._outlineColor.copy(value);
    } else {
      this._outlineColor.set(value);
    }
    this.sdfMaterial.outlineColor.value.copy(this._outlineColor);
  }

  get outlineWidth(): number {
    return this._outlineWidth;
  }

  set outlineWidth(value: number) {
    this._outlineWidth = value;
    this.sdfMaterial.outlineWidth.value = value;
  }

  // Shadow properties
  get shadowColor(): Color {
    return this._shadowColor.clone();
  }

  set shadowColor(value: Color | string | number) {
    if (value instanceof Color) {
      this._shadowColor.copy(value);
    } else {
      this._shadowColor.set(value);
    }
    this.sdfMaterial.shadowColor.value.copy(this._shadowColor);
    this._shadowEnabled = true;
    this.sdfMaterial.setShadowEnabled(true);
  }

  get shadowOffset(): Vector2 {
    return this._shadowOffset.clone();
  }

  set shadowOffset(value: Vector2 | [number, number]) {
    if (value instanceof Vector2) {
      this._shadowOffset.copy(value);
    } else {
      this._shadowOffset.set(value[0], value[1]);
    }
    this.sdfMaterial.shadowOffset.value.copy(this._shadowOffset);
    this._shadowEnabled = true;
    this.sdfMaterial.setShadowEnabled(true);
  }

  get shadowBlur(): number {
    return this._shadowBlur;
  }

  set shadowBlur(value: number) {
    this._shadowBlur = value;
    this.sdfMaterial.shadowBlur.value = value;
  }

  get shadowEnabled(): boolean {
    return this._shadowEnabled;
  }

  set shadowEnabled(value: boolean) {
    this._shadowEnabled = value;
    this.sdfMaterial.setShadowEnabled(value);
  }

  // Glow properties
  get glowColor(): Color {
    return this._glowColor.clone();
  }

  set glowColor(value: Color | string | number) {
    if (value instanceof Color) {
      this._glowColor.copy(value);
    } else {
      this._glowColor.set(value);
    }
    this.sdfMaterial.glowColor.value.copy(this._glowColor);
  }

  get glowIntensity(): number {
    return this._glowIntensity;
  }

  set glowIntensity(value: number) {
    this._glowIntensity = value;
    this.sdfMaterial.glowIntensity.value = value;
  }

  // SDF smoothing
  get sdfSmoothing(): number {
    return this._sdfSmoothing;
  }

  set sdfSmoothing(value: number) {
    this._sdfSmoothing = value;
    this.sdfMaterial.smoothing.value = value;
  }
}
```

---

### 8. MSDFText Class

**packages/core/src/text/MSDFText.ts:**

```typescript
import { Color, Vector2 } from 'three';
import { TextMesh } from './TextMesh';
import { MSDFTextMaterial } from '../materials/MSDFTextMaterial';
import type { SDFTextOptions } from './types';

/**
 * Multi-channel Signed Distance Field text renderer.
 *
 * Provides sharper text edges than single-channel SDF,
 * especially at small font sizes.
 *
 * @example
 * ```typescript
 * const text = new MSDFText({
 *   font: await FontLoader.load('/fonts/roboto-msdf.json'),
 *   text: 'Sharp Text',
 *   fontSize: 16,
 *   color: 0xffffff,
 * });
 * scene.add(text);
 * ```
 */
export class MSDFText extends TextMesh {
  private msdfMaterial: MSDFTextMaterial;

  private _outlineColor: Color = new Color(0x000000);
  private _outlineWidth: number = 0;
  private _shadowColor: Color = new Color(0x000000);
  private _shadowOffset: Vector2 = new Vector2(0.005, -0.005);
  private _shadowBlur: number = 0.1;
  private _shadowEnabled: boolean = false;

  constructor(options: SDFTextOptions) {
    super(options);

    this.msdfMaterial = new MSDFTextMaterial({
      map: this._font.textures[0]!,
      color: this._color,
      distanceRange: this._font.common.distanceRange ?? 4,
    });

    this.material = this.msdfMaterial;

    if (options.outlineColor !== undefined) {
      this.outlineColor = options.outlineColor;
    }
    if (options.outlineWidth !== undefined) {
      this.outlineWidth = options.outlineWidth;
    }
    if (options.shadowColor !== undefined) {
      this.shadowColor = options.shadowColor;
    }
    if (options.shadowOffset !== undefined) {
      const offset = options.shadowOffset;
      this._shadowOffset.set(
        Array.isArray(offset) ? offset[0] : offset.x,
        Array.isArray(offset) ? offset[1] : offset.y
      );
      this.msdfMaterial.shadowOffset.value.copy(this._shadowOffset);
      this._shadowEnabled = true;
      this.msdfMaterial.setShadowEnabled(true);
    }
    if (options.shadowBlur !== undefined) {
      this.shadowBlur = options.shadowBlur;
    }

    this.name = 'MSDFText';
  }

  protected updateMaterialColor(): void {
    this.msdfMaterial.textColor.value.copy(this._color);
  }

  get outlineColor(): Color {
    return this._outlineColor.clone();
  }

  set outlineColor(value: Color | string | number) {
    if (value instanceof Color) {
      this._outlineColor.copy(value);
    } else {
      this._outlineColor.set(value);
    }
    this.msdfMaterial.outlineColor.value.copy(this._outlineColor);
  }

  get outlineWidth(): number {
    return this._outlineWidth;
  }

  set outlineWidth(value: number) {
    this._outlineWidth = value;
    this.msdfMaterial.outlineWidth.value = value;
  }

  get shadowColor(): Color {
    return this._shadowColor.clone();
  }

  set shadowColor(value: Color | string | number) {
    if (value instanceof Color) {
      this._shadowColor.copy(value);
    } else {
      this._shadowColor.set(value);
    }
    this.msdfMaterial.shadowColor.value.copy(this._shadowColor);
    this._shadowEnabled = true;
    this.msdfMaterial.setShadowEnabled(true);
  }

  get shadowOffset(): Vector2 {
    return this._shadowOffset.clone();
  }

  set shadowOffset(value: Vector2 | [number, number]) {
    if (value instanceof Vector2) {
      this._shadowOffset.copy(value);
    } else {
      this._shadowOffset.set(value[0], value[1]);
    }
    this.msdfMaterial.shadowOffset.value.copy(this._shadowOffset);
    this._shadowEnabled = true;
    this.msdfMaterial.setShadowEnabled(true);
  }

  get shadowBlur(): number {
    return this._shadowBlur;
  }

  set shadowBlur(value: number) {
    this._shadowBlur = value;
    this.msdfMaterial.shadowBlur.value = value;
  }

  get shadowEnabled(): boolean {
    return this._shadowEnabled;
  }

  set shadowEnabled(value: boolean) {
    this._shadowEnabled = value;
    this.msdfMaterial.setShadowEnabled(value);
  }
}
```

---

### 9. BitmapText Class

**packages/core/src/text/BitmapText.ts:**

```typescript
import { MeshBasicMaterial, Color } from 'three';
import { TextMesh } from './TextMesh';
import type { TextOptions } from './types';

/**
 * Classic bitmap font text renderer.
 *
 * Uses pre-rendered font atlas without SDF effects.
 * Best for pixel-perfect retro-style text.
 *
 * @example
 * ```typescript
 * const text = new BitmapText({
 *   font: await FontLoader.load('/fonts/pixel.fnt'),
 *   text: 'GAME OVER',
 *   fontSize: 16,
 *   color: 0xffffff,
 * });
 * scene.add(text);
 * ```
 */
export class BitmapText extends TextMesh {
  private bitmapMaterial: MeshBasicMaterial;

  constructor(options: TextOptions) {
    super(options);

    this.bitmapMaterial = new MeshBasicMaterial({
      map: this._font.textures[0]!,
      color: this._color,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });

    this.material = this.bitmapMaterial;
    this.name = 'BitmapText';
  }

  protected updateMaterialColor(): void {
    this.bitmapMaterial.color.copy(this._color);
  }

  /**
   * Enable pixel-perfect rendering (disable texture filtering).
   */
  setPixelPerfect(enabled: boolean): void {
    const texture = this._font.textures[0];
    if (texture) {
      if (enabled) {
        texture.magFilter = 1003; // NearestFilter
        texture.minFilter = 1003; // NearestFilter
      } else {
        texture.magFilter = 1006; // LinearFilter
        texture.minFilter = 1006; // LinearFilter
      }
      texture.needsUpdate = true;
    }
  }
}
```

---

### 10. CanvasText Class

**packages/core/src/text/CanvasText.ts:**

```typescript
import {
  Mesh,
  PlaneGeometry,
  MeshBasicMaterial,
  CanvasTexture,
  Color,
  NearestFilter,
  LinearFilter,
} from 'three';
import type { CanvasTextOptions, TextAlignment } from './types';

/**
 * Canvas 2D rendered text.
 *
 * Uses HTML5 Canvas to render text to a texture.
 * Supports any CSS font and rich text styling.
 * Best for UI text that doesn't need to scale dynamically.
 *
 * @example
 * ```typescript
 * const text = new CanvasText({
 *   text: 'Score: 1000',
 *   font: 'bold 24px Arial',
 *   color: '#ffffff',
 *   width: 200,
 *   height: 50,
 * });
 * scene.add(text);
 * ```
 */
export class CanvasText extends Mesh {
  /** Render layer */
  layer: number = 0;

  /** Z-index within layer */
  zIndex: number = 0;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: CanvasTexture;
  private canvasMaterial: MeshBasicMaterial;

  private _text: string = '';
  private _font: string = '16px sans-serif';
  private _color: string = '#ffffff';
  private _alignment: TextAlignment = 'left';
  private _padding: number = 0;
  private _backgroundColor: string | null = null;
  private _autoSize: boolean = false;
  private _width: number = 256;
  private _height: number = 64;

  constructor(options: CanvasTextOptions = {}) {
    super();

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;

    this._width = options.width ?? 256;
    this._height = options.height ?? 64;
    this._text = options.text ?? '';
    this._font = options.font ?? '16px sans-serif';
    this._color = options.color ?? '#ffffff';
    this._alignment = options.alignment ?? 'left';
    this._padding = options.padding ?? 0;
    this._backgroundColor = options.backgroundColor ?? null;
    this._autoSize = options.autoSize ?? false;

    this.canvas.width = this._width;
    this.canvas.height = this._height;

    this.texture = new CanvasTexture(this.canvas);
    this.texture.generateMipmaps = false;
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;

    this.canvasMaterial = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });

    const geometry = new PlaneGeometry(this._width, this._height);
    this.geometry = geometry;
    this.material = this.canvasMaterial;

    this.render();
    this.name = 'CanvasText';
  }

  /**
   * Render text to canvas.
   */
  private render(): void {
    const { ctx, canvas } = this;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    if (this._backgroundColor) {
      ctx.fillStyle = this._backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Set font
    ctx.font = this._font;
    ctx.fillStyle = this._color;

    // Measure text for auto-size
    if (this._autoSize) {
      const metrics = ctx.measureText(this._text);
      const textWidth = Math.ceil(metrics.width) + this._padding * 2;
      const fontHeight = parseInt(this._font) || 16;
      const textHeight = fontHeight + this._padding * 2;

      if (canvas.width !== textWidth || canvas.height !== textHeight) {
        canvas.width = textWidth;
        canvas.height = textHeight;
        this._width = textWidth;
        this._height = textHeight;

        // Update geometry
        this.geometry.dispose();
        this.geometry = new PlaneGeometry(this._width, this._height);

        // Re-set font after canvas resize
        ctx.font = this._font;
        ctx.fillStyle = this._color;
      }
    }

    // Text alignment
    let x = this._padding;
    switch (this._alignment) {
      case 'center':
        ctx.textAlign = 'center';
        x = canvas.width / 2;
        break;
      case 'right':
        ctx.textAlign = 'right';
        x = canvas.width - this._padding;
        break;
      default:
        ctx.textAlign = 'left';
        x = this._padding;
    }

    // Baseline
    ctx.textBaseline = 'middle';
    const y = canvas.height / 2;

    // Draw text
    ctx.fillText(this._text, x, y);

    // Update texture
    this.texture.needsUpdate = true;
  }

  // Getters and setters
  get text(): string {
    return this._text;
  }

  set text(value: string) {
    if (this._text !== value) {
      this._text = value;
      this.render();
    }
  }

  get font(): string {
    return this._font;
  }

  set font(value: string) {
    if (this._font !== value) {
      this._font = value;
      this.render();
    }
  }

  get color(): string {
    return this._color;
  }

  set color(value: string) {
    if (this._color !== value) {
      this._color = value;
      this.render();
    }
  }

  get alignment(): TextAlignment {
    return this._alignment;
  }

  set alignment(value: TextAlignment) {
    if (this._alignment !== value) {
      this._alignment = value;
      this.render();
    }
  }

  get backgroundColor(): string | null {
    return this._backgroundColor;
  }

  set backgroundColor(value: string | null) {
    if (this._backgroundColor !== value) {
      this._backgroundColor = value;
      this.render();
    }
  }

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  /**
   * Resize the canvas.
   */
  resize(width: number, height: number): void {
    this._width = width;
    this._height = height;
    this.canvas.width = width;
    this.canvas.height = height;

    this.geometry.dispose();
    this.geometry = new PlaneGeometry(width, height);

    this.render();
  }

  /**
   * Set pixel-perfect rendering.
   */
  setPixelPerfect(enabled: boolean): void {
    if (enabled) {
      this.texture.magFilter = NearestFilter;
      this.texture.minFilter = NearestFilter;
    } else {
      this.texture.magFilter = LinearFilter;
      this.texture.minFilter = LinearFilter;
    }
    this.texture.needsUpdate = true;
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    this.texture.dispose();
    this.geometry.dispose();
    this.canvasMaterial.dispose();
  }
}
```

---

### 11. Paragraph Class

**packages/core/src/text/Paragraph.ts:**

```typescript
import { SDFText } from './SDFText';
import type { ParagraphOptions, TextOverflow } from './types';

/**
 * Multi-line paragraph text with word wrap.
 *
 * Extends SDFText with additional paragraph-specific features:
 * - Required maxWidth for word wrapping
 * - Overflow handling (visible, hidden, ellipsis)
 * - First-line indent
 * - Paragraph spacing
 *
 * @example
 * ```typescript
 * const paragraph = new Paragraph({
 *   font: await FontLoader.load('/fonts/roboto-msdf.json'),
 *   text: 'Lorem ipsum dolor sit amet...',
 *   fontSize: 14,
 *   maxWidth: 300,
 *   maxHeight: 200,
 *   overflow: 'ellipsis',
 * });
 * scene.add(paragraph);
 * ```
 */
export class Paragraph extends SDFText {
  private _maxHeight?: number;
  private _overflow: TextOverflow = 'visible';
  private _indent: number = 0;
  private _paragraphSpacing: number = 0;

  constructor(options: ParagraphOptions) {
    // Paragraphs always have word wrap
    super({
      ...options,
      wordWrap: true,
    });

    this._maxHeight = options.maxHeight;
    this._overflow = options.overflow ?? 'visible';
    this._indent = options.indent ?? 0;
    this._paragraphSpacing = options.paragraphSpacing ?? 0;

    this.name = 'Paragraph';
  }

  get maxHeight(): number | undefined {
    return this._maxHeight;
  }

  set maxHeight(value: number | undefined) {
    this._maxHeight = value;
    this.needsUpdate = true;
  }

  get overflow(): TextOverflow {
    return this._overflow;
  }

  set overflow(value: TextOverflow) {
    if (this._overflow !== value) {
      this._overflow = value;
      this.needsUpdate = true;
    }
  }

  get indent(): number {
    return this._indent;
  }

  set indent(value: number) {
    if (this._indent !== value) {
      this._indent = value;
      this.needsUpdate = true;
    }
  }

  get paragraphSpacing(): number {
    return this._paragraphSpacing;
  }

  set paragraphSpacing(value: number) {
    if (this._paragraphSpacing !== value) {
      this._paragraphSpacing = value;
      this.needsUpdate = true;
    }
  }

  /**
   * Update with overflow handling.
   */
  update(): void {
    super.update();

    // Apply overflow behavior
    if (this._overflow !== 'visible' && this._maxHeight !== undefined) {
      const layout = this.textGeometry.layout;
      if (layout && layout.height > this._maxHeight) {
        if (this._overflow === 'ellipsis') {
          this.applyEllipsis();
        }
        // For 'hidden', we just clip via material or geometry
      }
    }
  }

  /**
   * Apply ellipsis to text that overflows.
   */
  private applyEllipsis(): void {
    // Find the last visible line and truncate with ellipsis
    const layout = this.textGeometry.layout;
    if (!layout || !this._maxHeight) return;

    let visibleLines = 0;
    let accumulatedHeight = 0;

    for (const line of layout.lines) {
      accumulatedHeight += line.height;
      if (accumulatedHeight <= this._maxHeight) {
        visibleLines++;
      } else {
        break;
      }
    }

    if (visibleLines < layout.lineCount && visibleLines > 0) {
      // Truncate text to visible lines and add ellipsis
      const lastVisibleLine = layout.lines[visibleLines - 1]!;
      const glyphsToKeep = lastVisibleLine.end;

      // Find character index for truncation
      let charIndex = 0;
      for (let i = 0; i < glyphsToKeep && i < layout.glyphs.length; i++) {
        charIndex += layout.glyphs[i]!.char.length;
      }

      // Truncate and add ellipsis
      const truncatedText = this._text.substring(0, Math.max(0, charIndex - 3)) + '...';

      // Update with truncated text (avoid infinite loop)
      if (truncatedText !== this._text) {
        this._text = truncatedText;
        this.textGeometry.update(this._text);
      }
    }
  }
}
```

---

### 12. TSL Text Effect Nodes

**packages/core/src/nodes/textEffects.ts:**

```typescript
import {
  Fn,
  vec4,
  vec3,
  float,
  uv,
  uniform,
  texture as textureFn,
  smoothstep,
  mix,
  clamp,
  length,
  max,
  min,
  abs,
  sin,
  cos,
  time,
} from 'three/tsl';
import { Color, Vector2, Texture } from 'three';

/**
 * Create a text outline effect node.
 */
export const textOutline = (
  sdfTexture: Texture,
  distance: any,
  outlineColor: Color = new Color(0x000000),
  outlineWidth: number = 0.1,
  distanceRange: number = 4
) => {
  const outlineColorUniform = uniform(outlineColor);
  const outlineWidthUniform = uniform(outlineWidth);
  const distanceRangeUniform = uniform(distanceRange);

  return Fn(([textColor]: any[]) => {
    const screenPxDistance = distanceRangeUniform.mul(distance.sub(0.5));
    const textAlpha = clamp(screenPxDistance.mul(2.0).add(0.5), 0.0, 1.0);

    const outlineDistance = screenPxDistance.add(outlineWidthUniform.mul(distanceRangeUniform));
    const outlineAlpha = clamp(outlineDistance.mul(2.0).add(0.5), 0.0, 1.0);

    return mix(
      vec4(outlineColorUniform, outlineAlpha),
      textColor,
      textAlpha
    );
  });
};

/**
 * Create a text drop shadow effect node.
 */
export const textShadow = (
  sdfTexture: Texture,
  shadowColor: Color = new Color(0x000000),
  shadowOffset: Vector2 = new Vector2(0.01, -0.01),
  shadowBlur: number = 0.1,
  distanceRange: number = 4
) => {
  const shadowColorUniform = uniform(shadowColor);
  const shadowOffsetUniform = uniform(shadowOffset);
  const shadowBlurUniform = uniform(shadowBlur);
  const distanceRangeUniform = uniform(distanceRange);

  return Fn(([textColor]: any[]) => {
    const shadowCoords = uv().sub(shadowOffsetUniform);
    const shadowSample = textureFn(sdfTexture, shadowCoords);
    const shadowDistance = shadowSample.a;

    const shadowScreenDist = distanceRangeUniform.mul(shadowDistance.sub(0.5));
    const shadowAlpha = clamp(
      shadowScreenDist.div(float(0.25).add(shadowBlurUniform)).add(0.5),
      0.0,
      1.0
    );

    const shadowResult = vec4(shadowColorUniform, shadowAlpha.mul(0.5));

    return mix(shadowResult, textColor, textColor.a);
  });
};

/**
 * Create a text glow effect node.
 */
export const textGlow = (
  distance: any,
  glowColor: Color = new Color(0xffffff),
  glowIntensity: number = 1.0,
  glowRadius: number = 0.3
) => {
  const glowColorUniform = uniform(glowColor);
  const glowIntensityUniform = uniform(glowIntensity);
  const glowRadiusUniform = uniform(glowRadius);

  return Fn(([textColor]: any[]) => {
    const glowDistance = float(1.0).sub(distance);
    const glowAlpha = clamp(
      glowDistance.mul(glowIntensityUniform).div(glowRadiusUniform),
      0.0,
      1.0
    );

    const glowResult = vec4(glowColorUniform, glowAlpha);

    return vec4(
      textColor.rgb.add(glowResult.rgb.mul(glowAlpha.mul(0.5))),
      max(textColor.a, glowAlpha)
    );
  });
};

/**
 * Create a text gradient effect node.
 */
export const textGradient = (
  startColor: Color = new Color(0xff0000),
  endColor: Color = new Color(0x0000ff),
  direction: 'horizontal' | 'vertical' | 'diagonal' = 'vertical'
) => {
  const startColorUniform = uniform(startColor);
  const endColorUniform = uniform(endColor);

  return Fn(([textColor]: any[]) => {
    const coords = uv();
    let t;

    switch (direction) {
      case 'horizontal':
        t = coords.x;
        break;
      case 'diagonal':
        t = coords.x.add(coords.y).mul(0.5);
        break;
      case 'vertical':
      default:
        t = coords.y;
        break;
    }

    const gradientColor = mix(startColorUniform, endColorUniform, t);

    return vec4(textColor.rgb.mul(gradientColor), textColor.a);
  });
};

/**
 * Create an animated rainbow text effect.
 */
export const textRainbow = (speed: number = 1.0, saturation: number = 1.0) => {
  const speedUniform = uniform(speed);
  const saturationUniform = uniform(saturation);

  return Fn(([textColor]: any[]) => {
    const coords = uv();
    const hue = coords.x.add(time.mul(speedUniform)).mod(1.0);

    // HSV to RGB conversion
    const h = hue.mul(6.0);
    const s = saturationUniform;
    const v = float(1.0);

    const c = v.mul(s);
    const x = c.mul(float(1.0).sub(abs(h.mod(2.0).sub(1.0))));
    const m = v.sub(c);

    // Simplified HSV to RGB
    const r = clamp(abs(h.sub(3.0)).sub(1.0), 0.0, 1.0);
    const g = clamp(float(2.0).sub(abs(h.sub(2.0))), 0.0, 1.0);
    const b = clamp(float(2.0).sub(abs(h.sub(4.0))), 0.0, 1.0);

    const rainbow = vec3(r, g, b);

    return vec4(textColor.rgb.mul(rainbow), textColor.a);
  });
};

/**
 * Create a text wave distortion effect.
 */
export const textWave = (
  amplitude: number = 0.02,
  frequency: number = 10.0,
  speed: number = 2.0
) => {
  const amplitudeUniform = uniform(amplitude);
  const frequencyUniform = uniform(frequency);
  const speedUniform = uniform(speed);

  return {
    /** Apply to UV coordinates */
    uvOffset: Fn(() => {
      const coords = uv();
      const wave = sin(coords.x.mul(frequencyUniform).add(time.mul(speedUniform)));
      return vec2(0.0, wave.mul(amplitudeUniform));
    }),
  };
};
```

---

### 13. Exports

**packages/core/src/text/index.ts:**

```typescript
export { TextMesh } from './TextMesh';
export { TextGeometry } from './TextGeometry';
export { SDFText } from './SDFText';
export { MSDFText } from './MSDFText';
export { BitmapText } from './BitmapText';
export { CanvasText } from './CanvasText';
export { Paragraph } from './Paragraph';

export type {
  FontType,
  TextAlignment,
  VerticalAlignment,
  TextOverflow,
  GlyphData,
  KerningPair,
  FontInfo,
  FontCommon,
  FontData,
  TextOptions,
  SDFTextOptions,
  ParagraphOptions,
  CanvasTextOptions,
  TextLayout,
  LayoutGlyph,
  LayoutLine,
} from './types';
```

**packages/core/src/loaders/index.ts (updated):**

```typescript
export { SpriteSheetLoader } from './SpriteSheetLoader';
export { FontLoader } from './FontLoader';
```

**packages/core/src/materials/index.ts (updated):**

```typescript
export { Sprite2DMaterial } from './Sprite2DMaterial';
export { SDFTextMaterial } from './SDFTextMaterial';
export { MSDFTextMaterial } from './MSDFTextMaterial';
```

**packages/core/src/nodes/index.ts:**

```typescript
export {
  textOutline,
  textShadow,
  textGlow,
  textGradient,
  textRainbow,
  textWave,
} from './textEffects';
```

**packages/core/src/index.ts (updated):**

```typescript
export const VERSION = '0.7.0';

// Sprites
export * from './sprites';

// Animation
export * from './animation';

// Pipeline
export * from './pipeline';

// Materials
export * from './materials';

// Loaders
export * from './loaders';

// Text
export * from './text';

// TSL Nodes
export * from './nodes';
```

---

### 14. Tests

**packages/core/src/text/TextGeometry.test.ts:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Texture } from 'three';
import { TextGeometry } from './TextGeometry';
import type { FontData, GlyphData } from './types';

// Mock font data
function createMockFont(): FontData {
  const glyphs = new Map<number, GlyphData>();

  // Add basic ASCII characters
  for (let i = 32; i < 127; i++) {
    glyphs.set(i, {
      id: i,
      char: String.fromCharCode(i),
      x: ((i - 32) % 16) * 16,
      y: Math.floor((i - 32) / 16) * 16,
      width: 12,
      height: 16,
      xoffset: 0,
      yoffset: 0,
      xadvance: 14,
      page: 0,
    });
  }

  return {
    type: 'bitmap',
    info: {
      face: 'Test',
      size: 16,
      bold: false,
      italic: false,
      charset: '',
      unicode: true,
      stretchH: 100,
      smooth: true,
      aa: 1,
      padding: [0, 0, 0, 0],
      spacing: [0, 0],
    },
    common: {
      lineHeight: 20,
      base: 16,
      scaleW: 256,
      scaleH: 256,
      pages: 1,
      packed: false,
    },
    glyphs,
    kerning: new Map(),
    textures: [new Texture()],
    getGlyph(char: string) {
      return glyphs.get(char.charCodeAt(0));
    },
    getKerning() {
      return 0;
    },
  };
}

describe('TextGeometry', () => {
  let font: FontData;

  beforeEach(() => {
    font = createMockFont();
  });

  it('should create geometry for simple text', () => {
    const geometry = new TextGeometry({
      font,
      text: 'Hello',
      fontSize: 16,
    });

    expect(geometry.layout).not.toBeNull();
    expect(geometry.layout!.glyphs.length).toBe(5);
  });

  it('should compute correct layout dimensions', () => {
    const geometry = new TextGeometry({
      font,
      text: 'Test',
      fontSize: 16,
    });

    expect(geometry.layout!.width).toBeGreaterThan(0);
    expect(geometry.layout!.height).toBeGreaterThan(0);
  });

  it('should handle multi-line text', () => {
    const geometry = new TextGeometry({
      font,
      text: 'Line 1\nLine 2',
      fontSize: 16,
    });

    expect(geometry.layout!.lineCount).toBe(2);
  });

  it('should apply word wrap', () => {
    const geometry = new TextGeometry({
      font,
      text: 'This is a long line that should wrap',
      fontSize: 16,
      maxWidth: 100,
      wordWrap: true,
    });

    expect(geometry.layout!.lineCount).toBeGreaterThan(1);
  });

  it('should handle empty text', () => {
    const geometry = new TextGeometry({
      font,
      text: '',
      fontSize: 16,
    });

    expect(geometry.layout!.glyphs.length).toBe(0);
  });

  it('should apply text alignment', () => {
    const leftGeometry = new TextGeometry({
      font,
      text: 'Left',
      fontSize: 16,
      alignment: 'left',
    });

    const centerGeometry = new TextGeometry({
      font,
      text: 'Center',
      fontSize: 16,
      alignment: 'center',
    });

    // Center-aligned text should have different glyph positions
    expect(leftGeometry.layout!.glyphs[0]!.x).not.toBe(
      centerGeometry.layout!.glyphs[0]!.x
    );
  });

  it('should update geometry when text changes', () => {
    const geometry = new TextGeometry({
      font,
      text: 'Original',
      fontSize: 16,
    });

    const originalGlyphCount = geometry.layout!.glyphs.length;

    geometry.update('New');

    expect(geometry.layout!.glyphs.length).not.toBe(originalGlyphCount);
  });
});
```

**packages/core/src/text/SDFText.test.ts:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Texture, Color } from 'three';
import { SDFText } from './SDFText';
import type { FontData, GlyphData } from './types';

// Mock SDF font
function createMockSDFFont(): FontData {
  const glyphs = new Map<number, GlyphData>();

  for (let i = 32; i < 127; i++) {
    glyphs.set(i, {
      id: i,
      char: String.fromCharCode(i),
      x: ((i - 32) % 16) * 16,
      y: Math.floor((i - 32) / 16) * 16,
      width: 12,
      height: 16,
      xoffset: 0,
      yoffset: 0,
      xadvance: 14,
      page: 0,
    });
  }

  return {
    type: 'sdf',
    info: {
      face: 'Test SDF',
      size: 32,
      bold: false,
      italic: false,
      charset: '',
      unicode: true,
      stretchH: 100,
      smooth: true,
      aa: 1,
      padding: [0, 0, 0, 0],
      spacing: [0, 0],
    },
    common: {
      lineHeight: 40,
      base: 32,
      scaleW: 256,
      scaleH: 256,
      pages: 1,
      packed: false,
      distanceRange: 4,
    },
    glyphs,
    kerning: new Map(),
    textures: [new Texture()],
    getGlyph(char: string) {
      return glyphs.get(char.charCodeAt(0));
    },
    getKerning() {
      return 0;
    },
  };
}

describe('SDFText', () => {
  let font: FontData;

  beforeEach(() => {
    font = createMockSDFFont();
  });

  it('should create SDF text', () => {
    const text = new SDFText({
      font,
      text: 'Hello',
      fontSize: 32,
    });

    expect(text.text).toBe('Hello');
    expect(text.fontSize).toBe(32);
  });

  it('should set color', () => {
    const text = new SDFText({
      font,
      text: 'Hello',
      color: 0xff0000,
    });

    expect(text.color.r).toBe(1);
    expect(text.color.g).toBe(0);
    expect(text.color.b).toBe(0);
  });

  it('should support outline', () => {
    const text = new SDFText({
      font,
      text: 'Hello',
      outlineColor: 0x000000,
      outlineWidth: 0.1,
    });

    expect(text.outlineWidth).toBe(0.1);
  });

  it('should support shadow', () => {
    const text = new SDFText({
      font,
      text: 'Hello',
      shadowColor: 0x000000,
      shadowOffset: [0.01, -0.01],
    });

    expect(text.shadowEnabled).toBe(true);
  });

  it('should support glow', () => {
    const text = new SDFText({
      font,
      text: 'Hello',
      glowColor: 0xffffff,
      glowIntensity: 1.0,
    });

    expect(text.glowIntensity).toBe(1.0);
  });

  it('should update text', () => {
    const text = new SDFText({
      font,
      text: 'Hello',
    });

    text.text = 'World';
    text.update();

    expect(text.text).toBe('World');
  });
});
```

**packages/core/src/loaders/FontLoader.test.ts:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FontLoader } from './FontLoader';

// Mock fetch
const mockBMFontText = `
info face="TestFont" size=16 bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=0,0
common lineHeight=20 base=16 scaleW=256 scaleH=256 pages=1 packed=0
page id=0 file="font.png"
chars count=2
char id=65 x=0 y=0 width=12 height=16 xoffset=0 yoffset=0 xadvance=14 page=0 chnl=15
char id=66 x=16 y=0 width=12 height=16 xoffset=0 yoffset=0 xadvance=14 page=0 chnl=15
`;

describe('FontLoader', () => {
  beforeEach(() => {
    FontLoader.clearCache();
  });

  it.todo('should load BMFont format');
  it.todo('should load MSDF JSON format');
  it.todo('should cache loaded fonts');
  it.todo('should provide glyph lookup');
  it.todo('should provide kerning lookup');
});
```

---

## Acceptance Criteria

- [ ] `FontLoader` loads BMFont (.fnt) format correctly
- [ ] `FontLoader` loads MSDF JSON format correctly
- [ ] `TextGeometry` generates correct glyph quads
- [ ] `TextGeometry` applies kerning between characters
- [ ] `TextGeometry` handles word wrap correctly
- [ ] `TextGeometry` applies text alignment (left, center, right)
- [ ] `SDFText` renders with smooth anti-aliased edges
- [ ] `SDFText` outline effect works correctly
- [ ] `SDFText` shadow effect works correctly
- [ ] `SDFText` glow effect works correctly
- [ ] `MSDFText` provides sharper edges than SDF
- [ ] `BitmapText` renders pixel-perfect at native size
- [ ] `CanvasText` renders dynamic text correctly
- [ ] `Paragraph` handles multi-line word wrap
- [ ] `Paragraph` applies ellipsis for overflow
- [ ] TSL text effect nodes work correctly
- [ ] All text types work with 2D render pipeline
- [ ] Text is scalable without quality loss (SDF/MSDF)
- [ ] All tests pass
- [ ] TypeScript types are correct and complete

---

## Example Usage

**Vanilla Three.js:**

```typescript
import * as THREE from 'three/webgpu';
import {
  SDFText,
  MSDFText,
  BitmapText,
  CanvasText,
  Paragraph,
  FontLoader,
  Layers,
} from '@three-flatland/core';

const renderer = new THREE.WebGPURenderer();
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(0, 800, 600, 0, -1000, 1000);

// Load fonts
const [sdfFont, msdfFont, bitmapFont] = await FontLoader.preload([
  '/fonts/roboto-sdf.json',
  '/fonts/roboto-msdf.json',
  '/fonts/pixel.fnt',
]);

// SDF text with effects
const title = new SDFText({
  font: sdfFont,
  text: 'GAME TITLE',
  fontSize: 48,
  color: 0xffffff,
  outlineColor: 0x000000,
  outlineWidth: 0.15,
  glowColor: 0x00ffff,
  glowIntensity: 0.5,
});
title.position.set(400, 100, 0);
scene.add(title);

// MSDF text for sharp small text
const subtitle = new MSDFText({
  font: msdfFont,
  text: 'Press Start',
  fontSize: 16,
  color: 0xcccccc,
});
subtitle.position.set(400, 150, 0);
scene.add(subtitle);

// Bitmap text for pixel art style
const score = new BitmapText({
  font: bitmapFont,
  text: 'SCORE: 00000',
  fontSize: 8,
  color: 0xffff00,
});
score.setPixelPerfect(true);
score.position.set(10, 10, 0);
scene.add(score);

// Canvas text for dynamic content
const fps = new CanvasText({
  text: 'FPS: 60',
  font: 'bold 12px monospace',
  color: '#00ff00',
  width: 80,
  height: 20,
  autoSize: true,
});
fps.position.set(750, 10, 0);
scene.add(fps);

// Paragraph for long text
const description = new Paragraph({
  font: msdfFont,
  text: 'Welcome to the game! This is a multi-line paragraph that will automatically wrap to fit within the specified width. You can also add ellipsis for overflow...',
  fontSize: 14,
  maxWidth: 300,
  maxHeight: 100,
  overflow: 'ellipsis',
  color: 0xffffff,
});
description.position.set(400, 400, 0);
scene.add(description);

// Animate
function animate() {
  requestAnimationFrame(animate);

  // Update dynamic text
  fps.text = `FPS: ${Math.round(1000 / 16)}`;

  renderer.render(scene, camera);
}
animate();
```

**React Three Fiber:**

```tsx
import { Canvas } from '@react-three/fiber';
import { Suspense, useState, useEffect } from 'react';
import {
  SDFText,
  MSDFText,
  FontLoader,
  type FontData,
} from '@three-flatland/core';

function GameTitle({ font }: { font: FontData }) {
  return (
    <primitive
      object={
        new SDFText({
          font,
          text: 'MY GAME',
          fontSize: 48,
          color: 0xffffff,
          outlineColor: 0x000000,
          outlineWidth: 0.1,
        })
      }
      position={[400, 100, 0]}
    />
  );
}

function ScoreText({ font, score }: { font: FontData; score: number }) {
  const [text] = useState(
    () =>
      new MSDFText({
        font,
        text: `Score: ${score}`,
        fontSize: 24,
        color: 0xffff00,
      })
  );

  useEffect(() => {
    text.text = `Score: ${score}`;
    text.update();
  }, [score, text]);

  return <primitive object={text} position={[50, 50, 0]} />;
}

function Game() {
  const [font, setFont] = useState<FontData | null>(null);
  const [score, setScore] = useState(0);

  useEffect(() => {
    FontLoader.load('/fonts/roboto-msdf.json').then(setFont);
  }, []);

  if (!font) return null;

  return (
    <>
      <GameTitle font={font} />
      <ScoreText font={font} score={score} />
    </>
  );
}

export default function App() {
  return (
    <Canvas orthographic camera={{ zoom: 1, position: [400, 300, 100] }}>
      <Suspense fallback={null}>
        <Game />
      </Suspense>
    </Canvas>
  );
}
```

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Complex text layout edge cases | High | Medium | Comprehensive test suite, follow proven algorithms |
| SDF shader math complexity | Medium | High | Reference established implementations, thorough testing |
| Font format parsing errors | Medium | Medium | Support common formats, clear error messages |
| Performance with large text | Medium | Medium | Batch text geometry, caching strategies |
| WebGPU shader compatibility | Low | Medium | Test on multiple browsers, fallback paths |
| Kerning accuracy | Medium | Low | Validate against reference renderers |

---

## Dependencies for Next Milestone

M8 (UI System) requires:
- Completed text rendering system
- Paragraph component for UI labels
- SDFText for scalable UI text

---

## Estimated Effort

| Task | Hours |
|------|-------|
| Type definitions | 4 |
| FontLoader (BMFont, MSDF) | 12 |
| TextGeometry (layout engine) | 16 |
| TextMesh base class | 4 |
| SDFTextMaterial (TSL) | 12 |
| MSDFTextMaterial (TSL) | 8 |
| SDFText class | 6 |
| MSDFText class | 4 |
| BitmapText class | 4 |
| CanvasText class | 6 |
| Paragraph class | 8 |
| TSL text effect nodes | 8 |
| Tests | 12 |
| Documentation | 4 |
| Examples | 4 |
| **Total** | **112 hours** (~4 weeks) |

---

*End of M7: Text Rendering*
