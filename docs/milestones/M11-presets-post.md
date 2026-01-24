# M11: Presets & Post-Processing

## Milestone Overview

| Field | Value |
|-------|-------|
| **Duration** | 2 weeks |
| **Dependencies** | M10 (Render Targets), M4-M7 (TSL Nodes) |
| **Outputs** | RetroPreset, HDPreset, VFXPreset, Post-processing integration, Preset composition |
| **Risk Level** | Medium (visual quality, cross-browser consistency) |

---

## Objectives

1. Create `RetroPreset` for pixel-perfect retro games
2. Create `HDPreset` for smooth, high-DPI rendering
3. Create `VFXPreset` for particle-heavy visual effects
4. Integrate with Three.js post-processing (EffectComposer)
5. Enable preset composition and customization
6. Provide TSL-based post-processing effects

---

## Architecture

```
+---------------------------------------------------------------------------+
|                       PRESETS & POST-PROCESSING                            |
+---------------------------------------------------------------------------+
|                                                                           |
|   Preset System                                                           |
|   +-------------------------------------------------------------------+   |
|   |  BasePreset (abstract)                                            |   |
|   |    - renderer settings                                            |   |
|   |    - camera configuration                                         |   |
|   |    - default materials                                            |   |
|   |    - post-processing effects                                      |   |
|   +-------------------------------------------------------------------+   |
|           |                    |                    |                     |
|           v                    v                    v                     |
|   +---------------+    +---------------+    +---------------+             |
|   | RetroPreset   |    | HDPreset      |    | VFXPreset     |             |
|   | - Pixel snap  |    | - High DPI    |    | - Particles   |             |
|   | - Limited pal |    | - Smooth      |    | - Bloom       |             |
|   | - CRT effect  |    | - Anti-alias  |    | - Trails      |             |
|   +---------------+    +---------------+    +---------------+             |
|                                                                           |
|   Post-Processing Pipeline                                                |
|   +-------------------------------------------------------------------+   |
|   |  PostProcessor                                                    |   |
|   |    - EffectComposer integration                                   |   |
|   |    - TSL-based custom effects                                     |   |
|   |    - Effect ordering                                              |   |
|   |    - Performance optimization                                     |   |
|   +-------------------------------------------------------------------+   |
|           |                    |                    |                     |
|           v                    v                    v                     |
|   +---------------+    +---------------+    +---------------+             |
|   | PixelatePass  |    | BloomPass     |    | PalettePass   |             |
|   | DitherPass    |    | ColorGrade    |    | ScanlinePass  |             |
|   | CRTPass       |    | VignettePass  |    | ChromaticPass |             |
|   +---------------+    +---------------+    +---------------+             |
|                                                                           |
+---------------------------------------------------------------------------+
```

---

## Detailed Implementation

### 1. Type Definitions

**packages/presets/src/types.ts:**

```typescript
import type { WebGLRenderer, Camera, Scene, Color } from 'three';
import type { Renderer2D } from '@three-flatland/core';

/**
 * Preset configuration options.
 */
export interface PresetOptions {
  /** Pixel ratio (1 = pixel art, devicePixelRatio = HD) */
  pixelRatio?: number;
  /** Enable anti-aliasing */
  antialias?: boolean;
  /** Enable post-processing */
  postProcessing?: boolean;
  /** Background color */
  backgroundColor?: number | string;
  /** Enable transparency */
  transparent?: boolean;
}

/**
 * Retro preset options.
 */
export interface RetroPresetOptions extends PresetOptions {
  /** Target resolution width */
  targetWidth?: number;
  /** Target resolution height */
  targetHeight?: number;
  /** Enable pixel snapping */
  pixelSnap?: boolean;
  /** Color palette (array of colors) */
  palette?: number[];
  /** Enable scanlines effect */
  scanlines?: boolean;
  /** Scanline intensity (0-1) */
  scanlineIntensity?: number;
  /** Enable CRT curvature */
  crtCurvature?: boolean;
  /** CRT curvature amount */
  curvatureAmount?: number;
  /** Enable dithering */
  dithering?: boolean;
  /** Dither pattern size */
  ditherSize?: number;
}

/**
 * HD preset options.
 */
export interface HDPresetOptions extends PresetOptions {
  /** Enable MSAA (samples count) */
  msaaSamples?: number;
  /** Enable bloom */
  bloom?: boolean;
  /** Bloom intensity */
  bloomIntensity?: number;
  /** Bloom threshold */
  bloomThreshold?: number;
  /** Enable vignette */
  vignette?: boolean;
  /** Vignette intensity */
  vignetteIntensity?: number;
  /** Enable color grading */
  colorGrading?: boolean;
  /** Color temperature adjustment */
  colorTemperature?: number;
  /** Saturation adjustment */
  saturation?: number;
  /** Contrast adjustment */
  contrast?: number;
}

/**
 * VFX preset options.
 */
export interface VFXPresetOptions extends PresetOptions {
  /** Enable bloom */
  bloom?: boolean;
  /** Bloom intensity (higher for VFX) */
  bloomIntensity?: number;
  /** Enable motion blur */
  motionBlur?: boolean;
  /** Motion blur samples */
  motionBlurSamples?: number;
  /** Enable chromatic aberration */
  chromaticAberration?: boolean;
  /** Chromatic aberration intensity */
  chromaticIntensity?: number;
  /** Enable glow */
  glow?: boolean;
  /** Glow color */
  glowColor?: number;
  /** Enable trails */
  trails?: boolean;
  /** Trail decay rate */
  trailDecay?: number;
}

/**
 * Post-processing effect definition.
 */
export interface PostEffect {
  /** Effect name */
  name: string;
  /** Effect enabled state */
  enabled: boolean;
  /** Effect priority (lower = earlier in chain) */
  priority: number;
  /** Effect uniforms/parameters */
  params: Record<string, unknown>;
}

/**
 * Post-processor configuration.
 */
export interface PostProcessorOptions {
  /** Effects to apply */
  effects: PostEffect[];
  /** Output pixel ratio */
  pixelRatio?: number;
  /** Enable depth buffer */
  depthBuffer?: boolean;
  /** Enable stencil buffer */
  stencilBuffer?: boolean;
}
```

---

### 2. Base Preset

**packages/presets/src/BasePreset.ts:**

```typescript
import type { WebGLRenderer, Camera, Scene } from 'three';
import type { Renderer2D } from '@three-flatland/core';
import type { PresetOptions, PostEffect } from './types';

/**
 * Abstract base class for rendering presets.
 *
 * Presets configure the rendering pipeline for specific visual styles.
 */
export abstract class BasePreset {
  protected options: Required<PresetOptions>;
  protected effects: PostEffect[] = [];
  protected renderer: WebGLRenderer | null = null;
  protected renderer2D: Renderer2D | null = null;

  constructor(options: PresetOptions = {}) {
    this.options = {
      pixelRatio: options.pixelRatio ?? 1,
      antialias: options.antialias ?? false,
      postProcessing: options.postProcessing ?? true,
      backgroundColor: options.backgroundColor ?? 0x000000,
      transparent: options.transparent ?? false,
    };
  }

  /**
   * Initialize the preset with renderer.
   */
  abstract init(renderer: WebGLRenderer): void;

  /**
   * Configure a Renderer2D instance for this preset.
   */
  abstract configure2D(renderer2D: Renderer2D): void;

  /**
   * Apply preset settings to a WebGLRenderer.
   */
  protected applyRendererSettings(renderer: WebGLRenderer): void {
    renderer.setPixelRatio(this.options.pixelRatio);
    renderer.setClearColor(
      this.options.backgroundColor as number,
      this.options.transparent ? 0 : 1
    );
  }

  /**
   * Get post-processing effects for this preset.
   */
  getEffects(): readonly PostEffect[] {
    return this.effects;
  }

  /**
   * Add an effect.
   */
  addEffect(effect: PostEffect): this {
    this.effects.push(effect);
    this.effects.sort((a, b) => a.priority - b.priority);
    return this;
  }

  /**
   * Remove an effect by name.
   */
  removeEffect(name: string): this {
    this.effects = this.effects.filter((e) => e.name !== name);
    return this;
  }

  /**
   * Enable/disable an effect.
   */
  setEffectEnabled(name: string, enabled: boolean): this {
    const effect = this.effects.find((e) => e.name === name);
    if (effect) {
      effect.enabled = enabled;
    }
    return this;
  }

  /**
   * Update effect parameters.
   */
  setEffectParams(name: string, params: Record<string, unknown>): this {
    const effect = this.effects.find((e) => e.name === name);
    if (effect) {
      Object.assign(effect.params, params);
    }
    return this;
  }

  /**
   * Render with this preset's configuration.
   */
  abstract render(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera
  ): void;

  /**
   * Dispose of preset resources.
   */
  abstract dispose(): void;
}
```

---

### 3. Retro Preset

**packages/presets/src/RetroPreset.ts:**

```typescript
import {
  WebGLRenderer,
  WebGLRenderTarget,
  OrthographicCamera,
  Scene,
  Camera,
  NearestFilter,
  ShaderMaterial,
  PlaneGeometry,
  Mesh,
} from 'three';
import { BasePreset } from './BasePreset';
import type { RetroPresetOptions, PostEffect } from './types';
import type { Renderer2D } from '@three-flatland/core';

// Classic color palettes
export const PALETTES = {
  /** Original Game Boy palette */
  GAMEBOY: [0x0f380f, 0x306230, 0x8bac0f, 0x9bbc0f],
  /** NES palette (simplified) */
  NES: [0x000000, 0xfcfcfc, 0xf8f8f8, 0xbcbcbc, 0x7c7c7c, 0xa4e4fc, 0x3cbcfc, 0x0078f8],
  /** C64 palette */
  C64: [0x000000, 0xffffff, 0x883932, 0x67b6bd, 0x8b3f96, 0x55a049, 0x40318d, 0xbfce72],
  /** Pico-8 palette */
  PICO8: [
    0x000000, 0x1d2b53, 0x7e2553, 0x008751,
    0xab5236, 0x5f574f, 0xc2c3c7, 0xfff1e8,
    0xff004d, 0xffa300, 0xffec27, 0x00e436,
    0x29adff, 0x83769c, 0xff77a8, 0xffccaa,
  ],
};

/**
 * Retro preset for pixel-perfect retro game aesthetics.
 *
 * Features:
 * - Pixel snapping for crisp edges
 * - Limited color palette
 * - CRT effects (scanlines, curvature)
 * - Dithering
 *
 * @example
 * ```typescript
 * const preset = new RetroPreset({
 *   targetWidth: 320,
 *   targetHeight: 240,
 *   palette: PALETTES.PICO8,
 *   scanlines: true,
 *   crtCurvature: true,
 * });
 *
 * preset.init(renderer);
 * ```
 */
export class RetroPreset extends BasePreset {
  private retroOptions: Required<RetroPresetOptions>;
  private lowResTarget: WebGLRenderTarget | null = null;
  private upscaleMesh: Mesh | null = null;
  private upscaleMaterial: ShaderMaterial | null = null;
  private upscaleScene: Scene | null = null;
  private upscaleCamera: OrthographicCamera | null = null;

  constructor(options: RetroPresetOptions = {}) {
    super({
      pixelRatio: 1,
      antialias: false,
      postProcessing: true,
      ...options,
    });

    this.retroOptions = {
      ...this.options,
      targetWidth: options.targetWidth ?? 320,
      targetHeight: options.targetHeight ?? 240,
      pixelSnap: options.pixelSnap ?? true,
      palette: options.palette ?? [],
      scanlines: options.scanlines ?? false,
      scanlineIntensity: options.scanlineIntensity ?? 0.15,
      crtCurvature: options.crtCurvature ?? false,
      curvatureAmount: options.curvatureAmount ?? 0.1,
      dithering: options.dithering ?? false,
      ditherSize: options.ditherSize ?? 2,
    };

    this.setupEffects();
  }

  private setupEffects(): void {
    if (this.retroOptions.scanlines) {
      this.addEffect({
        name: 'scanlines',
        enabled: true,
        priority: 10,
        params: {
          intensity: this.retroOptions.scanlineIntensity,
        },
      });
    }

    if (this.retroOptions.crtCurvature) {
      this.addEffect({
        name: 'crtCurvature',
        enabled: true,
        priority: 20,
        params: {
          amount: this.retroOptions.curvatureAmount,
        },
      });
    }

    if (this.retroOptions.palette.length > 0) {
      this.addEffect({
        name: 'palette',
        enabled: true,
        priority: 5,
        params: {
          colors: this.retroOptions.palette,
        },
      });
    }

    if (this.retroOptions.dithering) {
      this.addEffect({
        name: 'dither',
        enabled: true,
        priority: 4,
        params: {
          size: this.retroOptions.ditherSize,
        },
      });
    }
  }

  init(renderer: WebGLRenderer): void {
    this.renderer = renderer;
    this.applyRendererSettings(renderer);

    // Create low-resolution render target
    this.lowResTarget = new WebGLRenderTarget(
      this.retroOptions.targetWidth,
      this.retroOptions.targetHeight,
      {
        minFilter: NearestFilter,
        magFilter: NearestFilter,
        generateMipmaps: false,
      }
    );

    // Create upscale pass
    this.upscaleMaterial = this.createUpscaleMaterial();
    const geometry = new PlaneGeometry(2, 2);
    this.upscaleMesh = new Mesh(geometry, this.upscaleMaterial);
    this.upscaleScene = new Scene();
    this.upscaleScene.add(this.upscaleMesh);
    this.upscaleCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  private createUpscaleMaterial(): ShaderMaterial {
    // Shader with scanlines and CRT effects
    return new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        resolution: { value: [this.retroOptions.targetWidth, this.retroOptions.targetHeight] },
        scanlineIntensity: { value: this.retroOptions.scanlineIntensity },
        curvatureAmount: { value: this.retroOptions.curvatureAmount },
        enableScanlines: { value: this.retroOptions.scanlines },
        enableCurvature: { value: this.retroOptions.crtCurvature },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 resolution;
        uniform float scanlineIntensity;
        uniform float curvatureAmount;
        uniform bool enableScanlines;
        uniform bool enableCurvature;
        varying vec2 vUv;

        vec2 curveUV(vec2 uv) {
          if (!enableCurvature) return uv;
          uv = uv * 2.0 - 1.0;
          vec2 offset = abs(uv.yx) / vec2(6.0 / curvatureAmount);
          uv = uv + uv * offset * offset;
          uv = uv * 0.5 + 0.5;
          return uv;
        }

        void main() {
          vec2 uv = curveUV(vUv);

          // Out of bounds check
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
          }

          vec4 color = texture2D(tDiffuse, uv);

          // Scanlines
          if (enableScanlines) {
            float scanline = sin(uv.y * resolution.y * 3.14159) * 0.5 + 0.5;
            color.rgb *= 1.0 - scanlineIntensity * (1.0 - scanline);
          }

          gl_FragColor = color;
        }
      `,
    });
  }

  configure2D(renderer2D: Renderer2D): void {
    this.renderer2D = renderer2D;
    // Configure for pixel-perfect rendering
    // Could add pixel snapping logic here
  }

  render(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
    if (!this.lowResTarget || !this.upscaleMesh || !this.upscaleScene || !this.upscaleCamera) {
      return;
    }

    // Render scene to low-res target
    renderer.setRenderTarget(this.lowResTarget);
    renderer.render(scene, camera);

    // Render upscaled to screen
    renderer.setRenderTarget(null);
    (this.upscaleMaterial!.uniforms.tDiffuse as any).value = this.lowResTarget.texture;
    renderer.render(this.upscaleScene, this.upscaleCamera);
  }

  /**
   * Set target resolution.
   */
  setResolution(width: number, height: number): this {
    this.retroOptions.targetWidth = width;
    this.retroOptions.targetHeight = height;

    if (this.lowResTarget) {
      this.lowResTarget.setSize(width, height);
    }

    if (this.upscaleMaterial) {
      (this.upscaleMaterial.uniforms.resolution as any).value = [width, height];
    }

    return this;
  }

  /**
   * Set color palette.
   */
  setPalette(colors: number[]): this {
    this.retroOptions.palette = colors;
    this.setEffectParams('palette', { colors });
    return this;
  }

  /**
   * Toggle scanlines.
   */
  setScanlines(enabled: boolean, intensity?: number): this {
    this.retroOptions.scanlines = enabled;
    if (intensity !== undefined) {
      this.retroOptions.scanlineIntensity = intensity;
    }

    if (this.upscaleMaterial) {
      (this.upscaleMaterial.uniforms.enableScanlines as any).value = enabled;
      (this.upscaleMaterial.uniforms.scanlineIntensity as any).value = this.retroOptions.scanlineIntensity;
    }

    return this;
  }

  /**
   * Toggle CRT curvature.
   */
  setCurvature(enabled: boolean, amount?: number): this {
    this.retroOptions.crtCurvature = enabled;
    if (amount !== undefined) {
      this.retroOptions.curvatureAmount = amount;
    }

    if (this.upscaleMaterial) {
      (this.upscaleMaterial.uniforms.enableCurvature as any).value = enabled;
      (this.upscaleMaterial.uniforms.curvatureAmount as any).value = this.retroOptions.curvatureAmount;
    }

    return this;
  }

  dispose(): void {
    this.lowResTarget?.dispose();
    this.upscaleMaterial?.dispose();
    this.upscaleMesh?.geometry.dispose();
  }
}
```

---

### 4. HD Preset

**packages/presets/src/HDPreset.ts:**

```typescript
import {
  WebGLRenderer,
  Scene,
  Camera,
} from 'three';
import { BasePreset } from './BasePreset';
import type { HDPresetOptions } from './types';
import type { Renderer2D } from '@three-flatland/core';

/**
 * HD preset for smooth, high-DPI rendering.
 *
 * Features:
 * - High pixel ratio
 * - MSAA anti-aliasing
 * - Bloom effect
 * - Vignette
 * - Color grading
 *
 * @example
 * ```typescript
 * const preset = new HDPreset({
 *   bloom: true,
 *   bloomIntensity: 0.5,
 *   vignette: true,
 *   colorGrading: true,
 * });
 * ```
 */
export class HDPreset extends BasePreset {
  private hdOptions: Required<HDPresetOptions>;

  constructor(options: HDPresetOptions = {}) {
    super({
      pixelRatio: window.devicePixelRatio ?? 1,
      antialias: true,
      postProcessing: true,
      ...options,
    });

    this.hdOptions = {
      ...this.options,
      msaaSamples: options.msaaSamples ?? 4,
      bloom: options.bloom ?? false,
      bloomIntensity: options.bloomIntensity ?? 0.3,
      bloomThreshold: options.bloomThreshold ?? 0.8,
      vignette: options.vignette ?? false,
      vignetteIntensity: options.vignetteIntensity ?? 0.3,
      colorGrading: options.colorGrading ?? false,
      colorTemperature: options.colorTemperature ?? 0,
      saturation: options.saturation ?? 1,
      contrast: options.contrast ?? 1,
    };

    this.setupEffects();
  }

  private setupEffects(): void {
    if (this.hdOptions.bloom) {
      this.addEffect({
        name: 'bloom',
        enabled: true,
        priority: 10,
        params: {
          intensity: this.hdOptions.bloomIntensity,
          threshold: this.hdOptions.bloomThreshold,
        },
      });
    }

    if (this.hdOptions.vignette) {
      this.addEffect({
        name: 'vignette',
        enabled: true,
        priority: 20,
        params: {
          intensity: this.hdOptions.vignetteIntensity,
        },
      });
    }

    if (this.hdOptions.colorGrading) {
      this.addEffect({
        name: 'colorGrading',
        enabled: true,
        priority: 30,
        params: {
          temperature: this.hdOptions.colorTemperature,
          saturation: this.hdOptions.saturation,
          contrast: this.hdOptions.contrast,
        },
      });
    }
  }

  init(renderer: WebGLRenderer): void {
    this.renderer = renderer;
    this.applyRendererSettings(renderer);

    // Configure for HD rendering
    renderer.setPixelRatio(this.hdOptions.pixelRatio);
  }

  configure2D(renderer2D: Renderer2D): void {
    this.renderer2D = renderer2D;
    // HD-specific configuration
  }

  render(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
    // Basic render (post-processing would be added separately)
    renderer.render(scene, camera);
  }

  /**
   * Set bloom parameters.
   */
  setBloom(intensity: number, threshold?: number): this {
    this.hdOptions.bloomIntensity = intensity;
    if (threshold !== undefined) {
      this.hdOptions.bloomThreshold = threshold;
    }
    this.setEffectParams('bloom', {
      intensity,
      threshold: this.hdOptions.bloomThreshold,
    });
    return this;
  }

  /**
   * Set vignette intensity.
   */
  setVignette(intensity: number): this {
    this.hdOptions.vignetteIntensity = intensity;
    this.setEffectParams('vignette', { intensity });
    return this;
  }

  /**
   * Set color grading parameters.
   */
  setColorGrading(params: {
    temperature?: number;
    saturation?: number;
    contrast?: number;
  }): this {
    if (params.temperature !== undefined) {
      this.hdOptions.colorTemperature = params.temperature;
    }
    if (params.saturation !== undefined) {
      this.hdOptions.saturation = params.saturation;
    }
    if (params.contrast !== undefined) {
      this.hdOptions.contrast = params.contrast;
    }
    this.setEffectParams('colorGrading', {
      temperature: this.hdOptions.colorTemperature,
      saturation: this.hdOptions.saturation,
      contrast: this.hdOptions.contrast,
    });
    return this;
  }

  dispose(): void {
    // Cleanup
  }
}
```

---

### 5. VFX Preset

**packages/presets/src/VFXPreset.ts:**

```typescript
import {
  WebGLRenderer,
  Scene,
  Camera,
} from 'three';
import { BasePreset } from './BasePreset';
import type { VFXPresetOptions } from './types';
import type { Renderer2D } from '@three-flatland/core';

/**
 * VFX preset optimized for particle effects and visual flourishes.
 *
 * Features:
 * - Strong bloom for glowing effects
 * - Motion blur for trails
 * - Chromatic aberration
 * - Glow effects
 * - Trail persistence
 *
 * @example
 * ```typescript
 * const preset = new VFXPreset({
 *   bloom: true,
 *   bloomIntensity: 1.5,
 *   trails: true,
 *   trailDecay: 0.9,
 * });
 * ```
 */
export class VFXPreset extends BasePreset {
  private vfxOptions: Required<VFXPresetOptions>;

  constructor(options: VFXPresetOptions = {}) {
    super({
      pixelRatio: window.devicePixelRatio ?? 1,
      antialias: true,
      postProcessing: true,
      transparent: true,
      ...options,
    });

    this.vfxOptions = {
      ...this.options,
      bloom: options.bloom ?? true,
      bloomIntensity: options.bloomIntensity ?? 1.0,
      motionBlur: options.motionBlur ?? false,
      motionBlurSamples: options.motionBlurSamples ?? 8,
      chromaticAberration: options.chromaticAberration ?? false,
      chromaticIntensity: options.chromaticIntensity ?? 0.01,
      glow: options.glow ?? false,
      glowColor: options.glowColor ?? 0xffffff,
      trails: options.trails ?? false,
      trailDecay: options.trailDecay ?? 0.95,
    };

    this.setupEffects();
  }

  private setupEffects(): void {
    if (this.vfxOptions.bloom) {
      this.addEffect({
        name: 'bloom',
        enabled: true,
        priority: 5,
        params: {
          intensity: this.vfxOptions.bloomIntensity,
          threshold: 0.3, // Lower threshold for more glow
        },
      });
    }

    if (this.vfxOptions.trails) {
      this.addEffect({
        name: 'trails',
        enabled: true,
        priority: 1,
        params: {
          decay: this.vfxOptions.trailDecay,
        },
      });
    }

    if (this.vfxOptions.motionBlur) {
      this.addEffect({
        name: 'motionBlur',
        enabled: true,
        priority: 2,
        params: {
          samples: this.vfxOptions.motionBlurSamples,
        },
      });
    }

    if (this.vfxOptions.chromaticAberration) {
      this.addEffect({
        name: 'chromaticAberration',
        enabled: true,
        priority: 15,
        params: {
          intensity: this.vfxOptions.chromaticIntensity,
        },
      });
    }

    if (this.vfxOptions.glow) {
      this.addEffect({
        name: 'glow',
        enabled: true,
        priority: 10,
        params: {
          color: this.vfxOptions.glowColor,
        },
      });
    }
  }

  init(renderer: WebGLRenderer): void {
    this.renderer = renderer;
    this.applyRendererSettings(renderer);
  }

  configure2D(renderer2D: Renderer2D): void {
    this.renderer2D = renderer2D;
    // VFX-specific configuration
  }

  render(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
    renderer.render(scene, camera);
  }

  /**
   * Set bloom for glow effects.
   */
  setBloom(intensity: number): this {
    this.vfxOptions.bloomIntensity = intensity;
    this.setEffectParams('bloom', { intensity });
    return this;
  }

  /**
   * Set trail persistence.
   */
  setTrails(enabled: boolean, decay?: number): this {
    this.vfxOptions.trails = enabled;
    if (decay !== undefined) {
      this.vfxOptions.trailDecay = decay;
    }
    this.setEffectEnabled('trails', enabled);
    this.setEffectParams('trails', { decay: this.vfxOptions.trailDecay });
    return this;
  }

  /**
   * Set chromatic aberration.
   */
  setChromaticAberration(intensity: number): this {
    this.vfxOptions.chromaticIntensity = intensity;
    this.setEffectParams('chromaticAberration', { intensity });
    return this;
  }

  dispose(): void {
    // Cleanup
  }
}
```

---

### 6. Preset Composition

**packages/presets/src/CompositePreset.ts:**

```typescript
import {
  WebGLRenderer,
  Scene,
  Camera,
} from 'three';
import { BasePreset } from './BasePreset';
import type { PresetOptions, PostEffect } from './types';
import type { Renderer2D } from '@three-flatland/core';

/**
 * Compose multiple presets together.
 *
 * @example
 * ```typescript
 * const preset = new CompositePreset([
 *   new RetroPreset({ targetWidth: 320, targetHeight: 240 }),
 *   new VFXPreset({ bloom: true }),
 * ]);
 * ```
 */
export class CompositePreset extends BasePreset {
  private presets: BasePreset[];

  constructor(presets: BasePreset[], options: PresetOptions = {}) {
    super(options);
    this.presets = presets;

    // Merge effects from all presets
    for (const preset of presets) {
      for (const effect of preset.getEffects()) {
        this.addEffect({ ...effect });
      }
    }
  }

  init(renderer: WebGLRenderer): void {
    this.renderer = renderer;

    // Initialize all presets
    for (const preset of this.presets) {
      preset.init(renderer);
    }
  }

  configure2D(renderer2D: Renderer2D): void {
    this.renderer2D = renderer2D;

    // Configure all presets
    for (const preset of this.presets) {
      preset.configure2D(renderer2D);
    }
  }

  render(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
    // First preset handles base rendering
    if (this.presets.length > 0) {
      this.presets[0]!.render(renderer, scene, camera);
    } else {
      renderer.render(scene, camera);
    }
  }

  dispose(): void {
    for (const preset of this.presets) {
      preset.dispose();
    }
  }
}
```

---

### 7. Exports

**packages/presets/src/index.ts:**

```typescript
// Base
export { BasePreset } from './BasePreset';

// Presets
export { RetroPreset, PALETTES } from './RetroPreset';
export { HDPreset } from './HDPreset';
export { VFXPreset } from './VFXPreset';
export { CompositePreset } from './CompositePreset';

// Types
export type {
  PresetOptions,
  RetroPresetOptions,
  HDPresetOptions,
  VFXPresetOptions,
  PostEffect,
  PostProcessorOptions,
} from './types';
```

---

### 8. Tests

**packages/presets/src/RetroPreset.test.ts:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebGLRenderer } from 'three';
import { RetroPreset, PALETTES } from './RetroPreset';

describe('RetroPreset', () => {
  it('should create with default options', () => {
    const preset = new RetroPreset();

    expect(preset).toBeDefined();
  });

  it('should have pixel ratio of 1', () => {
    const preset = new RetroPreset();

    expect(preset['options'].pixelRatio).toBe(1);
  });

  it('should configure scanline effect', () => {
    const preset = new RetroPreset({
      scanlines: true,
      scanlineIntensity: 0.2,
    });

    const effects = preset.getEffects();
    const scanlineEffect = effects.find((e) => e.name === 'scanlines');

    expect(scanlineEffect).toBeDefined();
    expect(scanlineEffect?.params.intensity).toBe(0.2);
  });

  it('should configure palette effect', () => {
    const preset = new RetroPreset({
      palette: PALETTES.PICO8,
    });

    const effects = preset.getEffects();
    const paletteEffect = effects.find((e) => e.name === 'palette');

    expect(paletteEffect).toBeDefined();
    expect(paletteEffect?.params.colors).toEqual(PALETTES.PICO8);
  });

  it('should allow changing resolution', () => {
    const preset = new RetroPreset({
      targetWidth: 320,
      targetHeight: 240,
    });

    preset.setResolution(640, 480);

    expect(preset['retroOptions'].targetWidth).toBe(640);
    expect(preset['retroOptions'].targetHeight).toBe(480);
  });
});

describe('HDPreset', () => {
  it('should create with device pixel ratio', () => {
    const preset = new HDPreset();

    expect(preset['options'].pixelRatio).toBeGreaterThanOrEqual(1);
  });

  it('should configure bloom effect', () => {
    const preset = new HDPreset({
      bloom: true,
      bloomIntensity: 0.5,
    });

    const effects = preset.getEffects();
    const bloomEffect = effects.find((e) => e.name === 'bloom');

    expect(bloomEffect).toBeDefined();
    expect(bloomEffect?.params.intensity).toBe(0.5);
  });
});

describe('VFXPreset', () => {
  it('should enable bloom by default', () => {
    const preset = new VFXPreset();

    const effects = preset.getEffects();
    const bloomEffect = effects.find((e) => e.name === 'bloom');

    expect(bloomEffect).toBeDefined();
    expect(bloomEffect?.enabled).toBe(true);
  });

  it('should configure trails effect', () => {
    const preset = new VFXPreset({
      trails: true,
      trailDecay: 0.9,
    });

    const effects = preset.getEffects();
    const trailsEffect = effects.find((e) => e.name === 'trails');

    expect(trailsEffect).toBeDefined();
    expect(trailsEffect?.params.decay).toBe(0.9);
  });
});
```

---

## Acceptance Criteria

- [ ] `RetroPreset` renders pixel-perfect at target resolution
- [ ] Scanlines and CRT curvature effects work correctly
- [ ] Color palette quantization works
- [ ] `HDPreset` renders at high DPI with smooth edges
- [ ] Bloom effect works correctly
- [ ] Vignette effect works correctly
- [ ] `VFXPreset` provides strong glow and trail effects
- [ ] Presets can be composed together
- [ ] All effects can be enabled/disabled dynamically
- [ ] All tests pass

---

## Example Usage

```typescript
import {
  RetroPreset,
  HDPreset,
  VFXPreset,
  PALETTES,
} from '@three-flatland/presets';

// Create a retro-style game
const retroPreset = new RetroPreset({
  targetWidth: 320,
  targetHeight: 240,
  palette: PALETTES.PICO8,
  scanlines: true,
  crtCurvature: true,
});

retroPreset.init(renderer);

// Create an HD mobile game
const hdPreset = new HDPreset({
  bloom: true,
  bloomIntensity: 0.3,
  vignette: true,
  colorGrading: true,
  saturation: 1.1,
});

hdPreset.init(renderer);

// Create a particle-heavy VFX scene
const vfxPreset = new VFXPreset({
  bloom: true,
  bloomIntensity: 1.5,
  trails: true,
  trailDecay: 0.95,
  chromaticAberration: true,
});

vfxPreset.init(renderer);

// Render loop
function animate() {
  retroPreset.render(renderer, scene, camera);
  requestAnimationFrame(animate);
}
```

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Performance impact of effects | Medium | Medium | Provide disable options |
| Browser shader compatibility | Low | Medium | Test across browsers |
| Visual inconsistency | Low | Low | Provide examples |
| Effect combination issues | Medium | Low | Test compositions |

---

## Dependencies for Next Milestone

M12 (Documentation & Launch) requires:
- Complete preset system for examples

---

## Estimated Effort

| Task | Hours |
|------|-------|
| Type definitions | 2 |
| BasePreset | 3 |
| RetroPreset | 8 |
| HDPreset | 4 |
| VFXPreset | 4 |
| CompositePreset | 2 |
| Post-processing integration | 6 |
| Tests | 4 |
| Documentation | 2 |
| **Total** | **35 hours** (~2 weeks) |

---

*End of M11: Presets & Post-Processing*
