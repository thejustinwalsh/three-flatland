# Technical Specification: Hybrid SDF-Tiled Forward Renderer (TSL)
This document defines the architecture for a high-performance 2D lighting system using Three.js Shading Language (TSL). It is designed to scale across WebGPU and WebGL 2.0 while bypassing traditional uniform limits.

1. Architectural Overview
The system moves away from "per-light" calculations toward a Data-Centric model. It uses a Global Signed Distance Field (SDF) to decouple scene complexity from lighting performance.
Key Pillars
Decoupled Shading: Lights are stored in a Storage Buffer (WebGPU) or Data Texture (WebGL).
Jump Flood SDF: A global distance field replaces expensive ray-tracing.
Adaptive Tiling: A quadtree-inspired tiling system that uses the SDF to determine culling density.
Mimic GI: Multi-scale mipmap sampling for indirect light "bleeding."

2. Component Specifications
A. The Global SDF (Jump Flood Algorithm)
Instead of checking every light against every wall, we pre-calculate an SDF texture.
The Pass: 9–10 passes (for 1024px) using the Jump Flood Algorithm.
Output: A RGBA32F texture where:
R channel = Distance to nearest occluder.
GB channels = Vector to nearest occluder (useful for calculating surface normals/reflections).
Optimization: In WebGL, use Ping-Pong Framebuffers to handle the iterative JFA steps.
B. Adaptive Forward+ Culling
We replace the fixed 16x16 grid with a density-aware grid.
Logic:
High-SDF Areas (Open): Use 64x64 tiles. One light list for a large area.
Low-SDF Areas (Complex): Subdivide into 16x16 or 8x8 tiles for precision near geometry.
TSL Implementation: Use a compute() node to iterate through the Light Storage Buffer and assign light IDs to a TileBuffer.
C. Soft Shadows (SDF Cone Tracing)
Achieve penumbras without multiple rays.
Calculation: Shadow = min(1.0, (DistanceToSDF / TravelDistance) * Softness).
Benefit: This provides "contact hardening" shadows (sharper near the source, softer further away) in a single texture lookup.
D. Indirect GI (Mipmapped Radiosity)
To simulate light bouncing off surfaces:
Render a low-resolution pass of emissive materials.
Generate a full Mipmap Chain.
In the final shader, sample a high-level mip (e.g., Level 4) based on the local SDF value.
Result: Light "bleeds" around corners and fills dark areas with the average color of nearby emissive surfaces.

3. WebGL vs. WebGPU Strategy (TSL)
Feature	WebGPU (Native)	WebGL (Fallback)
Light Storage	storage( lights, 'vec4[]' )	DataTexture (auto-packed)
JFA Passes	Compute Shader	Render-to-Texture (Fragment)
Shadows	Direct SDF Lookup	Direct Texture Sample
Culling	Compute Write to Buffer	Render Light-IDs to Texture

4. Implementation Goals (Next Phase)
Define Light Struct: Create a TSL-compatible struct for position, color, radius, and decay.
JFA Node: Implement the jumpFloodStep node in TSL.
Adaptive Tile Node: Logic to branch between tile sizes based on textureLoad( sdfTexture, uv ).
Final Compose: Blend direct lighting (Forward+), SDF shadows, and Indirect GI.
Proactive Follow-up: How should we structure the first code module: as a Standalone TSL script or integrated into an existing Three.js Scene?


## What makes this "New" or "Special"?

We are applying 3D AAA optimizations to a 2D Web environment using TSL.

SDF-Adaptive Quadtrees: Standard 2D Forward+ uses a fixed grid. By using the SDF to define tile size, we can use massive tiles for "empty" space and tiny tiles for detailed corners. This "out of the box" trick drastically reduces the light-loop overhead on low-end hardware.
TSL Cross-Compilation: Unlike pure GLSL/WGSL projects, our approach uses Three.js's new Shading Language to automatically swap between Native Compute (WebGPU) and GPGPU Texture Hacks (WebGL) without rewriting the core math.

Mipmapped "Fake" Radiance: We bypass the complex hierarchical merging of Radiance Cascades by using simple texture mipmaps of emissive objects. This simulates "light bounce" (GI) for nearly zero extra cost—a trick used in early PS3/360 titles that most 2D web devs overlook today. 

# Further consideration

## The Danger: "Hard-to-Debug Slowdown"
You are correct—variable costs are the enemy of a smooth 60 FPS.
The Risk: If the player moves from a wide-open field (large tiles, fast) into a dense, complex "physics-object-filled" room (tiny tiles, slow), the frame rate will hitch.
The Debug Nightmare: In WebGL, since you're "faking" this with fragment shaders, a sudden density of tiles means more draw calls or more complex branching, which can lead to GPU "stalls" that are notoriously hard to profile in a browser.

## The Advantage: Why do it anyway?
The goal isn't just "speed"—it's VRAM and Bandwidth efficiency, especially for the WebGL fallback.
The "Ground" Optimization: In 2D games with vast open areas, a fixed 16x16 grid requires you to store and read thousands of light-list pointers for "empty" space.
The HRC "Proxy" Trick: In a large 64x64 tile, you can merge 10 distant lights into one single Proxy Light. The shader does 1 calculation instead of 10. You aren't just changing tile size; you are changing the mathematical complexity of the lighting for that area.

## The "Out of the Box" Solution: Fixed-Grid / Variable-Depth
To get the benefits of HRC without the "slowdown stutters," you use a Fixed Grid but a Hierarchical Light List.
How it works: Every tile is 32x32 (Fixed). However, the data inside that tile points to a "Light Hierarchy."
The Logic: If a tile is "Simple" (High SDF), it only points to a list of Global/Proxy lights. If a tile is "Complex" (Low SDF), it points to a list of Detailed/Local lights.
The Result: You get the performance of HRC/Clustered shading, but your GPU cost stays predictable because the grid structure never changes.
Scrutiny for the "Talk"
If you presented "Adaptive Tile Sizes" at GDC, a senior engine dev would ask: "How do you handle the overhead of rebuilding the quadtree every frame on the CPU?"
The "Pro" Answer: "We don't. We use the SDF Jump Flood to generate a 'Density Map' and let the Compute Shader determine the light-list depth in parallel."

To maintain performance in open areas, we add one more step to the culling phase: Clustering.
Logic: When culling lights for a tile, if the SDF.value is very high (meaning the area is wide open), we check for clusters of small, distant lights.
The Hack: We merge multiple distant lights into a single "Proxy Light" (average color, weighted center) for that specific tile.
Result: A pixel in the open field might see 50 torches as 4-5 Proxy Lights, drastically reducing the fragment shader's loop count.


# Production Ready Solution

## Why "Fixed-Grid Variable-Depth" is the Production Winner:
Cache Locality (The WebGL Killer): WebGL and mobile GPUs hate "pointer chasing." A Quadtree requires the shader to look up a node, then a child, then another child. This causes texture fetch latency. A fixed grid allows the shader to calculate exactly where its data is in one math operation: tileIndex = floor(uv * gridRes).

Divergence Control: GPUs are "SIMD" (Single Instruction, Multiple Data). They want every pixel in a 16x16 block to do the exact same work. If one pixel is in a "Deep Quadtree Leaf" and its neighbor is in a "Large Parent Node," the GPU has to pause one while the other finishes. Fixed-grid ensures all pixels in a tile follow the same code path.

The "Hierarchy" happens in the Buffer, not the Grid:
- The Grid: Stays 32x32.
- The Depth: Each tile stores an offset and a count into a global Light Index Buffer.
- The HRC Logic: The CPU (or a Compute Shader) pre-sorts the lights. A "simple" tile gets a count of 2 lights (proxies). A "complex" tile gets a count of 50 lights. The grid doesn't change—only the loop length inside the shader changes.

How this solves your "18-Light Limit" perfectly:
Instead of uniform vec3 lights[18], your shader looks like this:
Look up Tile: tile = tileData[myTileIndex] (gives you offset and lightCount).
Loop: for(int i = 0; i < tile.lightCount; i++).
Fetch: light = lightBuffer[tile.offset + i].

## The "Out of the Box" Twist for your 2D System:
To make this "SIGGRAPH/GDC talk" worthy, you use the SDF to populate that buffer.
In the "Culling Pass," you check the light against the tile's SDF value.
If light.distanceToTile > SDF.value, you know there is a wall between the light and the entire tile.

The Result: You don't even add that light to the tile's list. You are culling lights occlusion-style before the fragment shader even runs.
Scrutiny of the Approach:

The Pros: Rock-solid frame times; scales to hundreds of lights; works perfectly with TSL's storage() and DataTexture fallback.

The Cons: You "waste" a little memory on tiles that are empty, but on modern web browsers, memory is cheaper than GPU branching logic.

# The Pitch

## "Visibility-Aware Culling": We don't just cull by distance; we cull by occlusion before the light loop even starts.

## "HRC-Lite Proxying": We use the field density (SDF) to merge distant lights in open spaces, ensuring a constant frame time.

## "The Field is the Engine": Everything—shadows, light culling, and indirect GI—is derived from a single Jump-Flood SDF texture.

## Summary
A 2D Field-Based Renderer. It is more stable than Radiance Cascades for the Web, and significantly more powerful than the "Standard Forward" systems used in Three.js or PixiJS today. It is "good" because it addresses the hardware reality of 2024 browsers.
Next Step: To make this a reality, we need to build the Jump Flood SDF Generator in TSL. It is the "brain" that all other systems (Shadows, Culling, Clustering) depend on.