# M6: TSL Nodes Part 2 - Lighting & Effects

## Milestone Overview

| Field | Value |
|-------|-------|
| **Duration** | 2 weeks |
| **Dependencies** | M4 (TSL Nodes Part 1) |
| **Outputs** | 15+ lighting/effect nodes, composable shader effects |
| **Risk Level** | Medium (building on established TSL patterns) |

---

## Objectives

1. Implement 2D lighting nodes (ambient, point, spot, normal mapping)
2. Create post-processing effect nodes (blur, glow, shadow, distortion)
3. Build retro/stylized effect nodes (CRT, dither, palette swap)
4. Ensure all nodes are composable and chainable
5. Optimize for batched sprite rendering performance
6. Maintain WebGL/WebGPU compatibility
7. **Integrate lighting with layer system for batched rendering**

---

## Integration with TSL-Native Batching

### Effect Categories

M6 nodes fall into three categories based on how they integrate with rendering:

| Category | Scope | How to Use | Batching |
|----------|-------|------------|----------|
| **Sprite Lighting** | Per-material | Compose into `Sprite2DMaterial.colorNode` | ✅ Same material = batched |
| **Scene Lighting** | All sprites | Pass light uniforms to materials | ✅ Shared uniforms |
| **Post-Processing** | Final output | Separate render pass | N/A |

### Lighting in Materials

Lighting nodes compose into `Sprite2DMaterial` like any other TSL node:

```typescript
import { Sprite2DMaterial, pointLight2D, ambientLight2D, combineLights2D } from '@three-flatland/core';
import { texture, uv, uniform } from 'three/tsl';

// Create lights (uniform-based, animatable)
const ambient = ambientLight2D({ color: 0x202040, intensity: 0.3 });
const torch = pointLight2D({
  position: uniform(new Vector2(100, 200)),
  color: 0xff8844,
  intensity: 1.0,
  radius: 150,
});

// Create lit material
const litMaterial = new Sprite2DMaterial({ texture: heroTexture });
const lighting = combineLights2D({ ambient, pointLights: [torch] });

litMaterial.colorNode = Fn(({ position }) => {
  const baseColor = texture(litMaterial.map, uv());
  return lighting.apply(baseColor, position.xy);
})();

// All sprites with litMaterial are lit and batch together
const player = new Sprite2D({ material: litMaterial });
const enemy = new Sprite2D({ material: litMaterial });

// Animate lights (uniforms update, shader stays same)
function animate() {
  torch.setPosition(100 + Math.cos(time) * 50, 200);
  torch.setIntensity(0.8 + Math.sin(time * 10) * 0.2);
}
```

### Post-Processing Effects

Effects like CRT, vignette, blur operate on the **rendered output**, not individual sprites:

```typescript
import { Renderer2D, PostProcessor, crt2D, vignette2D } from '@three-flatland/core';

const postProcessor = new PostProcessor();

// Add post-processing effects (TSL-based)
postProcessor.addEffect(crt2D({
  scanlineIntensity: 0.4,
  curvature: 0.02,
}));

postProcessor.addEffect(vignette2D({
  innerRadius: 0.3,
  outerRadius: 0.9,
}));

// Render with post-processing
function animate() {
  renderer2D.render(renderer, camera, postProcessor.inputTexture);
  postProcessor.render(renderer);
}
```

---

## Architecture

```
+-----------------------------------------------------------------------------+
|                        TSL LIGHTING & EFFECTS SYSTEM                         |
+-----------------------------------------------------------------------------+
|                                                                             |
|  LIGHTING NODES                                                             |
|  +-----------------------------------------------------------------------+  |
|  |  ambientLight2D    Global ambient illumination                        |  |
|  |  pointLight2D      Radial falloff light source                        |  |
|  |  spotLight2D       Directional cone light                             |  |
|  |  normalMap2D       Normal-based lighting for sprites                  |  |
|  |  emission2D        Self-illumination/glow source                      |  |
|  +-----------------------------------------------------------------------+  |
|                              |                                              |
|                              v combines with                                |
|  EFFECT NODES                                                              |
|  +-----------------------------------------------------------------------+  |
|  |  BLUR/GLOW           DISTORTION           RETRO/STYLE                 |  |
|  |  +-------------+     +-------------+      +-------------+             |  |
|  |  | blur2D      |     | distortion2D|      | crt2D       |             |  |
|  |  | glow2D      |     | chromatic2D |      | dither2D    |             |  |
|  |  | shadow2D    |     |             |      | palette2D   |             |  |
|  |  +-------------+     +-------------+      | vignette2D  |             |  |
|  |                                           | noise2D     |             |  |
|  |                                           +-------------+             |  |
|  +-----------------------------------------------------------------------+  |
|                                                                             |
|  COMPOSITION: color.pipe(lighting).pipe(glow).pipe(crt).pipe(vignette)     |
|                                                                             |
+-----------------------------------------------------------------------------+
```

---

## Detailed Implementation

### 1. Type Definitions

**packages/core/src/nodes/lighting/types.ts:**

```typescript
import type { Color, Vector2, Vector3, Texture } from 'three';
import type { ShaderNodeObject, Node } from 'three/tsl';

/**
 * 2D light source configuration.
 */
export interface Light2DConfig {
  /** Light color */
  color: Color | string | number;
  /** Light intensity (0-1+) */
  intensity: number;
  /** Whether light is enabled */
  enabled?: boolean;
}

/**
 * Point light configuration.
 */
export interface PointLight2DConfig extends Light2DConfig {
  /** Light position in world space */
  position: Vector2 | [number, number];
  /** Maximum light radius */
  radius: number;
  /** Falloff exponent (1 = linear, 2 = quadratic) */
  falloff?: number;
}

/**
 * Spot light configuration.
 */
export interface SpotLight2DConfig extends Light2DConfig {
  /** Light position in world space */
  position: Vector2 | [number, number];
  /** Light direction (normalized) */
  direction: Vector2 | [number, number];
  /** Inner cone angle in radians */
  innerAngle: number;
  /** Outer cone angle in radians */
  outerAngle: number;
  /** Maximum light range */
  range: number;
  /** Falloff exponent */
  falloff?: number;
}

/**
 * Normal map lighting configuration.
 */
export interface NormalMap2DConfig {
  /** Normal map texture */
  normalMap: Texture;
  /** Normal map strength (0-1) */
  strength?: number;
  /** Light direction for normal mapping */
  lightDirection?: Vector3 | [number, number, number];
}

/**
 * Emission configuration.
 */
export interface Emission2DConfig {
  /** Emission color */
  color?: Color | string | number;
  /** Emission intensity multiplier */
  intensity?: number;
  /** Emission mask texture (optional) */
  mask?: Texture;
}

/**
 * Lighting result for combining multiple lights.
 */
export interface LightingResult {
  /** Combined diffuse lighting */
  diffuse: ShaderNodeObject<Node>;
  /** Combined specular lighting (if applicable) */
  specular?: ShaderNodeObject<Node>;
}
```

---

### 2. Ambient Light Node

**packages/core/src/nodes/lighting/ambientLight2D.ts:**

```typescript
import {
  Fn,
  vec3,
  vec4,
  uniform,
  float,
  mul,
} from 'three/tsl';
import { Color, Vector3 } from 'three';
import type { ShaderNodeObject, Node } from 'three/tsl';

export interface AmbientLight2DOptions {
  /** Ambient color (default: white) */
  color?: Color | string | number;
  /** Ambient intensity (default: 0.3) */
  intensity?: number;
}

/**
 * Creates an ambient light node for global illumination.
 *
 * Provides uniform base lighting across all sprites.
 *
 * @example
 * ```typescript
 * const ambient = ambientLight2D({ color: 0x404080, intensity: 0.4 });
 * material.colorNode = baseColor.mul(ambient);
 * ```
 */
export const ambientLight2D = (options: AmbientLight2DOptions = {}) => {
  const color = uniform(
    options.color instanceof Color
      ? options.color
      : new Color(options.color ?? 0xffffff)
  );
  const intensity = uniform(options.intensity ?? 0.3);

  const node = Fn(() => {
    return vec3(color).mul(intensity);
  })();

  // Expose uniforms for runtime updates
  return Object.assign(node, {
    color,
    intensity,
    setColor: (c: Color | string | number) => {
      if (c instanceof Color) {
        color.value.copy(c);
      } else {
        color.value.set(c);
      }
    },
    setIntensity: (i: number) => {
      intensity.value = i;
    },
  });
};

export type AmbientLight2DNode = ReturnType<typeof ambientLight2D>;
```

---

### 3. Point Light Node

**packages/core/src/nodes/lighting/pointLight2D.ts:**

```typescript
import {
  Fn,
  vec2,
  vec3,
  vec4,
  uniform,
  float,
  sub,
  length,
  div,
  clamp,
  pow,
  mul,
  max,
} from 'three/tsl';
import { Color, Vector2 } from 'three';
import type { ShaderNodeObject, Node } from 'three/tsl';
import type { PointLight2DConfig } from './types';

export interface PointLight2DOptions extends Partial<PointLight2DConfig> {}

/**
 * Creates a point light node with radial falloff.
 *
 * Simulates a light source emanating from a single point.
 *
 * @example
 * ```typescript
 * const torch = pointLight2D({
 *   position: [100, 200],
 *   color: 0xff8800,
 *   intensity: 1.0,
 *   radius: 150,
 *   falloff: 2,
 * });
 *
 * // In material, combine with world position
 * material.colorNode = Fn(({ worldPosition }) => {
 *   const lighting = torch.calculate(worldPosition.xy);
 *   return baseColor.mul(vec4(lighting, 1.0));
 * })();
 * ```
 */
export const pointLight2D = (options: PointLight2DOptions = {}) => {
  const position = uniform(
    options.position instanceof Vector2
      ? options.position
      : new Vector2(...(options.position ?? [0, 0]))
  );
  const color = uniform(
    options.color instanceof Color
      ? options.color
      : new Color(options.color ?? 0xffffff)
  );
  const intensity = uniform(options.intensity ?? 1.0);
  const radius = uniform(options.radius ?? 100);
  const falloff = uniform(options.falloff ?? 2);
  const enabled = uniform(options.enabled !== false ? 1.0 : 0.0);

  /**
   * Calculate light contribution at a given world position.
   */
  const calculate = (worldPos: ShaderNodeObject<Node>) => {
    return Fn(() => {
      // Distance from light to fragment
      const toLight = sub(vec2(position), worldPos);
      const dist = length(toLight);

      // Normalized distance (0 at center, 1 at radius)
      const normalizedDist = clamp(div(dist, radius), 0, 1);

      // Falloff attenuation
      const attenuation = pow(sub(float(1), normalizedDist), falloff);

      // Final light contribution
      const contribution = mul(vec3(color), mul(intensity, attenuation));

      // Apply enabled flag
      return mul(contribution, enabled);
    })();
  };

  return {
    calculate,
    position,
    color,
    intensity,
    radius,
    falloff,
    enabled,
    setPosition: (x: number, y: number) => {
      position.value.set(x, y);
    },
    setColor: (c: Color | string | number) => {
      if (c instanceof Color) {
        color.value.copy(c);
      } else {
        color.value.set(c);
      }
    },
    setIntensity: (i: number) => {
      intensity.value = i;
    },
    setRadius: (r: number) => {
      radius.value = r;
    },
    setEnabled: (e: boolean) => {
      enabled.value = e ? 1.0 : 0.0;
    },
  };
};

export type PointLight2DNode = ReturnType<typeof pointLight2D>;
```

---

### 4. Spot Light Node

**packages/core/src/nodes/lighting/spotLight2D.ts:**

```typescript
import {
  Fn,
  vec2,
  vec3,
  uniform,
  float,
  sub,
  length,
  div,
  clamp,
  pow,
  mul,
  dot,
  normalize,
  smoothstep,
} from 'three/tsl';
import { Color, Vector2 } from 'three';
import type { ShaderNodeObject, Node } from 'three/tsl';
import type { SpotLight2DConfig } from './types';

export interface SpotLight2DOptions extends Partial<SpotLight2DConfig> {}

/**
 * Creates a spot light node with directional cone.
 *
 * Simulates a focused beam of light with inner/outer cone angles.
 *
 * @example
 * ```typescript
 * const flashlight = spotLight2D({
 *   position: [400, 300],
 *   direction: [1, 0],
 *   color: 0xffffee,
 *   intensity: 1.5,
 *   innerAngle: Math.PI / 8,
 *   outerAngle: Math.PI / 4,
 *   range: 300,
 * });
 * ```
 */
export const spotLight2D = (options: SpotLight2DOptions = {}) => {
  const position = uniform(
    options.position instanceof Vector2
      ? options.position
      : new Vector2(...(options.position ?? [0, 0]))
  );
  const direction = uniform(
    options.direction instanceof Vector2
      ? options.direction.clone().normalize()
      : new Vector2(...(options.direction ?? [1, 0])).normalize()
  );
  const color = uniform(
    options.color instanceof Color
      ? options.color
      : new Color(options.color ?? 0xffffff)
  );
  const intensity = uniform(options.intensity ?? 1.0);
  const innerAngle = uniform(options.innerAngle ?? Math.PI / 6);
  const outerAngle = uniform(options.outerAngle ?? Math.PI / 4);
  const range = uniform(options.range ?? 200);
  const falloff = uniform(options.falloff ?? 1);
  const enabled = uniform(options.enabled !== false ? 1.0 : 0.0);

  /**
   * Calculate spot light contribution at a given world position.
   */
  const calculate = (worldPos: ShaderNodeObject<Node>) => {
    return Fn(() => {
      // Vector from light to fragment
      const toFragment = sub(worldPos, vec2(position));
      const dist = length(toFragment);

      // Direction to fragment (normalized)
      const dirToFragment = normalize(toFragment);

      // Angle between light direction and fragment direction
      const cosAngle = dot(vec2(direction), dirToFragment);

      // Cone attenuation
      const cosInner = float(Math.cos(innerAngle.value));
      const cosOuter = float(Math.cos(outerAngle.value));
      const coneAttenuation = smoothstep(cosOuter, cosInner, cosAngle);

      // Distance attenuation
      const normalizedDist = clamp(div(dist, range), 0, 1);
      const distAttenuation = pow(sub(float(1), normalizedDist), falloff);

      // Combined attenuation
      const totalAttenuation = mul(coneAttenuation, distAttenuation);

      // Final contribution
      const contribution = mul(vec3(color), mul(intensity, totalAttenuation));

      return mul(contribution, enabled);
    })();
  };

  return {
    calculate,
    position,
    direction,
    color,
    intensity,
    innerAngle,
    outerAngle,
    range,
    falloff,
    enabled,
    setPosition: (x: number, y: number) => {
      position.value.set(x, y);
    },
    setDirection: (x: number, y: number) => {
      direction.value.set(x, y).normalize();
    },
    setColor: (c: Color | string | number) => {
      if (c instanceof Color) {
        color.value.copy(c);
      } else {
        color.value.set(c);
      }
    },
    setIntensity: (i: number) => {
      intensity.value = i;
    },
    setAngles: (inner: number, outer: number) => {
      innerAngle.value = inner;
      outerAngle.value = outer;
    },
    setRange: (r: number) => {
      range.value = r;
    },
    setEnabled: (e: boolean) => {
      enabled.value = e ? 1.0 : 0.0;
    },
  };
};

export type SpotLight2DNode = ReturnType<typeof spotLight2D>;
```

---

### 5. Normal Map Node

**packages/core/src/nodes/lighting/normalMap2D.ts:**

```typescript
import {
  Fn,
  vec2,
  vec3,
  vec4,
  uniform,
  float,
  texture,
  uv,
  sub,
  mul,
  normalize,
  dot,
  max,
  mix,
} from 'three/tsl';
import { Color, Vector3, Texture } from 'three';
import type { ShaderNodeObject, Node } from 'three/tsl';

export interface NormalMap2DOptions {
  /** Normal map texture */
  normalMap: Texture;
  /** Normal map strength (0-1, default: 1) */
  strength?: number;
  /** Default light direction (default: [0, 0, 1] - facing camera) */
  lightDirection?: Vector3 | [number, number, number];
}

/**
 * Creates a normal map node for per-pixel lighting on sprites.
 *
 * Samples a normal map and calculates lighting based on surface normals.
 *
 * @example
 * ```typescript
 * const normals = normalMap2D({
 *   normalMap: normalTexture,
 *   strength: 0.8,
 * });
 *
 * // Calculate lighting from a direction
 * const lighting = normals.calculate(lightDir);
 * material.colorNode = baseColor.mul(lighting);
 * ```
 */
export const normalMap2D = (options: NormalMap2DOptions) => {
  const normalMap = options.normalMap;
  const strength = uniform(options.strength ?? 1.0);
  const defaultLightDir = uniform(
    options.lightDirection instanceof Vector3
      ? options.lightDirection.clone().normalize()
      : new Vector3(...(options.lightDirection ?? [0, 0, 1])).normalize()
  );

  /**
   * Sample normal from map at current UV.
   */
  const sampleNormal = (uvCoord?: ShaderNodeObject<Node>) => {
    return Fn(() => {
      const coord = uvCoord ?? uv();
      // Sample normal map (assumed to be in tangent space)
      const normalSample = texture(normalMap, coord);

      // Convert from [0,1] to [-1,1] range
      const normal = sub(mul(normalSample.xyz, 2.0), 1.0);

      // Apply strength (blend toward flat normal [0,0,1])
      const flatNormal = vec3(0, 0, 1);
      return normalize(mix(flatNormal, normal, strength));
    })();
  };

  /**
   * Calculate diffuse lighting contribution from a light direction.
   */
  const calculate = (
    lightDir?: ShaderNodeObject<Node>,
    uvCoord?: ShaderNodeObject<Node>
  ) => {
    return Fn(() => {
      const normal = sampleNormal(uvCoord);
      const light = lightDir ? normalize(lightDir) : normalize(vec3(defaultLightDir));

      // Lambertian diffuse
      const NdotL = max(dot(normal, light), 0.0);

      return NdotL;
    })();
  };

  /**
   * Calculate lighting with ambient.
   */
  const calculateWithAmbient = (
    lightDir?: ShaderNodeObject<Node>,
    ambientStrength: number = 0.3,
    uvCoord?: ShaderNodeObject<Node>
  ) => {
    return Fn(() => {
      const diffuse = calculate(lightDir, uvCoord);
      return max(diffuse, float(ambientStrength));
    })();
  };

  return {
    sampleNormal,
    calculate,
    calculateWithAmbient,
    strength,
    defaultLightDir,
    setStrength: (s: number) => {
      strength.value = s;
    },
    setDefaultLightDirection: (x: number, y: number, z: number) => {
      defaultLightDir.value.set(x, y, z).normalize();
    },
  };
};

export type NormalMap2DNode = ReturnType<typeof normalMap2D>;
```

---

### 6. Emission Node

**packages/core/src/nodes/lighting/emission2D.ts:**

```typescript
import {
  Fn,
  vec3,
  vec4,
  uniform,
  float,
  texture,
  uv,
  mul,
  add,
} from 'three/tsl';
import { Color, Texture } from 'three';
import type { ShaderNodeObject, Node } from 'three/tsl';

export interface Emission2DOptions {
  /** Emission color (default: white) */
  color?: Color | string | number;
  /** Emission intensity (default: 1.0) */
  intensity?: number;
  /** Optional emission mask texture */
  mask?: Texture;
}

/**
 * Creates an emission node for self-illuminating sprites.
 *
 * Adds emissive light that ignores scene lighting.
 *
 * @example
 * ```typescript
 * const glow = emission2D({
 *   color: 0x00ff88,
 *   intensity: 2.0,
 *   mask: emissionMaskTexture,
 * });
 *
 * // Add emission to lit color
 * const finalColor = litColor.add(glow.calculate());
 * ```
 */
export const emission2D = (options: Emission2DOptions = {}) => {
  const color = uniform(
    options.color instanceof Color
      ? options.color
      : new Color(options.color ?? 0xffffff)
  );
  const intensity = uniform(options.intensity ?? 1.0);
  const hasMask = options.mask !== undefined;
  const mask = options.mask;

  /**
   * Calculate emission contribution.
   */
  const calculate = (uvCoord?: ShaderNodeObject<Node>) => {
    return Fn(() => {
      let emission = mul(vec3(color), intensity);

      if (hasMask && mask) {
        const coord = uvCoord ?? uv();
        const maskValue = texture(mask, coord).r;
        emission = mul(emission, maskValue);
      }

      return emission;
    })();
  };

  /**
   * Apply emission to a base color.
   */
  const apply = (
    baseColor: ShaderNodeObject<Node>,
    uvCoord?: ShaderNodeObject<Node>
  ) => {
    return Fn(() => {
      const emissionValue = calculate(uvCoord);
      return vec4(add(baseColor.rgb, emissionValue), baseColor.a);
    })();
  };

  return {
    calculate,
    apply,
    color,
    intensity,
    setColor: (c: Color | string | number) => {
      if (c instanceof Color) {
        color.value.copy(c);
      } else {
        color.value.set(c);
      }
    },
    setIntensity: (i: number) => {
      intensity.value = i;
    },
  };
};

export type Emission2DNode = ReturnType<typeof emission2D>;
```

---

### 7. Blur Node

**packages/core/src/nodes/effects/blur2D.ts:**

```typescript
import {
  Fn,
  vec2,
  vec4,
  uniform,
  float,
  texture,
  uv,
  add,
  mul,
  div,
  Loop,
} from 'three/tsl';
import { Vector2, Texture } from 'three';
import type { ShaderNodeObject, Node } from 'three/tsl';

export interface Blur2DOptions {
  /** Input texture to blur */
  map: Texture;
  /** Blur radius in pixels (default: 4) */
  radius?: number;
  /** Blur quality/samples (default: 8) */
  quality?: number;
  /** Blur direction for directional blur (default: both) */
  direction?: 'horizontal' | 'vertical' | 'both';
}

/**
 * Creates a Gaussian blur effect node.
 *
 * Uses separable blur for efficiency when quality > 4.
 *
 * @example
 * ```typescript
 * const blur = blur2D({
 *   map: sceneTexture,
 *   radius: 8,
 *   quality: 12,
 * });
 *
 * material.colorNode = blur.apply();
 * ```
 */
export const blur2D = (options: Blur2DOptions) => {
  const map = options.map;
  const radius = uniform(options.radius ?? 4);
  const quality = options.quality ?? 8;
  const direction = options.direction ?? 'both';

  // Texture size for pixel calculations
  const texelSize = uniform(
    new Vector2(1 / (map.image?.width ?? 1), 1 / (map.image?.height ?? 1))
  );

  /**
   * Apply Gaussian blur to texture.
   */
  const apply = (uvCoord?: ShaderNodeObject<Node>) => {
    return Fn(() => {
      const coord = uvCoord ?? uv();
      let color = vec4(0, 0, 0, 0);
      let totalWeight = float(0);

      // Gaussian kernel weights (approximation)
      const sigma = div(radius, float(2));

      // Sample in a circular/linear pattern
      const samples = quality;
      const step = div(mul(float(2), radius), float(samples - 1));

      // Simplified box blur with gaussian-like weighting
      for (let i = 0; i < samples; i++) {
        const offset = float(i - (samples - 1) / 2);
        const pixelOffset = mul(offset, step);

        // Gaussian weight approximation
        const weight = float(1.0 - Math.abs(i - (samples - 1) / 2) / ((samples - 1) / 2));

        if (direction === 'horizontal' || direction === 'both') {
          const hOffset = vec2(mul(pixelOffset, texelSize.x), 0);
          const hSample = texture(map, add(coord, hOffset));
          color = add(color, mul(hSample, weight));
          totalWeight = add(totalWeight, weight);
        }

        if (direction === 'vertical' || direction === 'both') {
          const vOffset = vec2(0, mul(pixelOffset, texelSize.y));
          const vSample = texture(map, add(coord, vOffset));
          color = add(color, mul(vSample, weight));
          totalWeight = add(totalWeight, weight);
        }
      }

      return div(color, totalWeight);
    })();
  };

  return {
    apply,
    radius,
    texelSize,
    setRadius: (r: number) => {
      radius.value = r;
    },
    updateTextureSize: (width: number, height: number) => {
      texelSize.value.set(1 / width, 1 / height);
    },
  };
};

export type Blur2DNode = ReturnType<typeof blur2D>;
```

---

### 8. Glow Node

**packages/core/src/nodes/effects/glow2D.ts:**

```typescript
import {
  Fn,
  vec3,
  vec4,
  uniform,
  float,
  texture,
  uv,
  add,
  mul,
  max,
  sub,
  clamp,
} from 'three/tsl';
import { Color, Texture, Vector2 } from 'three';
import type { ShaderNodeObject, Node } from 'three/tsl';

export interface Glow2DOptions {
  /** Input texture */
  map: Texture;
  /** Glow color (default: white, uses source color if not set) */
  color?: Color | string | number;
  /** Glow intensity (default: 1.0) */
  intensity?: number;
  /** Glow threshold - pixels brighter than this glow (default: 0.8) */
  threshold?: number;
  /** Glow radius in pixels (default: 8) */
  radius?: number;
  /** Glow quality/samples (default: 8) */
  quality?: number;
}

/**
 * Creates a bloom/glow effect node.
 *
 * Extracts bright areas and blurs them to create a glow effect.
 *
 * @example
 * ```typescript
 * const bloom = glow2D({
 *   map: sceneTexture,
 *   intensity: 1.5,
 *   threshold: 0.7,
 *   radius: 12,
 * });
 *
 * // Additive blend with original
 * material.colorNode = bloom.apply(baseColor);
 * ```
 */
export const glow2D = (options: Glow2DOptions) => {
  const map = options.map;
  const color = uniform(
    options.color instanceof Color
      ? options.color
      : new Color(options.color ?? 0xffffff)
  );
  const intensity = uniform(options.intensity ?? 1.0);
  const threshold = uniform(options.threshold ?? 0.8);
  const radius = uniform(options.radius ?? 8);
  const quality = options.quality ?? 8;

  const texelSize = uniform(
    new Vector2(1 / (map.image?.width ?? 1), 1 / (map.image?.height ?? 1))
  );

  /**
   * Extract bright pixels for glow.
   */
  const extractBright = (inputColor: ShaderNodeObject<Node>) => {
    return Fn(() => {
      // Calculate luminance
      const luminance = add(
        mul(inputColor.r, 0.299),
        add(mul(inputColor.g, 0.587), mul(inputColor.b, 0.114))
      );

      // Extract pixels above threshold
      const brightness = max(sub(luminance, threshold), 0.0);
      const contribution = clamp(mul(brightness, float(4)), 0, 1);

      return mul(inputColor.rgb, contribution);
    })();
  };

  /**
   * Apply blur to extracted bright areas.
   */
  const blurBright = (uvCoord?: ShaderNodeObject<Node>) => {
    return Fn(() => {
      const coord = uvCoord ?? uv();
      let glowColor = vec3(0, 0, 0);
      let totalWeight = float(0);

      const samples = quality;

      // Simple radial blur for glow
      for (let i = 0; i < samples; i++) {
        for (let j = 0; j < samples; j++) {
          const offsetX = float((i - (samples - 1) / 2) / ((samples - 1) / 2));
          const offsetY = float((j - (samples - 1) / 2) / ((samples - 1) / 2));

          const offset = vec2(
            mul(mul(offsetX, radius), texelSize.x),
            mul(mul(offsetY, radius), texelSize.y)
          );

          const sampleCoord = add(coord, offset);
          const sampleColor = texture(map, sampleCoord);
          const bright = extractBright(sampleColor);

          // Gaussian-like weight
          const dist = add(mul(offsetX, offsetX), mul(offsetY, offsetY));
          const weight = max(sub(float(1), dist), 0.0);

          glowColor = add(glowColor, mul(bright, weight));
          totalWeight = add(totalWeight, weight);
        }
      }

      return mul(mul(glowColor, vec3(color)), intensity);
    })();
  };

  /**
   * Apply glow to base color (additive).
   */
  const apply = (
    baseColor: ShaderNodeObject<Node>,
    uvCoord?: ShaderNodeObject<Node>
  ) => {
    return Fn(() => {
      const glow = blurBright(uvCoord);
      return vec4(add(baseColor.rgb, glow), baseColor.a);
    })();
  };

  return {
    extractBright,
    blurBright,
    apply,
    color,
    intensity,
    threshold,
    radius,
    texelSize,
    setColor: (c: Color | string | number) => {
      if (c instanceof Color) {
        color.value.copy(c);
      } else {
        color.value.set(c);
      }
    },
    setIntensity: (i: number) => {
      intensity.value = i;
    },
    setThreshold: (t: number) => {
      threshold.value = t;
    },
    setRadius: (r: number) => {
      radius.value = r;
    },
  };
};

export type Glow2DNode = ReturnType<typeof glow2D>;
```

---

### 9. Shadow Node

**packages/core/src/nodes/effects/shadow2D.ts:**

```typescript
import {
  Fn,
  vec2,
  vec3,
  vec4,
  uniform,
  float,
  texture,
  uv,
  add,
  mul,
  sub,
  mix,
} from 'three/tsl';
import { Color, Vector2, Texture } from 'three';
import type { ShaderNodeObject, Node } from 'three/tsl';

export interface Shadow2DOptions {
  /** Shadow color (default: black) */
  color?: Color | string | number;
  /** Shadow opacity (default: 0.5) */
  opacity?: number;
  /** Shadow offset in pixels (default: [4, -4]) */
  offset?: Vector2 | [number, number];
  /** Shadow blur radius (default: 2) */
  blur?: number;
}

/**
 * Creates a drop shadow effect node.
 *
 * Generates a shadow behind sprites with offset, blur, and color.
 *
 * @example
 * ```typescript
 * const shadow = shadow2D({
 *   color: 0x000000,
 *   opacity: 0.6,
 *   offset: [5, -5],
 *   blur: 3,
 * });
 *
 * // Apply shadow behind sprite
 * material.colorNode = shadow.apply(spriteColor, spriteTexture);
 * ```
 */
export const shadow2D = (options: Shadow2DOptions = {}) => {
  const color = uniform(
    options.color instanceof Color
      ? options.color
      : new Color(options.color ?? 0x000000)
  );
  const opacity = uniform(options.opacity ?? 0.5);
  const offset = uniform(
    options.offset instanceof Vector2
      ? options.offset
      : new Vector2(...(options.offset ?? [4, -4]))
  );
  const blur = uniform(options.blur ?? 2);

  /**
   * Calculate shadow at offset position with blur.
   */
  const calculate = (
    alphaMap: Texture,
    texelSize: Vector2,
    uvCoord?: ShaderNodeObject<Node>
  ) => {
    return Fn(() => {
      const coord = uvCoord ?? uv();

      // Offset UV for shadow position
      const shadowUV = sub(
        coord,
        vec2(
          mul(offset.x, texelSize.x),
          mul(offset.y, texelSize.y)
        )
      );

      // Sample alpha with blur
      let shadowAlpha = float(0);
      const samples = 5;
      let totalWeight = float(0);

      for (let i = 0; i < samples; i++) {
        for (let j = 0; j < samples; j++) {
          const ox = float((i - 2) / 2);
          const oy = float((j - 2) / 2);
          const sampleOffset = vec2(
            mul(mul(ox, blur), texelSize.x),
            mul(mul(oy, blur), texelSize.y)
          );
          const sampleUV = add(shadowUV, sampleOffset);
          const sampleAlpha = texture(alphaMap, sampleUV).a;

          const weight = float(1.0 - Math.sqrt((i - 2) ** 2 + (j - 2) ** 2) / 2.83);
          shadowAlpha = add(shadowAlpha, mul(sampleAlpha, weight));
          totalWeight = add(totalWeight, weight);
        }
      }

      shadowAlpha = mul(shadowAlpha, opacity);
      return vec4(vec3(color), shadowAlpha);
    })();
  };

  /**
   * Apply shadow behind a sprite color.
   */
  const apply = (
    spriteColor: ShaderNodeObject<Node>,
    alphaMap: Texture,
    texelSize: Vector2,
    uvCoord?: ShaderNodeObject<Node>
  ) => {
    return Fn(() => {
      const shadowColor = calculate(alphaMap, texelSize, uvCoord);

      // Composite: shadow behind sprite
      const behindAlpha = mul(shadowColor.a, sub(float(1), spriteColor.a));
      const finalAlpha = add(spriteColor.a, behindAlpha);

      const finalRgb = mix(
        shadowColor.rgb,
        spriteColor.rgb,
        spriteColor.a
      );

      return vec4(finalRgb, finalAlpha);
    })();
  };

  return {
    calculate,
    apply,
    color,
    opacity,
    offset,
    blur,
    setColor: (c: Color | string | number) => {
      if (c instanceof Color) {
        color.value.copy(c);
      } else {
        color.value.set(c);
      }
    },
    setOpacity: (o: number) => {
      opacity.value = o;
    },
    setOffset: (x: number, y: number) => {
      offset.value.set(x, y);
    },
    setBlur: (b: number) => {
      blur.value = b;
    },
  };
};

export type Shadow2DNode = ReturnType<typeof shadow2D>;
```

---

### 10. Distortion Node

**packages/core/src/nodes/effects/distortion2D.ts:**

```typescript
import {
  Fn,
  vec2,
  vec4,
  uniform,
  float,
  texture,
  uv,
  add,
  mul,
  sin,
  cos,
  time,
} from 'three/tsl';
import { Texture, Vector2 } from 'three';
import type { ShaderNodeObject, Node } from 'three/tsl';

export interface Distortion2DOptions {
  /** Input texture */
  map: Texture;
  /** Wave amplitude in UV space (default: 0.02) */
  amplitude?: number;
  /** Wave frequency (default: 10) */
  frequency?: number;
  /** Wave speed (default: 1) */
  speed?: number;
  /** Distortion type (default: 'wave') */
  type?: 'wave' | 'ripple' | 'turbulence';
  /** Ripple center (for ripple type) */
  center?: Vector2 | [number, number];
}

/**
 * Creates a distortion effect node for wave/ripple effects.
 *
 * Supports multiple distortion types: wave, ripple, turbulence.
 *
 * @example
 * ```typescript
 * const waterRipple = distortion2D({
 *   map: sceneTexture,
 *   type: 'ripple',
 *   amplitude: 0.03,
 *   frequency: 20,
 *   speed: 2,
 *   center: [0.5, 0.5],
 * });
 *
 * material.colorNode = waterRipple.apply();
 * ```
 */
export const distortion2D = (options: Distortion2DOptions) => {
  const map = options.map;
  const amplitude = uniform(options.amplitude ?? 0.02);
  const frequency = uniform(options.frequency ?? 10);
  const speed = uniform(options.speed ?? 1);
  const distortionType = options.type ?? 'wave';
  const center = uniform(
    options.center instanceof Vector2
      ? options.center
      : new Vector2(...(options.center ?? [0.5, 0.5]))
  );

  /**
   * Calculate distorted UV coordinates.
   */
  const distortUV = (uvCoord?: ShaderNodeObject<Node>) => {
    return Fn(() => {
      const coord = uvCoord ?? uv();
      const t = mul(time, speed);

      if (distortionType === 'wave') {
        // Horizontal wave
        const waveX = mul(
          sin(add(mul(coord.y, frequency), t)),
          amplitude
        );
        const waveY = mul(
          cos(add(mul(coord.x, frequency), t)),
          amplitude
        );
        return add(coord, vec2(waveX, waveY));
      } else if (distortionType === 'ripple') {
        // Circular ripple from center
        const toCenter = sub(coord, vec2(center));
        const dist = length(toCenter);
        const ripple = mul(
          sin(add(mul(dist, frequency), t)),
          amplitude
        );
        const dir = normalize(toCenter);
        return add(coord, mul(dir, ripple));
      } else {
        // Turbulence (multi-frequency waves)
        const wave1 = mul(sin(add(mul(coord.y, frequency), t)), amplitude);
        const wave2 = mul(sin(add(mul(coord.x, mul(frequency, 0.7)), mul(t, 1.3))), mul(amplitude, 0.5));
        const wave3 = mul(cos(add(mul(add(coord.x, coord.y), mul(frequency, 0.5)), mul(t, 0.8))), mul(amplitude, 0.3));
        return add(coord, vec2(add(wave1, wave3), add(wave2, wave3)));
      }
    })();
  };

  /**
   * Apply distortion to texture.
   */
  const apply = (uvCoord?: ShaderNodeObject<Node>) => {
    return Fn(() => {
      const distortedUV = distortUV(uvCoord);
      return texture(map, distortedUV);
    })();
  };

  return {
    distortUV,
    apply,
    amplitude,
    frequency,
    speed,
    center,
    setAmplitude: (a: number) => {
      amplitude.value = a;
    },
    setFrequency: (f: number) => {
      frequency.value = f;
    },
    setSpeed: (s: number) => {
      speed.value = s;
    },
    setCenter: (x: number, y: number) => {
      center.value.set(x, y);
    },
  };
};

export type Distortion2DNode = ReturnType<typeof distortion2D>;
```

---

### 11. Chromatic Aberration Node

**packages/core/src/nodes/effects/chromatic2D.ts:**

```typescript
import {
  Fn,
  vec2,
  vec3,
  vec4,
  uniform,
  float,
  texture,
  uv,
  add,
  sub,
  mul,
  normalize,
  length,
} from 'three/tsl';
import { Texture, Vector2 } from 'three';
import type { ShaderNodeObject, Node } from 'three/tsl';

export interface Chromatic2DOptions {
  /** Input texture */
  map: Texture;
  /** Aberration strength (default: 0.005) */
  strength?: number;
  /** Aberration direction - radial from center or directional (default: 'radial') */
  mode?: 'radial' | 'directional';
  /** Direction for directional mode (default: [1, 0]) */
  direction?: Vector2 | [number, number];
  /** Center point for radial mode (default: [0.5, 0.5]) */
  center?: Vector2 | [number, number];
}

/**
 * Creates a chromatic aberration effect.
 *
 * Separates RGB channels with slight offset to simulate lens distortion.
 *
 * @example
 * ```typescript
 * const aberration = chromatic2D({
 *   map: sceneTexture,
 *   strength: 0.008,
 *   mode: 'radial',
 * });
 *
 * material.colorNode = aberration.apply();
 * ```
 */
export const chromatic2D = (options: Chromatic2DOptions) => {
  const map = options.map;
  const strength = uniform(options.strength ?? 0.005);
  const mode = options.mode ?? 'radial';
  const direction = uniform(
    options.direction instanceof Vector2
      ? options.direction.clone().normalize()
      : new Vector2(...(options.direction ?? [1, 0])).normalize()
  );
  const center = uniform(
    options.center instanceof Vector2
      ? options.center
      : new Vector2(...(options.center ?? [0.5, 0.5]))
  );

  /**
   * Apply chromatic aberration effect.
   */
  const apply = (uvCoord?: ShaderNodeObject<Node>) => {
    return Fn(() => {
      const coord = uvCoord ?? uv();

      let offsetDir: ShaderNodeObject<Node>;

      if (mode === 'radial') {
        // Radial: direction from center to pixel
        const toPixel = sub(coord, vec2(center));
        const dist = length(toPixel);
        offsetDir = mul(normalize(toPixel), dist);
      } else {
        // Directional: uniform direction
        offsetDir = vec2(direction);
      }

      // Offset each channel differently
      const rOffset = mul(offsetDir, mul(strength, float(-1)));
      const gOffset = vec2(0, 0); // Green stays centered
      const bOffset = mul(offsetDir, strength);

      // Sample each channel at offset position
      const r = texture(map, add(coord, rOffset)).r;
      const g = texture(map, add(coord, gOffset)).g;
      const b = texture(map, add(coord, bOffset)).b;
      const a = texture(map, coord).a;

      return vec4(r, g, b, a);
    })();
  };

  return {
    apply,
    strength,
    direction,
    center,
    setStrength: (s: number) => {
      strength.value = s;
    },
    setDirection: (x: number, y: number) => {
      direction.value.set(x, y).normalize();
    },
    setCenter: (x: number, y: number) => {
      center.value.set(x, y);
    },
  };
};

export type Chromatic2DNode = ReturnType<typeof chromatic2D>;
```

---

### 12. CRT Effect Node

**packages/core/src/nodes/effects/crt2D.ts:**

```typescript
import {
  Fn,
  vec2,
  vec3,
  vec4,
  uniform,
  float,
  texture,
  uv,
  add,
  sub,
  mul,
  sin,
  floor,
  mod,
  mix,
  time,
} from 'three/tsl';
import { Texture, Vector2 } from 'three';
import type { ShaderNodeObject, Node } from 'three/tsl';

export interface CRT2DOptions {
  /** Input texture */
  map: Texture;
  /** Scanline intensity (default: 0.3) */
  scanlineIntensity?: number;
  /** Scanline count/density (default: 240) */
  scanlineCount?: number;
  /** Screen curvature amount (default: 0.02) */
  curvature?: number;
  /** Vignette strength (default: 0.3) */
  vignette?: number;
  /** Flicker intensity (default: 0.03) */
  flicker?: number;
  /** RGB pixel separation (default: true) */
  rgbSplit?: boolean;
}

/**
 * Creates a CRT monitor effect.
 *
 * Simulates old CRT displays with scanlines, curvature, and flicker.
 *
 * @example
 * ```typescript
 * const crt = crt2D({
 *   map: gameTexture,
 *   scanlineIntensity: 0.4,
 *   scanlineCount: 200,
 *   curvature: 0.03,
 *   vignette: 0.4,
 * });
 *
 * material.colorNode = crt.apply();
 * ```
 */
export const crt2D = (options: CRT2DOptions) => {
  const map = options.map;
  const scanlineIntensity = uniform(options.scanlineIntensity ?? 0.3);
  const scanlineCount = uniform(options.scanlineCount ?? 240);
  const curvature = uniform(options.curvature ?? 0.02);
  const vignetteStrength = uniform(options.vignette ?? 0.3);
  const flicker = uniform(options.flicker ?? 0.03);
  const rgbSplit = options.rgbSplit !== false;

  /**
   * Apply barrel distortion for screen curvature.
   */
  const curveUV = (coord: ShaderNodeObject<Node>) => {
    return Fn(() => {
      // Convert to -1 to 1 range
      const centered = sub(mul(coord, 2), 1);

      // Apply barrel distortion
      const offset = mul(
        mul(centered, length(centered)),
        curvature
      );

      const curved = add(centered, offset);

      // Convert back to 0-1 range
      return mul(add(curved, 1), 0.5);
    })();
  };

  /**
   * Apply CRT effect.
   */
  const apply = (uvCoord?: ShaderNodeObject<Node>) => {
    return Fn(() => {
      const coord = uvCoord ?? uv();

      // Apply curvature
      const curvedUV = curveUV(coord);

      // Sample texture (with optional RGB split)
      let color: ShaderNodeObject<Node>;

      if (rgbSplit) {
        const pixelOffset = float(0.001);
        const r = texture(map, add(curvedUV, vec2(pixelOffset, 0))).r;
        const g = texture(map, curvedUV).g;
        const b = texture(map, sub(curvedUV, vec2(pixelOffset, 0))).b;
        const a = texture(map, curvedUV).a;
        color = vec4(r, g, b, a);
      } else {
        color = texture(map, curvedUV);
      }

      // Scanlines
      const scanline = sin(mul(curvedUV.y, mul(scanlineCount, 3.14159)));
      const scanlineFactor = sub(float(1), mul(mul(scanline, scanline), scanlineIntensity));

      // Flicker
      const flickerFactor = add(float(1), mul(sin(mul(time, 60)), flicker));

      // Vignette
      const vignetteCoord = sub(mul(coord, 2), 1);
      const vignetteDist = length(vignetteCoord);
      const vignetteFactor = sub(float(1), mul(mul(vignetteDist, vignetteDist), vignetteStrength));

      // Combine effects
      const finalColor = mul(
        mul(mul(color.rgb, scanlineFactor), flickerFactor),
        vignetteFactor
      );

      return vec4(finalColor, color.a);
    })();
  };

  return {
    apply,
    curveUV,
    scanlineIntensity,
    scanlineCount,
    curvature,
    vignetteStrength,
    flicker,
    setScanlineIntensity: (i: number) => {
      scanlineIntensity.value = i;
    },
    setScanlineCount: (c: number) => {
      scanlineCount.value = c;
    },
    setCurvature: (c: number) => {
      curvature.value = c;
    },
    setVignette: (v: number) => {
      vignetteStrength.value = v;
    },
    setFlicker: (f: number) => {
      flicker.value = f;
    },
  };
};

export type CRT2DNode = ReturnType<typeof crt2D>;
```

---

### 13. Vignette Node

**packages/core/src/nodes/effects/vignette2D.ts:**

```typescript
import {
  Fn,
  vec2,
  vec3,
  vec4,
  uniform,
  float,
  uv,
  sub,
  mul,
  length,
  smoothstep,
  pow,
} from 'three/tsl';
import { Color } from 'three';
import type { ShaderNodeObject, Node } from 'three/tsl';

export interface Vignette2DOptions {
  /** Vignette color (default: black) */
  color?: Color | string | number;
  /** Inner radius where vignette starts (0-1, default: 0.4) */
  innerRadius?: number;
  /** Outer radius where vignette is full (0-1, default: 1.0) */
  outerRadius?: number;
  /** Vignette intensity/opacity (default: 1.0) */
  intensity?: number;
  /** Falloff curve power (default: 2.0) */
  falloff?: number;
  /** Vignette shape: 'circular' or 'rectangular' (default: 'circular') */
  shape?: 'circular' | 'rectangular';
}

/**
 * Creates a vignette (edge darkening) effect.
 *
 * Darkens the edges of the screen for a cinematic look.
 *
 * @example
 * ```typescript
 * const vignette = vignette2D({
 *   color: 0x000000,
 *   innerRadius: 0.3,
 *   outerRadius: 0.9,
 *   intensity: 0.8,
 * });
 *
 * material.colorNode = vignette.apply(baseColor);
 * ```
 */
export const vignette2D = (options: Vignette2DOptions = {}) => {
  const color = uniform(
    options.color instanceof Color
      ? options.color
      : new Color(options.color ?? 0x000000)
  );
  const innerRadius = uniform(options.innerRadius ?? 0.4);
  const outerRadius = uniform(options.outerRadius ?? 1.0);
  const intensity = uniform(options.intensity ?? 1.0);
  const falloffPower = uniform(options.falloff ?? 2.0);
  const shape = options.shape ?? 'circular';

  /**
   * Calculate vignette factor (0 = no vignette, 1 = full vignette).
   */
  const calculate = (uvCoord?: ShaderNodeObject<Node>) => {
    return Fn(() => {
      const coord = uvCoord ?? uv();

      // Convert to centered coordinates (-1 to 1)
      const centered = sub(mul(coord, 2), 1);

      let dist: ShaderNodeObject<Node>;

      if (shape === 'circular') {
        dist = length(centered);
      } else {
        // Rectangular: use max of absolute x and y
        dist = max(abs(centered.x), abs(centered.y));
      }

      // Calculate vignette factor with smooth falloff
      const vignette = smoothstep(innerRadius, outerRadius, dist);
      const vignetteWithFalloff = pow(vignette, falloffPower);

      return mul(vignetteWithFalloff, intensity);
    })();
  };

  /**
   * Apply vignette to a color.
   */
  const apply = (
    inputColor: ShaderNodeObject<Node>,
    uvCoord?: ShaderNodeObject<Node>
  ) => {
    return Fn(() => {
      const vignetteFactor = calculate(uvCoord);

      // Mix input color toward vignette color
      const vignetteColor = mix(
        inputColor.rgb,
        vec3(color),
        vignetteFactor
      );

      return vec4(vignetteColor, inputColor.a);
    })();
  };

  return {
    calculate,
    apply,
    color,
    innerRadius,
    outerRadius,
    intensity,
    falloffPower,
    setColor: (c: Color | string | number) => {
      if (c instanceof Color) {
        color.value.copy(c);
      } else {
        color.value.set(c);
      }
    },
    setInnerRadius: (r: number) => {
      innerRadius.value = r;
    },
    setOuterRadius: (r: number) => {
      outerRadius.value = r;
    },
    setIntensity: (i: number) => {
      intensity.value = i;
    },
    setFalloff: (f: number) => {
      falloffPower.value = f;
    },
  };
};

export type Vignette2DNode = ReturnType<typeof vignette2D>;
```

---

### 14. Noise/Film Grain Node

**packages/core/src/nodes/effects/noise2D.ts:**

```typescript
import {
  Fn,
  vec2,
  vec3,
  vec4,
  uniform,
  float,
  uv,
  add,
  sub,
  mul,
  fract,
  sin,
  dot,
  time,
  mix,
} from 'three/tsl';
import type { ShaderNodeObject, Node } from 'three/tsl';

export interface Noise2DOptions {
  /** Noise intensity (default: 0.1) */
  intensity?: number;
  /** Noise speed/animation rate (default: 1.0) */
  speed?: number;
  /** Whether noise is monochrome or colored (default: true) */
  monochrome?: boolean;
  /** Noise scale/grain size (default: 1.0) */
  scale?: number;
}

/**
 * Creates a film grain/noise effect.
 *
 * Adds animated noise for a cinematic or retro look.
 *
 * @example
 * ```typescript
 * const grain = noise2D({
 *   intensity: 0.08,
 *   speed: 2.0,
 *   monochrome: true,
 * });
 *
 * material.colorNode = grain.apply(baseColor);
 * ```
 */
export const noise2D = (options: Noise2DOptions = {}) => {
  const intensity = uniform(options.intensity ?? 0.1);
  const speed = uniform(options.speed ?? 1.0);
  const monochrome = options.monochrome !== false;
  const scale = uniform(options.scale ?? 1.0);

  /**
   * Hash function for pseudo-random noise.
   */
  const hash = (p: ShaderNodeObject<Node>) => {
    return Fn(() => {
      const p3 = fract(mul(p, vec3(0.1031, 0.1030, 0.0973)));
      const p3Dot = dot(p3, add(p3.yzx, float(33.33)));
      return fract(mul(add(p3.x, p3.y), p3.z));
    })();
  };

  /**
   * Generate noise value at UV coordinate.
   */
  const generate = (uvCoord?: ShaderNodeObject<Node>) => {
    return Fn(() => {
      const coord = uvCoord ?? uv();

      // Scale and animate
      const animatedCoord = vec3(
        mul(coord.x, scale),
        mul(coord.y, scale),
        mul(time, speed)
      );

      // Generate noise
      const noiseValue = hash(animatedCoord);

      if (monochrome) {
        // Same value for all channels
        return vec3(noiseValue, noiseValue, noiseValue);
      } else {
        // Different noise per channel
        const r = hash(add(animatedCoord, vec3(0.0, 0.0, 0.0)));
        const g = hash(add(animatedCoord, vec3(1.0, 0.0, 0.0)));
        const b = hash(add(animatedCoord, vec3(0.0, 1.0, 0.0)));
        return vec3(r, g, b);
      }
    })();
  };

  /**
   * Apply noise to a color (additive).
   */
  const apply = (
    inputColor: ShaderNodeObject<Node>,
    uvCoord?: ShaderNodeObject<Node>
  ) => {
    return Fn(() => {
      const noise = generate(uvCoord);

      // Center noise around 0 (-0.5 to 0.5)
      const centeredNoise = sub(noise, 0.5);

      // Apply intensity
      const scaledNoise = mul(centeredNoise, intensity);

      // Add to color
      const noisyColor = add(inputColor.rgb, scaledNoise);

      return vec4(noisyColor, inputColor.a);
    })();
  };

  return {
    generate,
    apply,
    intensity,
    speed,
    scale,
    setIntensity: (i: number) => {
      intensity.value = i;
    },
    setSpeed: (s: number) => {
      speed.value = s;
    },
    setScale: (s: number) => {
      scale.value = s;
    },
  };
};

export type Noise2DNode = ReturnType<typeof noise2D>;
```

---

### 15. Palette Swap Node

**packages/core/src/nodes/effects/palette2D.ts:**

```typescript
import {
  Fn,
  vec3,
  vec4,
  uniform,
  float,
  texture,
  uv,
  add,
  mul,
  floor,
  clamp,
} from 'three/tsl';
import { Color, Texture, DataTexture, RGBAFormat, NearestFilter } from 'three';
import type { ShaderNodeObject, Node } from 'three/tsl';

export interface Palette2DOptions {
  /** Input texture */
  map: Texture;
  /** Palette texture (1D or 2D lookup) */
  palette: Texture;
  /** Number of colors in palette (default: 16) */
  colorCount?: number;
  /** Use luminance for lookup (default: true) */
  useLuminance?: boolean;
}

/**
 * Creates a color palette swap effect.
 *
 * Maps input colors to a limited palette for retro aesthetics.
 *
 * @example
 * ```typescript
 * // Create a 4-color Game Boy palette
 * const gbPalette = createPalette([
 *   0x0f380f, // Darkest
 *   0x306230,
 *   0x8bac0f,
 *   0x9bbc0f, // Lightest
 * ]);
 *
 * const retro = palette2D({
 *   map: sceneTexture,
 *   palette: gbPalette,
 *   colorCount: 4,
 * });
 *
 * material.colorNode = retro.apply();
 * ```
 */
export const palette2D = (options: Palette2DOptions) => {
  const map = options.map;
  const palette = options.palette;
  const colorCount = uniform(options.colorCount ?? 16);
  const useLuminance = options.useLuminance !== false;

  /**
   * Apply palette mapping.
   */
  const apply = (uvCoord?: ShaderNodeObject<Node>) => {
    return Fn(() => {
      const coord = uvCoord ?? uv();
      const inputColor = texture(map, coord);

      // Calculate lookup index
      let index: ShaderNodeObject<Node>;

      if (useLuminance) {
        // Use luminance for grayscale->color mapping
        const luminance = add(
          mul(inputColor.r, 0.299),
          add(mul(inputColor.g, 0.587), mul(inputColor.b, 0.114))
        );
        index = mul(luminance, sub(colorCount, float(1)));
      } else {
        // Quantize each channel separately (for color palettes)
        const r = mul(inputColor.r, sub(colorCount, float(1)));
        index = floor(r);
      }

      // Clamp and normalize for texture lookup
      const normalizedIndex = clamp(
        div(add(floor(index), float(0.5)), colorCount),
        0,
        1
      );

      // Sample palette (assuming 1D horizontal texture)
      const paletteColor = texture(palette, vec2(normalizedIndex, 0.5));

      return vec4(paletteColor.rgb, inputColor.a);
    })();
  };

  return {
    apply,
    colorCount,
    setColorCount: (c: number) => {
      colorCount.value = c;
    },
  };
};

/**
 * Helper to create a palette texture from colors.
 */
export function createPaletteTexture(colors: (Color | number | string)[]): Texture {
  const size = colors.length;
  const data = new Uint8Array(size * 4);

  colors.forEach((c, i) => {
    const color = c instanceof Color ? c : new Color(c);
    data[i * 4] = Math.floor(color.r * 255);
    data[i * 4 + 1] = Math.floor(color.g * 255);
    data[i * 4 + 2] = Math.floor(color.b * 255);
    data[i * 4 + 3] = 255;
  });

  const texture = new DataTexture(data, size, 1, RGBAFormat);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.needsUpdate = true;

  return texture;
}

export type Palette2DNode = ReturnType<typeof palette2D>;
```

---

### 16. Dither Node

**packages/core/src/nodes/effects/dither2D.ts:**

```typescript
import {
  Fn,
  vec2,
  vec3,
  vec4,
  uniform,
  float,
  uv,
  floor,
  mod,
  add,
  sub,
  mul,
  div,
  step,
} from 'three/tsl';
import type { ShaderNodeObject, Node } from 'three/tsl';

export interface Dither2DOptions {
  /** Number of color levels per channel (default: 4) */
  colorLevels?: number;
  /** Dither matrix size: 2, 4, or 8 (default: 4) */
  matrixSize?: 2 | 4 | 8;
  /** Dither strength (default: 1.0) */
  strength?: number;
  /** Screen resolution for pixel-accurate dithering */
  resolution?: [number, number];
}

/**
 * Creates an ordered dithering effect.
 *
 * Reduces color depth with Bayer matrix dithering for retro aesthetics.
 *
 * @example
 * ```typescript
 * const dither = dither2D({
 *   colorLevels: 4, // 4 levels per channel = 64 total colors
 *   matrixSize: 4,  // 4x4 Bayer matrix
 *   strength: 1.0,
 * });
 *
 * material.colorNode = dither.apply(baseColor);
 * ```
 */
export const dither2D = (options: Dither2DOptions = {}) => {
  const colorLevels = uniform(options.colorLevels ?? 4);
  const matrixSize = options.matrixSize ?? 4;
  const strength = uniform(options.strength ?? 1.0);
  const resolution = uniform(
    new Vector2(...(options.resolution ?? [800, 600]))
  );

  // Bayer matrices (normalized to 0-1)
  const bayerMatrix2 = [
    0 / 4, 2 / 4,
    3 / 4, 1 / 4,
  ];

  const bayerMatrix4 = [
    0 / 16, 8 / 16, 2 / 16, 10 / 16,
    12 / 16, 4 / 16, 14 / 16, 6 / 16,
    3 / 16, 11 / 16, 1 / 16, 9 / 16,
    15 / 16, 7 / 16, 13 / 16, 5 / 16,
  ];

  const bayerMatrix8 = [
    0 / 64, 32 / 64, 8 / 64, 40 / 64, 2 / 64, 34 / 64, 10 / 64, 42 / 64,
    48 / 64, 16 / 64, 56 / 64, 24 / 64, 50 / 64, 18 / 64, 58 / 64, 26 / 64,
    12 / 64, 44 / 64, 4 / 64, 36 / 64, 14 / 64, 46 / 64, 6 / 64, 38 / 64,
    60 / 64, 28 / 64, 52 / 64, 20 / 64, 62 / 64, 30 / 64, 54 / 64, 22 / 64,
    3 / 64, 35 / 64, 11 / 64, 43 / 64, 1 / 64, 33 / 64, 9 / 64, 41 / 64,
    51 / 64, 19 / 64, 59 / 64, 27 / 64, 49 / 64, 17 / 64, 57 / 64, 25 / 64,
    15 / 64, 47 / 64, 7 / 64, 39 / 64, 13 / 64, 45 / 64, 5 / 64, 37 / 64,
    63 / 64, 31 / 64, 55 / 64, 23 / 64, 61 / 64, 29 / 64, 53 / 64, 21 / 64,
  ];

  /**
   * Get Bayer threshold at pixel coordinate.
   */
  const getBayerThreshold = (pixelCoord: ShaderNodeObject<Node>) => {
    return Fn(() => {
      const x = floor(mod(pixelCoord.x, float(matrixSize)));
      const y = floor(mod(pixelCoord.y, float(matrixSize)));
      const index = add(mul(y, float(matrixSize)), x);

      // For TSL, we'll compute Bayer value procedurally
      // This is a simplified version - real implementation would use a texture lookup
      const bayerValue = div(
        mod(
          add(
            mul(floor(div(pixelCoord.x, float(1))), 0.5),
            mul(floor(div(pixelCoord.y, float(1))), 0.25)
          ),
          float(1)
        ),
        float(1)
      );

      return sub(bayerValue, 0.5);
    })();
  };

  /**
   * Apply dithering to a color.
   */
  const apply = (
    inputColor: ShaderNodeObject<Node>,
    uvCoord?: ShaderNodeObject<Node>
  ) => {
    return Fn(() => {
      const coord = uvCoord ?? uv();

      // Convert UV to pixel coordinates
      const pixelCoord = mul(coord, vec2(resolution));

      // Get Bayer threshold
      const threshold = getBayerThreshold(pixelCoord);

      // Apply dithering
      const ditherAmount = mul(div(threshold, colorLevels), strength);

      // Add dither offset and quantize
      const ditheredColor = add(inputColor.rgb, ditherAmount);

      // Quantize to color levels
      const quantized = div(
        floor(mul(ditheredColor, colorLevels)),
        sub(colorLevels, float(1))
      );

      return vec4(quantized, inputColor.a);
    })();
  };

  return {
    apply,
    colorLevels,
    strength,
    resolution,
    setColorLevels: (l: number) => {
      colorLevels.value = l;
    },
    setStrength: (s: number) => {
      strength.value = s;
    },
    setResolution: (w: number, h: number) => {
      resolution.value.set(w, h);
    },
  };
};

export type Dither2DNode = ReturnType<typeof dither2D>;
```

---

### 17. Light Combiner Utility

**packages/core/src/nodes/lighting/combineLights2D.ts:**

```typescript
import {
  Fn,
  vec3,
  vec4,
  add,
  mul,
  clamp,
} from 'three/tsl';
import type { ShaderNodeObject, Node } from 'three/tsl';
import type { AmbientLight2DNode } from './ambientLight2D';
import type { PointLight2DNode } from './pointLight2D';
import type { SpotLight2DNode } from './spotLight2D';

type Light2DNode = AmbientLight2DNode | PointLight2DNode | SpotLight2DNode;

export interface CombineLights2DOptions {
  /** Ambient light (optional) */
  ambient?: AmbientLight2DNode;
  /** Point lights */
  pointLights?: PointLight2DNode[];
  /** Spot lights */
  spotLights?: SpotLight2DNode[];
  /** Maximum combined light intensity (default: 2.0) */
  maxIntensity?: number;
}

/**
 * Combines multiple 2D lights into a single lighting contribution.
 *
 * @example
 * ```typescript
 * const lighting = combineLights2D({
 *   ambient: ambientLight,
 *   pointLights: [torch1, torch2, torch3],
 *   spotLights: [flashlight],
 * });
 *
 * // In material
 * material.colorNode = Fn(({ worldPosition }) => {
 *   const light = lighting.calculate(worldPosition.xy);
 *   return baseColor.mul(vec4(light, 1.0));
 * })();
 * ```
 */
export const combineLights2D = (options: CombineLights2DOptions) => {
  const { ambient, pointLights = [], spotLights = [], maxIntensity = 2.0 } = options;

  /**
   * Calculate combined lighting at world position.
   */
  const calculate = (worldPos: ShaderNodeObject<Node>) => {
    return Fn(() => {
      let totalLight = vec3(0, 0, 0);

      // Add ambient
      if (ambient) {
        totalLight = add(totalLight, ambient);
      }

      // Add point lights
      for (const light of pointLights) {
        totalLight = add(totalLight, light.calculate(worldPos));
      }

      // Add spot lights
      for (const light of spotLights) {
        totalLight = add(totalLight, light.calculate(worldPos));
      }

      // Clamp to max intensity
      return clamp(totalLight, 0, maxIntensity);
    })();
  };

  /**
   * Apply combined lighting to a color.
   */
  const apply = (
    baseColor: ShaderNodeObject<Node>,
    worldPos: ShaderNodeObject<Node>
  ) => {
    return Fn(() => {
      const lighting = calculate(worldPos);
      return vec4(mul(baseColor.rgb, lighting), baseColor.a);
    })();
  };

  return {
    calculate,
    apply,
  };
};

export type CombineLights2DNode = ReturnType<typeof combineLights2D>;
```

---

### 18. Exports

**packages/core/src/nodes/lighting/index.ts:**

```typescript
export { ambientLight2D } from './ambientLight2D';
export type { AmbientLight2DNode, AmbientLight2DOptions } from './ambientLight2D';

export { pointLight2D } from './pointLight2D';
export type { PointLight2DNode, PointLight2DOptions } from './pointLight2D';

export { spotLight2D } from './spotLight2D';
export type { SpotLight2DNode, SpotLight2DOptions } from './spotLight2D';

export { normalMap2D } from './normalMap2D';
export type { NormalMap2DNode, NormalMap2DOptions } from './normalMap2D';

export { emission2D } from './emission2D';
export type { Emission2DNode, Emission2DOptions } from './emission2D';

export { combineLights2D } from './combineLights2D';
export type { CombineLights2DNode, CombineLights2DOptions } from './combineLights2D';

export type * from './types';
```

**packages/core/src/nodes/effects/index.ts:**

```typescript
export { blur2D } from './blur2D';
export type { Blur2DNode, Blur2DOptions } from './blur2D';

export { glow2D } from './glow2D';
export type { Glow2DNode, Glow2DOptions } from './glow2D';

export { shadow2D } from './shadow2D';
export type { Shadow2DNode, Shadow2DOptions } from './shadow2D';

export { distortion2D } from './distortion2D';
export type { Distortion2DNode, Distortion2DOptions } from './distortion2D';

export { chromatic2D } from './chromatic2D';
export type { Chromatic2DNode, Chromatic2DOptions } from './chromatic2D';

export { crt2D } from './crt2D';
export type { CRT2DNode, CRT2DOptions } from './crt2D';

export { vignette2D } from './vignette2D';
export type { Vignette2DNode, Vignette2DOptions } from './vignette2D';

export { noise2D } from './noise2D';
export type { Noise2DNode, Noise2DOptions } from './noise2D';

export { palette2D, createPaletteTexture } from './palette2D';
export type { Palette2DNode, Palette2DOptions } from './palette2D';

export { dither2D } from './dither2D';
export type { Dither2DNode, Dither2DOptions } from './dither2D';
```

**packages/core/src/nodes/index.ts:**

```typescript
// Part 1 nodes (from M4)
export * from './transform';
export * from './color';

// Part 2 nodes (M6)
export * from './lighting';
export * from './effects';
```

---

### 19. Tests

**packages/core/src/nodes/lighting/pointLight2D.test.ts:**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { pointLight2D } from './pointLight2D';
import { Color, Vector2 } from 'three';

describe('pointLight2D', () => {
  it('should create a point light with default options', () => {
    const light = pointLight2D();

    expect(light.position.value).toBeInstanceOf(Vector2);
    expect(light.color.value).toBeInstanceOf(Color);
    expect(light.intensity.value).toBe(1.0);
    expect(light.radius.value).toBe(100);
  });

  it('should accept custom options', () => {
    const light = pointLight2D({
      position: [100, 200],
      color: 0xff0000,
      intensity: 2.0,
      radius: 50,
      falloff: 1,
    });

    expect(light.position.value.x).toBe(100);
    expect(light.position.value.y).toBe(200);
    expect(light.color.value.r).toBe(1);
    expect(light.intensity.value).toBe(2.0);
    expect(light.radius.value).toBe(50);
  });

  it('should update position via setter', () => {
    const light = pointLight2D();
    light.setPosition(50, 75);

    expect(light.position.value.x).toBe(50);
    expect(light.position.value.y).toBe(75);
  });

  it('should update color via setter', () => {
    const light = pointLight2D();
    light.setColor(0x00ff00);

    expect(light.color.value.g).toBe(1);
  });

  it('should have calculate method', () => {
    const light = pointLight2D();
    expect(typeof light.calculate).toBe('function');
  });
});
```

**packages/core/src/nodes/effects/blur2D.test.ts:**

```typescript
import { describe, it, expect } from 'vitest';
import { blur2D } from './blur2D';
import { Texture } from 'three';

describe('blur2D', () => {
  it('should create a blur node with default options', () => {
    const texture = new Texture();
    texture.image = { width: 256, height: 256 };

    const blur = blur2D({ map: texture });

    expect(blur.radius.value).toBe(4);
  });

  it('should accept custom radius', () => {
    const texture = new Texture();
    texture.image = { width: 256, height: 256 };

    const blur = blur2D({ map: texture, radius: 8 });

    expect(blur.radius.value).toBe(8);
  });

  it('should update radius via setter', () => {
    const texture = new Texture();
    texture.image = { width: 256, height: 256 };

    const blur = blur2D({ map: texture });
    blur.setRadius(12);

    expect(blur.radius.value).toBe(12);
  });

  it('should have apply method', () => {
    const texture = new Texture();
    texture.image = { width: 256, height: 256 };

    const blur = blur2D({ map: texture });
    expect(typeof blur.apply).toBe('function');
  });
});
```

**packages/core/src/nodes/effects/crt2D.test.ts:**

```typescript
import { describe, it, expect } from 'vitest';
import { crt2D } from './crt2D';
import { Texture } from 'three';

describe('crt2D', () => {
  it('should create a CRT effect with default options', () => {
    const texture = new Texture();
    const crt = crt2D({ map: texture });

    expect(crt.scanlineIntensity.value).toBe(0.3);
    expect(crt.scanlineCount.value).toBe(240);
    expect(crt.curvature.value).toBe(0.02);
  });

  it('should accept custom options', () => {
    const texture = new Texture();
    const crt = crt2D({
      map: texture,
      scanlineIntensity: 0.5,
      scanlineCount: 200,
      curvature: 0.05,
      vignette: 0.5,
    });

    expect(crt.scanlineIntensity.value).toBe(0.5);
    expect(crt.scanlineCount.value).toBe(200);
    expect(crt.curvature.value).toBe(0.05);
    expect(crt.vignetteStrength.value).toBe(0.5);
  });

  it('should update values via setters', () => {
    const texture = new Texture();
    const crt = crt2D({ map: texture });

    crt.setScanlineIntensity(0.6);
    crt.setCurvature(0.04);

    expect(crt.scanlineIntensity.value).toBe(0.6);
    expect(crt.curvature.value).toBe(0.04);
  });
});
```

---

## Acceptance Criteria

- [ ] All lighting nodes compile and render correctly (WebGL and WebGPU)
- [ ] `ambientLight2D` provides uniform base illumination
- [ ] `pointLight2D` has correct radial falloff
- [ ] `spotLight2D` has correct cone attenuation
- [ ] `normalMap2D` calculates lighting from normal maps
- [ ] `emission2D` adds self-illumination correctly
- [ ] `blur2D` produces smooth Gaussian-like blur
- [ ] `glow2D` extracts bright pixels and creates bloom
- [ ] `shadow2D` renders offset, blurred shadows
- [ ] `distortion2D` supports wave, ripple, and turbulence
- [ ] `chromatic2D` separates RGB channels correctly
- [ ] `crt2D` applies scanlines, curvature, and flicker
- [ ] `vignette2D` darkens edges correctly
- [ ] `noise2D` produces animated film grain
- [ ] `palette2D` maps colors to limited palette
- [ ] `dither2D` applies ordered dithering
- [ ] All nodes are composable/chainable
- [ ] Uniforms are exposed for runtime animation
- [ ] All tests pass
- [ ] Documentation is complete

---

## Example Usage

**Lit Scene with Dynamic Lighting:**

```typescript
import * as THREE from 'three/webgpu';
import {
  Sprite2D,
  Renderer2D,
  ambientLight2D,
  pointLight2D,
  combineLights2D,
  vignette2D,
} from '@three-flatland/core';

// Setup scene
const renderer = new THREE.WebGPURenderer();
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(0, 800, 600, 0, -1000, 1000);

// Create 2D renderer
const renderer2D = new Renderer2D();

// Create lights
const ambient = ambientLight2D({ color: 0x202040, intensity: 0.3 });

const torch1 = pointLight2D({
  position: [200, 300],
  color: 0xff8844,
  intensity: 1.2,
  radius: 150,
  falloff: 2,
});

const torch2 = pointLight2D({
  position: [600, 300],
  color: 0x44ff88,
  intensity: 1.0,
  radius: 120,
  falloff: 2,
});

// Combine lights
const lighting = combineLights2D({
  ambient,
  pointLights: [torch1, torch2],
});

// Create lit sprite material
const litMaterial = new MeshBasicNodeMaterial();
litMaterial.colorNode = Fn(({ position }) => {
  const baseColor = texture(spriteTexture, uv());
  return lighting.apply(baseColor, position.xy);
})();

// Add post-processing vignette
const vignette = vignette2D({
  innerRadius: 0.3,
  outerRadius: 0.95,
  intensity: 0.7,
});

// Animate lights
function animate() {
  requestAnimationFrame(animate);

  // Move torch in circle
  const t = performance.now() * 0.001;
  torch1.setPosition(
    400 + Math.cos(t) * 150,
    300 + Math.sin(t) * 100
  );

  // Flicker intensity
  torch1.setIntensity(1.0 + Math.sin(t * 10) * 0.1);

  renderer2D.render(renderer, camera);
}

animate();
```

**Retro CRT Effect:**

```typescript
import {
  crt2D,
  palette2D,
  createPaletteTexture,
  noise2D,
} from '@three-flatland/core';

// Create NES-style palette
const nesPalette = createPaletteTexture([
  0x000000, 0x00247D, 0x0000A8, 0x4900A8,
  0xA80080, 0xA80010, 0x881400, 0x503000,
  0x007800, 0x006800, 0x005800, 0x004058,
  0x000000, 0x000000, 0x000000, 0x000000,
  // ... more colors
]);

// Create retro effect chain
const paletteEffect = palette2D({
  map: gameTexture,
  palette: nesPalette,
  colorCount: 16,
});

const crtEffect = crt2D({
  map: palettizedTexture,
  scanlineIntensity: 0.4,
  scanlineCount: 224,
  curvature: 0.03,
  flicker: 0.02,
});

const grainEffect = noise2D({
  intensity: 0.05,
  speed: 2,
  monochrome: true,
});

// Apply chain: palette -> CRT -> grain
material.colorNode = Fn(() => {
  let color = paletteEffect.apply();
  color = crtEffect.apply(color);
  color = grainEffect.apply(color);
  return color;
})();
```

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| TSL compilation differences between backends | Medium | Medium | Test both WebGL and WebGPU early |
| Performance with many lights | Medium | High | Implement light culling, limit active lights |
| Blur quality vs performance | Medium | Medium | Provide quality presets, use separable blur |
| Shader complexity limits | Low | High | Keep nodes modular, allow selective composition |

---

## Dependencies for Next Milestone

M7 (Input/Interaction) requires:
- Completed visual pipeline (M1-M6)
- Working sprite rendering with effects

---

## Estimated Effort

| Task | Hours |
|------|-------|
| Type definitions | 2 |
| Lighting nodes (5) | 12 |
| Effect nodes - blur/glow/shadow | 8 |
| Effect nodes - distortion/chromatic | 6 |
| Effect nodes - CRT/vignette/noise | 6 |
| Effect nodes - palette/dither | 6 |
| Light combiner utility | 3 |
| Tests | 6 |
| Documentation & examples | 4 |
| Integration testing | 3 |
| **Total** | **56 hours** (~2 weeks) |

---

*End of M6: TSL Nodes Part 2 - Lighting & Effects*
