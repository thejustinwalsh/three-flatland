Building an SDF-aware custom downsampling system is the secret to high-quality 2D Global Illumination (GI) that doesn't "leak" light through walls.

In a standard blur, light bleeds everywhere; in an SDF-aware blur, the Signed Distance Field acts as a weight that blocks light from crossing geometry boundaries.

The Core Logic: "Bilateral-Style" Filtering To implement this in TSL, you treat the downsampling pass as a weighted average where the weights depend on the distance to the nearest wall.

Standard Weight: Gaussian distribution (how far a pixel is from the center).
SDF Weight: Occlusion check (is there a wall between the center pixel and the neighbor?). Phase 2: SDF-Aware Downsample (TSL Specification) This pass takes your high-resolution Direct Lighting Texture and your Global SDF Texture to create a stable, low-resolution Fluence Map.

1. The Kernel Logic For each pixel in the low-res target, sample a 3x3 or 5x5 neighborhood from the high-res light texture.
For each neighbor:
  Sample Light:
    Get the color/fluence of the neighbor.Sample SDF: Get the distance to the nearest wall at the neighbor's position.Visibility Test: If the neighbor's SDF value indicates it is inside a wall (negative) or if the path from the center to the neighbor crosses an SDF boundary (SDF \(\approx 0\)), set its weight to 0.
  Accumulate: Add the weighted neighbor color to the total.

2. TSL Code Concept javascript// TSL node for SDF-aware diffusion
```ts
const sdfAwareDownsample = Fn( ( [ uv, lightTex, sdfTex ] ) => {
  const centerSDF = texture( sdfTex, uv ).r;
  const totalFluence = vec3( 0.0 ).toVar();
  const totalWeight = float( 0.0 ).toVar();

  // Simple 3x3 kernel (extend to 5x5 for smoother GI)
  for ( let x = -1; x <= 1; x ++ ) {
    for ( let y = -1; y <= 1; y ++ ) {
      const offset = vec2( x, y ).mul( texelSize );
      const neighborUV = uv.add( offset );
      
      const neighborLight = texture( lightTex, neighborUV ).rgb;
      const neighborSDF = texture( sdfTex, neighborUV ).r;

      // Weight is 0 if neighbor is on the other side of a wall
      const weight = sign( centerSDF ).equal( sign( neighborSDF ) ).select( 1.0, 0.0 );
      
      totalFluence.addAssign( neighborLight.mul( weight ) );
      totalWeight.addAssign( weight );
    }
  }

  return totalFluence.div( totalWeight.max( 0.001 ) );
} );
```
Use code with caution.

Why this works for WebGL & WebGPU WebGL Strategy: This can be run as a standard Fragment Shader pass using renderer.renderTarget. Because it only does a few texture lookups per pixel, it avoids the bottleneck of a heavy full-screen blur.WebGPU Strategy: TSL will compile this into a Compute Shader, utilizing local memory (LDS) for even faster neighborhood sampling.

Summary of Performance By using SDF-Awareness, you only need two downsampled levels (\(1/4\) and \(1/16\) resolution) to simulate convincing GI.

This is significantly more efficient than the 8-10 passes required for high-quality Bloom or the hierarchical merges of Radiance Cascades.
